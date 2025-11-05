import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type TonalClient from '@dlwiest/ts-tonal-client';

// Re-export types from ts-tonal-client
export type {
  TonalActivitySummary,
  TonalUserInfo,
  TonalUserStatistics,
  TonalCurrentStreak,
  TonalDailyMetrics,
  TonalMovement,
  TonalWorkout,
  TonalMuscleReadiness
} from '@dlwiest/ts-tonal-client';

// Use the official MCP CallToolResult type
export type MCPResponse = CallToolResult;

// MCP-specific types
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  handler: (client: TonalClient, args?: Record<string, unknown>) => Promise<MCPResponse>;
}

export interface ToolCategory {
  name: string;
  description: string;
  tools: MCPToolDefinition[];
}