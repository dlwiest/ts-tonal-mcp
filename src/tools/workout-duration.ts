import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { exercisesToSets } from '../utils/workout-conversion.js';
import { validateWorkoutExercises } from '../utils/validation.js';

export async function estimateWorkoutDuration(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const exercises = args?.exercises;
    validateWorkoutExercises(exercises);

    const movements = await client.getMovements();
    const sets = exercisesToSets(exercises, movements);

    const estimate = await client.estimateWorkoutDuration(sets);
    const totalMinutes = Math.round(estimate.duration / 60);
    const totalSeconds = estimate.duration;

    let report = `# ⏱️ Estimated Workout Duration\n\n`;
    report += `**${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}** (${totalSeconds}s)\n\n`;
    report += `## Exercises (${exercises.length} total)\n\n`;

    exercises.forEach((exercise, index) => {
      const setDetails = Array.isArray(exercise.setDetails) ? exercise.setDetails : undefined;
      const setCount =
        setDetails?.length ??
        (typeof exercise.sets === 'number' ? exercise.sets : 0);
      report += `${index + 1}. **${exercise.movementName}** - ${setCount} sets`;

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

    report += `\n_This is an estimate only — no workout was created or modified._\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'estimate_workout_duration');
  }
}
