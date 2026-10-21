import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  TonalMovement,
  TonalWorkoutEstimateSet,
  WorkoutSet,
} from '@dlwiest/ts-tonal-client';
import {
  exercisesToSets,
  reconstructExercisesFromSets,
} from '../src/utils/workout-conversion.js';

function movement(id: string, name: string, countReps: boolean): TonalMovement {
  return {
    id,
    createdAt: '',
    updatedAt: '',
    name,
    shortName: name,
    muscleGroups: [],
    bodyRegion: '',
    bodyRegionDisplay: '',
    baseOfSupport: '',
    pushPull: '',
    family: '',
    familyDisplay: '',
    inFreeLift: false,
    onMachine: true,
    countReps,
    isTwoSided: false,
    isBilateral: true,
    isAlternating: false,
    offMachineAccessory: '',
    descriptionHow: '',
    descriptionWhy: '',
    sortOrder: 0,
    imageAssetId: '',
    skillLevel: 0,
    active: true,
    featureGroupIds: null,
    isGeneric: false,
  };
}

const MOVEMENTS = [
  movement('bench', 'Bench Press', true),
  movement('pulldown', 'Lat Pulldown', true),
  movement('plank', 'Plank', false),
  movement('curl', 'Biceps Curl', true),
];

const SET_DEFAULTS = {
  burnout: false,
  spotter: false,
  eccentric: false,
  chains: false,
  flex: false,
  warmUp: false,
  description: '',
  dropSet: false,
} satisfies Pick<
  TonalWorkoutEstimateSet,
  | 'burnout'
  | 'spotter'
  | 'eccentric'
  | 'chains'
  | 'flex'
  | 'warmUp'
  | 'description'
  | 'dropSet'
>;

const GOLDEN_WORKOUT: TonalWorkoutEstimateSet[] = [
  {
    ...SET_DEFAULTS,
    blockStart: true,
    movementId: 'bench',
    prescribedReps: 10,
    repetition: 1,
    repetitionTotal: 2,
    blockNumber: 1,
    weightPercentage: 55,
    setGroup: 1,
    round: 1,
  },
  {
    ...SET_DEFAULTS,
    blockStart: false,
    movementId: 'bench',
    prescribedReps: 5,
    repetition: 1,
    repetitionTotal: 2,
    blockNumber: 1,
    weightPercentage: 85,
    setGroup: 2,
    round: 1,
  },
  {
    ...SET_DEFAULTS,
    blockStart: false,
    movementId: 'bench',
    prescribedReps: 10,
    repetition: 2,
    repetitionTotal: 2,
    blockNumber: 1,
    weightPercentage: 55,
    setGroup: 1,
    round: 2,
  },
  {
    ...SET_DEFAULTS,
    blockStart: false,
    movementId: 'bench',
    prescribedReps: 5,
    repetition: 2,
    repetitionTotal: 2,
    blockNumber: 1,
    weightPercentage: 85,
    setGroup: 2,
    round: 2,
  },
  {
    ...SET_DEFAULTS,
    blockStart: true,
    movementId: 'pulldown',
    prescribedReps: 12,
    repetition: 1,
    repetitionTotal: 3,
    blockNumber: 2,
    warmUp: true,
    weightPercentage: 50,
    setGroup: 1,
    round: 1,
    description: 'ramp up',
  },
  {
    ...SET_DEFAULTS,
    blockStart: false,
    movementId: 'plank',
    prescribedDuration: 30,
    repetition: 1,
    repetitionTotal: 1,
    blockNumber: 2,
    weightPercentage: 0,
    setGroup: 2,
    round: 1,
  },
  {
    ...SET_DEFAULTS,
    blockStart: false,
    movementId: 'pulldown',
    prescribedReps: 8,
    repetition: 2,
    repetitionTotal: 3,
    blockNumber: 2,
    weightPercentage: 75,
    setGroup: 1,
    round: 2,
  },
  {
    ...SET_DEFAULTS,
    blockStart: false,
    movementId: 'pulldown',
    prescribedReps: 5,
    repetition: 3,
    repetitionTotal: 3,
    blockNumber: 2,
    burnout: true,
    weightPercentage: 90,
    setGroup: 1,
    round: 3,
    description: 'drop',
    dropSet: true,
  },
];

function asReadSets(sets: TonalWorkoutEstimateSet[]): WorkoutSet[] {
  // The read converter consumes the programming fields shared by both set shapes.
  const readSets = sets as unknown as WorkoutSet[];
  return readSets;
}

