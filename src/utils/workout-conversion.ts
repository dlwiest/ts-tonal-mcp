import type {
  TonalMovement,
  TonalWorkoutEstimateSet,
  WorkoutSet,
} from '@dlwiest/ts-tonal-client';
import type { ExerciseInput, SetDetail } from '../types/index.js';

const GUARDED_MODES = ['spotter', 'eccentric', 'chains', 'burnout'] as const;

interface ProcessedExercise {
  exercise: ExerciseInput;
  movementId: string;
  blockNumber: number;
  setCount: number;
  setGroup?: number;
  isDurationBased: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts high-level exercise input into low-level workout sets.
 * Handles block grouping, round-robin set ordering, and movement type detection.
 *
 * @param exercises - Array of exercises in high-level format
 * @param movements - Movement database for name-to-ID lookup and type detection
 * @returns Array of TonalWorkoutEstimateSet objects ready for API submission
 * @throws Error if movement not found or validation fails
 */
export function exercisesToSets(
  exercises: unknown[],
  movements: TonalMovement[]
): TonalWorkoutEstimateSet[] {
  const parsedExercises: ExerciseInput[] = exercises.map((input, exerciseIndex) => {
    if (!isRecord(input)) {
      throw new Error(`Exercise at index ${exerciseIndex} must be an object`);
    }
    if (typeof input.movementName !== 'string' || input.movementName.length === 0) {
      throw new Error(`Exercise at index ${exerciseIndex} must have a movementName`);
    }

    const movementName = input.movementName;
    if (
      input.sets !== undefined &&
      (typeof input.sets !== 'number' ||
        !Number.isInteger(input.sets) ||
        input.sets < 1)
    ) {
      throw new Error(
        `Exercise "${movementName}" sets must be an integer greater than or equal to 1`
      );
    }
    if (input.setDetails !== undefined && !Array.isArray(input.setDetails)) {
      throw new Error(`Exercise "${movementName}" setDetails must be an array`);
    }
    if (input.sets === undefined && input.setDetails === undefined) {
      throw new Error(`Exercise "${movementName}" must specify sets or setDetails`);
    }
    if (Array.isArray(input.setDetails) && input.setDetails.length === 0) {
      throw new Error(`Exercise "${movementName}" setDetails must contain at least 1 set`);
    }
    if (
      typeof input.sets === 'number' &&
      Array.isArray(input.setDetails) &&
      input.sets !== input.setDetails.length
    ) {
      throw new Error(
        `Exercise "${movementName}" sets "${input.sets}" does not match setDetails length "${input.setDetails.length}"`
      );
    }

    for (const field of ['reps', 'duration', 'weight'] as const) {
      const value = input[field];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`Exercise "${movementName}" ${field} must be a number`);
      }
    }
    if (
      input.block !== undefined &&
      (typeof input.block !== 'number' ||
        !Number.isInteger(input.block) ||
        input.block < 0)
    ) {
      throw new Error(
        `Exercise "${movementName}" block must be an integer greater than or equal to 0`
      );
    }
    if (input.isWarmup !== undefined && typeof input.isWarmup !== 'boolean') {
      throw new Error(`Exercise "${movementName}" isWarmup must be a boolean`);
    }

    let setDetails: SetDetail[] | undefined;
    if (Array.isArray(input.setDetails)) {
      setDetails = input.setDetails.map((setDetailInput, setIndex) => {
        if (!isRecord(setDetailInput)) {
          throw new Error(`Exercise "${movementName}" setDetails[${setIndex}] must be an object`);
        }

        for (const field of ['reps', 'duration', 'weight'] as const) {
          const value = setDetailInput[field];
          if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
            throw new Error(
              `Exercise "${movementName}" setDetails[${setIndex}].${field} must be a number`
            );
          }
        }
        if (
          setDetailInput.reps !== undefined &&
          setDetailInput.duration !== undefined
        ) {
          throw new Error(
            `Exercise "${movementName}" setDetails[${setIndex}] cannot specify both reps and duration`
          );
        }
        for (const field of ['warmUp', 'dropSet', 'burnout', 'spotter', 'eccentric', 'chains', 'flex'] as const) {
          const value = setDetailInput[field];
          if (value !== undefined && typeof value !== 'boolean') {
            throw new Error(
              `Exercise "${movementName}" setDetails[${setIndex}].${field} must be a boolean`
            );
          }
        }
        if (
          setDetailInput.description !== undefined &&
          typeof setDetailInput.description !== 'string'
        ) {
          throw new Error(
            `Exercise "${movementName}" setDetails[${setIndex}].description must be a string`
          );
        }

        const setDetail: SetDetail = {};
        if (typeof setDetailInput.reps === 'number') {
          setDetail.reps = setDetailInput.reps;
        }
        if (typeof setDetailInput.duration === 'number') {
          setDetail.duration = setDetailInput.duration;
        }
        if (typeof setDetailInput.weight === 'number') {
          setDetail.weight = setDetailInput.weight;
        }
        if (typeof setDetailInput.warmUp === 'boolean') {
          setDetail.warmUp = setDetailInput.warmUp;
        }
        if (typeof setDetailInput.dropSet === 'boolean') {
          setDetail.dropSet = setDetailInput.dropSet;
        }
        if (typeof setDetailInput.burnout === 'boolean') {
          setDetail.burnout = setDetailInput.burnout;
        }
        if (typeof setDetailInput.spotter === 'boolean') {
          setDetail.spotter = setDetailInput.spotter;
        }
        if (typeof setDetailInput.eccentric === 'boolean') {
          setDetail.eccentric = setDetailInput.eccentric;
        }
        if (typeof setDetailInput.chains === 'boolean') {
          setDetail.chains = setDetailInput.chains;
        }
        if (typeof setDetailInput.flex === 'boolean') {
          setDetail.flex = setDetailInput.flex;
        }
        if (typeof setDetailInput.description === 'string') {
          setDetail.description = setDetailInput.description;
        }
        return setDetail;
      });
    }

