import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TonalService } from './services/tonal-service.js';
import { getMuscleReadiness, getMovements } from './tools/index.js';

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
    this.setupToolHandlers();
    console.error('TonalMCPServer created');
  }

  private setupToolHandlers() {
    // Register available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_muscle_readiness',
            description: 'Get current muscle readiness percentages for recovery planning',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_movements',
            description: 'Get available Tonal movements/exercises, optionally filtered by muscle groups',
            inputSchema: {
              type: 'object',
              properties: {
                muscleGroups: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Filter movements by muscle groups (e.g., ["Chest", "Back"] or ["Shoulders", "Triceps"])',
                },
              },
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const client = await this.tonalService.getClient();

        switch (name) {
          case 'get_muscle_readiness':
            return await getMuscleReadiness(client);

          case 'get_movements':
            return await getMovements(client, args?.muscleGroups as string[] | undefined);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Tonal MCP server running on stdio');
  }
}