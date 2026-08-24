import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import { currentTonalWeekNumber, isoWeekNumber } from '../src/utils/tonal-week.js';

function tonalClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

test('isoWeekNumber matches the scheme observed in live Tonal data', () => {
  // TonalCurrentStreak.lastUpdatedWeek returned "2026-08-17" (a Monday) for weekNumber 202634,
  // and today rolling over to Monday 2026-08-24 corresponded to weekNumber 202635 -- both
  // confirmed live against Carlos's real account.
  assert.equal(isoWeekNumber('2026-08-17'), 202634);
  assert.equal(isoWeekNumber('2026-08-23'), 202634); // Sunday, still the same ISO week
  assert.equal(isoWeekNumber('2026-08-24'), 202635); // Monday, new ISO week
});

test('isoWeekNumber handles ISO week-year boundaries correctly', () => {
  // 2025-12-29 (Monday) starts ISO week 1 of 2026, even though the date's calendar year is 2025.
  assert.equal(isoWeekNumber('2025-12-29'), 202601);
  // 2027-01-01 (Friday) is still part of ISO week 53 of 2026.
  assert.equal(isoWeekNumber('2027-01-01'), 202653);
});

test('currentTonalWeekNumber derives "today" from getDailyMetrics(1), not the local clock', async () => {
  let requestedDays: number | undefined;
  const client = tonalClient({
    getDailyMetrics: async (days: number) => {
      requestedDays = days;
      return [{ date: '2026-08-24', totalVolume: 0, totalWorkouts: 0, totalDuration: 0 }];
    },
  });

  const week = await currentTonalWeekNumber(client);
  assert.equal(week, 202635);
  assert.equal(requestedDays, 1);
});

test('currentTonalWeekNumber returns undefined rather than throwing when the API call fails', async () => {
  const client = tonalClient({
    getDailyMetrics: async () => {
      throw new Error('network error');
    },
  });

  const week = await currentTonalWeekNumber(client);
  assert.equal(week, undefined);
});

test('currentTonalWeekNumber returns undefined when getDailyMetrics is missing from the client', async () => {
  const client = tonalClient({});
  const week = await currentTonalWeekNumber(client);
  assert.equal(week, undefined);
});
