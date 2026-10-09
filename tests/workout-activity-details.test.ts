import assert from 'node:assert/strict';
import test from 'node:test';
import type TonalClient from '@dlwiest/ts-tonal-client';
import type { TonalWorkoutActivity } from '@dlwiest/ts-tonal-client';
import {
  getWorkoutActivityDetails,
  getWorkoutSummary,
} from '../src/tools/workout-activity-details.js';
import { toolsRegistry } from '../src/tools/registry.js';
import type { MCPResponse } from '../src/types/index.js';

function fakeClient(methods: Record<string, unknown>): TonalClient {
  return methods as unknown as TonalClient;
}

function reportText(response: MCPResponse): string {
  const [content] = response.content;
  assert.ok(content && content.type === 'text', 'expected a text content block');
  return content.text;
}

const DETAIL: TonalWorkoutActivity = {
  id: 'activity-42',
  userId: 'user-1',
  workoutId: 'workout-1',
  beginTime: '2026-08-30T12:00:00Z',
  endTime: '2026-08-30T15:02:00Z',
  totalDuration: 10_920,
  activeDuration: 360,
  totalSets: 5,
  totalReps: 25,
  totalVolume: 1_250,
  completed: true,
  workoutSetActivity: [34, 52, 54, 55, 55].map((avgWeight, index) => ({
    movementId: 'movement-bench',
    setGroup: 2,
    blockNumber: 1,
    repCount: 5,
    avgWeight,
    oneRepMax: 65 + index,
    totalOnMachineVolume: avgWeight * 5,
    romLengthIn: 24 + index,
  })),
};

const MOVEMENTS = [
  { id: 'movement-bench', name: 'Bench Press', onMachine: true },
  { id: 'movement-pulldown', name: 'Lat Pulldown', onMachine: true },
  { id: 'movement-plank', name: 'Plank', onMachine: false },
  { id: 'movement-carry', name: 'Farmer Carry', onMachine: true },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Rest', onMachine: false },
];

// One set per case the extra per-set lines handle: a modified working set, a skipped
// set (zero duration, out-of-order timestamps), a programmed Rest block, an off-machine
// set with Tonal's placeholder baseWeight, a set starting before the previous one
// ended, and a timed on-machine hold that carries load without counted reps.
const EXTENDED_DETAIL: TonalWorkoutActivity = {
  ...DETAIL,
  totalSets: 6,
  workoutSetActivity: [
    {
      movementId: 'movement-bench',
      beginTime: '2026-08-30T12:00:00Z',
      endTime: '2026-08-30T12:00:40Z',
      duration: 40,
      repCount: 8,
      prescribedReps: 8,
      prescribedDuration: 30,
      avgWeight: 51.5,
      baseWeight: 50,
      eccentric: true,
      eccentricWeight: 12.5,
      chains: false,
      chainsWeight: 6,
      warmUp: true,
      dropSet: false,
      spotter: true,
      repsInReserve: 2.46,
      prs: ['Strength', 'Power'],
    },
    {
      movementId: 'movement-pulldown',
      beginTime: '2026-08-30T11:00:00Z',
      endTime: '2026-08-30T11:00:00Z',
      duration: 0,
      repCount: 0,
      prescribedReps: 10,
      avgWeight: 0,
      baseWeight: 40,
    },
    {
      movementId: '00000000-0000-0000-0000-000000000005',
      beginTime: '2026-08-30T12:00:40Z',
      endTime: '2026-08-30T12:01:10Z',
      duration: 30,
      prescribedDuration: 30,
      avgWeight: 0,
      baseWeight: 5,
    },
    {
      movementId: 'movement-plank',
      beginTime: '2026-08-30T12:01:25.400Z',
      endTime: '2026-08-30T12:01:55Z',
      duration: 30,
      prescribedDuration: 30,
      avgWeight: 0,
      baseWeight: 5,
    },
    {
      movementId: 'movement-bench',
      beginTime: '2026-08-30T12:01:45Z',
      endTime: '2026-08-30T12:02:05Z',
      duration: 20,
      avgWeight: 40,
      baseWeight: 40,
      eccentric: false,
      eccentricWeight: 10,
      chains: true,
      chainsWeight: 15,
      dropSet: true,
      burnout: true,
      flex: true,
    },
    {
      movementId: 'movement-carry',
      beginTime: '2026-08-30T12:03:00Z',
      endTime: '2026-08-30T12:03:30Z',
      duration: 30,
      repCount: 0,
      prescribedDuration: 30,
      avgWeight: 0,
      baseWeight: 35,
    },
  ],
};

