import TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalProgram, TonalProgramLibraryEntry, TonalWorkoutLibraryEntry } from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { TonalMCPError, handleToolError } from '../utils/error-handler.js';
import { reconstructExercisesFromSets } from '../utils/workout-conversion.js';
import {
  validateOptionalPositiveInteger,
  validateOptionalString,
  validateRequiredString,
  validateStringArray,
} from '../utils/validation.js';

const DEFAULT_RESULTS = 10;
const MAX_RESULTS = 50;
const DESCRIPTION_LENGTH = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Page {
  limit: number;
  offset: number;
}

function validatePage(args: Record<string, unknown> | undefined): Page {
  const limit = validateOptionalPositiveInteger(args?.limit, 'limit') ?? DEFAULT_RESULTS;
  if (limit > MAX_RESULTS) {
    throw new TonalMCPError(`limit must be at most ${MAX_RESULTS}`, 'VALIDATION_ERROR', 400);
  }
  const offset = args?.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) {
    throw new TonalMCPError('offset must be a non-negative integer', 'VALIDATION_ERROR', 400);
  }
  return { limit, offset };
}

function validateMinutes(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TonalMCPError(`${fieldName} must be a number of minutes, 0 or more`, 'VALIDATION_ERROR', 400);
  }
  return value;
}

function validateId(value: unknown, fieldName: string): string {
  const id = validateRequiredString(value, fieldName);
  // IDs go into the request path, so only accept the UUIDs the search tools return.
  if (!UUID.test(id)) {
    throw new TonalMCPError(`${fieldName} must be a Tonal ID (a UUID) from a library search`, 'VALIDATION_ERROR', 400);
  }
  return id;
}

/** Lowercased, trimmed, non-empty filter values, or undefined when none were given. */
function filterValues(value: unknown, fieldName: string): Set<string> | undefined {
  const values = validateStringArray(value, fieldName).map(item => item.trim().toLowerCase()).filter(Boolean);
  return values.length > 0 ? new Set(values) : undefined;
}

/** What the user owns: an empty list means no equipment at all, unlike an absent field. */
function ownedEquipment(value: unknown): Set<string> | undefined {
  return value === undefined || value === null ? undefined : (filterValues(value, 'availableEquipment') ?? new Set());
}

function equipmentText(accessories: string[] | null | undefined): string {
  if (accessories === null || accessories === undefined) {
    return 'not reported';
  }
  return accessories.length > 0 ? accessories.join(', ') : 'none';
}

function optionalFilter(value: unknown, fieldName: string): string | undefined {
  const text = validateOptionalString(value, fieldName)?.trim().toLowerCase();
  return text ? text : undefined;
}

function matchesQuery(query: string | undefined, ...fields: (string | undefined)[]): boolean {
  return query === undefined || fields.some(field => field?.toLowerCase().includes(query));
}

function lowered(values: string[] | null | undefined): string[] {
  return (values ?? []).map(value => value.toLowerCase());
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > DESCRIPTION_LENGTH ? `${flat.slice(0, DESCRIPTION_LENGTH - 1)}…` : flat;
}

function newestFirst<T extends { publishedAt: string; id: string }>(left: T, right: T): number {
  return Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || (left.id < right.id ? -1 : 1);
}

function pageHeader(total: number, page: Page, shown: number, noun: string): string {
  if (total === 0) {
    return `No ${noun} match these filters.\n`;
  }
  if (shown === 0) {
    return `${total} ${noun} match, but offset ${page.offset} is past the end.\n`;
  }
  let header = `${total} ${noun} match; showing ${page.offset + 1}-${page.offset + shown}, newest first.`;
  if (page.offset + shown < total) {
    header += ` Pass offset ${page.offset + shown} for more.`;
  }
  return `${header}\n`;
}