    const exercise: ExerciseInput = { movementName };
    if (typeof input.sets === 'number') {
      exercise.sets = input.sets;
    }
    if (typeof input.reps === 'number') {
      exercise.reps = input.reps;
    }
    if (typeof input.duration === 'number') {
      exercise.duration = input.duration;
    }
    if (typeof input.weight === 'number') {
      exercise.weight = input.weight;
    }
    if (typeof input.isWarmup === 'boolean') {
      exercise.isWarmup = input.isWarmup;
    }
    if (typeof input.block === 'number') {
      exercise.block = input.block;
    }
    if (setDetails !== undefined) {
      exercise.setDetails = setDetails;
    }
    return exercise;
  });

  const movementMap = new Map(movements.map(m => [m.name.toLowerCase(), m]));

  const hasExplicitBlocks = parsedExercises.some((exercise) => exercise.block !== undefined);
  const hasOmittedBlocks = parsedExercises.some((exercise) => exercise.block === undefined);
  const renumberMixedBlocks = hasExplicitBlocks && hasOmittedBlocks;
  const renumberedExplicitBlocks = new Map<number, number>();

  // First pass: validate exercises and assign block numbers
  const processedExercises: ProcessedExercise[] = [];
  let nextBlockNumber = 1;

  for (const exercise of parsedExercises) {
    // Find movement
    const movement = movementMap.get(exercise.movementName.toLowerCase());
    if (!movement) {
      throw new Error(
        `Movement "${exercise.movementName}" not found. Use search_movements to find valid movement names.`
      );
    }

    // Check if movement is duration-based or reps-based
    const isDurationBased = !movement.countReps;
    const setCount = exercise.setDetails?.length ?? exercise.sets;

    // Validate sets
    if (!setCount || setCount < 1) {
      throw new Error(`Exercise "${exercise.movementName}" must have at least 1 set`);
    }

    // Validate reps or duration based on movement type
    if (exercise.setDetails !== undefined) {
      exercise.setDetails.forEach((setDetail, index) => {
        // Missing support metadata is not a disabled mode; only explicit true blocks it.
        for (const mode of GUARDED_MODES) {
          if (
            setDetail[mode] === true &&
            movement.onMachineInfo?.[`${mode}Disabled`] === true
          ) {
            throw new Error(
              `Exercise "${exercise.movementName}" set ${index + 1} requests ${mode}: true, but this movement does not support ${mode} mode (onMachineInfo.${mode}Disabled is true). Remove ${mode} from this set or choose a movement that supports it.`
            );
          }
        }

        if (isDurationBased) {
          if (!setDetail.duration || setDetail.duration < 1) {
            throw new Error(
              `Exercise "${exercise.movementName}" set ${index + 1} is duration-based and requires a duration in seconds (e.g., duration: 30)`
            );
          }
        } else if (!setDetail.reps || setDetail.reps < 1) {
          throw new Error(
            `Exercise "${exercise.movementName}" set ${index + 1} is reps-based and requires reps (e.g., reps: 10)`
          );
        }
      });
    } else if (isDurationBased) {
      if (!exercise.duration || exercise.duration < 1) {
        throw new Error(
          `Exercise "${exercise.movementName}" is duration-based and requires a duration in seconds (e.g., duration: 30)`
        );
      }
    } else if (!exercise.reps || exercise.reps < 1) {
      throw new Error(
        `Exercise "${exercise.movementName}" is reps-based and requires reps (e.g., reps: 10)`
      );
    }

    // Output is sorted by block, so mixed requests use encounter-order block numbers.
    // Explicit values still identify groups; each omitted exercise gets its own group.
    let blockNumber: number;
    if (renumberMixedBlocks) {
      if (exercise.block === undefined) {
        blockNumber = nextBlockNumber++;
      } else {
        const existingBlockNumber = renumberedExplicitBlocks.get(exercise.block);
        if (existingBlockNumber !== undefined) {
          blockNumber = existingBlockNumber;
        } else {
          blockNumber = nextBlockNumber++;
          renumberedExplicitBlocks.set(exercise.block, blockNumber);
        }
      }
    } else {
      blockNumber = exercise.block ?? nextBlockNumber++;
    }

    processedExercises.push({
      exercise,
      movementId: movement.id,
      blockNumber,
      setCount,
      isDurationBased,
    });
  }

  // Tonal requires blockNumber >= 1 but preserves gaps and relative order (blocks
  // 1 and 3 round-trip unchanged), so translate resolved blocks instead of densely
  // renumbering them. A legacy 0 cannot round-trip: Tonal's PUT rewrote blocks 0,1
  // to 1,2, collapsed setGroups 1,2 to 1, and changed repetitionTotal 3 to 5,
  // merging distinct exercises. That unavoidable first save is not byte-identical;
  // shifting here avoids the destructive rewrite and makes every later save stable.
  let minimumBlockNumber = Number.POSITIVE_INFINITY;
  for (const processedExercise of processedExercises) {
    minimumBlockNumber = Math.min(minimumBlockNumber, processedExercise.blockNumber);
  }
  if (minimumBlockNumber < 1) {
    const blockNumberShift = 1 - minimumBlockNumber;
    for (const processedExercise of processedExercises) {
      processedExercise.blockNumber += blockNumberShift;
    }
  }

  // Second pass: group exercises by block and create sets in rounds
  const blockToExercises = new Map<number, ProcessedExercise[]>();
  for (const pe of processedExercises) {
    if (!blockToExercises.has(pe.blockNumber)) {
      blockToExercises.set(pe.blockNumber, []);
    }
    blockToExercises.get(pe.blockNumber)!.push(pe);
  }

  // Build sets array with proper round structure
  const sets: TonalWorkoutEstimateSet[] = [];
  const blockHasStarted = new Set<number>();

  // Process blocks in order
  const sortedBlocks = Array.from(blockToExercises.entries()).sort((a, b) => a[0] - b[0]);

  for (const [blockNumber, exercisesInBlock] of sortedBlocks) {
    // Find max number of sets in this block
    const maxSets = Math.max(...exercisesInBlock.map((pe) => pe.setCount));

    // Assign setGroup by exercise position (1-indexed) so repeated movements remain distinct.
    exercisesInBlock.forEach((pe, idx) => {
      pe.setGroup = idx + 1;
    });

    // Create sets round by round
    for (let round = 1; round <= maxSets; round++) {
      for (const pe of exercisesInBlock) {
        // Only create set if this exercise has this many rounds
        if (round <= pe.setCount) {
          const isFirstSetOfBlock = !blockHasStarted.has(blockNumber);
          if (isFirstSetOfBlock) {
            blockHasStarted.add(blockNumber);
          }

          const hasSetDetails = pe.exercise.setDetails !== undefined;
          const setDetail = pe.exercise.setDetails?.[round - 1];
          const setData: TonalWorkoutEstimateSet = {
            blockStart: isFirstSetOfBlock,
            movementId: pe.movementId,
            repetition: round,
            repetitionTotal: pe.setCount,
            blockNumber: blockNumber,
            burnout: hasSetDetails ? (setDetail?.burnout ?? false) : false,
            spotter: setDetail?.spotter ?? false,
            eccentric: setDetail?.eccentric ?? false,
            chains: setDetail?.chains ?? false,
            flex: setDetail?.flex ?? false,
            warmUp: hasSetDetails
              ? (setDetail?.warmUp ?? pe.exercise.isWarmup ?? false)
              : (pe.exercise.isWarmup ?? false),
            weightPercentage: hasSetDetails
              ? (setDetail?.weight ?? pe.exercise.weight ?? 0)
              : (pe.exercise.weight ?? 0),
            setGroup: pe.setGroup!,
            round: round,
            description: hasSetDetails ? (setDetail?.description ?? '') : '',
            dropSet: hasSetDetails ? (setDetail?.dropSet ?? false) : false,
          };

          // Add either prescribedReps or prescribedDuration, but not both
          if (pe.isDurationBased) {
            const duration = hasSetDetails ? setDetail?.duration : pe.exercise.duration;
            if (duration !== undefined) {
              setData.prescribedDuration = duration;
            }
          } else {
            const reps = hasSetDetails ? setDetail?.reps : pe.exercise.reps;
            if (reps !== undefined) {
              setData.prescribedReps = reps;
            }
          }

          sets.push(setData);
        }
      }
    }
  }

  return sets;
}

