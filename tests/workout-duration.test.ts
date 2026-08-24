import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalMovement, TonalWorkoutEstimateSet } from '@dlwiest/ts-tonal-client';
import { estimateWorkoutDuration } from '../src/tools/workout-duration.js';

function tonalClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

function reportText(response: Awaited<ReturnType<typeof estimateWorkoutDuration>>): string {
  const [content] = response.content;
  assert.equal(content.type, 'text');
  return (content as { type: 'text'; text: string }).text;
}

const BENCH_MOVEMENT = {
  id: 'bench',
  name: 'Bench Press',
  countReps: true,
} as TonalMovement;

test('estimates duration via the client without creating a workout', async () => {
  let receivedSets: TonalWorkoutEstimateSet[] | undefined;
  const client = tonalClient({
    getMovements: async () => [BENCH_MOVEMENT],
    estimateWorkoutDuration: async (sets: TonalWorkoutEstimateSet[]) => {
      receivedSets = sets;
      return { duration: 725 };
    },
  });

  const response = await estimateWorkoutDuration(client, {
    exercises: [{ movementName: 'Bench Press', sets: 3, reps: 10 }],
  });

  const text = reportText(response);
  assert.match(text, /12 minute/);
  assert.match(text, /725s/);
  assert.match(text, /Bench Press/);
  assert.match(text, /no workout was created or modified/);
  assert.ok(receivedSets && receivedSets.length === 3);
});

test('returns a validation error instead of throwing when exercises are missing', async () => {
  const client = tonalClient({
    getMovements: async () => [BENCH_MOVEMENT],
    estimateWorkoutDuration: async () => ({ duration: 0 }),
  });

  const response = await estimateWorkoutDuration(client, {});
  assert.equal(response.isError, true);
  const text = reportText(response);
  assert.match(text, /At least one exercise is required/);
});

test('surfaces an unknown movement as a tool error rather than throwing', async () => {
  const client = tonalClient({
    getMovements: async () => [BENCH_MOVEMENT],
    estimateWorkoutDuration: async () => ({ duration: 0 }),
  });

  const response = await estimateWorkoutDuration(client, {
    exercises: [{ movementName: 'Nonexistent Movement', sets: 2, reps: 10 }],
  });

  assert.equal(response.isError, true);
});

test('surfaces a client-level estimateWorkoutDuration failure as isError, not swallowed', async () => {
  // This is the failure mode the estimateWorkoutDuration client bug actually produced in
  // practice before the patch-package fix (HTTP 400 from /user-workouts/estimate). Even with
  // the client patched, the tool must still handle the client method throwing -- for whatever
  // reason -- by surfacing it as a proper MCP tool error with the real message intact, not
  // swallowing it or miscategorizing it as something else (e.g. a validation error).
  const client = tonalClient({
    getMovements: async () => [BENCH_MOVEMENT],
    estimateWorkoutDuration: async () => {
      throw new Error('HTTP 400: json: cannot unmarshal object into Go value of type content.SetList');
    },
  });

  const response = await estimateWorkoutDuration(client, {
    exercises: [{ movementName: 'Bench Press', sets: 3, reps: 10 }],
  });

  assert.equal(response.isError, true);
  const text = reportText(response);
  assert.match(text, /estimate_workout_duration/);
  assert.match(text, /cannot unmarshal object into Go value of type content\.SetList/);
});
