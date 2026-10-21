import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
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
  annotations?: ToolAnnotations;
  handler: (client: TonalClient, args?: Record<string, unknown>) => Promise<MCPResponse>;
}

export interface ToolCategory {
  name: string;
  description: string;
  tools: MCPToolDefinition[];
}

// Workout-related types
/**
 * Per-set programming for an exercise. When setDetails is supplied, it must be
 * non-empty and its length is authoritative; a supplied sets value must match it.
 */
export interface SetDetail {
  reps?: number;
  duration?: number;
  weight?: number;
  warmUp?: boolean;
  dropSet?: boolean;
  burnout?: boolean;
  spotter?: boolean;
  eccentric?: boolean;
  chains?: boolean;
  flex?: boolean;
  description?: string;
}

export interface ExerciseInput {
  movementName: string;
  sets?: number;
  reps?: number; // For reps-based movements
  duration?: number; // For duration-based movements (in seconds)
  weight?: number; // Optional weight percentage (0-100)
  isWarmup?: boolean;
  block?: number; // Group exercises into the same block (same block = exercises alternate)
  setDetails?: SetDetail[];
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