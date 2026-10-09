import type { TonalActivitySummary } from '@dlwiest/ts-tonal-client';

/**
 * An activity summary as Tonal returns it, including activities imported from other apps.
 *
 * Imported activities (activityType "External", such as an Apple Watch walk or a ride from
 * a bike app) come back without the `name` Tonal declares as required, with an empty
 * targetArea, no volume or reps, a timeUnderTension that usually just repeats duration, and
 * a workoutActivityId that the activity-detail endpoint answers with 404. They describe
 * themselves through `source` and `externalWorkoutType`, which client 0.6.0 does not
 * declare. Omit avoids conflicts with pending declarations; remove this overlay after a
 * client release declares them.
 */
export type ActivitySummary = Omit<TonalActivitySummary, 'name' | 'source' | 'externalWorkoutType'> & {
  name?: string;
  source?: string;
  externalWorkoutType?: string;
};

export function isExternalActivity(activity: ActivitySummary): boolean {
  return activity.activityType === 'External';
}

/** The workout name, or for an imported activity what it was and which app recorded it. */
export function activityTitle(activity: ActivitySummary): string {
  if (isExternalActivity(activity)) {
    return `External activity: ${activity.externalWorkoutType ?? 'not reported'} (${activity.source ?? 'source not reported'})`;
  }
  return activity.name ?? 'not reported';
}
