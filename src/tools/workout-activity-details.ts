import TonalClient from '@dlwiest/ts-tonal-client';
import type {
  TonalFormattedWorkoutSummary,
  TonalWorkoutSetActivity,
} from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { validateRequiredString } from '../utils/validation.js';

// Tonal's built-in Rest movement: a programmed rest block, not a working set.
const REST_MOVEMENT_ID = '00000000-0000-0000-0000-000000000005';

// Warm-up, drop set, and burnout match get_custom_workout_details. Only modifiers
// Tonal reports as on are rendered, so an absent flag is never shown as off.
const SET_MODIFIERS: Array<[keyof TonalWorkoutSetActivity, string]> = [
  ['warmUp', 'Warm-up'],
  ['dropSet', 'Drop set'],
  ['burnout', 'Burnout'],
  ['eccentric', 'Eccentric'],
  ['chains', 'Chains'],
  ['flex', 'Smart Flex'],
  ['spotter', 'Spotter'],
];

interface FormattedMovementSet {
  movementName?: string | null;
  blockNumber?: number | null;
  setGroup?: number | null;
  totalVolume?: number | null;
  totalOnMachineVolume?: number | null;
  sets?: unknown[] | null;
}

// The 0.6.0 runtime returns these fields, but its published declarations omit them.
// Omit avoids conflicts with pending declarations; remove this overlay after a client
// release publishes the fields.
type CompleteFormattedWorkoutSummary = Omit<
  TonalFormattedWorkoutSummary,
  'coachName' | 'timeUnderTension' | 'movementSets'
> & {
  coachName?: string | null;
  timeUnderTension?: number | null;
  movementSets?: FormattedMovementSet[] | null;
};

function formatMetric(
  value: number | null | undefined,
  unit?: string
): string {
  if (value === undefined || value === null) {
    return 'not reported';
  }

  return unit ? `${value} ${unit}` : String(value);
}

