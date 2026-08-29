import assert from 'node:assert/strict';
import test from 'node:test';
import TonalClient from '@dlwiest/ts-tonal-client';

/**
 * Regression test for the estimateWorkoutDuration request-body fix, now shipped natively
 * upstream as of @dlwiest/ts-tonal-client@0.4.0.
 *
 * @dlwiest/ts-tonal-client@0.3.0 had a bug: estimateWorkoutDuration() POSTed `{ sets }` to
 * /user-workouts/estimate, but Tonal's live API expects the raw sets array as the body and
 * returned HTTP 400 ("json: cannot unmarshal object into Go value of type content.SetList")
 * otherwise. We previously carried a patch-package fix
 * (patches/@dlwiest+ts-tonal-client+0.3.0.patch) for this. Independently confirmed against the
 * raw (unpatched) 0.4.0 tarball from the npm registry -- not just the locally patched
 * node_modules copy -- that dist/index.esm.js now sends `JSON.stringify(sets)` natively, so the
 * patch was deleted and patch-package removed from postinstall/devDependencies.
 *
 * This test exercises the actual installed (now unpatched) 0.4.0+ client end-to-end via a
 * mocked fetch, so it fails loudly if a future client version ever regresses this behavior.
 */
test('installed ts-tonal-client 0.4.0+ sends the raw sets array to /user-workouts/estimate natively (no patch applied)', async () => {
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
