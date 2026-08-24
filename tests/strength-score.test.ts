import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type {
  TonalGoalMetric,
  TonalMetricScoresResponse,
  TonalTargetScoresResponse,
} from '@dlwiest/ts-tonal-client';
import { getStrengthScore } from '../src/tools/strength-score.js';

function tonalClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

function reportText(response: Awaited<ReturnType<typeof getStrengthScore>>): string {
  const [content] = response.content;
  assert.equal(content.type, 'text');
  return (content as { type: 'text'; text: string }).text;
}

test('matches goal metrics by name, not a hardcoded id', async () => {
  const goalMetrics: TonalGoalMetric[] = [
    { id: 'm-strength-sets', name: 'Strength Sets', goalId: 'g1', description: '' },
    { id: 'm-fss', name: 'Functional Strength Score', goalId: 'g1', description: 'Composite strength metric' },
    { id: 'm-cardio', name: 'Cardio Minutes', goalId: 'g2', description: 'Time spent in cardio zones' },
  ];

  const targetScores: TonalTargetScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 34, metricId: 'm-strength-sets', target: 13, lowRange: 10, highRange: 16 },
      { userId: 'u1', weekNumber: 33, metricId: 'm-strength-sets', target: 12, lowRange: 9, highRange: 15 },
    ],
    'm-fss': [
      { userId: 'u1', weekNumber: 34, metricId: 'm-fss', target: 166, lowRange: 140, highRange: 190 },
    ],
  };

  const metricScores: TonalMetricScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 34, metricId: 'm-strength-sets', score: 15.75 },
      { userId: 'u1', weekNumber: 33, metricId: 'm-strength-sets', score: 11.5 },
    ],
    'm-fss': [
      { userId: 'u1', weekNumber: 34, metricId: 'm-fss', score: 216.8 },
    ],
  };

  const client = tonalClient({
    getGoalMetrics: async () => goalMetrics,
    getTargetScores: async () => targetScores,
    getMetricScores: async () => metricScores,
    getDailyMetrics: async () => {
      throw new Error('unavailable in this test; exercised separately below');
    },
  });

  const text = reportText(await getStrengthScore(client));

  assert.match(text, /Strength Sets/);
  assert.match(text, /Functional Strength Score/);
  assert.doesNotMatch(text, /Cardio Minutes/);
  assert.match(text, /15\.75/);
  assert.match(text, /target 13\.00/);
  assert.match(text, /216\.80/);
  assert.match(text, /Week 34/);
});

test('falls back gracefully when no strength metrics exist', async () => {
  const client = tonalClient({
    getGoalMetrics: async () => [
      { id: 'm-cardio', name: 'Cardio Minutes', goalId: 'g2', description: '' },
    ],
    getTargetScores: async () => {
      throw new Error('should not be called when no strength metrics match');
    },
    getMetricScores: async () => {
      throw new Error('should not be called when no strength metrics match');
    },
  });

  const text = reportText(await getStrengthScore(client));
  assert.match(text, /No strength-related goal metrics/);
});

test('handles a metric with no score data yet without throwing', async () => {
  const client = tonalClient({
    getGoalMetrics: async () => [
      { id: 'm-strength-sets', name: 'Strength Sets', goalId: 'g1', description: '' },
    ],
    getTargetScores: async () => ({}) as TonalTargetScoresResponse,
    getMetricScores: async () => ({}) as TonalMetricScoresResponse,
    getDailyMetrics: async () => [{ date: '2026-08-24' }],
  });

  const text = reportText(await getStrengthScore(client));
  assert.match(text, /No score data available/);
});

// --- ARIIA M1: current week must come from today's real date, not max(weekNumber) ---