test('golden workout survives a full no-edit round trip', () => {
  const exercises = reconstructExercisesFromSets(asReadSets(GOLDEN_WORKOUT), MOVEMENTS);
  const roundTrippedSets = exercisesToSets(exercises, MOVEMENTS);

  assert.deepEqual(roundTrippedSets, GOLDEN_WORKOUT);

  const ramp = exercises.find((exercise) => exercise.movementName === 'Lat Pulldown');
  assert.equal(ramp?.sets, undefined);
  assert.equal(ramp?.setDetails?.length, 3);
});

test('non-uniform reps, weights, flags, and descriptions survive reconstruction', () => {
  const rampSets = GOLDEN_WORKOUT.filter(
    (set) => set.blockNumber === 2 && set.setGroup === 1
  );
  const exercises = reconstructExercisesFromSets(asReadSets(rampSets), MOVEMENTS);

  assert.deepEqual(exercises, [
    {
      movementName: 'Lat Pulldown',
      block: 2,
      setDetails: [
        {
          reps: 12,
          weight: 50,
          warmUp: true,
          dropSet: false,
          burnout: false,
          spotter: false,
          eccentric: false,
          chains: false,
          flex: false,
          description: 'ramp up',
        },
        {
          reps: 8,
          weight: 75,
          warmUp: false,
          dropSet: false,
          burnout: false,
          spotter: false,
          eccentric: false,
          chains: false,
          flex: false,
          description: '',
        },
        {
          reps: 5,
          weight: 90,
          warmUp: false,
          dropSet: true,
          burnout: true,
          spotter: false,
          eccentric: false,
          chains: false,
          flex: false,
          description: 'drop',
        },
      ],
    },
  ]);
  assert.deepEqual(exercisesToSets(exercises, MOVEMENTS), rampSets);
});

test('repeated movements in one block retain distinct set groups', () => {
  const sets = exercisesToSets(
    [
      { movementName: 'Bench Press', sets: 2, reps: 10, weight: 55, block: 1 },
      { movementName: 'Bench Press', sets: 2, reps: 5, weight: 85, block: 1 },
    ],
    MOVEMENTS
  );

  assert.deepEqual(
    sets.map((set) => set.setGroup),
    [1, 2, 1, 2]
  );

  const reconstructed = reconstructExercisesFromSets(asReadSets(sets), MOVEMENTS);
  assert.equal(reconstructed.length, 2);
  assert.deepEqual(
    reconstructed.map(({ movementName, sets: setCount, reps, weight, block }) => ({
      movementName,
      sets: setCount,
      reps,
      weight,
      block,
    })),
    [
      { movementName: 'Bench Press', sets: 2, reps: 10, weight: 55, block: 1 },
      { movementName: 'Bench Press', sets: 2, reps: 5, weight: 85, block: 1 },
    ]
  );
});

test('mixed supplied and omitted blocks are renumbered without collisions', () => {
  const sets = exercisesToSets(
    [
      { movementName: 'Bench Press', sets: 1, reps: 8, block: 1 },
      { movementName: 'Lat Pulldown', sets: 1, reps: 10, block: 2 },
      { movementName: 'Plank', sets: 1, duration: 30 },
    ],
    MOVEMENTS
  );

  assert.deepEqual(
    sets.map(({ movementId, blockNumber }) => ({ movementId, blockNumber })),
    [
      { movementId: 'bench', blockNumber: 1 },
      { movementId: 'pulldown', blockNumber: 2 },
      { movementId: 'plank', blockNumber: 3 },
    ]
  );
});

test('uniform inputs keep the legacy set shape and honor isWarmup', () => {
  const uniformSets = exercisesToSets(
    [{ movementName: 'Bench Press', sets: 2, reps: 10, weight: 55 }],
    MOVEMENTS
  );

  assert.deepEqual(uniformSets, [
    {
      ...SET_DEFAULTS,
      blockStart: true,
      movementId: 'bench',
      prescribedReps: 10,
      repetition: 1,
      repetitionTotal: 2,
      blockNumber: 1,
      weightPercentage: 55,
      setGroup: 1,
      round: 1,
    },
    {
      ...SET_DEFAULTS,
      blockStart: false,
      movementId: 'bench',
      prescribedReps: 10,
      repetition: 2,
      repetitionTotal: 2,
      blockNumber: 1,
      weightPercentage: 55,
      setGroup: 1,
      round: 2,
    },
  ]);

  const warmupSets = exercisesToSets(
    [{ movementName: 'Bench Press', sets: 1, reps: 5, isWarmup: true }],
    MOVEMENTS
  );
  assert.equal(warmupSets[0].warmUp, true);
});