/**
 * Reconstructs high-level exercise structure from low-level workout sets.
 * Groups sets by (blockNumber, setGroup) to identify unique exercises.
 *
 * Preserves every set's programming in setDetails and also provides the compact
 * uniform fields when reps/duration/weight agree across the exercise.
 *
 * @param sets - Array of WorkoutSet objects from API
 * @param movements - Movement database for ID-to-name lookup
 * @returns Array of exercises in high-level format
 */
export function reconstructExercisesFromSets(
  sets: WorkoutSet[] | null | undefined,
  movements: TonalMovement[]
): ExerciseInput[] {
  if (!sets || sets.length === 0) {
    return [];
  }

  const movementMap = new Map(movements.map((m) => [m.id, m]));

  // Group sets by (blockNumber, setGroup) to identify unique exercises
  interface ExerciseGroup {
    blockNumber: number;
    setGroup: number;
    sets: WorkoutSet[];
  }

  const exerciseGroups = new Map<string, ExerciseGroup>();

  for (const set of sets) {
    const key = `${set.blockNumber}-${set.setGroup}`;
    if (!exerciseGroups.has(key)) {
      exerciseGroups.set(key, {
        blockNumber: set.blockNumber,
        setGroup: set.setGroup,
        sets: [],
      });
    }
    exerciseGroups.get(key)!.sets.push(set);
  }

  // Convert each group to an ExerciseInput
  const exercises: ExerciseInput[] = [];

  // Sort by blockNumber, then setGroup to maintain order
  const sortedGroups = Array.from(exerciseGroups.values()).sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    return a.setGroup - b.setGroup;
  });

  for (const group of sortedGroups) {
    const firstSet = group.sets[0];
    const movement = movementMap.get(firstSet.movementId);
    const setDetails: SetDetail[] = group.sets.map((set) => {
      const setDetail: SetDetail = {
        weight: set.weightPercentage,
        warmUp: set.warmUp,
        dropSet: set.dropSet,
        burnout: set.burnout,
        spotter: set.spotter,
        eccentric: set.eccentric,
        chains: set.chains,
        flex: set.flex,
        description: set.description,
      };

      if (movement === undefined) {
        // Movement is outside the cached catalog (newly added, retired, or a stale
        // 24h snapshot), so there is no countReps to classify on. Trust the set's own
        // goal field rather than dropping it -- exercisesToSets throws on a missing goal.
        const duration = set.prescribedDuration || set.durationBasedRepGoal;
        if (duration !== undefined && duration > 0) {
          setDetail.duration = duration;
        } else if (set.prescribedReps !== undefined && set.prescribedReps > 0) {
          setDetail.reps = set.prescribedReps;
        }
      } else if (movement.countReps) {
        if (set.prescribedReps !== undefined && set.prescribedReps > 0) {
          setDetail.reps = set.prescribedReps;
        }
      } else {
        // The API has used both names for duration-based goals.
        const duration = set.prescribedDuration || set.durationBasedRepGoal;
        if (duration !== undefined && duration > 0) {
          setDetail.duration = duration;
        }
      }

      return setDetail;
    });

    const exercise: ExerciseInput = {
      movementName: movement?.name || firstSet.movementId,
      block: group.blockNumber,
      setDetails,
    };

    const firstSetDetail = setDetails[0];
    const hasUniformProgramming = setDetails.every(
      (setDetail) =>
        setDetail.reps === firstSetDetail.reps &&
        setDetail.duration === firstSetDetail.duration &&
        setDetail.weight === firstSetDetail.weight
    );
    if (hasUniformProgramming) {
      exercise.sets = group.sets.length;
      if (firstSetDetail.reps !== undefined) {
        exercise.reps = firstSetDetail.reps;
      }
      if (firstSetDetail.duration !== undefined) {
        exercise.duration = firstSetDetail.duration;
      }
      if (firstSetDetail.weight !== undefined) {
        exercise.weight = firstSetDetail.weight;
      }
    }

    exercises.push(exercise);
  }

  return exercises;
}
