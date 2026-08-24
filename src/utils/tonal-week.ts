import type TonalClient from '@dlwiest/ts-tonal-client';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Computes the ISO 8601 week number (Monday-start; week 1 is the week containing the year's
 * first Thursday) for a "YYYY-MM-DD" date string, encoded the same way Tonal's own
 * TonalTargetScore/TonalMetricScore `weekNumber` fields are: YYYYWW (e.g. 2026 week 34 -> 202634).
 *
 * This scheme was confirmed empirically: TonalCurrentStreak.lastUpdatedWeek returned
 * "2026-08-17" (a Monday) while getTargetScores/getMetricScores reported weekNumber 202634 for
 * that same week, and weekNumber 202635 once the account's "today" (per getDailyMetrics) rolled
 * over to Monday 2026-08-24.
 */
export function isoWeekNumber(dateString: string): number {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Move to the Thursday of this ISO week; the ISO week-year is that Thursday's year.
  const isoDayNum = (date.getUTCDay() + 6) % 7; // Monday=0 .. Sunday=6
  date.setUTCDate(date.getUTCDate() - isoDayNum + 3);
  const isoYear = date.getUTCFullYear();

  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);

  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / MS_PER_WEEK);
  return isoYear * 100 + week;
}

/**
 * Determines the current Tonal week number (YYYYWW) by asking Tonal what "today" is via
 * getDailyMetrics(1) — rather than trusting the MCP server process's local clock, which may run
 * in a different timezone than the Tonal account. Returns undefined if this can't be determined
 * (e.g. the API call fails), so callers can fall back to a documented, clearly-labeled behavior
 * instead of silently guessing.
 */
export async function currentTonalWeekNumber(client: TonalClient): Promise<number | undefined> {
  try {
    const [today] = await client.getDailyMetrics(1);
    if (!today?.date) {
      return undefined;
    }
    return isoWeekNumber(today.date);
  } catch {
    return undefined;
  }
}