test('setDetails presence and count are validated at runtime', () => {
  assert.throws(
    () => exercisesToSets([{ movementName: 'Bench Press', reps: 10 }], MOVEMENTS),
    /Exercise "Bench Press" must specify sets or setDetails/
  );
  assert.throws(
    () => exercisesToSets([{ movementName: 'Bench Press', setDetails: [] }], MOVEMENTS),
    /Exercise "Bench Press" setDetails must contain at least 1 set/
  );
  assert.throws(
    () =>
      exercisesToSets(
        [
          {
            movementName: 'Bench Press',
            sets: 3,
            setDetails: [{ reps: 10 }, { reps: 8 }, { reps: 5 }, { reps: 3 }],
          },
        ],
        MOVEMENTS
      ),
    /sets "3" does not match setDetails length "4"/
  );
});

test('mixed block requests renumber by first appearance without reordering exercises', () => {
  const allExplicit = exercisesToSets(
    [
      { movementName: 'Bench Press', sets: 1, reps: 5, block: 0 },
      { movementName: 'Lat Pulldown', sets: 1, reps: 5, block: 2 },
    ],
    MOVEMENTS
  );
  assert.deepEqual(
    allExplicit.map(({ movementId, blockNumber }) => ({ movementId, blockNumber })),
    [
      { movementId: 'bench', blockNumber: 1 },
      { movementId: 'pulldown', blockNumber: 3 },
    ]
  );

  const allOmitted = exercisesToSets(
    [
      { movementName: 'Bench Press', sets: 1, reps: 5 },
      { movementName: 'Lat Pulldown', sets: 1, reps: 5 },
    ],
    MOVEMENTS
  );
  assert.deepEqual(
    allOmitted.map(({ movementId, blockNumber }) => ({ movementId, blockNumber })),
    [
      { movementId: 'bench', blockNumber: 1 },
      { movementId: 'pulldown', blockNumber: 2 },
    ]
  );

  const mixed = exercisesToSets(
    [
      { movementName: 'Bench Press', sets: 1, reps: 5 },
      { movementName: 'Lat Pulldown', sets: 1, reps: 5, block: 0 },
      { movementName: 'Biceps Curl', sets: 1, reps: 5, block: 0 },
    ],
    MOVEMENTS
  );
  assert.deepEqual(
    mixed.map(({ movementId, blockNumber }) => ({ movementId, blockNumber })),
    [
      { movementId: 'bench', blockNumber: 1 },
      { movementId: 'pulldown', blockNumber: 2 },
      { movementId: 'curl', blockNumber: 2 },
    ]
  );

  const gappedRoundTripWithAppend = exercisesToSets(
    [
      { movementName: 'Bench Press', sets: 1, reps: 5, block: 0 },
      { movementName: 'Lat Pulldown', sets: 1, reps: 5, block: 2 },
      { movementName: 'Plank', sets: 1, duration: 30 },
    ],
    MOVEMENTS
  );
  assert.deepEqual(
    gappedRoundTripWithAppend.map(({ movementId, blockNumber }) => ({
      movementId,
      blockNumber,
    })),
    [
      { movementId: 'bench', blockNumber: 1 },
      { movementId: 'pulldown', blockNumber: 2 },
      { movementId: 'plank', blockNumber: 3 },
    ]
  );
});

test('emitted sets always use 1-based blocks while preserving grouping and gaps', () => {
  const scenarios = {
    explicitZero: exercisesToSets(
      [{ movementName: 'Bench Press', sets: 1, reps: 5, block: 0 }],
      MOVEMENTS
    ),
    mixedZero: exercisesToSets(
      [
        { movementName: 'Bench Press', sets: 1, reps: 5, block: 0 },
        { movementName: 'Lat Pulldown', sets: 1, reps: 5 },
      ],
      MOVEMENTS
    ),
    allOmitted: exercisesToSets(
      [
        { movementName: 'Bench Press', sets: 1, reps: 5 },
        { movementName: 'Lat Pulldown', sets: 1, reps: 5 },
      ],
      MOVEMENTS
    ),
    shiftedGap: exercisesToSets(
      [
        { movementName: 'Bench Press', sets: 1, reps: 5, block: 0 },
        { movementName: 'Lat Pulldown', sets: 1, reps: 5, block: 0 },
        { movementName: 'Plank', sets: 1, duration: 30, block: 2 },
      ],
      MOVEMENTS
    ),
  };

  for (const [scenario, sets] of Object.entries(scenarios)) {
    assert.ok(
      sets.every(({ blockNumber }) => blockNumber >= 1),
      `${scenario} emitted a block below 1`
    );
  }

  assert.deepEqual(
    scenarios.shiftedGap.map(({ movementId, blockNumber, setGroup }) => ({
      movementId,
      blockNumber,
      setGroup,
    })),
    [
      { movementId: 'bench', blockNumber: 1, setGroup: 1 },
      { movementId: 'pulldown', blockNumber: 1, setGroup: 2 },
      { movementId: 'plank', blockNumber: 3, setGroup: 1 },
    ]
  );
});

