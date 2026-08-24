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
  });

  const text = reportText(await getStrengthScore(client));
  assert.match(text, /No score data available/);
});
