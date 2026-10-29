import type TonalClient from '@dlwiest/ts-tonal-client';
import type { MCPResponse } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { exercisesToSets, reconstructExercisesFromSets } from '../utils/workout-conversion.js';
import { formatPoundConversions, resolvePoundTargets } from '../utils/pound-targets.js';
import { findWorkoutByName } from './custom-workouts.js';
import {
  validateOptionalString,
  validateRequiredString,
  validateWorkoutExercises,
} from '../utils/validation.js';

/**
 * Fetches a workout and returns it in a high-level, editable format.
 * Converts low-level sets into simple exercise structure for easy LLM manipulation.
 */
export async function getWorkoutForEditing(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const workoutName = validateRequiredString(args?.workoutName, 'Workout name');
    const matchingWorkouts = await findWorkoutByName(client, workoutName);

    if (matchingWorkouts.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ No custom workout found with name "${workoutName}".\n\nUse the list_custom_workouts tool to see available workouts.`,
          },
        ],
        isError: true,
      };
    }

    if (matchingWorkouts.length > 1) {
      const workoutList = matchingWorkouts
        .map(workout => `- ${workout.title} (ID: ${workout.id}, created ${new Date(workout.createdAt).toLocaleDateString()})`)
        .join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Multiple workouts found with name "${workoutName}":\n${workoutList}\n\nPlease use a unique workout name.`,
          },
        ],
        isError: true,
      };
    }

    const workout = matchingWorkouts[0];
    const detailedWorkout = await client.getWorkoutById(workout.id);
    const movements = await client.getMovements();
    const exercises = reconstructExercisesFromSets(detailedWorkout.sets ?? [], movements);

    let report = `# 🏋️ Workout Ready for Editing\n\n`;
    report += `**${detailedWorkout.title}**\n\n`;
    report += `**Workout ID:** ${detailedWorkout.id}\n`;
    report += `**Duration:** ${Math.round(detailedWorkout.duration / 60)} minutes\n`;
    if (detailedWorkout.description) {
      report += `**Description:** ${detailedWorkout.description}\n`;
    }
    report += `\n## Current Structure\n\n`;
    report += `\`\`\`json\n`;
    report += JSON.stringify(
      {
        title: detailedWorkout.title,
        description: detailedWorkout.description || '',
        exercises,
      },
      null,
      2
    );
    report += `\n\`\`\`\n\n`;
    report += `_Use update_workout to save changes to this workout._\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'get_workout_for_editing');
  }
}

/**
 * Updates an existing workout with modified exercise structure.
 * Converts high-level exercises back to low-level sets and persists to API.
 * Returns fresh workout state to prevent hallucination drift.
 */
export async function updateWorkout(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const workoutName = validateRequiredString(args?.workoutName, 'Workout name');
    const title =
      args?.title === undefined
        ? undefined
        : validateRequiredString(args.title, 'Workout title');
    const description = validateOptionalString(args?.description, 'Workout description');
    const requestedExercises = args?.exercises;
    validateWorkoutExercises(requestedExercises);

    const matchingWorkouts = await findWorkoutByName(client, workoutName);

    if (matchingWorkouts.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ No custom workout found with name "${workoutName}".\n\nUse the list_custom_workouts tool to see available workouts.`,
          },
        ],
        isError: true,
      };
    }

    if (matchingWorkouts.length > 1) {
      const workoutList = matchingWorkouts
        .map(workout => `- ${workout.title} (ID: ${workout.id}, created ${new Date(workout.createdAt).toLocaleDateString()})`)
        .join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Multiple workouts found with name "${workoutName}":\n${workoutList}\n\nPlease use a unique workout name.`,
          },
        ],
        isError: true,
      };
    }

    const originalWorkout = matchingWorkouts[0];
    const detailedWorkout = await client.getWorkoutById(originalWorkout.id);
    const movements = await client.getMovements();
    const { exercises, conversions } = await resolvePoundTargets(client, requestedExercises, movements);
    const newSets = exercisesToSets(exercises, movements);

    const updatedWorkout = await client.updateWorkout({
      id: detailedWorkout.id,
      title: title || detailedWorkout.title,
      shortDescription: detailedWorkout.shortDescription,
      description: description !== undefined ? description : detailedWorkout.description || '',
      sets: newSets,
      coachId: detailedWorkout.coachId,
      assetId: detailedWorkout.assetId,
      level: detailedWorkout.level,
      createdSource: 'WorkoutBuilder',
    });

    const freshExercises = reconstructExercisesFromSets(updatedWorkout.sets ?? [], movements);

    let report = `# ✅ Workout Updated Successfully\n\n`;
    report += `**${updatedWorkout.title}**\n\n`;
    report += `**Workout ID:** ${updatedWorkout.id}\n`;
    report += `**Duration:** ${Math.round(updatedWorkout.duration / 60)} minutes\n\n`;
    report += `## Updated Structure\n\n`;
    report += `\`\`\`json\n`;
    report += JSON.stringify(
      {
        title: updatedWorkout.title,
        description: updatedWorkout.description || '',
        exercises: freshExercises,
      },
      null,
      2
    );
    report += `\n\`\`\`\n\n`;
    report += formatPoundConversions(conversions);
    report += `\n_Your changes have been saved and synced to your Tonal!_\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'update_workout');
  }
}
