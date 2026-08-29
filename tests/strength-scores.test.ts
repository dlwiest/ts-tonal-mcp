import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalStrengthScore, TonalStrengthScoreHistoryEntry } from '@dlwiest/ts-tonal-client';
import { TonalClientError } from '@dlwiest/ts-tonal-client';
import { getCurrentStrengthScores, getStrengthScoreHistory } from '../src/tools/strength-scores.js';

function tonalClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

function reportText(response: { content: Array<{ type: string; text?: string }> }): string {
  const [content] = response.content;
  assert.equal(content.type, 'text');
  return content.text as string;
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function score(overrides: Partial<TonalStrengthScore>): TonalStrengthScore {
  return {
    id: 'score-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    userId: 'u1',
    workoutActivityId: 'activity-1',
    strengthBodyRegion: 'Upper Body',
    bodyRegionDisplay: 'Upper Body',
    score: 42,
    current: true,
    familyActivity: [],
    ...overrides,
  };
}

// --- get_current_strength_scores ---

test('reports real region rows normally', async () => {
  const client = tonalClient({
    getCurrentStrengthScores: async () => [
      score({ strengthBodyRegion: 'Upper Body', bodyRegionDisplay: 'Upper Body', score: 55 }),
    ],
  });

  const text = reportText(await getCurrentStrengthScores(client));
  assert.match(text, /Upper Body/);
  assert.match(text, /Score: 55/);
  assert.match(text, /Last Updated: 2026-08-20T00:00:00\.000Z/);
});

test('handles the synthesized Overall row: falls back to strengthBodyRegion for label, never surfaces its updatedAt', async () => {
  const overallRow = score({
    strengthBodyRegion: 'Overall',
    bodyRegionDisplay: '', // synthesized rows have an empty display label
    familyActivity: undefined,
    workoutActivityId: ZERO_UUID,
    updatedAt: '0001-01-01T00:00:00.000Z', // zero date -- must never be surfaced as real
    score: 61,
  });

  const client = tonalClient({
    getCurrentStrengthScores: async () => [overallRow],
  });

  const text = reportText(await getCurrentStrengthScores(client));
  assert.match(text, /## Overall/, 'must fall back to strengthBodyRegion when bodyRegionDisplay is empty');
  assert.doesNotMatch(
    text,
    /0001-01-01/,
    'the synthesized zero-date updatedAt must never be surfaced as a real timestamp'
  );
  assert.match(text, /N\/A \(this row is synthesized/);
});

test('orders real regions before the synthesized Overall row', async () => {
  const client = tonalClient({
    getCurrentStrengthScores: async () => [
      score({ strengthBodyRegion: 'Overall', bodyRegionDisplay: '', workoutActivityId: ZERO_UUID }),
      score({ strengthBodyRegion: 'Lower Body', bodyRegionDisplay: 'Lower Body', workoutActivityId: 'a2' }),
      score({ strengthBodyRegion: 'Core', bodyRegionDisplay: 'Core', workoutActivityId: 'a3' }),
    ],
  });

  const text = reportText(await getCurrentStrengthScores(client));
  const lowerIdx = text.indexOf('## Lower Body');
  const coreIdx = text.indexOf('## Core');
  const overallIdx = text.indexOf('## Overall');
  assert.ok(lowerIdx > -1 && coreIdx > -1 && overallIdx > -1);
  assert.ok(overallIdx > lowerIdx && overallIdx > coreIdx, 'Overall must be listed last');
});

test('reports a clear empty state when no strength scores exist', async () => {
  const client = tonalClient({ getCurrentStrengthScores: async () => [] });
  const text = reportText(await getCurrentStrengthScores(client));
  assert.match(text, /No strength scores are available/);
});

test('surfaces a client-level failure as isError rather than throwing', async () => {
  const client = tonalClient({
    getCurrentStrengthScores: async () => {
      throw new Error('unexpected client failure');
    },
  });
  const response = await getCurrentStrengthScores(client);
  assert.equal(response.isError, true);
  assert.match(reportText(response), /unexpected client failure/);
});

// --- get_strength_score_history ---

function historyEntry(overrides: Partial<TonalStrengthScoreHistoryEntry>): TonalStrengthScoreHistoryEntry {
  return {
    id: 'h1',
    userId: 'u1',
    workoutActivityId: 'activity-1',
    upper: 40,
    lower: 35,
    core: 30,
    overall: 38,
    activityTime: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

test('defaults days to "all" when omitted', async () => {
  let receivedDays: unknown;
  const client = tonalClient({
    getStrengthScoreHistory: async (days: unknown) => {
      receivedDays = days;
      return [historyEntry({})];
    },
  });

  await getStrengthScoreHistory(client, {});
  assert.equal(receivedDays, 'all', 'must default to the full-history window, not a short numeric default');
});

test('passes through an explicit numeric days value', async () => {
  let receivedDays: unknown;
  const client = tonalClient({
    getStrengthScoreHistory: async (days: unknown) => {
      receivedDays = days;
      return [];
    },
  });

  await getStrengthScoreHistory(client, { days: 90 });
  assert.equal(receivedDays, 90);
});

test('sorts history entries by activityTime, most-recent-first, defensively (no createdAt/updatedAt on this shape)', async () => {
  const client = tonalClient({
    getStrengthScoreHistory: async () => [
      historyEntry({ activityTime: '2026-08-01T00:00:00.000Z', overall: 10 }),
      historyEntry({ activityTime: '2026-08-20T00:00:00.000Z', overall: 30 }),
      historyEntry({ activityTime: '2026-08-10T00:00:00.000Z', overall: 20 }),
    ],
  });

  const text = reportText(await getStrengthScoreHistory(client, {}));
  const idx20 = text.indexOf('2026-08-20');
  const idx10 = text.indexOf('2026-08-10');
  const idx01 = text.indexOf('2026-08-01');
  assert.ok(idx20 > -1 && idx10 > -1 && idx01 > -1);
  assert.ok(idx20 < idx10 && idx10 < idx01, 'entries must be sorted most-recent-first');
});

test('distinguishes a genuinely empty account (days: all) from an empty result caused by a too-short window', async () => {
  const emptyAccountClient = tonalClient({
    getStrengthScoreHistory: async () => [],
  });
  const emptyAccountText = reportText(await getStrengthScoreHistory(emptyAccountClient, {}));
  assert.match(emptyAccountText, /No scored activities found for this account\./);
  assert.doesNotMatch(emptyAccountText, /shorter than the gap/);

  const shortWindowClient = tonalClient({
    getStrengthScoreHistory: async () => [],
  });
  const shortWindowText = reportText(await getStrengthScoreHistory(shortWindowClient, { days: 7 }));
  assert.match(shortWindowText, /shorter than the gap since the last scored activity/);
  assert.match(shortWindowText, /last 7 days/);
});

test("catches TonalClientError from days:'all' and tells the caller to retry with an explicit numeric days", async () => {
  const client = tonalClient({
    getStrengthScoreHistory: async () => {
      throw new TonalClientError('account createdAt is missing or unparseable');
    },
  });

  const response = await getStrengthScoreHistory(client, {});
  assert.equal(response.isError, true);
  const text = reportText(response);
  assert.match(text, /retry with an explicit numeric/i);
  assert.match(text, /account createdAt is missing or unparseable/);
});

test('a TonalClientError with an explicit numeric days still surfaces as a generic tool error, not the "all" guidance', async () => {
  const client = tonalClient({
    getStrengthScoreHistory: async () => {
      throw new TonalClientError('some other client error');
    },
  });

  const response = await getStrengthScoreHistory(client, { days: 30 });
  assert.equal(response.isError, true);
  const text = reportText(response);
  assert.doesNotMatch(text, /retry with an explicit numeric/i);
  assert.match(text, /get_strength_score_history/);
});

test('rejects a non-numeric, non-"all" days value with a validation error', async () => {
  const client = tonalClient({
    getStrengthScoreHistory: async () => [],
  });

  const response = await getStrengthScoreHistory(client, { days: 'yesterday' });
  assert.equal(response.isError, true);
  assert.match(reportText(response), /days must be a positive number or 'all'/);
});
