import TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalAchievementStats, TonalEarnedAchievement } from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';

const EARNED_DISPLAY_LIMIT = 15;

/**
 * Wraps TonalClient#getAchievements() and #getAchievementStats() in a single compacted view --
 * progress toward the next milestones plus a recent-first list of what's already been earned.
 * Intended to eventually feed a motivational tile on the kids' Nexus dashboard (separate
 * follow-on, not part of this tool).
 *
 * getAchievements() returns the full earned history unbounded, with no documented sort-order
 * guarantee. TonalEarnedAchievement does carry createdAt (and localTimestamp), so this sorts
 * defensively by createdAt (most-recent-first) rather than trusting API order. If a future
 * client version ever drops all timestamp fields from the type, that limitation should be noted
 * here plainly rather than silently presenting arbitrary order as chronological.
 */
export async function getTonalAchievements(client: TonalClient): Promise<MCPResponse> {
  try {
    const [stats, earned]: [TonalAchievementStats, TonalEarnedAchievement[]] = await Promise.all([
      client.getAchievementStats(),
      client.getAchievements(),
    ]);

    let report = `# 🏆 Tonal Achievements\n\n`;

    report += `## Progress\n`;
    report += `- **Total Achievements Earned**: ${stats.totalAchievements}\n\n`;

    if (stats.nextMilestones.length > 0) {
      report += `## Next Milestones\n`;
      stats.nextMilestones.forEach(milestone => {
        report += `- **${milestone.name}** (target: ${milestone.value.toLocaleString()}) -- ${milestone.description}\n`;
      });
      report += `\n`;
    }

    if (earned.length === 0) {
      report += `## Recently Earned\n\n_No achievements earned yet._\n`;
      return { content: [{ type: 'text' as const, text: report }] };
    }

    // Sorted defensively by createdAt (most-recent-first) rather than trusting API order, since
    // getAchievements() documents no sort-order guarantee for the returned list.
    const sorted = [...earned].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    report += `## Recently Earned (${sorted.length} total, most recent first)\n`;
    sorted.slice(0, EARNED_DISPLAY_LIMIT).forEach(achievement => {
      const category = achievement.achievement?.achievementCategory?.name;
      report += `- **${achievement.name}** -- ${achievement.createdAt}${category ? ` (${category})` : ''}\n`;
    });

    if (sorted.length > EARNED_DISPLAY_LIMIT) {
      report += `\n_...and ${sorted.length - EARNED_DISPLAY_LIMIT} more._\n`;
    }

    return { content: [{ type: 'text' as const, text: report }] };
  } catch (error) {
    return handleToolError(error, 'get_tonal_achievements');
  }
}
