// Default values for tool parameters
export const DEFAULTS = {
  WORKOUT_LIMIT: 10,
  DAILY_METRICS_DAYS: 30,
  RECENT_ACTIVITIES_LIMIT: 10,
  MAX_WORKOUT_LIMIT: 100,
} as const;

// Muscle readiness thresholds
export const MUSCLE_READINESS = {
  EXCELLENT: 80,
  GOOD: 60,
  NEEDS_RECOVERY: 60,
} as const;

// Workout frequency analysis thresholds
export const WORKOUT_FREQUENCY = {
  EXCEPTIONAL: 80,
  GREAT: 60,
  GOOD: 40,
  BUILDING: 20,
} as const;