test('setDetails inherit exercise-level weight and warmup defaults', () => {
  const sets = exercisesToSets(
    [
      {
        movementName: 'Bench Press',
        weight: 70,
        isWarmup: true,
        setDetails: [
          { reps: 10 },
          { reps: 8, weight: 0, warmUp: false },
        ],
      },
    ],
    MOVEMENTS
  );

  assert.deepEqual(
    sets.map(({ weightPercentage, warmUp }) => ({ weightPercentage, warmUp })),
    [
      { weightPercentage: 70, warmUp: true },
      { weightPercentage: 0, warmUp: false },
    ]
  );
});

test('sets and block reject values outside their integer ranges', () => {
  assert.throws(
    () =>
      exercisesToSets(
        [{ movementName: 'Bench Press', sets: 2.5, reps: 5 }],
        MOVEMENTS
      ),
    /sets must be an integer greater than or equal to 1/
  );
  assert.throws(
    () =>
      exercisesToSets(
        [{ movementName: 'Bench Press', sets: 1, reps: 5, block: 1.5 }],
        MOVEMENTS
      ),
    /block must be an integer greater than or equal to 0/
  );
  assert.throws(
    () =>
      exercisesToSets(
        [{ movementName: 'Bench Press', sets: 1, reps: 5, block: -3 }],
        MOVEMENTS
      ),
    /block must be an integer greater than or equal to 0/
  );
});

test('setDetails reject simultaneous reps and duration with the set index', () => {
  assert.throws(
    () =>
      exercisesToSets(
        [
          {
            movementName: 'Bench Press',
            setDetails: [{ reps: 10, duration: 30 }],
          },
        ],
        MOVEMENTS
      ),
    /setDetails\[0\] cannot specify both reps and duration/
  );
});

test('reconstruction chooses the movement goal when an API set carries both', () => {
  const setsWithBothGoals: TonalWorkoutEstimateSet[] = [
    {
      ...SET_DEFAULTS,
      blockStart: true,
      movementId: 'bench',
      prescribedReps: 8,
      prescribedDuration: 30,
      repetition: 1,
      repetitionTotal: 1,
      blockNumber: 1,
      weightPercentage: 60,
      setGroup: 1,
      round: 1,
    },
    {
      ...SET_DEFAULTS,
      blockStart: true,
      movementId: 'plank',
      prescribedReps: 8,
      prescribedDuration: 30,
      repetition: 1,
      repetitionTotal: 1,
      blockNumber: 2,
      weightPercentage: 0,
      setGroup: 1,
      round: 1,
    },
  ];

  const exercises = reconstructExercisesFromSets(asReadSets(setsWithBothGoals), MOVEMENTS);
  assert.equal(exercises[0].setDetails?.[0].reps, 8);
  assert.equal(exercises[0].setDetails?.[0].duration, undefined);
  assert.equal(exercises[1].setDetails?.[0].reps, undefined);
  assert.equal(exercises[1].setDetails?.[0].duration, 30);

  assert.deepEqual(
    exercisesToSets(exercises, MOVEMENTS).map(
      ({ movementId, prescribedReps, prescribedDuration }) => ({
        movementId,
        prescribedReps,
        prescribedDuration,
      })
    ),
    [
      {
        movementId: 'bench',
        prescribedReps: 8,
        prescribedDuration: undefined,
      },
      {
        movementId: 'plank',
        prescribedReps: undefined,
        prescribedDuration: 30,
      },
    ]
  );
});

const TRAINING_MODES = ['spotter', 'eccentric', 'chains', 'flex', 'burnout'] as const;
const MODE_SUPPORT = {
  accessory: 'Handles',
  resistanceType: 'Weight',
  spotterDisabled: false,
  eccentricDisabled: false,
  chainsDisabled: false,
  burnoutDisabled: false,
};

