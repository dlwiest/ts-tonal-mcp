import TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalGoalMetric, TonalMetricScore, TonalTargetScore } from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { currentTonalWeekNumber } from '../utils/tonal-week.js';

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

/**
 * Picks which week to report as "current" for a metric.
 *
 * Prefers the real current week (from today's actual date, via currentTonalWeekNumber). If that
 * week has no target/score entry yet, falls back to the most recent week at or before it that
 * Tonal actually has data for -- never to a week *after* the real current week, since that would
 * be a pre-populated future target masquerading as "this week." If the real current week
 * couldn't be determined at all (e.g. the getDailyMetrics call failed), falls back to the
 * newest week present in the data, same as the tool's original (pre-fix) behavior.
 *
 * Returns the selected week number plus whether it's the true current week or a fallback, so the
 * caller can label the two cases differently instead of silently implying "this week" either way.
 */
function selectReportedWeek(
  weekNumbersDesc: number[],
  realCurrentWeekNumber: number | undefined
): { weekNumber: number; isRealCurrentWeek: boolean; realCurrentWeekNumber: number | undefined } {
  if (realCurrentWeekNumber === undefined) {
    return { weekNumber: weekNumbersDesc[0], isRealCurrentWeek: false, realCurrentWeekNumber: undefined };
  }

  if (weekNumbersDesc.includes(realCurrentWeekNumber)) {
    return { weekNumber: realCurrentWeekNumber, isRealCurrentWeek: true, realCurrentWeekNumber };
  }

  const priorWeeks = weekNumbersDesc.filter(week => week <= realCurrentWeekNumber);
  if (priorWeeks.length > 0) {
    return { weekNumber: priorWeeks[0], isRealCurrentWeek: false, realCurrentWeekNumber };
  }

  // Only future weeks are present (e.g. Tonal pre-populated a future target with no history
  // yet). Report the real current week explicitly rather than a future one -- it will simply
  // show as having no target/score, which is the honest answer.
  return { weekNumber: realCurrentWeekNumber, isRealCurrentWeek: true, realCurrentWeekNumber };
}

function buildMetricSection(
  metric: TonalGoalMetric,
  targets: TonalTargetScore[],
  scores: TonalMetricScore[],
  realCurrentWeekNumber: number | undefined
): string {
  let section = `## ${metric.name}\n`;
  if (metric.description) {
    section += `${metric.description}\n\n`;
  }

  const allWeekNumbersDesc = Array.from(
    new Set([...targets.map(t => t.weekNumber), ...scores.map(s => s.weekNumber)])
  ).sort((a, b) => b - a);

  if (allWeekNumbersDesc.length === 0) {
    section += `_No score data available for this metric._\n\n`;
    return section;
  }

  const { weekNumber, isRealCurrentWeek } = selectReportedWeek(allWeekNumbersDesc, realCurrentWeekNumber);
  const target = targets.find(t => t.weekNumber === weekNumber);
  const score = scores.find(s => s.weekNumber === weekNumber);

  if (isRealCurrentWeek) {
    section += `**Current Week (${weekNumber})**\n`;
  } else if (realCurrentWeekNumber !== undefined) {
    section += `**Most Recent Available Week (${weekNumber})** -- current week (${realCurrentWeekNumber}) has no data yet\n`;
  } else {
    section += `**Most Recent Available Week (${weekNumber})** -- today's actual current week could not be determined\n`;
  }

  section += `- Actual: ${score ? score.score.toFixed(2) : 'N/A'}\n`;
  section += `- Target: ${target ? target.target.toFixed(2) : 'N/A'}\n`;
  if (target) {
    section += `- Range: ${target.lowRange.toFixed(2)} - ${target.highRange.toFixed(2)}\n`;
  }
  section += `\n`;

  // Trend excludes any week after the real current week, so a pre-populated future target
  // doesn't show up as if it were already history.
  const trendCandidates =
    realCurrentWeekNumber !== undefined
      ? allWeekNumbersDesc.filter(w => w <= realCurrentWeekNumber)
      : allWeekNumbersDesc;
  const trendWeekNumbers = trendCandidates.slice(0, TREND_WEEKS);

  if (trendWeekNumbers.length === 0) {
    section += `_No historical weeks available yet._\n\n`;
    return section;
  }

  const trendLines = trendWeekNumbers.map(weekNum => {
    const trendTarget = targets.find(t => t.weekNumber === weekNum);
    const trendScore = scores.find(s => s.weekNumber === weekNum);
    return formatWeek({
      weekNumber: weekNum,
      score: trendScore?.score,
      target: trendTarget?.target,
      lowRange: trendTarget?.lowRange,
      highRange: trendTarget?.highRange,
    });
  });

  section += `**Last ${trendLines.length} Week Trend**\n`;
  trendLines.forEach(line => {
    section += `- ${line}\n`;
  });
  section += `\n`;

  return section;
}

export async function getStrengthGoalProgress(client: TonalClient): Promise<MCPResponse> {
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
          text: '# 💪 Strength Goal Progress\n\nNo strength-related goal metrics were found for this account.',
        },
      ],
    };
  }

  const [targetScores, metricScores, realCurrentWeekNumber] = await Promise.all([
    client.getTargetScores(),
    client.getMetricScores(),
    currentTonalWeekNumber(client),
  ]);

  let report = `# 💪 Strength Goal Progress\n\n`;
  report += `_Weekly goal-progress metrics (e.g. Strength Sets, Functional Strength Score) -- not the app's headline per-region Strength Score. For that, use get_current_strength_scores._\n\n`;

  for (const metric of strengthMetrics) {
    const targets = targetScores[metric.id] ?? [];
    const scores = metricScores[metric.id] ?? [];
    report += buildMetricSection(metric, targets, scores, realCurrentWeekNumber);
  }

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}