function setSection(text: string, heading: string): string {
  const headingPosition = text.indexOf(heading);
  assert.ok(headingPosition >= 0, `missing ${heading}`);
  const nextHeadingPosition = text.indexOf('### Set ', headingPosition + heading.length);
  return text.slice(headingPosition, nextHeadingPosition === -1 ? undefined : nextHeadingPosition);
}

const SUMMARY = {
  id: 'activity-42',
  deletedAt: null,
  userId: 'user-1',
  name: 'Upper Body Builder',
  workoutId: 'workout-1',
  coachName: 'Coach Nicolette',
  targetArea: 'Upper Body',
  isInProgram: true,
  isGuidedWorkout: false,
  isBaselineWorkout: false,
  timestamp: '2026-08-30T12:00:00Z',
  UTCTimestamp: '2026-08-30T12:00:00Z',
  localTimestamp: '2026-08-30T05:00:00',
  endTime: '2026-08-30T15:02:00Z',
  timeZone: 'America/Los_Angeles',
  duration: 10_920,
  timeUnderTension: 360,
  movementSets: [
    {
      movementName: 'Bench Press',
      movementId: 'movement-bench',
      totalVolume: 1_250,
      totalOnMachineVolume: 1_250,
      blockNumber: 1,
      setGroup: 2,
      sets: [{ repCount: 5 }, { repCount: 5 }],
    },
    {
      movementName: 'Lat Pulldown',
      movementId: 'movement-pulldown',
      totalVolume: 800,
      totalOnMachineVolume: 800,
      blockNumber: 2,
      setGroup: 3,
      sets: [{ repCount: 8 }],
    },
  ],
};

test('registers both activity inspection tools with required IDs and read-only annotations', () => {
  for (const name of ['get_workout_activity_details', 'get_workout_summary']) {
    const tool = toolsRegistry.get(name);
    assert.ok(tool, `${name} must be registered`);
    assert.deepEqual(tool.inputSchema.required, ['activityId']);
    assert.deepEqual(tool.inputSchema.properties.activityId, {
      type: 'string',
      description: 'Workout activity ID returned by list_workout_activities.',
    });
    assert.match(
      tool.description,
      /Activity summary IDs from get_recent_workouts are the same workout activity IDs accepted here/
    );
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
  }
});

test('gets activity detail and the movement catalog through the 0.6.0 client methods', async () => {
  const calls: unknown[][] = [];
  const client = fakeClient({
    getWorkoutActivityById: async (...args: unknown[]) => {
      calls.push(['detail', ...args]);
      return DETAIL;
    },
    getMovements: async (...args: unknown[]) => {
      calls.push(['movements', ...args]);
      return MOVEMENTS;
    },
  });

  await getWorkoutActivityDetails(client, { activityId: '  activity-42  ' });

  assert.deepEqual(calls, [
    ['detail', 'activity-42'],
    ['movements'],
  ]);
});

test('preserves performed-set order and every requested per-set metric', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));

  const weightPositions = [34, 52, 54, 55, 55].map((weight, index) => {
    const heading = `### Set ${index + 1}: Bench Press`;
    const headingPosition = text.indexOf(heading);
    assert.ok(headingPosition >= 0, `missing ${heading}`);
    const nextHeadingPosition = text.indexOf('### Set ', headingPosition + heading.length);
    const setText = text.slice(
      headingPosition,
      nextHeadingPosition === -1 ? undefined : nextHeadingPosition
    );
    assert.match(setText, new RegExp(`Average weight \\(avgWeight\\): ${weight} lb`));
    assert.match(setText, /Set group \(setGroup\): 2/);
    assert.match(setText, /Block number \(blockNumber\): 1/);
    assert.match(setText, /Reps \(repCount\): 5/);
    assert.match(setText, new RegExp(`One-rep max \\(oneRepMax\\): ${65 + index} lb`));
    assert.match(setText, new RegExp(`On-machine volume \\(totalOnMachineVolume\\): ${weight * 5} lb`));
    assert.match(setText, new RegExp(`Range of motion \\(romLengthIn\\): ${24 + index} in`));
    return headingPosition;
  });

  assert.deepEqual(weightPositions, [...weightPositions].sort((left, right) => left - right));
});

