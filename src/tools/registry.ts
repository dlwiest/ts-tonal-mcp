
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
import { getAchievements } from './achievements.js';
import { estimateWorkoutDuration } from './workout-duration.js';
import { listWorkoutActivities } from './workout-activities.js';
import { getWorkoutActivityDetails, getWorkoutSummary } from './workout-activity-details.js';
import { getSuggestedWeights } from './suggested-weights.js';
import { getLibraryProgram, getLibraryWorkout, searchProgramLibrary, searchWorkoutLibrary } from './library.js';

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
        description: "Weight percentage (0-100) of Tonal's suggested weight for this movement, for this set",
      },
      weightLb: {
        type: 'number',
        exclusiveMinimum: 0,
        description: "Target weight in pounds for this set, converted to a percentage of Tonal's suggested weight from your most recent performance of the movement at this set's reps (or duration), since Tonal's suggestion depends on them. Needs that movement at those reps in your last 20 Tonal workouts, on-machine only; the result must fall within 1-100%. Not combinable with weight on the same set.",
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
        description: 'Whether this is a burnout set. Rejected when onMachineInfo.burnoutDisabled is true for the movement.',
      },
      spotter: {
        type: 'boolean',
        description: 'Whether spotter mode is enabled for this set. Rejected when onMachineInfo.spotterDisabled is true for the movement.',
      },
      eccentric: {
        type: 'boolean',
        description: 'Whether eccentric mode is enabled for this set. Rejected when onMachineInfo.eccentricDisabled is true for the movement.',
      },
      chains: {
        type: 'boolean',
        description: 'Whether chains mode is enabled for this set. Rejected when onMachineInfo.chainsDisabled is true for the movement.',
      },
      flex: {
        type: 'boolean',
        description: 'Whether flex mode is enabled for this set.',
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
      description: "Optional: Weight percentage (0-100) of Tonal's suggested weight for this movement. When setDetails is supplied, this is the fallback for any set that omits its own weight.",
    },
    weightLb: {
      type: 'number',
      exclusiveMinimum: 0,
      description: "Optional: target weight in pounds, converted per set to a percentage of Tonal's suggested weight from your most recent performance of the movement at that set's reps (or duration), since Tonal's suggestion depends on them (see get_suggested_weights). Needs that movement at those reps in your last 20 Tonal workouts, on-machine only; the result must fall within 1-100%. Not combinable with weight on the same exercise. When setDetails is supplied, this is the fallback for any set without its own weight or weightLb.",
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
  {
    name: 'get_achievements',
    description: 'Get Tonal achievements: the total earned, the next milestones in progress, and earned achievements newest first with their dates and categories.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'How many earned achievements to list, newest first (default 15). The total is always reported.',
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getAchievements,
  },
];

// Workout Tools
const workoutTools: MCPToolDefinition[] = [
  {
    name: 'get_recent_workouts',
    description: 'Get recent workout history with wall-clock and time-under-tension stats plus workoutActivityId values for activity detail or summary lookup. Activities imported from other apps are labelled as external and left out of the summary totals; they have no Tonal activity detail.',
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
  {
    name: 'get_suggested_weights',
    description: "Get Tonal's last recorded suggested weight in pounds for on-machine movements, per prescribed rep count (or duration), from your most recent performed sets in your last 20 Tonal workouts. Tonal's suggestion depends on the reps, and each value estimates what 100% loads at that prescription; Tonal may have changed it since. A set's weight percentage is a share of the suggestion for its reps, so use this to choose percentages or check what weightLb will convert to.",
    inputSchema: {
      type: 'object',
      properties: {
        movementNames: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: { type: 'string' },
          description: 'Exact movement names (use search_movements to find them)',
        },
      },
      required: ['movementNames'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getSuggestedWeights,
  },
];

// Tonal's published guided workouts and programs
const pageProperties = {
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: 50,
    description: 'Results per page (default 10, at most 50)',
  },
  offset: {
    type: 'integer',
    minimum: 0,
    description: 'Results to skip, for the next page (default 0)',
  },
};

const libraryTools: MCPToolDefinition[] = [
  {
    name: 'search_workout_library',
    description: "Search Tonal's published guided workouts (not your custom workouts or history), newest first. All filters are optional and combine. Use get_library_workout for a result's exercises.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive text to find in the title or description' },
        level: { type: 'string', description: 'BEGINNER, INTERMEDIATE, ADVANCED, or ALL (case-insensitive)' },
        targetArea: { type: 'string', description: 'UPPER BODY, LOWER BODY, FULL BODY, or CORE (case-insensitive)' },
        trainingType: { type: 'string', description: 'Exact training type, case-insensitive, e.g. Strength, High Intensity, Yoga, Mobility, Cardio, Recovery, Boxing, Barre, Pilates' },
        device: { type: 'string', description: 'Only workouts supported on this Tonal: Classic, T3, or Elite' },
        minMinutes: { type: 'number', minimum: 0, description: 'Minimum length in minutes (inclusive)' },
        maxMinutes: { type: 'number', minimum: 0, description: 'Maximum length in minutes (inclusive)' },
        requiresEquipment: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only workouts that use every listed accessory: StraightBar, Handles, Rope, Bench, Mat, Roller, AnkleStraps, PilatesLoops',
        },
        availableEquipment: {
          type: 'array',
          items: { type: 'string' },
          description: "The accessories the user owns: only workouts that need nothing beyond them. Pass [] for a user with no accessories. Workouts whose equipment Tonal doesn't report are excluded.",
        },
        ...pageProperties,
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: searchWorkoutLibrary,
  },
  {
    name: 'search_program_library',
    description: "Search Tonal's published multi-week programs, newest first. All filters are optional and combine. Use get_library_program for a result's schedule.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive text to find in the name or description' },
        level: { type: 'string', description: 'BEGINNER, INTERMEDIATE, ADVANCED, or ALL (case-insensitive)' },
        weeks: { type: 'integer', minimum: 1, description: 'Exact program length in weeks' },
        workoutsPerWeek: { type: 'integer', minimum: 1, description: 'Exact number of workouts per week' },
        device: { type: 'string', description: 'Only programs supported on this Tonal: Classic, T3, or Elite' },
        availableEquipment: {
          type: 'array',
          items: { type: 'string' },
          description: 'The accessories the user owns: only programs that need nothing beyond them (StraightBar, Handles, Rope, Bench, Mat, Roller, AnkleStraps, PilatesLoops). Pass [] for a user with no accessories.',
        },
        ...pageProperties,
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: searchProgramLibrary,
  },
  {
    name: 'get_library_workout',
    description: "Get one Tonal guided workout's exercises (movement names, sets, reps or duration, weight percentages, blocks) by workoutId from search_workout_library or get_library_program. The exercises use the same shape create_workout accepts. Read-only: does not start or schedule the workout.",
    inputSchema: {
      type: 'object',
      properties: {
        workoutId: { type: 'string', description: 'The workoutId from a library search or program schedule' },
      },
      required: ['workoutId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getLibraryWorkout,
  },
  {
    name: 'get_library_program',
    description: "Get one Tonal program's week-by-week schedule of workouts by programId from search_program_library. Read-only: does not enroll you.",
    inputSchema: {
      type: 'object',
      properties: {
        programId: { type: 'string', description: 'The programId from search_program_library' },
      },
      required: ['programId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: getLibraryProgram,
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
  {
    name: 'library',
    description: "Tonal's published guided workouts and programs",
    tools: libraryTools,
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