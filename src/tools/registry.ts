
 // Tool registry allows adding new tools without modifying server.ts.
 // Tools are organized by category and automatically discovered by the server.

import { MCPToolDefinition, ToolCategory } from '../types/index.js';
import { getMuscleReadiness } from './muscle-readiness.js';
import { getMovements, searchMovements } from './movements.js';
import { getRecentWorkouts } from './workouts.js';
import { getUserStats, getRecentProgress } from './user-stats.js';
import { listCustomWorkouts, deleteCustomWorkout, getCustomWorkoutDetails, createWorkout } from './custom-workouts.js';
import { getWorkoutForEditing, updateWorkout } from './workout-editing.js';
import { getStrengthScore } from './strength-score.js';
import { estimateWorkoutDuration } from './workout-duration.js';

const setDetailsSchema = {
  type: 'array',
  minItems: 1,
  description: 'Non-empty per-set programming. This array is authoritative and its length defines the set count; if sets is also supplied, it must match this length.',
  items: {
    type: 'object',
    properties: {
      reps: {
        type: 'number',
        description: 'Repetitions for this set',
      },
      duration: {
        type: 'number',
        description: 'Duration in seconds for this set',
      },
      weight: {
        type: 'number',
        description: 'Weight percentage (0-100) for this set',
      },
      warmUp: {
        type: 'boolean',
        description: 'Whether this is a warm-up set',
      },
      dropSet: {
        type: 'boolean',
        description: 'Whether this is a drop set',
      },
      burnout: {
        type: 'boolean',
        description: 'Whether this is a burnout set',
      },
      description: {
        type: 'string',
        description: 'Optional description for this set',
      },
    },
  },
};

