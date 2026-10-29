import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalMovement, TonalWorkoutEstimateSet } from '@dlwiest/ts-tonal-client';
import { estimateWorkoutDuration } from '../src/tools/workout-duration.js';
import { getSuggestedWeights } from '../src/tools/suggested-weights.js';
import { createWorkout } from '../src/tools/custom-workouts.js';
import type { MCPResponse } from '../src/types/index.js';

function reportText(response: MCPResponse): string {
  const [content] = response.content;
  assert.ok(content && content.type === 'text', 'expected a text content block');
  return content.text;
}

function movement(id: string, name: string, overrides: Partial<TonalMovement> = {}): TonalMovement {
  return {
    id, name, onMachine: true, countReps: true, isAlternating: false, isTwoSided: false, ...overrides,
  } as unknown as TonalMovement;
}

const MOVEMENTS = [
  movement('bench', 'Bench Press'),
  movement('row', 'Seated Row'),
  movement('carry', 'Farmer Carry', { countReps: false }),
  movement('plank', 'Plank', { onMachine: false, countReps: false }),
];

interface PerformedSet {
  movementId: string;
  beginTime: string;
  suggestedWeight: number;
  prescribedReps?: number;
  prescribedDuration?: number;
  duration?: number;
}

/** Summaries come back in the given order, which tests set to something other than newest first. */
function fakeClient(
  activities: { id: string; timestamp: string; activityType?: string; sets: PerformedSet[] }[],
  onEstimate?: (sets: TonalWorkoutEstimateSet[]) => void
): TonalClient & { detailCalls: string[] } {
  const detailCalls: string[] = [];
  return {
    detailCalls,
    getMovements: async () => MOVEMENTS,
    getActivitySummaries: async () => activities.map(({ id, timestamp, activityType }) => ({
      id, timestamp, activityType: activityType ?? 'Internal',
    })),
    getWorkoutActivityById: async (id: string) => {
      detailCalls.push(id);
      const activity = activities.find(candidate => candidate.id === id);
      assert.ok(activity, `unexpected activity ${id}`);
      // Tonal answers an imported activity's detail with 404.
      assert.notEqual(activity.activityType, 'External', 'imported activity details were requested');
      return { id, workoutSetActivity: activity.sets.map(set => ({ duration: 30, ...set })) };
    },
    estimateWorkoutDuration: async (sets: TonalWorkoutEstimateSet[]) => {
      onEstimate?.(sets);
      return { duration: 600 };
    },
  } as unknown as TonalClient & { detailCalls: string[] };
}

const HISTORY = [
  {
    id: 'older', timestamp: '2026-10-01T12:00:00Z',
    sets: [
      { movementId: 'bench', beginTime: '2026-10-01T12:05:00Z', suggestedWeight: 50, prescribedReps: 10 },
      // Only the older session has bench at 5 reps.
      { movementId: 'bench', beginTime: '2026-10-01T12:15:00Z', suggestedWeight: 70, prescribedReps: 5 },
    ],
  },
  {
    id: 'newer', timestamp: '2026-10-10T12:00:00Z',
    sets: [
      // Listed out of order: the newest set (by beginTime) wins, not the last one listed.
      { movementId: 'bench', beginTime: '2026-10-10T12:10:00Z', suggestedWeight: 62, prescribedReps: 10 },
      { movementId: 'bench', beginTime: '2026-10-10T12:05:00Z', suggestedWeight: 60, prescribedReps: 10 },
      // A lower suggestion at more reps, in the same session.
      { movementId: 'bench', beginTime: '2026-10-10T12:20:00Z', suggestedWeight: 54, prescribedReps: 15 },
      // Skipped set: never the source of a suggestion.
      { movementId: 'bench', beginTime: '2026-10-10T12:25:00Z', suggestedWeight: 99, prescribedReps: 10, duration: 0 },
      { movementId: 'row', beginTime: '2026-10-10T12:30:00Z', suggestedWeight: 40, prescribedReps: 10 },
      { movementId: 'carry', beginTime: '2026-10-10T12:40:00Z', suggestedWeight: 80, prescribedDuration: 30 },
    ],
  },
  {
    // Newest, but imported: its details must never be requested.
    id: 'imported', timestamp: '2026-10-20T12:00:00Z', activityType: 'External', sets: [],
  },
];

