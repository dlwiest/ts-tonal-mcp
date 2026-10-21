import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import TonalClient, { TonalClientError } from '@dlwiest/ts-tonal-client';
import { TonalService } from '../src/services/tonal-service.js';

process.env.TONAL_USERNAME = 'user@example.com';
process.env.TONAL_PASSWORD = 'secret';

function stubLogin(impl: () => Promise<TonalClient>): { calls: () => number; restore: () => void } {
  const original = TonalClient.create;
  let calls = 0;
  TonalClient.create = async () => {
    calls += 1;
    return impl();
  };
  return { calls: () => calls, restore: () => { TonalClient.create = original; } };
}

test('a rejected login is not retried against Tonal for five minutes', async (t) => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const login = stubLogin(async () => {
    throw new TonalClientError('Wrong email or password.', 403);
  });
  t.after(() => {
    login.restore();
    mock.timers.reset();
  });

  const service = new TonalService();
  await assert.rejects(service.getClient(), /Wrong email or password/);
  mock.timers.tick(5 * 60 * 1000 - 1);
  await assert.rejects(service.getClient(), /Wrong email or password/);
  assert.equal(login.calls(), 1);

  mock.timers.tick(1);
  await assert.rejects(service.getClient(), /Wrong email or password/);
  assert.equal(login.calls(), 2);
});

test('a network or server failure is retried on the next call', async (t) => {
  let failure: Error = new TypeError('fetch failed');
  const login = stubLogin(async () => {
    throw failure;
  });
  t.after(() => login.restore());

  const service = new TonalService();
  await assert.rejects(service.getClient(), /fetch failed/);
  failure = new TonalClientError('Service unavailable', 503);
  await assert.rejects(service.getClient(), /Service unavailable/);
  assert.equal(login.calls(), 2);
});

test('concurrent first calls share one login, and later calls reuse it', async (t) => {
  const client = {} as TonalClient;
  // Promise.withResolvers is ES2024; the project targets ES2022.
  let finishLogin!: (client: TonalClient) => void;
  const pending = new Promise<TonalClient>((resolve) => { finishLogin = resolve; });
  const login = stubLogin(() => pending);
  t.after(() => login.restore());

  const service = new TonalService();
  const both = Promise.all([service.getClient(), service.getClient()]);
  finishLogin(client);
  const [first, second] = await both;
  assert.equal(first, client);
  assert.equal(second, client);
  assert.equal(await service.getClient(), client);
  assert.equal(login.calls(), 1);
});
