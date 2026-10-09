
 // Tool registry allows adding new tools without modifying server.ts.
 // Tools are organized by category and automatically discovered by the server.

import { MCPToolDefinition, ToolCategory } from '../types/index.js';
import { getMuscleReadiness } from './muscle-readiness.js';
import { getMovements, searchMovements } from './movements.js';
import { getRecentWorkouts } from './workouts.js';
import { getUserStats, getRecentProgress } from './user-stats.js';
import { listCustomWorkouts, deleteCustomWorkout, getCustomWorkoutDetails, createWorkout } from './custom-workouts.js';
import { getWorkoutForEditing, updateWorkout } from './workout-editing.js';
import { getGoalMetrics } from './goal-metrics.js';
import { getStrengthScores } from './strength-scores.js';
import { estimateWorkoutDuration } from './workout-duration.js';
import { listWorkoutActivities } from './workout-activities.js';
import { getWorkoutActivityDetails, getWorkoutSummary } from './workout-activity-details.js';

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

// Shared by create_workout, update_workout, and estimate_workout_duration so all three
// accept an identical exercise shape. Previously duplicated per tool, which let the
// descriptions drift apart.
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
      description: 'Optional: Weight percentage (0-100) for this exercise. When setDetails is supplied, this is the fallback for any set that omits its own weight.',
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
      properties: {},
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
      properties: {},
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getRecentProgress,
  },
  {
    name: 'get_goal_metrics',
    description: "Get Tonal's weekly goal metrics (Volume, Work, Movement Quality Score, Strength Sets, Power Reps, Endurance Sets, Functional Strength Score) with the current week's actual, target, and range plus a recent trend. Optionally filter by metric name. Functional Strength Score is not Tonal's headline Strength Score; use get_strength_scores for the latter.",
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Optional case-insensitive substring matched against metric names (e.g. "strength" for Strength Sets and Functional Strength Score). Omit for all metrics.',
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getGoalMetrics,
  },
  {
    name: 'get_strength_scores',
    description: "Get Tonal's headline current Strength Score by body region and a compact per-activity trend. This is distinct from the weekly Functional Strength Score goal metric.",
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          minimum: 1,
          description: 'Calendar-day history lookback, not a workout or row count. Omit to query from account creation (all available strength-score history).',
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getStrengthScores,
  },
];

// Workout Tools
const workoutTools: MCPToolDefinition[] = [
  {
    name: 'get_recent_workouts',
    description: 'Get recent workout history with wall-clock and time-under-tension stats plus workoutActivityId values for activity detail or summary lookup',
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getRecentWorkouts,
  },
  {
    name: 'list_workout_activities',
    description: "List one Tonal workout-activity API page. Offset 0 selects the account's oldest activities and increasing offset advances toward newer ones; rows are displayed newest-first only within the selected page. Use get_recent_workouts for recent sessions.",
    inputSchema: {
      type: 'object',
      properties: {
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Tonal API offset into the oldest-first activity sequence.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum activities requested from Tonal for this API page.',
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: listWorkoutActivities,
  },
  {
    name: 'get_workout_activity_details',
    description: 'Get one completed activity with performed sets in original order, catalog-resolved movement names, per-set weights, reps, one-rep max, volume, and range of motion. When Tonal reports them, sets also include prescribed reps and duration, base weight with added eccentric or chains load, active modifiers, estimated reps in reserve, personal-record categories, and set duration. Rest before each working set is derived from set timestamps. Activity summary IDs from get_recent_workouts are the same workout activity IDs accepted here. Reports totalDuration as wall-clock time and activeDuration as time under tension.',
    inputSchema: {
      type: 'object',
      properties: {
        activityId: {
          type: 'string',
          description: 'Workout activity ID returned by list_workout_activities.',
        },
      },
      required: ['activityId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getWorkoutActivityDetails,
  },
  {
    name: 'get_workout_summary',
    description: "Get Tonal's formatted workout summary and per-movement breakdown. Activity summary IDs from get_recent_workouts are the same workout activity IDs accepted here. Reports duration as wall-clock session time and timeUnderTension as active lifting time.",
    inputSchema: {
      type: 'object',
      properties: {
        activityId: {
          type: 'string',
          description: 'Workout activity ID returned by list_workout_activities.',
        },
      },
      required: ['activityId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getWorkoutSummary,
  },
  {
    name: 'list_custom_workouts',
    description: 'List up to 100 custom workouts created on Tonal and report when additional workouts may exist',
    inputSchema: {
      type: 'object',
      properties: {},
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
          items: exerciseItemSchema,
          description: 'Array of exercises to include in the workout',
        },
        description: {
          type: 'string',
          description: 'Optional description for the workout',
        },
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
          items: exerciseItemSchema,
          description: 'Complete array of exercises for the updated workout',
        },
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
    description: 'Estimate how long a prescribed workout would take, without creating or modifying anything on Tonal. Accepts the same exercises shape as create_workout.',
    inputSchema: {
      type: 'object',
      properties: {
        exercises: {
          type: 'array',
          items: exerciseItemSchema,
          description: 'Array of exercises to estimate duration for',
        },
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