test('adds prescription, load, modifiers, effort, and records for a set that reports them', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => EXTENDED_DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));
  const setText = setSection(text, '### Set 1: Bench Press');

  assert.match(
    setText,
    /^- Prescribed reps \(prescribedReps\): 8 \| Prescribed duration \(prescribedDuration\): 30 seconds$/m
  );
  assert.match(
    setText,
    /^- Base weight \(baseWeight\): 50 lb \| Added eccentric load \(eccentricWeight\): 12\.5 lb$/m
  );
  assert.match(setText, /^- Modifiers: Warm-up \(warmUp\), Eccentric \(eccentric\), Spotter \(spotter\)$/m);
  assert.match(setText, /^- Estimated reps in reserve \(repsInReserve\): 2\.5$/m);
  assert.match(setText, /^- Personal records \(prs\): Strength, Power$/m);
  assert.match(setText, /^- Set duration \(duration\): 40 seconds$/m);
});

test('reports added load and modifiers only for modifiers Tonal reports as on', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => EXTENDED_DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));
  const setText = setSection(text, '### Set 5: Bench Press');

  assert.match(setText, /^- Base weight \(baseWeight\): 40 lb \| Added chains load \(chainsWeight\): 15 lb$/m);
  assert.match(
    setText,
    /^- Modifiers: Drop set \(dropSet\), Burnout \(burnout\), Chains \(chains\), Smart Flex \(flex\)$/m
  );
  assert.doesNotMatch(setSection(text, '### Set 1: Bench Press'), /chains/i);
});

test('derives rest from the last working set, skipping zero-duration sets and Rest blocks', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => EXTENDED_DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));

  assert.match(setSection(text, '### Set 2: Lat Pulldown'), /^- Set duration \(duration\): 0 seconds$/m);
  assert.match(setSection(text, '### Set 3: Rest'), /^- Set duration \(duration\): 30 seconds$/m);
  assert.match(
    setSection(text, '### Set 4: Plank'),
    /^- Set duration \(duration\): 30 seconds \| Rest before set: 45 seconds$/m
  );
  // Starts before the previous set ended, so no rest is reported rather than a negative one.
  assert.match(setSection(text, '### Set 5: Bench Press'), /^- Set duration \(duration\): 20 seconds$/m);
  assert.match(setSection(text, '### Set 6: Farmer Carry'), /Rest before set: 55 seconds$/m);
});

test('reports base weight for on-machine sets without counted reps but never a placeholder load', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => EXTENDED_DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));

  assert.match(setSection(text, '### Set 6: Farmer Carry'), /^- Base weight \(baseWeight\): 35 lb$/m);
  assert.match(setSection(text, '### Set 4: Plank'), /^- Prescribed duration \(prescribedDuration\): 30 seconds$/m);
  for (const heading of ['### Set 2: Lat Pulldown', '### Set 3: Rest', '### Set 4: Plank']) {
    assert.doesNotMatch(setSection(text, heading), /Base weight/, heading);
  }
  assert.doesNotMatch(setSection(text, '### Set 4: Plank'), /Modifiers:/);
});

test('falls back to whether a set moved weight when the movement catalog is unavailable', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => EXTENDED_DETAIL,
    getMovements: async () => {
      throw new Error('movement catalog unavailable');
    },
  }), { activityId: 'activity-42' }));
  const sections = text.split('\n### ').slice(1);

  assert.match(sections[0], /^- Base weight \(baseWeight\): 50 lb/m);
  assert.doesNotMatch(sections[3], /Base weight/);
});

test('adds no lines for fields a set does not report', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));

  assert.doesNotMatch(
    text,
    /Prescribed|Base weight|Modifiers|reps in reserve|Personal records|Set duration|Rest before set/
  );
});

test('resolves movement names from the catalog without exposing movement UUIDs', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));

  assert.match(text, /Set 1: Bench Press/);
  assert.doesNotMatch(text, /movement-bench/);
});

test('keeps unresolved sets visible without substituting their raw movement ID', async () => {
  const unknownId = 'ca8fcf7e-6e5a-4301-b617-31c3f5bd7975';
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => ({
      ...DETAIL,
      workoutSetActivity: [{ ...DETAIL.workoutSetActivity[0], movementId: unknownId }],
    }),
    getMovements: async () => [],
  }), { activityId: 'activity-42' }));

  assert.match(text, /Unknown movement \(catalog entry unavailable\)/);
  assert.doesNotMatch(text, new RegExp(unknownId));
});