// Exercise item schema shared by estimate_workout_duration, mirroring create_workout's shape.
const exerciseItemSchema = {
  type: 'object',
  description: 'Each exercise requires movementName and either sets for uniform programming or a non-empty setDetails array for per-set programming. If both are supplied, sets must equal the setDetails length; setDetails is authoritative.',
  properties: {
    movementName: {
      type: 'string',
      description: 'The exact name of the movement/exercise (use search_movements to find valid names)',
    },
    sets: {
      type: 'integer',
      minimum: 1,
      description: 'Uniform set count used only when setDetails is omitted. If both are supplied, this must equal the setDetails length.',
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
    setDetails: setDetailsSchema,
    isWarmup: {
      type: 'boolean',
      description: 'Optional: Mark this exercise as a warmup',
    },
    block: {
      type: 'integer',
      minimum: 0,
      description: 'Optional Tonal block number. Tonal blocks are 1-based, but a supplied 0 is accepted and normalized to 1. Equal block values group exercises into a superset. If some exercises include block and others omit it, every block is renumbered by first appearance; otherwise gaps and relative order are preserved.',
    },
  },
  required: ['movementName'],
  anyOf: [
    { required: ['sets'] },
    { required: ['setDetails'] },
  ],
};

// Shared user parameter added to every tool so callers can specify which Tonal account to use.
const userProperty = {
  user: {
    type: 'string',
    description: "Tonal account user (e.g. 'carlos', 'daniel'). Defaults to 'carlos'.",
  },
};

// Fitness/Health Tools
const fitnessTools: MCPToolDefinition[] = [
  {
    name: 'get_muscle_readiness',
    description: 'Get current muscle readiness percentages for recovery planning',
    inputSchema: {
      type: 'object',
      properties: { ...userProperty },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getMuscleReadiness,
  },
  {
    name: 'get_user_stats',
    description: 'Get comprehensive user fitness statistics and current streak',
    inputSchema: {
      type: 'object',
      properties: { ...userProperty },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getUserStats,
  },
  {
    name: 'get_recent_progress',
    description: 'Get recent progress analysis including workout frequency and trends',
    inputSchema: {
      type: 'object',
      properties: { ...userProperty },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getRecentProgress,
  },
  {
    name: 'get_strength_score',
    description: "Get Tonal's strength-related goal metrics (e.g. Strength Sets, Functional Strength Score), matched by name rather than hardcoded ID. Returns current week actual/target/range plus a recent trend.",
    inputSchema: {
      type: 'object',
      properties: { ...userProperty },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getStrengthScore,
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
        ...userProperty,
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getRecentWorkouts,
  },
  {
    name: 'list_custom_workouts',
    description: 'List up to 100 custom workouts created on Tonal and report when additional workouts may exist',
    inputSchema: {
      type: 'object',
      properties: { ...userProperty },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: listCustomWorkouts,
  },
  {
    name: 'delete_custom_workout',
    description: 'Permanently delete a custom workout by exact name after explicit confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        workoutName: {
          type: 'string',
          description: 'The exact name of the workout to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to permanently delete the resolved workout; otherwise the tool returns a deletion preview',
        },
        ...userProperty,
      },
      required: ['workoutName', 'confirm'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
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
        ...userProperty,
      },
      required: ['workoutName'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getCustomWorkoutDetails,
  },
  {
    name: 'create_workout',
    description: 'Create a new custom workout with specified exercises and per-set or uniform programming. Use the same 1-based "block" number for exercises that should be grouped together; a supplied 0 is accepted and normalized to 1.',
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
            description: 'Each exercise requires movementName and either sets for uniform programming or a non-empty setDetails array for per-set programming. If both are supplied, sets must equal the setDetails length; setDetails is authoritative.',
            properties: {
              movementName: {
                type: 'string',
                description: 'The exact name of the movement/exercise (use search_movements to find valid names)',
              },
              sets: {
                type: 'integer',
                minimum: 1,
                description: 'Uniform set count used only when setDetails is omitted. If both are supplied, this must equal the setDetails length.',
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
              setDetails: setDetailsSchema,
              isWarmup: {
                type: 'boolean',
                description: 'Optional: Mark this exercise as a warmup',
              },
              block: {
                type: 'integer',
                minimum: 0,
                description: 'Optional Tonal block number. Tonal blocks are 1-based, but a supplied 0 is accepted and normalized to 1. Equal block values group exercises into a superset. If some exercises include block and others omit it, every block is renumbered by first appearance; otherwise gaps and relative order are preserved.',
              },
            },
            required: ['movementName'],
            anyOf: [
              { required: ['sets'] },
              { required: ['setDetails'] },
            ],
          },
          description: 'Array of exercises to include in the workout',
        },
        description: {
          type: 'string',
          description: 'Optional description for the workout',
        },
        ...userProperty,
      },
      required: ['title', 'exercises'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    handler: createWorkout,
  },
  {
    name: 'get_workout_for_editing',
    description: 'Get a workout in an editable format with high-level exercise structure. Use this before making modifications to a workout.',
    inputSchema: {
      type: 'object',
      properties: {
        workoutName: {
          type: 'string',
          description: 'The exact name of the workout to fetch for editing',
        },
        ...userProperty,
      },
      required: ['workoutName'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getWorkoutForEditing,
  },
  {
    name: 'update_workout',
    description: 'Update an existing workout with modified exercises and per-set or uniform programming. Preserve 1-based "block" values from get_workout_for_editing; a legacy 0 is accepted and normalized to 1 on save. Returns fresh workout state after saving.',
    inputSchema: {
      type: 'object',
      properties: {
        workoutName: {
          type: 'string',
          description: 'The name of the workout to update',
        },
        title: {
          type: 'string',
          description: 'Optional: New title for the workout',
        },
        description: {
          type: 'string',
          description: 'Optional: New description for the workout',
        },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            description: 'Each exercise requires movementName and either sets for uniform programming or a non-empty setDetails array for per-set programming. If both are supplied, sets must equal the setDetails length; setDetails is authoritative.',
            properties: {
              movementName: {
                type: 'string',
                description: 'The exact name of the movement/exercise',
              },
              sets: {
                type: 'integer',
                minimum: 1,
                description: 'Uniform set count used only when setDetails is omitted. If both are supplied, this must equal the setDetails length.',
              },
              reps: {
                type: 'number',
                description: 'Number of reps per set (for reps-based exercises)',
              },
              duration: {
                type: 'number',
                description: 'Duration in seconds per set (for duration-based exercises)',
              },
              weight: {
                type: 'number',
                description: 'Optional: Weight percentage (0-100) for this exercise',
              },
              setDetails: setDetailsSchema,
              isWarmup: {
                type: 'boolean',
                description: 'Optional: Mark this exercise as a warmup',
              },
              block: {
                type: 'integer',
                minimum: 0,
                description: 'Optional Tonal block number. Tonal blocks are 1-based, but a supplied 0 is accepted and normalized to 1. Equal block values group exercises into a superset. If some exercises include block and others omit it, every block is renumbered by first appearance; otherwise gaps and relative order are preserved.',
              },
            },
            required: ['movementName'],
            anyOf: [
              { required: ['sets'] },
              { required: ['setDetails'] },
            ],
          },
          description: 'Complete array of exercises for the updated workout',
        },
        ...userProperty,
      },
      required: ['workoutName', 'exercises'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
    handler: updateWorkout,
  },
  {
    name: 'estimate_workout_duration',
    description: 'Estimate how long a prescribed workout will take, without creating or modifying anything on Tonal. Accepts the same exercises shape as create_workout.',
    inputSchema: {
      type: 'object',
      properties: {
        exercises: {
          type: 'array',
          items: exerciseItemSchema,
          description: 'Array of exercises to estimate duration for',
        },
        ...userProperty,
      },
      required: ['exercises'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: estimateWorkoutDuration,
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
        ...userProperty,
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
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
        ...userProperty,
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
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