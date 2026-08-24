import assert from 'node:assert/strict';
import test from 'node:test';
import TonalClient from '@dlwiest/ts-tonal-client';

/**
 * Regression test for the patch-package fix in patches/@dlwiest+ts-tonal-client+0.3.0.patch.
 *
 * The installed @dlwiest/ts-tonal-client@0.3.0 has a bug: estimateWorkoutDuration() POSTs
 * `{ sets }` to /user-workouts/estimate, but Tonal's live API expects the raw sets array as
 * the body and returns HTTP 400 ("json: cannot unmarshal object into Go value of type
 * content.SetList") otherwise. The patch changes that call site to send the raw array.
 *
 * This test exercises the actual installed (patched) client end-to-end via a mocked fetch,
 * so it fails loudly if a future `npm install` / client version bump ever silently drops the
 * patch (e.g. the patch no longer applies cleanly and postinstall is run non-strictly).
 */
test('installed ts-tonal-client sends the raw sets array to /user-workouts/estimate', async () => {
  const originalFetch = global.fetch;
  const capturedEstimateBodies: unknown[] = [];

  (global as any).fetch = async (input: unknown, init: any = {}) => {
    const url = String(input);

    if (url.includes('tonal.auth0.com')) {
      return new Response(
        JSON.stringify({
          id_token: 'fake-id-token',
          refresh_token: 'fake-refresh-token',
          expires_in: 3600,
        }),
        { status: 200 }
      );
    }

    if (url.includes('/user-workouts/estimate')) {
      capturedEstimateBodies.push(init.body ? JSON.parse(init.body as string) : undefined);
      return new Response(JSON.stringify({ duration: 300 }), { status: 200 });
    }

    throw new Error(`Unexpected fetch call to ${url}`);
  };

  try {
    const client = await TonalClient.create({
      username: 'regression-test@example.com',
      password: 'irrelevant-fake-password',
    });

    const sets = [
      {
        blockStart: true,
        movementId: 'movement-1',
        prescribedReps: 10,
        dropSet: false,
        repetition: 1,
        repetitionTotal: 1,
        blockNumber: 1,
        burnout: false,
        spotter: false,
        eccentric: false,
        chains: false,
        flex: false,
        warmUp: false,
        weightPercentage: 0,
        setGroup: 0,
        round: 1,
        description: '',
      },
    ];

    const result = await client.estimateWorkoutDuration(sets as any);
    assert.equal(result.duration, 300);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(capturedEstimateBodies.length, 1, 'estimateWorkoutDuration should have made exactly one estimate request');
  const body = capturedEstimateBodies[0];
  assert.ok(
    Array.isArray(body),
    `request body must be the raw sets array, not an object wrapping it. Received: ${JSON.stringify(body)}`
  );
  assert.equal((body as unknown[]).length, 1);
});