test('keeps performed sets visible when movement catalog retrieval fails', async () => {
  const response = await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => DETAIL,
    getMovements: async () => {
      throw new Error('movement catalog unavailable');
    },
  }), { activityId: 'activity-42' });
  const text = reportText(response);

  assert.equal(response.isError, undefined);
  const fallbackHeadings = text.match(
    /^### Set \d+: Unknown movement \(catalog entry unavailable\)$/gm
  ) ?? [];
  assert.equal(fallbackHeadings.length, DETAIL.workoutSetActivity.length);
  assert.match(text, /Average weight \(avgWeight\): 34 lb/);
});

test('labels detail wall-clock and time-under-tension durations without swapping them', async () => {
  const text = reportText(await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => DETAIL,
    getMovements: async () => MOVEMENTS,
  }), { activityId: 'activity-42' }));

  assert.match(text, /Wall-clock session duration \(totalDuration\): 10920 seconds/);
  assert.match(text, /Time under tension \(activeDuration\): 360 seconds/);
  assert.doesNotMatch(text, /Wall-clock session duration \(totalDuration\): 360 seconds/);
  assert.doesNotMatch(text, /^- Duration:/m);
});

test('returns an error response when activity detail retrieval fails', async () => {
  let movementCalls = 0;
  const response = await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => {
      throw new Error('activity detail unavailable');
    },
    getMovements: async () => {
      movementCalls += 1;
      return MOVEMENTS;
    },
  }), { activityId: 'activity-42' });

  assert.equal(response.isError, true);
  assert.match(reportText(response), /activity detail unavailable/);
  assert.equal(movementCalls, 0);
});

test('rejects a missing activity ID before calling either detail client method', async () => {
  let calls = 0;
  const response = await getWorkoutActivityDetails(fakeClient({
    getWorkoutActivityById: async () => {
      calls += 1;
      return DETAIL;
    },
    getMovements: async () => {
      calls += 1;
      return MOVEMENTS;
    },
  }), { activityId: '  ' });

  assert.equal(response.isError, true);
  assert.match(reportText(response), /VALIDATION_ERROR/);
  assert.equal(calls, 0);
});

test('surfaces summary metadata and preserves Tonal movement-breakdown order', async () => {
  const text = reportText(await getWorkoutSummary(fakeClient({
    getFormattedWorkoutSummary: async () => SUMMARY,
  }), { activityId: 'activity-42' }));

  assert.match(text, /Name: Upper Body Builder/);
  assert.match(text, /Coach: Coach Nicolette/);
  assert.match(text, /Target area: Upper Body/);
  assert.match(text, /In program \(isInProgram\): yes/);
  assert.match(text, /Guided workout \(isGuidedWorkout\): no/);
  assert.match(text, /Total volume \(totalVolume\): 1250 lb/);
  assert.match(text, /On-machine volume \(totalOnMachineVolume\): 1250 lb/);
  assert.match(text, /Performed set entries: 2/);
  assert.ok(text.indexOf('1. Bench Press') < text.indexOf('2. Lat Pulldown'));
});

test('labels summary wall-clock duration and time under tension without swapping them', async () => {
  const text = reportText(await getWorkoutSummary(fakeClient({
    getFormattedWorkoutSummary: async () => SUMMARY,
  }), { activityId: 'activity-42' }));

  assert.match(text, /Wall-clock session duration \(duration\): 10920 seconds/);
  assert.match(text, /Time under tension \(timeUnderTension\): 360 seconds/);
  assert.doesNotMatch(text, /Wall-clock session duration \(duration\): 360 seconds/);
  assert.doesNotMatch(text, /^- Duration:/m);
});

test('passes a trimmed activity ID to summary retrieval and maps failures to isError', async () => {
  const calls: string[] = [];
  const response = await getWorkoutSummary(fakeClient({
    getFormattedWorkoutSummary: async (activityId: string) => {
      calls.push(activityId);
      throw new Error('summary unavailable');
    },
  }), { activityId: '  activity-42  ' });

  assert.deepEqual(calls, ['activity-42']);
  assert.equal(response.isError, true);
  assert.match(reportText(response), /summary unavailable/);
});
