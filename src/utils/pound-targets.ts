import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalMovement } from '@dlwiest/ts-tonal-client';
import { isExternalActivity, type ActivitySummary } from './activity-summaries.js';
import { TonalMCPError } from './error-handler.js';
import { isRecord } from './workout-conversion.js';

/**
 * Tonal stores a set's load as weightPercentage of the suggested weight it records on every
 * performed set. Measured on one account's 4,600 performed on-machine sets without
 * eccentric, chains or Smart Flex, the loaded baseWeight equalled weightPercentage x
 * suggestedWeight within 1 lb on 97%, across StraightBar, Handles and Rope. No cable factor
 * is involved: suggestedWeight is already in the pounds the trainer displays. Eccentric,
 * chains and Smart Flex then move the loaded weight away from that base.
 *
 * The suggestion depends on the prescription: within one session, a movement's 15-rep sets
 * carried a lower suggestion than its 10-rep sets in every one of 147 cases. So a pound
 * target converts only against a suggestion recorded at the same prescribed reps (or, for
 * timed movements, the same duration). Matched that way, the newest earlier suggestion was
 * within 5% of the next session's on 92% of sets, versus 81% ignoring the prescription.
 * Tonal still raises it as you progress, and a stored percentage scales with it.
 */

/** Recent activities scanned for suggestions before giving up. */
export const SUGGESTION_LOOKBACK_ACTIVITIES = 20;
const DETAIL_BATCH_SIZE = 5;
/** Tonal's own programming never exceeded 100% in the measured history; above it is untested. */
const MAX_PERCENTAGE = 100;

export interface SuggestedWeight {
  /** Tonal's last recorded suggested weight in pounds: an estimate of what 100% loads. */
  pounds: number;
  /** When the set carrying this suggestion began. */
  performedAt: string;
}

/** A prescription key: `r10` for 10 reps, `d30` for 30 seconds. */
export type Prescription = `r${number}` | `d${number}`;

/** Suggestions per movement ID, then per prescription. */
export type SuggestionsByMovement = Map<string, Map<Prescription, SuggestedWeight>>;

export interface PoundConversion {
  movementName: string;
  /** 1-based position of the exercise in the request. */
  exerciseNumber: number;
  /** 1-based set number, or undefined for an exercise-level target on uniform sets. */
  setNumber?: number;
  prescription: Prescription;
  requestedPounds: number;
  percentage: number;
  expectedPounds: number;
  suggestion: SuggestedWeight;
}

export function describePrescription(prescription: Prescription): string {
  const amount = Number(prescription.slice(1));
  return prescription.startsWith('r') ? `${amount} reps` : `${amount} s`;
}

function setPrescription(set: { prescribedReps?: number | null; prescribedDuration?: number }): Prescription | undefined {
  if ((set.prescribedReps ?? 0) > 0) {
    return `r${set.prescribedReps as number}`;
  }
  if ((set.prescribedDuration ?? 0) > 0) {
    return `d${set.prescribedDuration as number}`;
  }
  return undefined;
}

/**
 * Collects the newest suggested weight per movement and prescription from recent Tonal
 * activities. Stops early once every `required` key (`movementId|prescription`) is found;
 * without `required`, scans the whole lookback window.
 */
export async function findSuggestedWeights(
  client: TonalClient,
  movementIds: ReadonlySet<string>,
  required?: ReadonlySet<string>
): Promise<SuggestionsByMovement> {
  const found: SuggestionsByMovement = new Map();
  if (movementIds.size === 0) {
    return found;
  }
  const missing = new Set(required);

  const summaries = (await client.getActivitySummaries()) as ActivitySummary[];
  const recent = summaries
    .filter(summary => !isExternalActivity(summary))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, SUGGESTION_LOOKBACK_ACTIVITIES);

  for (let start = 0; start < recent.length; start += DETAIL_BATCH_SIZE) {
    if (required !== undefined && missing.size === 0) {
      break;
    }
    const batch = recent.slice(start, start + DETAIL_BATCH_SIZE);
    const details = await Promise.all(batch.map(summary => client.getWorkoutActivityById(summary.id)));

    // Newest activity first, so the first activity containing a prescription wins.
    for (const detail of details) {
      const newestInActivity = new Map<string, { movementId: string; prescription: Prescription; suggestion: SuggestedWeight }>();
      for (const set of detail.workoutSetActivity ?? []) {
        const prescription = setPrescription(set);
        if (
          !movementIds.has(set.movementId) ||
          prescription === undefined ||
          found.get(set.movementId)?.has(prescription) ||
          !((set.duration ?? 0) > 0) ||
          !((set.suggestedWeight ?? 0) > 0) ||
          set.beginTime === undefined
        ) {
          continue;
        }
        const key = `${set.movementId}|${prescription}`;
        const current = newestInActivity.get(key);
        if (current === undefined || Date.parse(set.beginTime) > Date.parse(current.suggestion.performedAt)) {
          newestInActivity.set(key, {
            movementId: set.movementId,
            prescription,
            suggestion: { pounds: set.suggestedWeight as number, performedAt: set.beginTime },
          });
        }
      }
      for (const [key, { movementId, prescription, suggestion }] of newestInActivity) {
        let byPrescription = found.get(movementId);
        if (byPrescription === undefined) {
          byPrescription = new Map();
          found.set(movementId, byPrescription);
        }
        byPrescription.set(prescription, suggestion);
        missing.delete(key);
      }
    }
  }

  return found;
}