async function sentPercentages(exercises: unknown[]): Promise<{ weights: number[]; text: string }> {
  let weights: number[] = [];
  const response = await estimateWorkoutDuration(
    fakeClient(HISTORY, sets => { weights = sets.map(set => set.weightPercentage); }),
    { exercises }
  );
  return { weights, text: reportText(response) };
}

test('converts pounds against the newest suggestion at the same reps and reports the expected load', async () => {
  const { weights, text } = await sentPercentages([
    { movementName: 'Bench Press', sets: 2, reps: 10, weightLb: 50 },
  ]);

  // 50 / 62 = 80.6% -> 81%, which loads 50 lb at a 62 lb suggestion.
  assert.deepEqual(weights, [81, 81]);
  assert.match(text, /Exercise 1, Bench Press: 50 lb → 81% ≈ 50 lb \(Tonal's suggested weight at 10 reps: 62 lb, from 2026-10-10T12:10:00Z\)/);
});

test('each set converts against the suggestion for its own reps', async () => {
  const { weights } = await sentPercentages([
    {
      movementName: 'Bench Press',
      weightLb: 45,
      setDetails: [{ reps: 15 }, { reps: 10 }, { reps: 5, weightLb: 63 }],
    },
  ]);

  // 45/54 = 83%, 45/62 = 73%, and 63/70 = 90% from the older session's 5-rep suggestion.
  assert.deepEqual(weights, [83, 73, 90]);
});

test('timed movements match on duration', async () => {
  const { weights } = await sentPercentages([{ movementName: 'Farmer Carry', sets: 1, duration: 30, weightLb: 60 }]);

  assert.deepEqual(weights, [75]);
});

test('a set-level target or weight overrides the exercise level', async () => {
  const { weights, text } = await sentPercentages([
    {
      movementName: 'Seated Row',
      weightLb: 30,
      setDetails: [{ reps: 10 }, { reps: 10, weightLb: 36 }, { reps: 10, weight: 100 }],
    },
  ]);

  assert.deepEqual(weights, [75, 90, 100]);
  assert.match(text, /Exercise 1, Seated Row set 1: 30 lb → 75%/);
  assert.doesNotMatch(text, /set 3/);
});

test('converts each exercise on its own, matching movement names case-insensitively', async () => {
  const { weights, text } = await sentPercentages([
    { movementName: 'bench press', sets: 1, reps: 10, weightLb: 31 },
    { movementName: 'Bench Press', sets: 1, reps: 10, weightLb: 62 },
  ]);

  assert.deepEqual(weights, [50, 100]);
  assert.match(text, /Exercise 1, Bench Press: 31 lb → 50%/);
  assert.match(text, /Exercise 2, Bench Press: 62 lb → 100%/);
});

test('an exercise-level target that every set overrides is neither checked nor reported', async () => {
  const { weights, text } = await sentPercentages([
    { movementName: 'Seated Row', weightLb: 500, setDetails: [{ reps: 10, weight: 70 }, { reps: 10, weightLb: 36 }] },
  ]);

  assert.deepEqual(weights, [70, 90]);
  assert.doesNotMatch(text, /500 lb/);
});

test('create_workout sends the converted percentages', async () => {
  let created: TonalWorkoutEstimateSet[] = [];
  const client = Object.assign(fakeClient(HISTORY), {
    createWorkout: async ({ title, sets }: { title: string; sets: TonalWorkoutEstimateSet[] }) => {
      created = sets;
      return { id: 'w1', title, duration: 300 };
    },
  });
  const text = reportText(await createWorkout(client, {
    title: 'Pounds',
    exercises: [{ movementName: 'Seated Row', sets: 2, reps: 10, weightLb: 30 }],
  }));

  assert.deepEqual(created.map(set => set.weightPercentage), [75, 75]);
  assert.match(text, /\*\*Seated Row\*\* - 2 sets × 10 reps @ 75%/);
  assert.match(text, /Exercise 1, Seated Row: 30 lb → 75% ≈ 30 lb/);
});

test('rejects pound targets that cannot be converted, before estimating anything', async () => {
  const cases: [unknown, RegExp][] = [
    [{ movementName: 'Bench Press', sets: 1, reps: 10, weight: 80, weightLb: 50 }, /both weight and weightLb/],
    [{ movementName: 'Bench Press', setDetails: [{ reps: 10, weight: 80, weightLb: 50 }] }, /setDetails\[0\] cannot specify both/],
    [{ movementName: 'Bench Press', sets: 1, reps: 10, weightLb: 70 }, /113% of Tonal's suggested weight of 62 lb at 10 reps, above 100%/],
    [{ movementName: 'Bench Press', sets: 1, reps: 10, weightLb: 0.2 }, /0% of Tonal's suggested weight of 62 lb at 10 reps, below the 1% minimum/],
    [{ movementName: 'Bench Press', sets: 1, reps: 10, weightLb: 0 }, /weightLb must be a number greater than 0/],
    [{ movementName: 'Bench Press', sets: 1, weightLb: 40 }, /without reps; Tonal's suggestion depends on the prescribed reps/],
    [{ movementName: 'Bench Press', sets: 1, reps: 8, weightLb: 40 }, /at 8 reps, but in your last 20 Tonal workouts it has suggestions only at 10 reps, 15 reps, 5 reps.*use weight/],
    [{ movementName: 'Plank', sets: 1, duration: 30, weightLb: 10 }, /off-machine movement/],
  ];
  for (const [exercise, message] of cases) {
    let estimated = false;
    const response = await estimateWorkoutDuration(
      fakeClient(HISTORY, () => { estimated = true; }),
      { exercises: [exercise] }
    );
    assert.equal(response.isError, true, String(message));
    assert.match(reportText(response), message);
    assert.equal(estimated, false, String(message));
  }
});

test('refuses a pound target for a movement with no recent performance', async () => {
  const response = await estimateWorkoutDuration(
    fakeClient([HISTORY[0]]),
    { exercises: [{ movementName: 'Seated Row', sets: 1, reps: 10, weightLb: 30 }] }
  );

  assert.equal(response.isError, true);
  assert.match(reportText(response), /in your last 20 Tonal workouts it was not performed with a suggested weight.*use weight \(a percentage\)/);
});

test('workouts without pound targets never read activity history', async () => {
  const client = fakeClient(HISTORY);
  const response = await estimateWorkoutDuration(client, {
    exercises: [{ movementName: 'Bench Press', sets: 1, reps: 5, weight: 80 }],
  });

  assert.equal(response.isError, undefined);
  assert.deepEqual(client.detailCalls, []);
  assert.doesNotMatch(reportText(response), /Pound Targets/);
});

test('conversion stops reading history once every needed prescription is found', async () => {
  const many = Array.from({ length: 12 }, (_, index) => {
    const day = String(28 - index).padStart(2, '0');
    return {
      id: `a${index}`,
      timestamp: `2026-09-${day}T12:00:00Z`,
      sets: [{ movementId: 'bench', beginTime: `2026-09-${day}T12:05:00Z`, suggestedWeight: 40 + index, prescribedReps: 10 }],
    };
  });
  const client = fakeClient(many);
  const response = await estimateWorkoutDuration(client, {
    exercises: [{ movementName: 'Bench Press', sets: 1, reps: 10, weightLb: 20 }],
  });

  assert.match(reportText(response), /at 10 reps: 40 lb/);
  assert.equal(client.detailCalls.length, 5);
});

test('get_suggested_weights lists each prescription, and movements it cannot answer for', async () => {
  const text = reportText(await getSuggestedWeights(fakeClient(HISTORY), {
    movementNames: ['bench press', 'Plank', 'Not A Movement', 'Farmer Carry'],
  }));

  assert.match(
    text,
    /\*\*Bench Press\*\*:\n {2}- at 5 reps: 70 lb.*\n {2}- at 10 reps: 62 lb \(1% ≈ 0\.62 lb\), from 2026-10-10T12:10:00Z\n {2}- at 15 reps: 54 lb/
  );
  assert.match(text, /\*\*Farmer Carry\*\*:\n {2}- at 30 s: 80 lb/);
  assert.match(text, /\*\*Plank\*\*: off-machine/);
  assert.match(text, /\*\*Not A Movement\*\*: not a Tonal movement name/);
});
