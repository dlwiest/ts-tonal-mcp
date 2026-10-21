import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalActivitySummary } from '@dlwiest/ts-tonal-client';
import { getRecentWorkouts } from '../src/tools/workouts.js';
import type { MCPResponse } from '../src/types/index.js';

function fakeClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

function reportText(response: MCPResponse): string {
  const [content] = response.content;
  assert.ok(content && content.type === 'text', 'expected a text content block');
  return content.text;
}

const ACTIVITY: TonalActivitySummary = {
  id: 'activity-42',
  deletedAt: null,
  userId: 'user-1',
  name: 'Upper Body Builder',
  workoutId: 'workout-1',
  isInProgram: true,
  isGuidedWorkout: false,
  isBaselineWorkout: false,
  timestamp: '2026-02-24T12:00:00Z',
  UTCTimestamp: '2026-02-24T12:00:00Z',
  localTimestamp: '2026-02-24T04:00:00',
  endTime: '2026-02-24T15:02:00Z',
  timeZone: 'America/Los_Angeles',
  targetArea: 'Upper Body',
  duration: 10_920,
  timeUnderTension: 360,
  repGoalPercentage: 100,
  totalReps: 25,
  totalVolume: 1_250,
  totalWork: 42,
  level: 'INTERMEDIATE',
  programWeeks: 4,
  programWorkoutsPerWeek: 3,
  groupIds: [],
  workoutType: 'Custom',
  completed: true,
  deviceId: 'device-1',
  appVersion: '1.0.0',
  activityType: 'Workout',
  triggeredTimedWeightOff: false,
};

// An activity imported from another app, shaped like Tonal returns it: no name or
// workout type, an empty target area, and device time reported as time under tension.
const { name: _name, workoutType: _workoutType, ...UNNAMED_ACTIVITY } = ACTIVITY;
const EXTERNAL_ACTIVITY = {
  ...UNNAMED_ACTIVITY,
  id: 'activity-43',
  isInProgram: false,
  targetArea: '',
  duration: 2_700,
  timeUnderTension: 2_700,
  totalReps: 0,
  totalVolume: 0,
  totalWork: 0,
  activityType: 'External',
  source: 'Apple Watch',
  externalWorkoutType: 'walking',
};

test('exposes a recent workout activity ID for direct detail and summary lookup', async () => {
  const text = reportText(await getRecentWorkouts(fakeClient({
    getActivitySummaries: async () => [ACTIVITY],
  }), { limit: 1 }));

  assert.match(text, /workoutActivityId activity-42/);
});

test('distinguishes wall-clock duration from time under tension in totals and entries', async () => {
  const text = reportText(await getRecentWorkouts(fakeClient({
    getActivitySummaries: async () => [ACTIVITY],
  }), { limit: 1 }));

  assert.match(text, /Total Wall-clock Time: 182 minutes/);
  assert.match(text, /Average Wall-clock Duration: 182 minutes/);
  assert.match(text, /Total Time Under Tension: 6 minutes/);
  assert.match(text, /Average Time Under Tension: 6 minutes/);
  assert.match(text, /Wall-clock duration \(duration\): 182 min/);
  assert.match(text, /Time under tension \(timeUnderTension\): 6 min/);
  assert.doesNotMatch(text, /^- Duration:/m);
  assert.doesNotMatch(text, /Average Duration:/);
  assert.doesNotMatch(text, /External Activities:/);
});

test('labels activities imported from other apps instead of rendering an undefined name', async () => {
  const text = reportText(await getRecentWorkouts(fakeClient({
    getActivitySummaries: async () => [EXTERNAL_ACTIVITY],
  }), { limit: 1 }));

  assert.match(text, /^\*\*External activity: walking \(Apple Watch\)\*\* \(/m);
  assert.match(text, /workoutActivityId activity-43/);
  assert.match(text, /^- Wall-clock duration \(duration\): 45 min$/m);
  assert.match(text, /^- Type: External \(no Tonal activity detail, volume, reps, or time under tension\)$/m);
  assert.doesNotMatch(text, /undefined|Free Lift|Target:/);
});

test('leaves imported activities out of the summary totals', async () => {
  const text = reportText(await getRecentWorkouts(fakeClient({
    getActivitySummaries: async () => [ACTIVITY, EXTERNAL_ACTIVITY],
  }), { limit: 2 }));

  assert.match(text, /Summary \(last 1 workouts\)/);
  assert.match(text, /Total Wall-clock Time: 182 minutes/);
  assert.match(text, /Average Wall-clock Duration: 182 minutes/);
  assert.match(text, /Total Time Under Tension: 6 minutes/);
  assert.match(text, /Average Time Under Tension: 6 minutes/);
  assert.match(text, /^- External Activities: 1 \(imported from other apps, not included above\)$/m);
  assert.match(text, /\*\*Upper Body Builder\*\*/);
  assert.match(text, /\*\*External activity: walking \(Apple Watch\)\*\*/);
});

test('reports zero averages rather than NaN when every recent activity is imported', async () => {
  const text = reportText(await getRecentWorkouts(fakeClient({
    getActivitySummaries: async () => [EXTERNAL_ACTIVITY],
  }), { limit: 1 }));

  assert.match(text, /Average Wall-clock Duration: 0 minutes/);
  assert.match(text, /Average Time Under Tension: 0 minutes/);
  assert.doesNotMatch(text, /NaN/);
});
