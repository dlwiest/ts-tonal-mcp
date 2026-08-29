import TonalClient, { TonalClientError } from '@dlwiest/ts-tonal-client';
import type { TonalStrengthScore, TonalStrengthScoreHistoryEntry } from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { handleToolError, TonalMCPError } from '../utils/error-handler.js';

// Tonal synthesizes a per-account "Overall" row rather than tying it to a real workout
// activity: it carries this all-zero workoutActivityId and a zero-date updatedAt. Detecting
// via workoutActivityId (rather than strengthBodyRegion === 'Overall') keys off the documented
// mechanism directly, so it still works if Tonal ever localizes/renames the region label.
const SYNTHESIZED_WORKOUT_ACTIVITY_ID = '00000000-0000-0000-0000-000000000000';

function isSynthesizedOverallRow(score: TonalStrengthScore): boolean {
  return score.workoutActivityId === SYNTHESIZED_WORKOUT_ACTIVITY_ID;
}

/**
 * Wraps TonalClient#getCurrentStrengthScores() -- Tonal's headline per-region Strength Score
 * (distinct from the weekly goal-progress metrics returned by get_strength_goal_progress).
 *
 * The "Overall" row is synthesized rather than tied to a real workout: bodyRegionDisplay is
 * empty, familyActivity is absent, workoutActivityId is an all-zero UUID, and updatedAt is a
 * zero date. This tool falls back to strengthBodyRegion for the label and never surfaces that
 * row's updatedAt as if it were a real timestamp.
 */
export async function getCurrentStrengthScores(client: TonalClient): Promise<MCPResponse> {
  try {
    const scores = await client.getCurrentStrengthScores();

    if (scores.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: '# 💪 Current Strength Scores\n\nNo strength scores are available for this account yet.',
          },
        ],
      };
    }

    let report = `# 💪 Current Strength Scores\n\n`;
    report += `Tonal's headline Strength Score per body region (not the weekly goal-progress metrics -- see get_strength_goal_progress for those).\n\n`;

    // Real regions first, the synthesized Overall row last, for a stable readable layout.
    const ordered = [...scores].sort(
      (a, b) => Number(isSynthesizedOverallRow(a)) - Number(isSynthesizedOverallRow(b))
    );

    ordered.forEach(score => {
      const label = score.bodyRegionDisplay || score.strengthBodyRegion;
      const synthesized = isSynthesizedOverallRow(score);

      report += `## ${label}${synthesized ? ' (combined across regions)' : ''}\n`;
      report += `- Score: ${score.score}\n`;
      report += `- Current: ${score.current ? 'Yes' : 'No'}\n`;
      report += synthesized
        ? `- Last Updated: N/A (this row is synthesized, not tied to a real workout activity)\n`
        : `- Last Updated: ${score.updatedAt}\n`;
      report += `\n`;
    });

    return { content: [{ type: 'text' as const, text: report }] };
  } catch (error) {
    return handleToolError(error, 'get_current_strength_scores');
  }
}

const HISTORY_DISPLAY_LIMIT = 25;

function parseDaysArg(rawDays: unknown): number | 'all' {
  if (rawDays === undefined || rawDays === 'all') {
    return 'all';
  }
  if (typeof rawDays === 'number' && Number.isFinite(rawDays) && rawDays > 0) {
    return rawDays;
  }
  throw new TonalMCPError(
    `days must be a positive number or 'all', received: ${JSON.stringify(rawDays)}`,
    'VALIDATION_ERROR',
    400
  );
}

/**
 * Wraps TonalClient#getStrengthScoreHistory(days). `days` is a calendar-day lookback, not a
 * row count -- despite the underlying API parameter being named `limit` -- so a window shorter
 * than the gap since the account's last workout returns an empty array, not an error. Defaults
 * to 'all' rather than a small number of days: both kids have documented multi-week+ training
 * gaps (e.g. 54 days) that a short default would silently misread as "no data".
 *
 * When `days: 'all'` is used, the client derives the window from the account's createdAt; if
 * that's missing, unparseable, or future-dated it throws TonalClientError, which is caught here
 * and turned into actionable guidance (retry with an explicit numeric `days`) instead of a
 * generic error.
 */
export async function getStrengthScoreHistory(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  let days: number | 'all';
  try {
    days = parseDaysArg(args?.days);
  } catch (error) {
    return handleToolError(error, 'get_strength_score_history');
  }

  let history: TonalStrengthScoreHistoryEntry[];
  try {
    history = await client.getStrengthScoreHistory(days);
  } catch (error) {
    if (error instanceof TonalClientError && days === 'all') {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `# 🏋️ Strength Score History\n\n` +
              `❌ Could not derive the lookback window from this account's creation date -- ` +
              `it may be missing, unparseable, or future-dated. Retry with an explicit numeric ` +
              `\`days\` value (e.g. \`days: 365\`) instead of the default \`'all'\`.\n\n` +
              `Details: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
    return handleToolError(error, 'get_strength_score_history');
  }

  if (history.length === 0) {
    // Distinguish "genuinely no scored activities" from "the window was too short" -- these
    // must never collapse into the same ambiguous message, since days is a calendar lookback
    // and a too-short window silently returns empty rather than erroring.
    const text =
      days === 'all'
        ? `# 🏋️ Strength Score History\n\nNo scored activities found for this account.`
        : `# 🏋️ Strength Score History\n\n` +
          `No scored activities found in the last ${days} day${days === 1 ? '' : 's'}. ` +
          `This does not necessarily mean the account has no history -- \`days\` is a calendar-day ` +
          `lookback, and this window may simply be shorter than the gap since the last scored ` +
          `activity. Retry with a larger \`days\` value or \`days: 'all'\` to check the full account history.`;

    return { content: [{ type: 'text' as const, text }] };
  }

  // History entries carry activityTime, not createdAt/updatedAt; the API documents no sort
  // order guarantee, so sort explicitly rather than trusting API order.
  const sorted = [...history].sort(
    (a, b) => new Date(b.activityTime).getTime() - new Date(a.activityTime).getTime()
  );

  let report = `# 🏋️ Strength Score History\n\n`;
  report += `${sorted.length} scored activit${sorted.length === 1 ? 'y' : 'ies'} found`;
  report += days === 'all' ? ` (full account history)\n\n` : ` (last ${days} day${days === 1 ? '' : 's'})\n\n`;

  sorted.slice(0, HISTORY_DISPLAY_LIMIT).forEach(entry => {
    report += `- **${entry.activityTime}** -- Overall ${entry.overall} (Upper ${entry.upper} / Core ${entry.core} / Lower ${entry.lower})\n`;
  });

  if (sorted.length > HISTORY_DISPLAY_LIMIT) {
    report += `\n_...and ${sorted.length - HISTORY_DISPLAY_LIMIT} more._\n`;
  }

  return { content: [{ type: 'text' as const, text: report }] };
}
