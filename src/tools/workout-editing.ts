import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalWorkout } from '@dlwiest/ts-tonal-client';
import type { MCPResponse, ExerciseInput, UpdateWorkoutInput } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { exercisesToSets, reconstructExercisesFromSets } from '../utils/workout-conversion.js';

/**
 * Fetches a workout and returns it in a high-level, editable format.
 * Converts low-level sets into simple exercise structure for easy LLM manipulation.
 */
export async function getWorkoutForEditing(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const workoutName = args?.workoutName as string;

    if (!workoutName?.trim()) {
      return handleToolError(new Error('Workout name is required'), 'get_workout_for_editing');
    }

    // Find the workout by name
    const allWorkouts = await client.getUserWorkouts(0, 100);
    const matchingWorkouts = allWorkouts.filter(
      (workout: TonalWorkout) => workout.title.toLowerCase() === workoutName.toLowerCase()
    );

    if (matchingWorkouts.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ No custom workout found with name "${workoutName}".\n\nUse the list_custom_workouts tool to see available workouts.`,
          },
        ],
      };
    }

    if (matchingWorkouts.length > 1) {
      const workoutList = matchingWorkouts.map((w: TonalWorkout) => `- ${w.title} (ID: ${w.id})`).join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Multiple workouts found with name "${workoutName}":\n${workoutList}\n\nPlease use a more specific name.`,
          },
        ],
      };
    }

    const workout = matchingWorkouts[0];

    // Get full workout details
    const detailedWorkout = await client.getWorkoutById(workout.id);

    // Get movements for reconstruction
    const movements = await client.getMovements();

    // Reconstruct exercises from sets
    const exercises = reconstructExercisesFromSets(detailedWorkout.sets, movements);

    // Build the response
    let report = `# 🏋️ Workout Ready for Editing\n\n`;
    report += `**${detailedWorkout.title}**\n\n`;
    report += `**Workout ID:** ${detailedWorkout.id}\n`;
    report += `**Duration:** ${Math.round(detailedWorkout.duration / 60)} minutes\n`;
    if (detailedWorkout.description) {
      report += `**Description:** ${detailedWorkout.description}\n`;
    }
    report += `\n`;

    report += `## Current Structure\n\n`;
    report += `\`\`\`json\n`;
    report += JSON.stringify(
      {
        title: detailedWorkout.title,
        description: detailedWorkout.description || '',
        exercises: exercises,
      },
      null,
      2
    );
    report += `\n\`\`\`\n\n`;

    report += `## Exercises (${exercises.length} total)\n\n`;

    // Group by block for display
    const blockGroups = new Map<number, ExerciseInput[]>();
    for (const ex of exercises) {
      const block = ex.block || 0;
      if (!blockGroups.has(block)) {
        blockGroups.set(block, []);
      }
      blockGroups.get(block)!.push(ex);
    }

    const sortedBlocks = Array.from(blockGroups.entries()).sort((a, b) => a[0] - b[0]);

    for (const [blockNum, blockExercises] of sortedBlocks) {
      report += `### Block ${blockNum}\n`;
      if (blockExercises.length > 1) {
        report += `_(Exercises alternate: ${blockExercises.map(e => e.movementName).join(' → ')})_\n\n`;
      }
      for (const ex of blockExercises) {
        report += `- **${ex.movementName}**\n`;
        report += `  - Sets: ${ex.sets}\n`;
        if (ex.reps) {
          report += `  - Reps: ${ex.reps}\n`;
        }
        if (ex.duration) {
          report += `  - Duration: ${ex.duration}s\n`;
        }
        if (ex.weight) {
          report += `  - Weight: ${ex.weight}%\n`;
        }
      }
      report += `\n`;
    }

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
    const input = args as UpdateWorkoutInput | undefined;

    if (!input?.workoutName?.trim()) {
      return handleToolError(new Error('Workout name is required'), 'update_workout');
    }

    if (!input.exercises || input.exercises.length === 0) {
      return handleToolError(new Error('At least one exercise is required'), 'update_workout');
    }

    // Find the workout by name
    const allWorkouts = await client.getUserWorkouts(0, 100);
    const matchingWorkouts = allWorkouts.filter(
      (workout: TonalWorkout) => workout.title.toLowerCase() === input.workoutName.toLowerCase()
    );

    if (matchingWorkouts.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ No custom workout found with name "${input.workoutName}".\n\nUse the list_custom_workouts tool to see available workouts.`,
          },
        ],
      };
    }

    if (matchingWorkouts.length > 1) {
      const workoutList = matchingWorkouts.map((w: TonalWorkout) => `- ${w.title} (ID: ${w.id})`).join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Multiple workouts found with name "${input.workoutName}":\n${workoutList}\n\nPlease use a more specific name.`,
          },
        ],
      };
    }

    const originalWorkout = matchingWorkouts[0];

    // Get full workout details to retrieve required metadata
    const detailedWorkout = await client.getWorkoutById(originalWorkout.id);

    // Get movements for conversion
    const movements = await client.getMovements();

    // Convert exercises to sets
    const newSets = exercisesToSets(input.exercises, movements);

    // Update the workout
    const updatedWorkout = await client.updateWorkout({
      id: detailedWorkout.id,
      title: input.title || detailedWorkout.title,
      description: input.description !== undefined ? input.description : detailedWorkout.description || '',
      sets: newSets,
      coachId: detailedWorkout.coachId,
      assetId: detailedWorkout.assetId,
      level: detailedWorkout.level,
      createdSource: 'WorkoutBuilder',
    });

    // Reconstruct fresh state to return
    const freshExercises = reconstructExercisesFromSets(updatedWorkout.sets, movements);

    // Build success response
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

    report += `## Exercises (${freshExercises.length} total)\n\n`;

    // Group by block for display
    const blockGroups = new Map<number, ExerciseInput[]>();
    for (const ex of freshExercises) {
      const block = ex.block || 0;
      if (!blockGroups.has(block)) {
        blockGroups.set(block, []);
      }
      blockGroups.get(block)!.push(ex);
    }

    const sortedBlocks = Array.from(blockGroups.entries()).sort((a, b) => a[0] - b[0]);

    for (const [blockNum, blockExercises] of sortedBlocks) {
      report += `### Block ${blockNum}\n`;
      if (blockExercises.length > 1) {
        report += `_(Exercises alternate: ${blockExercises.map(e => e.movementName).join(' → ')})_\n\n`;
      }
      for (const ex of blockExercises) {
        report += `- **${ex.movementName}**\n`;
        report += `  - Sets: ${ex.sets}\n`;
        if (ex.reps) {
          report += `  - Reps: ${ex.reps}\n`;
        }
        if (ex.duration) {
          report += `  - Duration: ${ex.duration}s\n`;
        }
        if (ex.weight) {
          report += `  - Weight: ${ex.weight}%\n`;
        }
      }
      report += `\n`;
    }

    report += `_Your changes have been saved and synced to your Tonal!_\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    // Extract detailed error information if available
    if (error && typeof error === 'object' && 'originalError' in error) {
      const originalError = (error as any).originalError;
      if (originalError && typeof originalError === 'object') {
        const errorDetails = JSON.stringify(originalError, null, 2);
        const errorMessage = (error as any).message || 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ **Error updating workout**\n\n${errorMessage}\n\n**Details:**\n\`\`\`json\n${errorDetails}\n\`\`\``,
            },
          ],
        };
      }
    }
    return handleToolError(error, 'update_workout');
  }
}
