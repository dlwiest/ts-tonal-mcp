import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { exercisesToSets } from '../utils/workout-conversion.js';
import { formatPoundConversions, resolvePoundTargets } from '../utils/pound-targets.js';
import { validateWorkoutExercises } from '../utils/validation.js';

export async function estimateWorkoutDuration(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const requestedExercises = args?.exercises;
    validateWorkoutExercises(requestedExercises);

    const movements = await client.getMovements();
    const { exercises, conversions } = await resolvePoundTargets(client, requestedExercises, movements);
    const sets = exercisesToSets(exercises, movements);
    const estimate = await client.estimateWorkoutDuration(sets);

    const minutes = Math.round(estimate.duration / 60);

    let report = `# ⏱️ Estimated Workout Duration\n\n`;
    report += `**${minutes} minute${minutes === 1 ? '' : 's'}** (${estimate.duration}s across ${sets.length} set${sets.length === 1 ? '' : 's'})\n\n`;
    report += `## Exercises (${exercises.length} total)\n\n`;

    // Follows create_workout's exercise summary shape, with one deliberate difference: when
    // setDetails is present the exercise-level weight is labelled "where unspecified".
    // exercisesToSets resolves each set as (setDetail.weight ?? exercise.weight ?? 0), so a
    // bare "@ 70%" would overstate uniformity for sets that carry their own weight -- and
    // this tool exists precisely to describe a workout the caller cannot otherwise inspect.
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
        const everySetSpecifiesWeight =
          setDetails?.every(detail => typeof detail?.weight === 'number') ?? false;
        if (!setDetails) {
          report += ` @ ${exercise.weight}%`;
        } else if (!everySetSpecifiesWeight) {
          report += ` @ ${exercise.weight}% where unspecified`;
        }
      }
      if (exercise.isWarmup === true) {
        report += ` (Warmup)`;
      }
      report += `\n`;
    });

    report += formatPoundConversions(conversions);
    report += `\n_Estimate only — nothing was created or modified on your Tonal._\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'estimate_workout_duration');
  }
}
