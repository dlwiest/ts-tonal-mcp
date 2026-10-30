import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalProgramLibraryEntry, TonalWorkoutLibraryEntry } from '@dlwiest/ts-tonal-client';
import {
  getLibraryProgram,
  getLibraryWorkout,
  searchProgramLibrary,
  searchWorkoutLibrary,
} from '../src/tools/library.js';
import type { MCPResponse } from '../src/types/index.js';

function reportText(response: MCPResponse): string {
  const [content] = response.content;
  assert.ok(content && content.type === 'text', 'expected a text content block');
  return content.text;
}

function workout(id: string, overrides: Partial<TonalWorkoutLibraryEntry>): TonalWorkoutLibraryEntry {
  return {
    id,
    title: id,
    shortDescription: '',
    description: '',
    duration: 1800,
    level: 'INTERMEDIATE',
    targetArea: 'UPPER BODY',
    primaryTrainingTypeName: 'Strength',
    supportedDevices: ['Classic', 'T3'],
    accessories: ['Handles'],
    publishedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TonalWorkoutLibraryEntry;
}

const WORKOUTS = [
  workout('handles-old', { title: 'Handle Burner', publishedAt: '2025-01-01T00:00:00Z' }),
  workout('bar-and-bench', { title: 'Barbell Press', accessories: ['StraightBar', 'Bench'], publishedAt: '2026-03-01T00:00:00Z' }),
  workout('long-lower', { title: 'Leg Day', targetArea: 'LOWER BODY', duration: 3600, accessories: [] }),
  workout('unknown-gear', { title: 'Mystery', accessories: null }),
  workout('yoga', { title: 'Calm Flow', primaryTrainingTypeName: 'Yoga', level: 'BEGINNER', accessories: ['Mat'], supportedDevices: ['T3'] }),
];

function program(id: string, overrides: Partial<TonalProgramLibraryEntry>): TonalProgramLibraryEntry {
  return {
    id,
    name: id,
    description: '',
    weeks: 4,
    workoutsPerWeek: 3,
    cadence: [true, false, true, false, true, false, false],
    level: 'BEGINNER',
    supportedDevices: ['Classic'],
    accessories: ['Handles'],
    publishedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TonalProgramLibraryEntry;
}

const PROGRAMS = [
  program('starter', { name: 'Starter Strength' }),
  program('advanced-six', { name: 'Six Week Power', weeks: 6, workoutsPerWeek: 4, level: 'ADVANCED', accessories: ['StraightBar', 'Bench'] }),
];

function libraryClient(extra: Record<string, unknown> = {}): TonalClient {
  return {
    getWorkoutLibrary: async () => WORKOUTS,
    getProgramLibrary: async () => PROGRAMS,
    ...extra,
  } as unknown as TonalClient;
}

function listedIds(text: string): string[] {
  return [...text.matchAll(/\((?:workoutId|programId) ([^)]+)\)/g)].map(match => match[1]);
}

test('workout filters combine, case-insensitively, newest first', async () => {
  const text = reportText(await searchWorkoutLibrary(libraryClient(), {
    targetArea: 'upper body', trainingType: 'strength', level: 'Intermediate', maxMinutes: 30,
  }));

  assert.deepEqual(listedIds(text), ['bar-and-bench', 'unknown-gear', 'handles-old']);
  assert.match(text, /3 workouts match; showing 1-3, newest first\./);
});

test('availableEquipment keeps only workouts needing nothing else, and never unknown equipment', async () => {
  const text = reportText(await searchWorkoutLibrary(libraryClient(), { availableEquipment: ['handles', 'Mat'] }));

  // long-lower needs no equipment; unknown-gear's equipment is not reported.
  assert.deepEqual(listedIds(text).sort(), ['handles-old', 'long-lower', 'yoga']);
});

test('an empty availableEquipment means the user owns nothing, not "no filter"', async () => {
  const text = reportText(await searchWorkoutLibrary(libraryClient(), { availableEquipment: [] }));

  assert.deepEqual(listedIds(text), ['long-lower']);
  assert.match(text, /1 more otherwise-matching workout don't list equipment.*Drop the equipment filter/);
});

test('duration bounds match the whole minutes shown in results', async () => {
  const client = {
    getWorkoutLibrary: async () => [workout('thirty-ish', { duration: 30 * 60 + 20 })],
  } as unknown as TonalClient;
  const text = reportText(await searchWorkoutLibrary(client, { maxMinutes: 30 }));

  assert.deepEqual(listedIds(text), ['thirty-ish']);
  assert.match(text, /- 30 min \|/);
});

test('requiresEquipment keeps only workouts that use every listed accessory', async () => {
  const text = reportText(await searchWorkoutLibrary(libraryClient(), { requiresEquipment: ['Bench', 'StraightBar'] }));

  assert.deepEqual(listedIds(text), ['bar-and-bench']);
});

test('duration bounds are inclusive minutes and query matches the title', async () => {
  assert.deepEqual(listedIds(reportText(await searchWorkoutLibrary(libraryClient(), { minMinutes: 60 }))), ['long-lower']);
  assert.deepEqual(listedIds(reportText(await searchWorkoutLibrary(libraryClient(), { query: 'calm', device: 't3' }))), ['yoga']);
});

test('pages through results and says how to get the next page', async () => {
  const first = reportText(await searchWorkoutLibrary(libraryClient(), { limit: 2 }));
  const second = reportText(await searchWorkoutLibrary(libraryClient(), { limit: 2, offset: 2 }));

  assert.match(first, /5 workouts match; showing 1-2, newest first\. Pass offset 2 for more\./);
  assert.match(second, /showing 3-4/);
  assert.equal(new Set([...listedIds(first), ...listedIds(second)]).size, 4);
});

test('rejects invalid search arguments before loading the library', async () => {
  let loaded = false;
  const client = { getWorkoutLibrary: async () => { loaded = true; return WORKOUTS; } } as unknown as TonalClient;
  for (const args of [{ limit: 51 }, { offset: -1 }, { minMinutes: 40, maxMinutes: 20 }, { maxMinutes: 'ten' }, { availableEquipment: 'Handles' }]) {
    const response = await searchWorkoutLibrary(client, args);
    assert.equal(response.isError, true, JSON.stringify(args));
  }
  assert.equal(loaded, false);
});

test('program search filters on schedule and equipment', async () => {
  const text = reportText(await searchProgramLibrary(libraryClient(), {
    weeks: 6, workoutsPerWeek: 4, availableEquipment: ['StraightBar', 'Bench', 'Handles'],
  }));

  assert.deepEqual(listedIds(text), ['advanced-six']);
  assert.match(reportText(await searchProgramLibrary(libraryClient(), {})), /4 weeks \| 3 workouts per week \(Mon, Wed, Fri\)/);
});

test('get_library_workout returns exercises by movement name and flags only on-machine sets without a weight', async () => {
  const client = {
    getWorkoutById: async (id: string) => ({
      id,
      title: 'Press Express',
      duration: 780,
      level: 'INTERMEDIATE',
      targetArea: 'UPPER BODY',
      accessories: [],
      sets: [
        { movementId: 'bench', blockNumber: 1, setGroup: 1, repetition: 1, prescribedReps: 6, weightPercentage: 60, warmUp: true },
        { movementId: 'bench', blockNumber: 1, setGroup: 1, repetition: 2, prescribedReps: 8 },
        // Off-machine: no weight is correct here and must not be flagged.
        { movementId: 'plank', blockNumber: 2, setGroup: 1, repetition: 1, prescribedDuration: 30 },
      ],
    }),
    getMovements: async () => [
      { id: 'bench', name: 'Bench Press', countReps: true, onMachine: true },
      { id: 'plank', name: 'Plank', countReps: false, onMachine: false },
    ],
  } as unknown as TonalClient;

  const text = reportText(await getLibraryWorkout(client, { workoutId: '69ac8883-72e7-402b-b2bd-f38d34b33298' }));
  const exercises = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '[]');

  assert.equal(exercises[0].movementName, 'Bench Press');
  assert.deepEqual(exercises[0].setDetails.map((set: { reps: number; weight?: number }) => [set.reps, set.weight]), [[6, 60], [8, undefined]]);
  assert.match(text, /\n1 on-machine set carries no weight percentage.*create_workout sends 0%/);
  assert.match(text, /- Equipment: none\n/);
  assert.doesNotMatch(text, /missing from the movement catalog/);
});

test('get_library_workout names movements missing from the catalog', async () => {
  const client = {
    getWorkoutById: async (id: string) => ({
      id, title: 'New Moves', duration: 600, level: 'ALL', targetArea: 'CORE', accessories: null,
      sets: [{ movementId: 'brand-new', blockNumber: 1, setGroup: 1, repetition: 1, prescribedReps: 10, weightPercentage: 50 }],
    }),
    getMovements: async () => [],
  } as unknown as TonalClient;

  const text = reportText(await getLibraryWorkout(client, { workoutId: '69ac8883-72e7-402b-b2bd-f38d34b33298' }));

  assert.match(text, /1 movement is missing from the movement catalog.*create_workout will reject: brand-new\./);
  assert.match(text, /- Equipment: not reported\n/);
});

test('get_library_program lists the schedule by week in order', async () => {
  const client = {
    getProgramById: async (id: string) => ({
      id,
      name: 'Starter Strength',
      weeks: 2,
      workoutsPerWeek: 2,
      cadence: [true, false, false, true, false, false, false],
      level: 'BEGINNER',
      accessories: [],
      programWorkouts: [
        { workoutId: 'w3', workoutTitle: 'W2 first', programWeek: 2, programDay: 1, workoutNumber: 3, duration: 1800 },
        { workoutId: 'w2', workoutTitle: 'W1 second', programWeek: 1, programDay: 2, workoutNumber: 2, duration: 1200 },
        { workoutId: 'w1', workoutTitle: 'W1 first', programWeek: 1, programDay: 1, workoutNumber: 1, duration: 600 },
      ],
    }),
  } as unknown as TonalClient;

  const text = reportText(await getLibraryProgram(client, { programId: '128e57e2-2405-4b52-8eb7-0709d47fffcc' }));

  assert.match(text, /2 workouts per week \(Mon, Thu\)/);
  assert.match(text, /### Week 1\n- Workout 1: W1 first, 10 min \(workoutId w1\)\n- Workout 2: W1 second, 20 min \(workoutId w2\)\n\n### Week 2\n- Workout 1: W2 first, 30 min/);
});

test('detail tools accept only Tonal IDs, since the ID goes into the request path', async () => {
  let called = false;
  const client = {
    getWorkoutById: async () => { called = true; },
    getProgramById: async () => { called = true; },
    getMovements: async () => [],
  } as unknown as TonalClient;

  for (const id of ['../users/me', '', 'not-a-uuid']) {
    assert.equal((await getLibraryWorkout(client, { workoutId: id })).isError, true, id);
    assert.equal((await getLibraryProgram(client, { programId: id })).isError, true, id);
  }
  assert.equal(called, false);
});
