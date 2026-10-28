import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { validateOptionalPositiveInteger } from '../utils/validation.js';

const DEFAULT_EARNED_LIMIT = 15;

export async function getAchievements(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const limit = validateOptionalPositiveInteger(args?.limit, 'limit') ?? DEFAULT_EARNED_LIMIT;
    const [stats, earned] = await Promise.all([
      client.getAchievementStats(),
      client.getAchievements(),
    ]);

    let report = `# Tonal Achievements\n\n`;
    // totalAchievements counts distinct achievements; the earned list repeats a badge
    // (e.g. Friday the 13th) once per time it was earned.
    report += `- Distinct achievements earned (totalAchievements): ${stats.totalAchievements}\n`;
    report += `- Times earned, including repeat badges: ${earned.length}\n`;

    report += `\n## Next Milestones\n`;
    if (stats.nextMilestones.length === 0) {
      report += `No upcoming milestones were returned.\n`;
    }
    for (const milestone of stats.nextMilestones) {
      report += `- **${milestone.name}**: ${milestone.shortDescription || milestone.description}\n`;
    }

    // The API has returned newest-first, but documents no order, so sort explicitly.
    const newestFirst = [...earned].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
    const shown = newestFirst.slice(0, limit);
    const label = earned.length > shown.length
      ? `showing ${shown.length} of ${earned.length}`
      : `${earned.length}`;
    report += `\n## Earned, Newest First (${label})\n`;
    if (earned.length === 0) {
      report += `No achievements have been earned yet.\n`;
    }
    for (const achievement of shown) {
      const category = achievement.achievement?.achievementCategory?.name;
      report += `- ${achievement.localTimestamp || achievement.createdAt}: **${achievement.name}**`;
      report += category ? ` (${category})\n` : `\n`;
    }

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'get_achievements');
  }
}