function readPounds(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TonalMCPError(`${label} must be a number greater than 0`, 'VALIDATION_ERROR', 400);
  }
  return value;
}

function prescriptionOf(movement: TonalMovement, source: Record<string, unknown>): Prescription | undefined {
  const value = movement.countReps ? source.reps : source.duration;
  if (typeof value !== 'number' || !(value > 0)) {
    return undefined;
  }
  return movement.countReps ? `r${value}` : `d${value}`;
}

interface PendingTarget {
  movement: TonalMovement;
  exerciseNumber: number;
  setNumber?: number;
  pounds: number;
  prescription: Prescription;
  apply: (percentage: number) => void;
}

/**
 * Replaces every weightLb in the exercises with the equivalent weight percentage, looking up
 * suggested weights only when a pound target is present. Returns new exercise objects; the
 * input is not modified. A set's own weight or weightLb overrides an exercise-level target,
 * mirroring weight; an exercise-level target converts per set, since each set's reps select
 * its suggestion.
 */
export async function resolvePoundTargets<T>(
  client: TonalClient,
  exercises: T[],
  movements: TonalMovement[]
): Promise<{ exercises: T[]; conversions: PoundConversion[] }> {
  const movementByName = new Map(movements.map(movement => [movement.name.toLowerCase(), movement]));
  const pending: PendingTarget[] = [];

  const resolved = exercises.map((exercise, exerciseIndex) => {
    if (!isRecord(exercise) || typeof exercise.movementName !== 'string') {
      return exercise;
    }
    const setDetails = Array.isArray(exercise.setDetails) ? exercise.setDetails : undefined;
    const hasTarget =
      exercise.weightLb !== undefined ||
      (setDetails?.some(set => isRecord(set) && set.weightLb !== undefined) ?? false);
    const movement = movementByName.get(exercise.movementName.toLowerCase());
    if (!hasTarget || movement === undefined) {
      return exercise; // exercisesToSets reports unknown movement names.
    }
    if (!movement.onMachine) {
      throw new TonalMCPError(
        `Exercise "${movement.name}" uses weightLb, but it is an off-machine movement with no Tonal load`,
        'VALIDATION_ERROR',
        400
      );
    }

    const exerciseNumber = exerciseIndex + 1;
    const { weightLb, ...rest } = exercise;
    const exercisePounds = readPounds(weightLb, `Exercise "${movement.name}" weightLb`);
    if (exercisePounds !== undefined && rest.weight !== undefined) {
      throw new TonalMCPError(
        `Exercise "${movement.name}" cannot specify both weight and weightLb`,
        'VALIDATION_ERROR',
        400
      );
    }
    const converted: Record<string, unknown> = { ...rest };
    const unit = movement.countReps ? 'reps' : 'duration';

    if (setDetails === undefined) {
      if (exercisePounds !== undefined) {
        const prescription = prescriptionOf(movement, rest);
        if (prescription === undefined) {
          throw new TonalMCPError(
            `Exercise "${movement.name}" uses weightLb without ${unit}; Tonal's suggestion depends on the prescribed ${unit}`,
            'VALIDATION_ERROR',
            400
          );
        }
        pending.push({
          movement, exerciseNumber, pounds: exercisePounds, prescription,
          apply: percentage => { converted.weight = percentage; },
        });
      }
      return converted;
    }

    converted.setDetails = setDetails.map((set, index) => {
      if (!isRecord(set)) {
        return set;
      }
      const { weightLb: setWeightLb, ...setRest } = set;
      const setPounds = readPounds(setWeightLb, `Exercise "${movement.name}" setDetails[${index}] weightLb`);
      if (setPounds !== undefined && setRest.weight !== undefined) {
        throw new TonalMCPError(
          `Exercise "${movement.name}" setDetails[${index}] cannot specify both weight and weightLb`,
          'VALIDATION_ERROR',
          400
        );
      }
      const pounds = setPounds ?? (setRest.weight === undefined ? exercisePounds : undefined);
      if (pounds === undefined) {
        return setRest;
      }
      const prescription = prescriptionOf(movement, setRest);
      if (prescription === undefined) {
        throw new TonalMCPError(
          `Exercise "${movement.name}" setDetails[${index}] has a pound target without ${unit}; Tonal's suggestion depends on the prescribed ${unit}`,
          'VALIDATION_ERROR',
          400
        );
      }
      const convertedSet: Record<string, unknown> = { ...setRest };
      pending.push({
        movement, exerciseNumber, setNumber: index + 1, pounds, prescription,
        apply: percentage => { convertedSet.weight = percentage; },
      });
      return convertedSet;
    });
    return converted;
  });

  if (pending.length === 0) {
    return { exercises: resolved as T[], conversions: [] };
  }

  const suggestions = await findSuggestedWeights(
    client,
    new Set(pending.map(target => target.movement.id)),
    new Set(pending.map(target => `${target.movement.id}|${target.prescription}`))
  );

  const conversions: PoundConversion[] = [];
  for (const target of pending) {
    const { movement, setNumber, pounds, prescription } = target;
    const where = setNumber === undefined ? '' : ` set ${setNumber}`;
    const available = suggestions.get(movement.id);
    const suggestion = available?.get(prescription);
    if (suggestion === undefined) {
      const seen = available === undefined || available.size === 0
        ? 'it was not performed with a suggested weight'
        : `it has suggestions only at ${[...available.keys()].map(describePrescription).join(', ')}`;
      throw new TonalMCPError(
        `Exercise "${movement.name}"${where} weightLb needs Tonal's suggested weight at ${describePrescription(prescription)}, but in your last ${SUGGESTION_LOOKBACK_ACTIVITIES} Tonal workouts ${seen}. Tonal's suggestion depends on the prescription, so use weight (a percentage) here instead.`,
        'VALIDATION_ERROR',
        400
      );
    }

    const percentage = Math.round((pounds / suggestion.pounds) * 100);
    const share = `Exercise "${movement.name}"${where} weightLb ${pounds} is ${percentage}% of Tonal's suggested weight of ${Math.round(suggestion.pounds)} lb at ${describePrescription(prescription)}`;
    if (percentage < 1) {
      throw new TonalMCPError(`${share}, below the 1% minimum.`, 'VALIDATION_ERROR', 400);
    }
    if (percentage > MAX_PERCENTAGE) {
      throw new TonalMCPError(
        `${share}, above ${MAX_PERCENTAGE}%. Tonal's own programming stays at or below 100% of its suggestion, and a higher percentage has not been verified on a trainer.`,
        'VALIDATION_ERROR',
        400
      );
    }
    target.apply(percentage);
    conversions.push({
      movementName: movement.name,
      exerciseNumber: target.exerciseNumber,
      setNumber,
      prescription,
      requestedPounds: pounds,
      percentage,
      expectedPounds: Math.round((percentage / 100) * suggestion.pounds),
      suggestion,
    });
  }

  // Conversion only swaps weightLb for weight, so each exercise keeps its validated shape.
  return { exercises: resolved as T[], conversions };
}

export function formatPoundConversions(conversions: PoundConversion[]): string {
  if (conversions.length === 0) {
    return '';
  }
  let report = `\n## Pound Targets\n`;
  for (const conversion of conversions) {
    const where = conversion.setNumber === undefined ? '' : ` set ${conversion.setNumber}`;
    report += `- Exercise ${conversion.exerciseNumber}, ${conversion.movementName}${where}: ${conversion.requestedPounds} lb → ${conversion.percentage}% ≈ ${conversion.expectedPounds} lb (Tonal's suggested weight at ${describePrescription(conversion.prescription)}: ${Math.round(conversion.suggestion.pounds)} lb, from ${conversion.suggestion.performedAt})\n`;
  }
  report += `\nTonal stores percentages of its suggested weight, which depends on the prescribed reps and was last recorded at the date shown. It may have changed since and rises as Tonal progresses you, so the pounds are estimates. Eccentric, chains, and Smart Flex adjust the loaded weight from this base.\n`;
  return report;
}
