import TonalClient, { type TonalWorkout } from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { TonalMCPError, handleToolError } from '../utils/error-handler.js';
import { exercisesToSets } from '../utils/workout-conversion.js';
import { formatPoundConversions, resolvePoundTargets } from '../utils/pound-targets.js';
import {
  validateOptionalString,
  validateRequiredString,
  validateWorkoutExercises,
} from '../utils/validation.js';

const WORKOUT_PAGE_SIZE = 100;
const WORKOUT_MAX_PAGES = 50;

export async function findWorkoutByName(client: TonalClient, name: string): Promise<TonalWorkout[]> {
  const normalizedName = name.trim().toLowerCase();
  const matchingWorkouts: TonalWorkout[] = [];
  let offset = 0;

  for (let page = 0; page < WORKOUT_MAX_PAGES; page++) {
    const batch = await client.getUserWorkouts(offset, WORKOUT_PAGE_SIZE);
    matchingWorkouts.push(
      ...batch.filter(workout => workout.title.toLowerCase() === normalizedName)
    );

    if (batch.length < WORKOUT_PAGE_SIZE) {
      return matchingWorkouts;
    }

    const nextOffset = offset + batch.length;
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw new TonalMCPError(
        'Workout lookup pagination offset did not advance',
        'PAGINATION_ERROR',
        502
      );
    }
    offset = nextOffset;
  }

  throw new TonalMCPError(
    `Workout lookup exceeded pagination limit of ${WORKOUT_MAX_PAGES} pages`,
    'PAGINATION_ERROR',
    502
  );
}

