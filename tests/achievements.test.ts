import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalAchievementStats, TonalEarnedAchievement } from '@dlwiest/ts-tonal-client';
import { getAchievements } from '../src/tools/achievements.js';
import type { MCPResponse } from '../src/types/index.js';

function reportText(response: MCPResponse): string {
  const [content] = response.content;
  assert.ok(content && content.type === 'text', 'expected a text content block');
  return content.text;
}

const STATS: TonalAchievementStats = {
  totalAchievements: 3,
  nextMilestones: [
    {
      id: 'milestone-1',
      name: '500 Workouts',
      description: 'Way to show up! You just earned a new workout milestone.',
      shortDescription: 'Completed 500 workouts on Tonal',
      achievementCategoryId: 'category-workouts',
      achievementCategory: null,
      assetId: 'asset-1',
      value: 500,
      iconAssetId: 'icon-1',
      active: true,
      needsTemplate: false,
    },
  ],
};

function earned(name: string, createdAt: string, category?: string): TonalEarnedAchievement {
  return {
    id: `earned-${name}`,
    achievementId: `achievement-${name}`,
    userId: 'user-1',
    createdAt,
    name,
    description: '',
    shortDescription: '',
    assetId: 'asset',
    iconAssetId: 'icon',
    localTimestamp: '',
    achievement: {
      id: `achievement-${name}`,
      name,
      description: '',
      shortDescription: '',
      achievementCategoryId: 'category',
      achievementCategory: { id: 'category', name: category ?? '', type: 'type' },
      assetId: 'asset',
      value: null,
      iconAssetId: 'icon',
      active: true,
      needsTemplate: false,
    },
  };
}

// Deliberately out of order: the tool must not trust API order. "Middle" was earned
// twice, so there are 4 earned records for STATS' 3 distinct achievements, as Tonal
// returns for repeatable badges.
const EARNED = [
  earned('Middle', '2026-02-01T00:00:00Z', 'Badges'),
  earned('Newest', '2026-03-01T00:00:00Z', 'Volume Milestone'),
  earned('Oldest', '2026-01-01T00:00:00Z'),
  earned('Middle', '2025-02-01T00:00:00Z', 'Badges'),
];

function client(stats: TonalAchievementStats, list: TonalEarnedAchievement[]): TonalClient {
  return {
    getAchievementStats: async () => stats,
    getAchievements: async () => list,
  } as unknown as TonalClient;
}

test('lists earned achievements newest first with categories and the next milestones', async () => {
  const text = reportText(await getAchievements(client(STATS, EARNED), {}));

  assert.match(text, /Distinct achievements earned \(totalAchievements\): 3/);
  assert.match(text, /Times earned, including repeat badges: 4/);
  assert.match(text, /\*\*500 Workouts\*\*: Completed 500 workouts on Tonal/);
  const order = ['Newest', 'Middle', 'Oldest'].map(name => text.indexOf(`**${name}**`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(text, /2026-03-01T00:00:00Z: \*\*Newest\*\* \(Volume Milestone\)\n/);
  assert.match(text, /\*\*Oldest\*\*\n/);
});

test('limit keeps the newest achievements and says how many were left out', async () => {
  const text = reportText(await getAchievements(client(STATS, EARNED), { limit: 1 }));

  assert.match(text, /showing 1 of 4/);
  assert.match(text, /\*\*Newest\*\*/);
  assert.doesNotMatch(text, /\*\*Middle\*\*|\*\*Oldest\*\*/);
});

test('reports an account with nothing earned and no milestones', async () => {
  const text = reportText(await getAchievements(
    client({ totalAchievements: 0, nextMilestones: [] }, []),
    {}
  ));

  assert.match(text, /No upcoming milestones were returned/);
  assert.match(text, /No achievements have been earned yet/);
});

test('rejects an invalid limit before calling Tonal', async () => {
  let calls = 0;
  const counting = {
    getAchievementStats: async () => { calls += 1; return STATS; },
    getAchievements: async () => { calls += 1; return EARNED; },
  } as unknown as TonalClient;

  const response = await getAchievements(counting, { limit: 0 });
  assert.equal(response.isError, true);
  assert.equal(calls, 0);
});