export async function getWorkoutActivityDetails(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const activityId = validateRequiredString(args?.activityId, 'activityId');
    const detail = await client.getWorkoutActivityById(activityId);
    const movements = await client.getMovements().catch(() => []);
    const movementNames = new Map(
      movements.map(movement => [movement.id, movement.name])
    );
    const onMachineMovements = new Map(
      movements.map(movement => [movement.id, movement.onMachine])
    );

    let report = '# Workout Activity Details\n\n';
    report += `- Activity ID: ${detail.id}\n`;
    report += `- Began: ${detail.beginTime}\n`;
    report += `- Ended: ${detail.endTime ?? 'not reported'}\n`;
    report += `- Wall-clock session duration (totalDuration): ${formatMetric(detail.totalDuration, 'seconds')}\n`;
    report += `- Time under tension (activeDuration): ${formatMetric(detail.activeDuration, 'seconds')}\n`;
    report += `- Total sets: ${detail.totalSets}\n`;
    report += `- Total reps: ${detail.totalReps}\n`;
    report += `- Total volume: ${formatMetric(detail.totalVolume, 'lb')}\n`;

    report += '\n## Performed Sets\n';
    if (detail.workoutSetActivity.length === 0) {
      report += 'No performed sets were returned for this activity.\n';
    } else {
      let previousEndTime: number | undefined;
      detail.workoutSetActivity.forEach((set, index) => {
        const movementName = movementNames.get(set.movementId)
          ?? 'Unknown movement (catalog entry unavailable)';
        report += `\n### Set ${index + 1}: ${movementName}\n`;
        report += `- Set group (setGroup): ${formatMetric(set.setGroup)}\n`;
        report += `- Block number (blockNumber): ${formatMetric(set.blockNumber)}\n`;
        report += `- Reps (repCount): ${formatMetric(set.repCount)}\n`;
        report += `- Average weight (avgWeight): ${formatMetric(set.avgWeight, 'lb')}\n`;
        report += `- One-rep max (oneRepMax): ${formatMetric(set.oneRepMax, 'lb')}\n`;
        report += `- On-machine volume (totalOnMachineVolume): ${formatMetric(set.totalOnMachineVolume, 'lb')}\n`;
        report += `- Range of motion (romLengthIn): ${formatMetric(set.romLengthIn, 'in')}\n`;

        const prescription: string[] = [];
        if (set.prescribedReps !== undefined && set.prescribedReps !== null) {
          prescription.push(`Prescribed reps (prescribedReps): ${set.prescribedReps}`);
        }
        if (set.prescribedDuration !== undefined) {
          prescription.push(`Prescribed duration (prescribedDuration): ${formatMetric(set.prescribedDuration, 'seconds')}`);
        }
        if (prescription.length > 0) {
          report += `- ${prescription.join(' | ')}\n`;
        }

        // Off-machine and Rest sets carry a placeholder baseWeight (0 or 5), while timed
        // on-machine holds carry real load with avgWeight 0, so the catalog decides.
        // Without a catalog entry, fall back to whether the set moved weight.
        const performed = (set.duration ?? 0) > 0;
        const onMachine = onMachineMovements.get(set.movementId) ?? (set.avgWeight ?? 0) > 0;
        if (performed && onMachine && set.baseWeight !== undefined && set.baseWeight !== null) {
          const load = [`Base weight (baseWeight): ${formatMetric(set.baseWeight, 'lb')}`];
          // Eccentric and chains weights are added on top of baseWeight (maxWeight is their sum).
          if (set.eccentric && (set.eccentricWeight ?? 0) > 0) {
            load.push(`Added eccentric load (eccentricWeight): ${formatMetric(set.eccentricWeight, 'lb')}`);
          }
          if (set.chains && (set.chainsWeight ?? 0) > 0) {
            load.push(`Added chains load (chainsWeight): ${formatMetric(set.chainsWeight, 'lb')}`);
          }
          report += `- ${load.join(' | ')}\n`;
        }

        const modifiers = SET_MODIFIERS
          .filter(([field]) => set[field] === true)
          .map(([field, label]) => `${label} (${field})`);
        if (modifiers.length > 0) {
          report += `- Modifiers: ${modifiers.join(', ')}\n`;
        }

        if (typeof set.repsInReserve === 'number') {
          // A fractional model estimate; one decimal is all the precision it carries.
          report += `- Estimated reps in reserve (repsInReserve): ${Number(set.repsInReserve.toFixed(1))}\n`;
        }

        const personalRecords = (set.prs ?? []).filter(
          (record): record is string => typeof record === 'string'
        );
        if (personalRecords.length > 0) {
          report += `- Personal records (prs): ${personalRecords.join(', ')}\n`;
        }

        // Tonal's restDuration is not per-set rest, so rest is derived from timestamps:
        // this set's beginTime minus the endTime of the last working set that ran.
        // Skipped sets (zero duration, out-of-order timestamps) and programmed Rest
        // blocks don't reset it, so rest after a Rest block includes the block.
        const timing: string[] = [];
        if (set.duration !== undefined) {
          timing.push(`Set duration (duration): ${formatMetric(set.duration, 'seconds')}`);
        }
        const working = performed && set.movementId !== REST_MOVEMENT_ID;
        const beginTime = Date.parse(set.beginTime ?? '');
        if (working && previousEndTime !== undefined && beginTime >= previousEndTime) {
          timing.push(`Rest before set: ${Math.round((beginTime - previousEndTime) / 1000)} seconds`);
        }
        if (timing.length > 0) {
          report += `- ${timing.join(' | ')}\n`;
        }
        const endTime = Date.parse(set.endTime ?? '');
        if (working && Number.isFinite(endTime)) {
          previousEndTime = endTime;
        }
      });
    }

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'get_workout_activity_details');
  }
}

export async function getWorkoutSummary(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const activityId = validateRequiredString(args?.activityId, 'activityId');
    const summary = await client.getFormattedWorkoutSummary(activityId) as CompleteFormattedWorkoutSummary;

    let report = '# Workout Summary\n\n';
    report += `- Name: ${summary.name}\n`;
    report += `- Coach: ${summary.coachName ?? 'not reported'}\n`;
    report += `- Target area: ${summary.targetArea}\n`;
    report += `- In program (isInProgram): ${summary.isInProgram ? 'yes' : 'no'}\n`;
    report += `- Guided workout (isGuidedWorkout): ${summary.isGuidedWorkout ? 'yes' : 'no'}\n`;
    report += `- Wall-clock session duration (duration): ${formatMetric(summary.duration, 'seconds')}\n`;
    report += `- Time under tension (timeUnderTension): ${formatMetric(summary.timeUnderTension, 'seconds')}\n`;

    const movementSets = summary.movementSets ?? [];
    report += '\n## Movement Breakdown\n';
    if (movementSets.length === 0) {
      report += 'No movement breakdown was returned for this workout.\n';
    } else {
      movementSets.forEach((movement, index) => {
        report += `\n### ${index + 1}. ${movement.movementName ?? 'Unknown movement'}\n`;
        report += `- Block number (blockNumber): ${formatMetric(movement.blockNumber)}\n`;
        report += `- Set group (setGroup): ${formatMetric(movement.setGroup)}\n`;
        report += `- Total volume (totalVolume): ${formatMetric(movement.totalVolume, 'lb')}\n`;
        report += `- On-machine volume (totalOnMachineVolume): ${formatMetric(movement.totalOnMachineVolume, 'lb')}\n`;
        report += `- Performed set entries: ${movement.sets?.length ?? 'not reported'}\n`;
      });
    }

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'get_workout_summary');
  }
}