export async function searchWorkoutLibrary(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const query = optionalFilter(args?.query, 'query');
    const level = optionalFilter(args?.level, 'level');
    const targetArea = optionalFilter(args?.targetArea, 'targetArea');
    const trainingType = optionalFilter(args?.trainingType, 'trainingType');
    const device = optionalFilter(args?.device, 'device');
    const minMinutes = validateMinutes(args?.minMinutes, 'minMinutes');
    const maxMinutes = validateMinutes(args?.maxMinutes, 'maxMinutes');
    if (minMinutes !== undefined && maxMinutes !== undefined && minMinutes > maxMinutes) {
      throw new TonalMCPError('minMinutes must not exceed maxMinutes', 'VALIDATION_ERROR', 400);
    }
    const requires = filterValues(args?.requiresEquipment, 'requiresEquipment');
    const available = ownedEquipment(args?.availableEquipment);
    const page = validatePage(args);

    let unknownEquipment = 0;
    const matches = (await client.getWorkoutLibrary())
      .filter((workout: TonalWorkoutLibraryEntry) => {
        const accessories = lowered(workout.accessories);
        // Bounds apply to the whole minutes shown in results, so "30 min" passes maxMinutes 30.
        const minutes = Math.round(workout.duration / 60);
        const otherwiseMatches =
          matchesQuery(query, workout.title, workout.shortDescription, workout.description) &&
          (level === undefined || workout.level.toLowerCase() === level) &&
          (targetArea === undefined || workout.targetArea?.toLowerCase() === targetArea) &&
          (trainingType === undefined || workout.primaryTrainingTypeName.toLowerCase() === trainingType) &&
          (device === undefined || lowered(workout.supportedDevices).includes(device)) &&
          (minMinutes === undefined || minutes >= minMinutes) &&
          (maxMinutes === undefined || minutes <= maxMinutes);
        if (!otherwiseMatches) {
          return false;
        }
        // Unknown accessories (null) never pass an equipment filter; count them so the
        // report can say what was left out rather than implying nothing else matched.
        if ((requires !== undefined || available !== undefined) && workout.accessories === null) {
          unknownEquipment += 1;
          return false;
        }
        return (
          (requires === undefined || [...requires].every(item => accessories.includes(item))) &&
          (available === undefined || accessories.every(item => available.has(item)))
        );
      })
      .sort(newestFirst);
    const shown = matches.slice(page.offset, page.offset + page.limit);

    let report = `# Tonal Workout Library\n\n${pageHeader(matches.length, page, shown.length, 'workouts')}`;
    if (unknownEquipment > 0) {
      report += `${unknownEquipment} more otherwise-matching workout${unknownEquipment === 1 ? '' : 's'} don't list equipment in Tonal's catalog and were left out (mostly yoga, mobility, recovery, and cardio, which usually need none). Drop the equipment filter to include them.\n`;
    }
    for (const workout of shown) {
      report += `\n**${workout.title}** (workoutId ${workout.id})\n`;
      report += `- ${Math.round(workout.duration / 60)} min | ${workout.level} | ${workout.targetArea ?? 'target area not reported'} | ${workout.primaryTrainingTypeName}\n`;
      report += `- Equipment: ${equipmentText(workout.accessories)}\n`;
      const summary = workout.shortDescription || workout.description;
      if (summary) {
        report += `- ${clip(summary)}\n`;
      }
    }
    if (shown.length > 0) {
      report += `\nUse get_library_workout with a workoutId for its exercises.\n`;
    }

    return { content: [{ type: 'text' as const, text: report }] };
  } catch (error) {
    return handleToolError(error, 'search_workout_library');
  }
}

export async function searchProgramLibrary(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const query = optionalFilter(args?.query, 'query');
    const level = optionalFilter(args?.level, 'level');
    const device = optionalFilter(args?.device, 'device');
    const weeks = validateOptionalPositiveInteger(args?.weeks, 'weeks');
    const workoutsPerWeek = validateOptionalPositiveInteger(args?.workoutsPerWeek, 'workoutsPerWeek');
    const available = ownedEquipment(args?.availableEquipment);
    const page = validatePage(args);

    const matches = (await client.getProgramLibrary())
      .filter((program: TonalProgramLibraryEntry) =>
        matchesQuery(query, program.name, program.description, program.focusArea) &&
        (level === undefined || program.level.toLowerCase() === level) &&
        (device === undefined || lowered(program.supportedDevices).includes(device)) &&
        (weeks === undefined || program.weeks === weeks) &&
        (workoutsPerWeek === undefined || program.workoutsPerWeek === workoutsPerWeek) &&
        (available === undefined || lowered(program.accessories).every(item => available.has(item)))
      )
      .sort(newestFirst);
    const shown = matches.slice(page.offset, page.offset + page.limit);

    let report = `# Tonal Program Library\n\n${pageHeader(matches.length, page, shown.length, 'programs')}`;
    for (const program of shown) {
      const days = program.cadence.flatMap((on, index) => (on ? [WEEKDAYS[index]] : []));
      report += `\n**${program.name}** (programId ${program.id})\n`;
      report += `- ${program.weeks} weeks | ${program.workoutsPerWeek} workouts per week${days.length > 0 ? ` (${days.join(', ')})` : ''} | ${program.level}\n`;
      report += `- Equipment: ${equipmentText(program.accessories)}\n`;
      if (program.description) {
        report += `- ${clip(program.description)}\n`;
      }
    }
    if (shown.length > 0) {
      report += `\nUse get_library_program with a programId for its week-by-week schedule.\n`;
    }

    return { content: [{ type: 'text' as const, text: report }] };
  } catch (error) {
    return handleToolError(error, 'search_program_library');
  }
}

