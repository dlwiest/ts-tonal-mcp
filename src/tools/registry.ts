
 // Tool registry allows adding new tools without modifying server.ts.
 // Tools are organized by category and automatically discovered by the server.

import { MCPToolDefinition, ToolCategory } from '../types/index.js';
import { getMuscleReadiness } from './muscle-readiness.js';
import { getMovements } from './movements.js';
import { getRecentWorkouts } from './workouts.js';
import { getUserStats, getRecentProgress } from './user-stats.js';

// Fitness/Health Tools
const fitnessTools: MCPToolDefinition[] = [
  {
    name: 'get_muscle_readiness',
    description: 'Get current muscle readiness percentages for recovery planning',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: getMuscleReadiness,
  },
  {
    name: 'get_user_stats',
    description: 'Get comprehensive user fitness statistics and current streak',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: getUserStats,
  },
  {
    name: 'get_recent_progress',
    description: 'Get recent progress analysis including workout frequency and trends',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: getRecentProgress,
  },
];

// Workout Tools
const workoutTools: MCPToolDefinition[] = [
  {
    name: 'get_recent_workouts',
    description: 'Get recent workout history with summary stats',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent workouts to retrieve (default: 10)',
        },
      },
      required: [],
    },
    handler: getRecentWorkouts,
  },
];

// Exercise/Movement Tools
const movementTools: MCPToolDefinition[] = [
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
    handler: getMovements,
  },
];

// Tool Categories
export const toolCategories: ToolCategory[] = [
  {
    name: 'fitness',
    description: 'User fitness metrics, readiness, and progress tracking',
    tools: fitnessTools,
  },
  {
    name: 'workouts',
    description: 'Workout history and analysis',
    tools: workoutTools,
  },
  {
    name: 'movements',
    description: 'Exercise and movement database',
    tools: movementTools,
  },
];

// Create a Map for O(1) tool lookup by name
export const toolsRegistry = new Map<string, MCPToolDefinition>();

// Auto-populate the registry from all categories
toolCategories.forEach(category => {
  category.tools.forEach(tool => {
    toolsRegistry.set(tool.name, tool);
  });
});

// Export flattened array for server registration
export const allTools = Array.from(toolsRegistry.values());