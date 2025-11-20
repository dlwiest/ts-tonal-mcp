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

// Workout-related types
export interface ExerciseInput {
  movementName: string;
  sets: number;
  reps?: number; // For reps-based movements
  duration?: number; // For duration-based movements (in seconds)
  weight?: number; // Optional weight percentage (0-100)
  isWarmup?: boolean;
  block?: number; // Group exercises into the same block (same block = exercises alternate)
}

export interface CreateWorkoutInput {
  title: string;
  exercises: ExerciseInput[];
  description?: string;
}

export interface UpdateWorkoutInput {
  workoutName: string;
  title?: string;
  description?: string;
  exercises: ExerciseInput[];
}