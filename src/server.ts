import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TonalService } from './services/tonal-service.js';
import { allTools, toolsRegistry } from './tools/registry.js';
import { handleToolError } from './utils/error-handler.js';

const packageMetadata: unknown = createRequire(import.meta.url)('../package.json');
if (
  !packageMetadata ||
  typeof packageMetadata !== 'object' ||
  !('version' in packageMetadata) ||
  typeof packageMetadata.version !== 'string'
) {
  throw new Error('package.json must contain a string version');
}
const packageVersion = packageMetadata.version;

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

// Returns null once the body exceeds the limit, without buffering the rest.
async function readBoundedBody(req: IncomingMessage): Promise<Buffer | null> {
  if (Number(req.headers['content-length']) > MAX_REQUEST_BODY_BYTES) {
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export class TonalMCPServer {
  private tonalService: TonalService;

  constructor() {
    this.tonalService = new TonalService();
    console.error('TonalMCPServer created');
  }

  // Builds an MCP server instance; HTTP mode creates one per request, sharing the Tonal client
  private createServer(): Server {
    const server = new Server(
      {
        name: 'tonal-mcp',
        version: packageVersion,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.setupHandlers(server);
    return server;
  }

  private setupHandlers(server: Server) {
    // Register tool list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: allTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        })),
      };
    });

    // Register tool execution handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const tool = toolsRegistry.get(name);
        if (!tool) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const client = await this.tonalService.getClient();
        return await tool.handler(client, args);
      } catch (error) {
        return handleToolError(error, name);
      }
    });
  }

  async run() {
    if (process.env.MCP_TRANSPORT === 'http') {
      await this.runHttp();
      return;
    }

    const transport = new StdioServerTransport();
    await this.createServer().connect(transport);
    console.error('Tonal MCP server running on stdio');
  }

  private async runHttp() {
    const authToken = process.env.MCP_AUTH_TOKEN;
    if (!authToken) {
      throw new Error('MCP_AUTH_TOKEN environment variable is required when MCP_TRANSPORT=http');
    }
    const expectedAuth = Buffer.from(`Bearer ${authToken}`);
    const port = Number(process.env.PORT ?? 8080);

    const httpServer = createHttpServer(async (req, res) => {
      // Split rather than `new URL`: it throws on targets like `//[`, and this handler runs before auth.
      const path = (req.url ?? '/').split('?', 1)[0];

      if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
        return;
      }

      if (path !== '/mcp') {
        res.writeHead(404).end();
        return;
      }

      const providedAuth = Buffer.from(req.headers.authorization ?? '');
      if (
        providedAuth.length !== expectedAuth.length ||
        !timingSafeEqual(providedAuth, expectedAuth)
      ) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
        return;
      }

      // Stateless mode never sends server-initiated messages, so GET would only hold an
      // idle event stream open and DELETE has no session to end.
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }).end();
        return;
      }

      // Stateless mode: a fresh server and transport per request
      const server = this.createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });

      try {
        const body = await readBoundedBody(req);
        if (body === null) {
          res.writeHead(413, { Connection: 'close' }).end();
          return;
        }

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(body.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error: Invalid JSON' },
            id: null,
          }));
          return;
        }

        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.writeHead(500).end();
        }
      }
    });

    await new Promise<void>((resolve) => httpServer.listen(port, '0.0.0.0', resolve));
    console.error(`Tonal MCP server listening on http://0.0.0.0:${port}/mcp`);
  }
}