test('reports the real current week even when it has no actual score yet', async () => {
  const goalMetrics: TonalGoalMetric[] = [
    { id: 'm-strength-sets', name: 'Strength Sets', goalId: 'g1', description: '' },
  ];
  // getDailyMetrics says today is 2026-08-24 (a Monday) -> real current week is 202635.
  const targetScores: TonalTargetScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 202635, metricId: 'm-strength-sets', target: 13, lowRange: 11, highRange: 15 },
      { userId: 'u1', weekNumber: 202634, metricId: 'm-strength-sets', target: 12, lowRange: 10, highRange: 13 },
    ],
  };
  const metricScores: TonalMetricScoresResponse = {
    'm-strength-sets': [
      // Week 202635 (this week) has no actual score yet -- only the completed prior week does.
      { userId: 'u1', weekNumber: 202634, metricId: 'm-strength-sets', score: 15.75 },
    ],
  };

  const client = tonalClient({
    getGoalMetrics: async () => goalMetrics,
    getTargetScores: async () => targetScores,
    getMetricScores: async () => metricScores,
    getDailyMetrics: async () => [{ date: '2026-08-24' }],
  });

  const text = reportText(await getStrengthScore(client));
  assert.match(text, /Current Week \(202635\)/);
  assert.match(text, /Actual: N\/A/);
  assert.match(text, /Target: 13\.00/);
});

test('does not report a pre-populated future week as current (ARIIA M1)', async () => {
  const goalMetrics: TonalGoalMetric[] = [
    { id: 'm-strength-sets', name: 'Strength Sets', goalId: 'g1', description: '' },
  ];
  // Today is 2026-08-24 -> real current week is 202635. Tonal has already pre-populated a
  // target for a *future* week (202636) with no history yet. The old max(weekNumber) logic
  // would have silently reported 202636 as "current" with a blank actual score, indistinguishable
  // from a normal in-progress week. It must not do that.
  const targetScores: TonalTargetScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 202636, metricId: 'm-strength-sets', target: 14, lowRange: 12, highRange: 16 },
      { userId: 'u1', weekNumber: 202634, metricId: 'm-strength-sets', target: 12, lowRange: 10, highRange: 13 },
    ],
  };
  const metricScores: TonalMetricScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 202634, metricId: 'm-strength-sets', score: 15.75 },
    ],
  };

  const client = tonalClient({
    getGoalMetrics: async () => goalMetrics,
    getTargetScores: async () => targetScores,
    getMetricScores: async () => metricScores,
    getDailyMetrics: async () => [{ date: '2026-08-24' }],
  });

  const text = reportText(await getStrengthScore(client));
  assert.doesNotMatch(text, /Current Week \(202636\)/);
  assert.doesNotMatch(text, /target 14\.00/);
  // Falls back to the most recent week at or before the real current week (202634), clearly
  // labeled as a fallback rather than silently implied to be "this week."
  assert.match(text, /Most Recent Available Week \(202634\)/);
  assert.match(text, /current week \(202635\) has no data yet/);
  assert.match(text, /Actual: 15\.75/);
  // The future pre-populated week must not leak into the trend either.
  assert.doesNotMatch(text, /Week 202636/);
});

test('labels the fallback distinctly when the real current week cannot be determined at all', async () => {
  const goalMetrics: TonalGoalMetric[] = [
    { id: 'm-strength-sets', name: 'Strength Sets', goalId: 'g1', description: '' },
  ];
  const targetScores: TonalTargetScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 202634, metricId: 'm-strength-sets', target: 12, lowRange: 10, highRange: 13 },
    ],
  };
  const metricScores: TonalMetricScoresResponse = {
    'm-strength-sets': [
      { userId: 'u1', weekNumber: 202634, metricId: 'm-strength-sets', score: 15.75 },
    ],
  };

  const client = tonalClient({
    getGoalMetrics: async () => goalMetrics,
    getTargetScores: async () => targetScores,
    getMetricScores: async () => metricScores,
    getDailyMetrics: async () => {
      throw new Error('network error');
    },
  });

  const text = reportText(await getStrengthScore(client));
  assert.match(text, /Most Recent Available Week \(202634\)/);
  assert.match(text, /today's actual current week could not be determined/);
});