for (const mode of TRAINING_MODES) {
  test(`${mode} sends explicit true and false and defaults omitted flags to false`, () => {
    const sets = exercisesToSets(
      [{
        movementName: 'Bench Press',
        setDetails: [
          { reps: 10, [mode]: true },
          { reps: 10, [mode]: false },
          { reps: 10 },
        ],
      }],
      [{ ...MOVEMENTS[0], onMachineInfo: MODE_SUPPORT }]
    );

    assert.deepEqual(sets.map((set) => set[mode]), [true, false, false]);
  });

  for (const uniform of [true, false]) {
    test(`${mode} survives ${uniform ? 'uniform' : 'non-uniform'} set reconstruction and update`, () => {
      const savedSets = GOLDEN_WORKOUT
        .filter((set) => set.blockNumber === 1 && set.setGroup === 1)
        .map((set, index) => ({
          ...set,
          prescribedReps: uniform ? 10 : 10 - index,
          [mode]: index === 0,
        }));
      const exercises = reconstructExercisesFromSets(asReadSets(savedSets), MOVEMENTS);

      assert.equal(exercises[0].sets, uniform ? 2 : undefined);
      assert.deepEqual(exercises[0].setDetails?.map((set) => set[mode]), [true, false]);
      assert.deepEqual(exercisesToSets(exercises, MOVEMENTS), savedSets);
    });
  }

  test(`${mode} rejects non-boolean per-set values`, () => {
    for (const value of ['true', 1, null, {}, []]) {
      assert.throws(
        () => exercisesToSets(
          [{ movementName: 'Bench Press', setDetails: [{ reps: 10, [mode]: value }] }],
          MOVEMENTS
        ),
        { message: `Exercise "Bench Press" setDetails[0].${mode} must be a boolean` }
      );
    }
  });
}

for (const mode of ['spotter', 'eccentric', 'chains', 'burnout'] as const) {
  const disabledMovement: TonalMovement = {
    ...MOVEMENTS[0],
    onMachineInfo: { ...MODE_SUPPORT, [`${mode}Disabled`]: true },
  };

  test(`${mode} rejects explicit true when the movement disables that mode`, () => {
    assert.throws(
      () => exercisesToSets(
        [{
          movementName: 'Bench Press',
          setDetails: [{ reps: 10 }, { reps: 8, [mode]: true }],
        }],
        [disabledMovement]
      ),
      { message: `Exercise "Bench Press" set 2 requests ${mode}: true, but this movement does not support ${mode} mode (onMachineInfo.${mode}Disabled is true). Remove ${mode} from this set or choose a movement that supports it.` }
    );
  });

  test(`${mode} being disabled permits false, omission, and other enabled modes`, () => {
    const sets = exercisesToSets(
      [{
        movementName: 'Bench Press',
        setDetails: [{ reps: 10, [mode]: false }, { reps: 10, flex: true }],
      }],
      [disabledMovement]
    );

    assert.deepEqual(sets.map((set) => set[mode]), [false, false]);
    assert.equal(sets[1].flex, true);
  });
}

test('absent onMachineInfo does not block any training mode', () => {
  const sets = exercisesToSets(
    [{
      movementName: 'Bench Press',
      setDetails: TRAINING_MODES.map((mode) => ({ reps: 10, [mode]: true })),
    }],
    MOVEMENTS
  );

  for (const [index, mode] of TRAINING_MODES.entries()) {
    assert.equal(sets[index][mode], true);
  }
});

test('uniform inputs default modes off and preserve touchscreen changes on the next update', () => {
  const sets = exercisesToSets(
    [{ movementName: 'Bench Press', sets: 2, reps: 10 }],
    MOVEMENTS
  );
  for (const set of sets) {
    for (const mode of TRAINING_MODES) {
      assert.equal(set[mode], false);
      set[mode] = true;
    }
  }

  const exercises = reconstructExercisesFromSets(asReadSets(sets), MOVEMENTS);
  assert.equal(exercises[0].sets, 2);
  assert.equal(exercises[0].setDetails?.length, 2);
  assert.deepEqual(exercisesToSets(exercises, MOVEMENTS), sets);
});

test('duration-based sets preserve all training modes through reconstruction', () => {
  const sets = GOLDEN_WORKOUT
    .filter((set) => set.movementId === 'plank')
    .map((set) => ({
      ...set,
      blockStart: true,
      setGroup: 1,
      spotter: true,
      eccentric: true,
      chains: true,
      flex: true,
      burnout: true,
    }));

  assert.deepEqual(
    exercisesToSets(reconstructExercisesFromSets(asReadSets(sets), MOVEMENTS), MOVEMENTS),
    sets
  );
});
