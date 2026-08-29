import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type {
  TonalAchievementCategory,
  TonalAchievementDefinition,
  TonalAchievementMilestone,
  TonalAchievementStats,
  TonalEarnedAchievement,
} from '@dlwiest/ts-tonal-client';
import { getTonalAchievements } from '../src/tools/achievements.js';

function tonalClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

function reportText(response: Awaited<ReturnType<typeof getTonalAchievements>>): string {
  const [content] = response.content;
  assert.equal(content.type, 'text');
  return (content as { type: 'text'; text: string }).text;
}

const CATEGORY: TonalAchievementCategory = { id: 'cat-1', name: 'Volume', type: 'volume' };

const DEFINITION: TonalAchievementDefinition = {
  id: 'def-1',
  name: 'First Workout',
  description: 'Complete your first workout',
  shortDescription: 'First workout',
  achievementCategoryId: 'cat-1',
  achievementCategory: CATEGORY,
  assetId: 'asset-1',
  value: 1,
  iconAssetId: 'icon-1',
  active: true,
  needsTemplate: false,
};

function earned(overrides: Partial<TonalEarnedAchievement>): TonalEarnedAchievement {
  return {
    id: 'earned-1',
    achievementId: 'def-1',
    userId: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    name: 'First Workout',
    description: 'Complete your first workout',
    shortDescription: 'First workout',
    assetId: 'asset-1',
    iconAssetId: 'icon-1',
    achievement: DEFINITION,
    localTimestamp: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function milestone(overrides: Partial<TonalAchievementMilestone>): TonalAchievementMilestone {
  return {
    id: 'milestone-1',
    name: '100 Workouts',
    description: 'Complete 100 workouts',
    shortDescription: '100 workouts',
    achievementCategoryId: 'cat-1',
    achievementCategory: null,
    assetId: 'asset-2',
    value: 100,
    iconAssetId: 'icon-2',
    active: true,
    needsTemplate: false,
    ...overrides,
  };
}

test('reports progress totals and next milestones', async () => {
  const stats: TonalAchievementStats = {
    totalAchievements: 12,
    nextMilestones: [milestone({ name: '100 Workouts', value: 100 })],
  };
  const client = tonalClient({
    getAchievementStats: async () => stats,
    getAchievements: async () => [earned({})],
  });

  const text = reportText(await getTonalAchievements(client));
  assert.match(text, /Total Achievements Earned.*12/);
  assert.match(text, /100 Workouts/);
});

test('sorts earned achievements defensively by createdAt, most-recent-first, ignoring API order', async () => {
  const client = tonalClient({
    getAchievementStats: async () => ({ totalAchievements: 3, nextMilestones: [] }) as TonalAchievementStats,
    getAchievements: async () => [
      // Returned out of chronological order on purpose -- the tool must not trust this.
      earned({ id: 'e1', name: 'Oldest', createdAt: '2026-01-01T00:00:00.000Z' }),
      earned({ id: 'e2', name: 'Newest', createdAt: '2026-08-20T00:00:00.000Z' }),
      earned({ id: 'e3', name: 'Middle', createdAt: '2026-04-15T00:00:00.000Z' }),
    ],
  });

  const text = reportText(await getTonalAchievements(client));
  const idxNewest = text.indexOf('Newest');
  const idxMiddle = text.indexOf('Middle');
  const idxOldest = text.indexOf('Oldest');
  assert.ok(idxNewest > -1 && idxMiddle > -1 && idxOldest > -1);
  assert.ok(idxNewest < idxMiddle && idxMiddle < idxOldest, 'must be sorted most-recent-first');
});

test('reports a clear empty state when nothing has been earned yet', async () => {
  const client = tonalClient({
    getAchievementStats: async () => ({ totalAchievements: 0, nextMilestones: [] }) as TonalAchievementStats,
    getAchievements: async () => [],
  });

  const text = reportText(await getTonalAchievements(client));
  assert.match(text, /No achievements earned yet/);
});

test('surfaces a client-level failure as isError rather than throwing', async () => {
  const client = tonalClient({
    getAchievementStats: async () => {
      throw new Error('achievements service unavailable');
    },
    getAchievements: async () => [],
  });

  const response = await getTonalAchievements(client);
  assert.equal(response.isError, true);
  assert.match(reportText(response), /achievements service unavailable/);
});
