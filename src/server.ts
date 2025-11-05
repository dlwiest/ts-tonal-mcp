import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TonalService } from './services/tonal-service.js';
import { allTools, toolsRegistry } from './tools/registry.js';
import { handleToolError } from './utils/error-handler.js';

export class TonalMCPServer {
  private server: Server;
  private tonalService: TonalService;

  constructor() {
    this.server = new Server(
      {
        name: 'tonal-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tonalService = new TonalService();
    this.setupHandlers();
    console.error('TonalMCPServer created');
  }

  private setupHandlers() {
    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: allTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Register tool execution handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Tonal MCP server running on stdio');
  }
}