export async function listCustomWorkouts(client: TonalClient): Promise<MCPResponse> {
  // Keep list output bounded; name-based lookups page through the complete collection.
  const customWorkouts = await client.getUserWorkouts(0, WORKOUT_PAGE_SIZE);
  const hitListingLimit = customWorkouts.length === WORKOUT_PAGE_SIZE;
  
  let report = `# 🏗️ Your Custom Workouts\n\n`;
  report += hitListingLimit
    ? `Found at least ${customWorkouts.length} custom workouts (showing ${customWorkouts.length}; additional workouts may exist)\n\n`
    : `Found ${customWorkouts.length} custom workouts\n\n`;

  if (customWorkouts.length === 0) {
    report += `No custom workouts found. Create your own workouts on the Tonal!\n`;
    return {
      content: [{ type: 'text' as const, text: report }],
    };
  }

  // Sort by creation date, most recent first
  customWorkouts.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  customWorkouts.forEach((workout, index) => {
    const date = new Date(workout.createdAt).toLocaleDateString();
    const duration = Math.round(workout.duration / 60);
    
    report += `## ${index + 1}. ${workout.title}\n`;
    report += `- **Created**: ${date}\n`;
    report += `- **Duration**: ${duration} minutes\n`;
    report += `- **Target**: ${workout.targetArea || 'Not specified'}\n`;
    report += `- **Sets**: ${workout.sets?.length || 0}\n`;
    
    if (workout.description) {
      report += `- **Description**: ${workout.description}\n`;
    }
    
    report += `- **ID**: \`${workout.id}\`\n`;
    report += `\n`;
  });

  report += `\n💡 **Tip**: To delete a workout, use the exact title in quotes.\n`;

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

export async function deleteCustomWorkout(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  const workoutName = validateRequiredString(args?.workoutName, 'Workout name');
  const matchingWorkouts = await findWorkoutByName(client, workoutName);

  if (matchingWorkouts.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `❌ No custom workout found with name "${workoutName}".\n\nUse the list_custom_workouts tool to see available workouts.`,
      }],
      isError: true,
    };
  }

  if (matchingWorkouts.length > 1) {
    const workoutList = matchingWorkouts
      .map(workout => `- ${workout.title} (ID: ${workout.id}, created ${new Date(workout.createdAt).toLocaleDateString()})`)
      .join('\n');
    return {
      content: [{
        type: 'text' as const,
        text: `❌ Multiple workouts found with name "${workoutName}":\n${workoutList}\n\nPlease make workout names unique before deleting.`,
      }],
      isError: true,
    };
  }

  const workoutToDelete = matchingWorkouts[0];

  if (args?.confirm !== true) {
    const createdDate = new Date(workoutToDelete.createdAt).toLocaleDateString();
    const setCount = workoutToDelete.sets?.length || 0;
    return {
      content: [{
        type: 'text' as const,
        text: `# Deletion Preview\n\n- **Title**: ${workoutToDelete.title}\n- **ID**: \`${workoutToDelete.id}\`\n- **Created**: ${createdDate}\n- **Sets**: ${setCount}\n\n**Warning:** This deletion is permanent. Call delete_custom_workout again with \`confirm: true\` to delete this workout.`,
      }],
    };
  }

  try {
    await client.deleteWorkout(workoutToDelete.id);

    return {
      content: [{
        type: 'text' as const,
        text: `✅ Successfully deleted workout: **${workoutToDelete.title}**\n\nID: \`${workoutToDelete.id}\``,
      }],
    };
  } catch (error) {
    throw new TonalMCPError(
      `Failed to delete workout: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DELETE_ERROR',
      500
    );
  }
}

export async function getCustomWorkoutDetails(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  const workoutName = validateRequiredString(args?.workoutName, 'Workout name');
  const matchingWorkouts = await findWorkoutByName(client, workoutName);

  if (matchingWorkouts.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `❌ No custom workout found with name "${workoutName}".\n\nUse the list_custom_workouts tool to see available workouts.`,
      }],
      isError: true,
    };
  }

  if (matchingWorkouts.length > 1) {
    const workoutList = matchingWorkouts
      .map(workout => `- ${workout.title} (ID: ${workout.id}, created ${new Date(workout.createdAt).toLocaleDateString()})`)
      .join('\n');
    return {
      content: [{
        type: 'text' as const,
        text: `❌ Multiple workouts found with name "${workoutName}":\n${workoutList}\n\nPlease use a unique workout name.`,
      }],
      isError: true,
    };
  }

  const workout = matchingWorkouts[0];
  
  // Fetch full workout details
  const detailedWorkout = await client.getWorkoutById(workout.id);
  
  // Get movements to resolve names
  const movements = await client.getMovements();
  const movementMap = new Map(movements.map(m => [m.id, m.name]));
  
  let report = `# 📋 ${detailedWorkout.title}\n\n`;
  
  // Basic info
  report += `## Overview\n`;
  report += `- **Created**: ${new Date(detailedWorkout.createdAt).toLocaleDateString()}\n`;
  report += `- **Duration**: ${Math.round(detailedWorkout.duration / 60)} minutes\n`;
  report += `- **Target Area**: ${detailedWorkout.targetArea || 'Not specified'}\n`;
  report += `- **Total Sets**: ${detailedWorkout.sets?.length || 0}\n`;
  
  if (detailedWorkout.description) {
    report += `- **Description**: ${detailedWorkout.description}\n`;
  }
  
  if (detailedWorkout.accessories?.length) {
    report += `- **Equipment**: ${detailedWorkout.accessories.join(', ')}\n`;
  }
  
  report += `\n`;
  
  // Movement breakdown
  if (detailedWorkout.sets && detailedWorkout.sets.length > 0) {
    report += `## Workout Structure\n\n`;
    
    let currentBlock = -1;
    detailedWorkout.sets.forEach((set, index) => {
      // New block indicator
      if (set.blockNumber !== currentBlock) {
        currentBlock = set.blockNumber;
        if (index > 0) report += `\n`;
        report += `### Block ${currentBlock}\n`;
      }
      
      // Format set info
      const movementName = movementMap.get(set.movementId) || `Unknown (${set.movementId})`;
      report += `${index + 1}. **${movementName}**\n`;
      if (set.prescribedDuration !== undefined) {
        report += `   - Duration: ${set.prescribedDuration}s`;
      } else if (set.prescribedReps !== undefined) {
        report += `   - Reps: ${set.prescribedReps}`;
      } else {
        report += `   - Programming not specified`;
      }
      
      if (set.weightPercentage) {
        report += ` @ ${set.weightPercentage}% weight`;
      }
      
      if (set.warmUp) {
        report += ` (Warm-up)`;
      }
      
      if (set.dropSet) {
        report += ` (Drop set)`;
      }
      
      if (set.burnout) {
        report += ` (Burnout)`;
      }
      
      report += `\n`;
    });
  }
  
  report += `\n## Workout ID\n`;
  report += `\`${detailedWorkout.id}\`\n`;

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

export async function createWorkout(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const title = validateRequiredString(args?.title, 'Workout title');
    const description = validateOptionalString(args?.description, 'Workout description');
    const requestedExercises = args?.exercises;
    validateWorkoutExercises(requestedExercises);

    const movements = await client.getMovements();
    const { exercises, conversions } = await resolvePoundTargets(client, requestedExercises, movements);
    const sets = exercisesToSets(exercises, movements);

    const workout = await client.createWorkout({
      title,
      sets,
      description: description || '',
      createdSource: 'WorkoutBuilder',
    });

    let report = `# ✅ Workout Created Successfully\n\n`;
    report += `**${workout.title}**\n\n`;
    report += `**Workout ID:** ${workout.id}\n`;
    report += `**Estimated Duration:** ${Math.round(workout.duration / 60)} minutes\n\n`;
    report += `## Exercises (${exercises.length} total)\n\n`;

    exercises.forEach((exercise, index) => {
      const setDetails = Array.isArray(exercise.setDetails) ? exercise.setDetails : undefined;
      const setCount =
        setDetails?.length ??
        (typeof exercise.sets === 'number' ? exercise.sets : 0);
      report += `${index + 1}. **${exercise.movementName}** - ${setCount} set${setCount === 1 ? '' : 's'}`;

      if (setDetails) {
        report += ` with per-set programming`;
      } else if (typeof exercise.duration === 'number') {
        report += ` × ${exercise.duration}s`;
      } else if (typeof exercise.reps === 'number') {
        report += ` × ${exercise.reps} reps`;
      }

      if (typeof exercise.weight === 'number') {
        report += ` @ ${exercise.weight}%`;
      }
      if (exercise.isWarmup === true) {
        report += ` (Warmup)`;
      }
      report += `\n`;
    });

    report += formatPoundConversions(conversions);
    report += `\n_Your workout has been saved and is ready to use on your Tonal!_\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'create_workout');
  }
}