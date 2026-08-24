import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';

const TREND_WEEKS = 4;

interface WeekEntry {
  weekNumber: number;
  score?: number;
  target?: number;
  lowRange?: number;
  highRange?: number;
}

function formatWeek(entry: WeekEntry): string {
  const scoreText = entry.score !== undefined ? entry.score.toFixed(2) : 'N/A';
  const targetText = entry.target !== undefined ? entry.target.toFixed(2) : 'N/A';
  const rangeText =
    entry.lowRange !== undefined && entry.highRange !== undefined
      ? ` (range ${entry.lowRange.toFixed(2)}-${entry.highRange.toFixed(2)})`
      : '';
  return `Week ${entry.weekNumber}: ${scoreText} / target ${targetText}${rangeText}`;
}

export async function getStrengthScore(client: TonalClient): Promise<MCPResponse> {
  const goalMetrics = await client.getGoalMetrics();

  // Name-match rather than hardcode a UUID: Tonal's metric IDs are not
  // guaranteed to be stable across accounts or API changes.
  const strengthMetrics = goalMetrics.filter(
    metric => /strength/i.test(metric.name) || /strength/i.test(metric.description ?? '')
  );

  if (strengthMetrics.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: '# 💪 Strength Score\n\nNo strength-related goal metrics were found for this account.',
        },
      ],
    };
  }

  const [targetScores, metricScores] = await Promise.all([
    client.getTargetScores(),
    client.getMetricScores(),
  ]);

  let report = `# 💪 Strength Score\n\n`;

  for (const metric of strengthMetrics) {
    const targets = targetScores[metric.id] ?? [];
    const scores = metricScores[metric.id] ?? [];

    const weekNumbers = Array.from(
      new Set([...targets.map(t => t.weekNumber), ...scores.map(s => s.weekNumber)])
    ).sort((a, b) => b - a);

    if (weekNumbers.length === 0) {
      report += `## ${metric.name}\n_No score data available for this metric._\n\n`;
      continue;
    }

    const currentWeekNumber = weekNumbers[0];
    const currentTarget = targets.find(t => t.weekNumber === currentWeekNumber);
    const currentScore = scores.find(s => s.weekNumber === currentWeekNumber);

    report += `## ${metric.name}\n`;
    if (metric.description) {
      report += `${metric.description}\n\n`;
    }

    report += `**Current Week (${currentWeekNumber})**\n`;
    report += `- Actual: ${currentScore ? currentScore.score.toFixed(2) : 'N/A'}\n`;
    report += `- Target: ${currentTarget ? currentTarget.target.toFixed(2) : 'N/A'}\n`;
    if (currentTarget) {
      report += `- Range: ${currentTarget.lowRange.toFixed(2)} - ${currentTarget.highRange.toFixed(2)}\n`;
    }
    report += `\n`;

    const trendWeeks = weekNumbers.slice(0, TREND_WEEKS).map(weekNumber => {
      const target = targets.find(t => t.weekNumber === weekNumber);
      const score = scores.find(s => s.weekNumber === weekNumber);
      return formatWeek({
        weekNumber,
        score: score?.score,
        target: target?.target,
        lowRange: target?.lowRange,
        highRange: target?.highRange,
      });
    });

    report += `**Last ${trendWeeks.length} Week Trend**\n`;
    trendWeeks.forEach(line => {
      report += `- ${line}\n`;
    });
    report += `\n`;
  }

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}