export async function getLibraryWorkout(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const workoutId = validateId(args?.workoutId, 'workoutId');
    const [workout, movements] = await Promise.all([
      client.getWorkoutById(workoutId),
      client.getMovements(),
    ]);
    const exercises = reconstructExercisesFromSets(workout.sets ?? [], movements);
    const movementById = new Map(movements.map(movement => [movement.id, movement]));

    let report = `# ${workout.title}\n\n`;
    report += `- workoutId ${workout.id}\n`;
    report += `- ${Math.round(workout.duration / 60)} min | ${workout.level} | ${workout.targetArea || 'target area not reported'}\n`;
    report += `- Equipment: ${equipmentText(workout.accessories)}\n`;
    if (workout.description) {
      report += `\n${workout.description.trim()}\n`;
    }
    report += `\n## Exercises\n\n`;
    if (exercises.length === 0) {
      report += `Tonal returned no sets for this workout.\n`;
    } else {
      report += `In order, grouped by block (exercises sharing a block alternate as a superset). Weights are percentages of Tonal's suggested weight for each set's reps. This is the same shape create_workout accepts.\n`;
      // Off-machine sets (mat, bodyweight) correctly have no weight; only on-machine ones need one.
      const unweighted = (workout.sets ?? []).filter(set =>
        set.weightPercentage == null && movementById.get(set.movementId)?.onMachine === true
      ).length;
      if (unweighted > 0) {
        report += `\n${unweighted} on-machine ${unweighted === 1 ? 'set carries' : 'sets carry'} no weight percentage in Tonal's guided version, so they have no weight below. Give each a weight (or weightLb, if you have recent history at those reps) before reusing them: create_workout sends 0% for a set without one.\n`;
      }
      const unknown = [...new Set((workout.sets ?? []).map(set => set.movementId).filter(id => !movementById.has(id)))];
      if (unknown.length > 0) {
        report += `\n${unknown.length} movement${unknown.length === 1 ? ' is' : 's are'} missing from the movement catalog, so ${unknown.length === 1 ? 'its' : 'their'} movementName below is a raw ID that create_workout will reject: ${unknown.join(', ')}. Replace ${unknown.length === 1 ? 'it' : 'them'} using search_movements before reusing this workout.\n`;
      }
      report += `\n\`\`\`json\n${JSON.stringify(exercises, null, 2)}\n\`\`\`\n`;
    }
    report += `\nThis is a Tonal guided workout; reading it does not start, save, or schedule it.\n`;

    return { content: [{ type: 'text' as const, text: report }] };
  } catch (error) {
    return handleToolError(error, 'get_library_workout');
  }
}

export async function getLibraryProgram(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const programId = validateId(args?.programId, 'programId');
    // Client 0.7.0 doesn't declare accessories on program details, which the API returns.
    const program = (await client.getProgramById(programId)) as TonalProgram & { accessories?: string[] };
    const days = program.cadence.flatMap((on, index) => (on ? [WEEKDAYS[index]] : []));

    let report = `# ${program.name}\n\n`;
    report += `- programId ${program.id}\n`;
    report += `- ${program.weeks} weeks | ${program.workoutsPerWeek} workouts per week${days.length > 0 ? ` (${days.join(', ')})` : ''} | ${program.level}\n`;
    report += `- Equipment: ${equipmentText(program.accessories)}\n`;
    if (program.description) {
      report += `\n${program.description.trim()}\n`;
    }

    const schedule = [...(program.programWorkouts ?? [])].sort((left, right) =>
      left.programWeek - right.programWeek ||
      left.programDay - right.programDay ||
      left.workoutNumber - right.workoutNumber
    );
    report += `\n## Schedule\n`;
    if (schedule.length === 0) {
      report += `\nTonal returned no scheduled workouts for this program.\n`;
    }
    let week: number | undefined;
    for (const session of schedule) {
      if (session.programWeek !== week) {
        week = session.programWeek;
        report += `\n### Week ${week}\n`;
      }
      // programDay counts workouts within the week, not calendar days.
      report += `- Workout ${session.programDay}: ${session.workoutTitle}, ${Math.round(session.duration / 60)} min (workoutId ${session.workoutId})\n`;
    }
    report += `\nUse get_library_workout with a workoutId for its exercises. Reading a program does not enroll you in it.\n`;

    return { content: [{ type: 'text' as const, text: report }] };
  } catch (error) {
    return handleToolError(error, 'get_library_program');
  }
}
