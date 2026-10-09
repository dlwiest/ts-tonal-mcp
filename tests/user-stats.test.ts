import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalActivitySummary } from '@dlwiest/ts-tonal-client';
import { getRecentProgress } from '../src/tools/user-stats.js';
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
  isInProgram: false,
  isGuidedWorkout: false,
  isBaselineWorkout: false,
  timestamp: '2026-02-24T12:00:00Z',
  UTCTimestamp: '2026-02-24T12:00:00Z',
  localTimestamp: '2026-02-24T04:00:00',
  endTime: '2026-02-24T12:30:00Z',
  timeZone: 'America/Los_Angeles',
  targetArea: 'Upper Body',
  duration: 1_800,
  timeUnderTension: 360,
  repGoalPercentage: 100,
  totalReps: 25,
  totalVolume: 1_250,
  totalWork: 42,
  level: 'INTERMEDIATE',
  programWeeks: 0,
  programWorkoutsPerWeek: 0,
  groupIds: [],
  workoutType: 'Custom',
  completed: true,
  deviceId: 'device-1',
  appVersion: '1.0.0',
  activityType: 'Internal',
  triggeredTimedWeightOff: false,
};

// An activity imported from another app, shaped like Tonal returns it: no name or
// workout type, an empty target area, and no volume or reps.
const { name: _name, workoutType: _workoutType, ...UNNAMED_ACTIVITY } = ACTIVITY;
const EXTERNAL_ACTIVITY = {
  ...UNNAMED_ACTIVITY,
  id: 'activity-43',
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

test('labels imported activities in recent activity instead of rendering an undefined name', async () => {
  const text = reportText(await getRecentProgress(fakeClient({
    getDailyMetrics: async () => [{ totalWorkouts: 1, totalVolume: 1_250, totalDuration: 1_800 }],
    getActivitySummaries: async () => [EXTERNAL_ACTIVITY, ACTIVITY],
  })));

  assert.match(text, /^1\. \*\*External activity: walking \(Apple Watch\)\*\* \(/m);
  assert.match(text, /^2\. \*\*Upper Body Builder\*\* \(/m);
  assert.doesNotMatch(text, /undefined/);
});
