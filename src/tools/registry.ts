
 // Tool registry allows adding new tools without modifying server.ts.
 // Tools are organized by category and automatically discovered by the server.

import { MCPToolDefinition, ToolCategory } from '../types/index.js';
import { getMuscleReadiness } from './muscle-readiness.js';
import { getMovements, searchMovements } from './movements.js';
import { getRecentWorkouts } from './workouts.js';
import { getUserStats, getRecentProgress } from './user-stats.js';
import { listCustomWorkouts, deleteCustomWorkout, getCustomWorkoutDetails, createWorkout } from './custom-workouts.js';

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
  {
    name: 'list_custom_workouts',
    description: 'List all your custom workouts created on Tonal',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: listCustomWorkouts,
  },
  {
    name: 'delete_custom_workout',
    description: 'Delete a custom workout by name',
    inputSchema: {
      type: 'object',
      properties: {
        workoutName: {
          type: 'string',
          description: 'The exact name of the workout to delete',
        },
      },
      required: ['workoutName'],
    },
    handler: deleteCustomWorkout,
  },
  {
    name: 'get_custom_workout_details',
    description: 'Get detailed information about a specific custom workout including all sets and movements',
    inputSchema: {
      type: 'object',
      properties: {
        workoutName: {
          type: 'string',
          description: 'The exact name of the workout to view',
        },
      },
      required: ['workoutName'],
    },
    handler: getCustomWorkoutDetails,
  },
  {
    name: 'create_workout',
    description: 'Create a new custom workout with specified exercises, sets, and reps. IMPORTANT: Use the "block" parameter to group exercises that should appear together (warmups, cooldowns, supersets, etc.). For example: all warmup exercises with block: 1, first superset with block: 2, second superset with block: 3, cooldown exercises with block: 4. Without a block number, each exercise gets its own separate block.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title/name of the workout',
        },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              movementName: {
                type: 'string',
                description: 'The exact name of the movement/exercise (use search_movements to find valid names)',
              },
              sets: {
                type: 'number',
                description: 'Number of sets for this exercise',
              },
              reps: {
                type: 'number',
                description: 'Number of reps per set (for reps-based exercises like Bench Press, Squat, etc.)',
              },
              duration: {
                type: 'number',
                description: 'Duration in seconds per set (for duration-based exercises like Jumping Jack, Plank, etc.)',
              },
              weight: {
                type: 'number',
                description: 'Optional: Weight percentage (0-100) for this exercise',
              },
              isWarmup: {
                type: 'boolean',
                description: 'Optional: Mark this exercise as a warmup',
              },
              block: {
                type: 'number',
                description: 'Optional: Block number to group exercises together. Exercises with the same block number will be grouped into a single block on the Tonal. Use for: warmups (block: 1), supersets (block: 2, 3, etc.), cooldowns (block: 99). Without a block number, each exercise appears in its own separate block.',
              },
            },
            required: ['movementName', 'sets'],
          },
          description: 'Array of exercises to include in the workout',
        },
        description: {
          type: 'string',
          description: 'Optional description for the workout',
        },
      },
      required: ['title', 'exercises'],
    },
    handler: createWorkout,
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
  {
    name: 'search_movements',
    description: 'Advanced search for Tonal movements with multiple filter options including muscle groups, equipment, arm angle, body region, push/pull, skill level, and movement characteristics',
    inputSchema: {
      type: 'object',
      properties: {
        muscleGroups: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by muscle groups. Options: "Obliques", "Abs", "Shoulders", "Glutes", "Back", "Biceps", "Quads", "Triceps", "Chest", "Hamstrings", "Calves", "Forearms"',
        },
        equipment: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by equipment and accessories. Off-machine options: "Bench", "Mat", "Roller". On-machine options: "Handles", "Rope", "StraightBar", "AnkleStraps"',
        },
        armAngle: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by arm angle position on the machine. Options: "High", "Middle", "Low"',
        },
        bodyRegion: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by body region. Options: "UpperBody", "LowerBody", "Core"',
        },
        pushPull: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by push/pull pattern. Options: "Push", "Pull", "N/A"',
        },
        family: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by movement family (e.g., ["Row", "Squat", "BenchPress", "ChestPress", "OverheadPress", "Lunge", "Plank"])',
        },
        onMachine: {
          type: 'boolean',
          description: 'Filter for on-machine movements only (true) or off-machine only (false)',
        },
        inFreeLift: {
          type: 'boolean',
          description: 'Filter for free lift movements (true) or non-free lift (false)',
        },
        skillLevel: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by skill level. Options: 0, 1, 2, 3 (higher numbers indicate more advanced movements)',
        },
        isBilateral: {
          type: 'boolean',
          description: 'Filter for bilateral movements (both sides at once)',
        },
        isAlternating: {
          type: 'boolean',
          description: 'Filter for alternating movements',
        },
        isTwoSided: {
          type: 'boolean',
          description: 'Filter for two-sided movements',
        },
      },
      required: [],
    },
    handler: searchMovements,
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