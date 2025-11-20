import type { TonalMovement, WorkoutSet } from '@dlwiest/ts-tonal-client';
import type { ExerciseInput } from '../types/index.js';

interface ProcessedExercise {
  exercise: ExerciseInput;
  movementId: string;
  blockNumber: number;
  isDurationBased: boolean;
}

/**
 * Converts high-level exercise input into low-level workout sets.
 * Handles block grouping, round-robin set ordering, and movement type detection.
 *
 * @param exercises - Array of exercises in high-level format
 * @param movements - Movement database for name-to-ID lookup and type detection
 * @returns Array of WorkoutSet objects ready for API submission
 * @throws Error if movement not found or validation fails
 */
export function exercisesToSets(
  exercises: ExerciseInput[],
  movements: TonalMovement[]
): any[] {
  const movementMap = new Map(movements.map(m => [m.name.toLowerCase(), m]));

  // First pass: validate exercises and assign block numbers
  const processedExercises: ProcessedExercise[] = [];
  const blockGroupToBlockNumber = new Map<number, number>();
  let nextBlockNumber = 1;

  for (const exercise of exercises) {
    // Find movement
    const movement = movementMap.get(exercise.movementName.toLowerCase());
    if (!movement) {
      throw new Error(
        `Movement "${exercise.movementName}" not found. Use search_movements to find valid movement names.`
      );
    }

    // Check if movement is duration-based or reps-based
    const isDurationBased = !movement.countReps;

    // Validate sets
    if (!exercise.sets || exercise.sets < 1) {
      throw new Error(`Exercise "${exercise.movementName}" must have at least 1 set`);
    }

    // Validate reps or duration based on movement type
    if (isDurationBased) {
      if (!exercise.duration || exercise.duration < 1) {
        throw new Error(
          `Exercise "${exercise.movementName}" is duration-based and requires a duration in seconds (e.g., duration: 30)`
        );
      }
    } else {
      if (!exercise.reps || exercise.reps < 1) {
        throw new Error(
          `Exercise "${exercise.movementName}" is reps-based and requires reps (e.g., reps: 10)`
        );
      }
    }

    // Determine block number based on block grouping
    let blockNumber: number;
    if (exercise.block !== undefined) {
      if (!blockGroupToBlockNumber.has(exercise.block)) {
        blockGroupToBlockNumber.set(exercise.block, nextBlockNumber++);
      }
      blockNumber = blockGroupToBlockNumber.get(exercise.block)!;
    } else {
      blockNumber = nextBlockNumber++;
    }

    processedExercises.push({
      exercise,
      movementId: movement.id,
      blockNumber,
      isDurationBased,
    });
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
  const sets: any[] = [];
  const blockHasStarted = new Set<number>();

  // Process blocks in order
  const sortedBlocks = Array.from(blockToExercises.entries()).sort((a, b) => a[0] - b[0]);

  for (const [blockNumber, exercisesInBlock] of sortedBlocks) {
    // Find max number of sets in this block
    const maxSets = Math.max(...exercisesInBlock.map((pe) => pe.exercise.sets));

    // Assign setGroup per movement (1-indexed, identifies movement within block)
    const movementToSetGroup = new Map<string, number>();
    exercisesInBlock.forEach((pe, idx) => {
      movementToSetGroup.set(pe.movementId, idx + 1);
    });

    // Create sets round by round
    for (let round = 1; round <= maxSets; round++) {
      for (const pe of exercisesInBlock) {
        // Only create set if this exercise has this many rounds
        if (round <= pe.exercise.sets) {
          const isFirstSetOfBlock = !blockHasStarted.has(blockNumber);
          if (isFirstSetOfBlock) {
            blockHasStarted.add(blockNumber);
          }

          const setData: any = {
            blockStart: isFirstSetOfBlock,
            movementId: pe.movementId,
            repetition: round,
            repetitionTotal: pe.exercise.sets,
            blockNumber: blockNumber,
            burnout: false,
            spotter: false,
            eccentric: false,
            chains: false,
            flex: false,
            warmUp: false, // Always false - warmUp: true causes display issues with single-set blocks
            weightPercentage: pe.exercise.weight || 0,
            setGroup: movementToSetGroup.get(pe.movementId)!,
            round: round,
            description: '',
            dropSet: false,
          };

          // Add either prescribedReps or prescribedDuration, but not both
          if (pe.isDurationBased) {
            setData.prescribedDuration = pe.exercise.duration || 0;
          } else {
            setData.prescribedReps = pe.exercise.reps || 0;
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
 * LIMITATION: Assumes uniform sets (all sets of an exercise have same reps/weight).
 * If sets have per-set variation, values from the first set are used.
 *
 * @param sets - Array of WorkoutSet objects from API
 * @param movements - Movement database for ID-to-name lookup
 * @returns Array of exercises in high-level format
 */
export function reconstructExercisesFromSets(
  sets: WorkoutSet[],
  movements: TonalMovement[]
): ExerciseInput[] {
  if (sets.length === 0) {
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
    // Use the first set as the template (assumes uniform sets)
    const firstSet = group.sets[0];
    const movement = movementMap.get(firstSet.movementId);

    const exercise: ExerciseInput = {
      movementName: movement?.name || firstSet.movementId,
      sets: firstSet.repetitionTotal,
      weight: firstSet.weightPercentage || undefined,
      block: firstSet.blockNumber,
    };

    // Add either reps or duration based on what's present
    if (firstSet.prescribedReps !== undefined && firstSet.prescribedReps > 0) {
      exercise.reps = firstSet.prescribedReps;
    }

    // Check both prescribedDuration and durationBasedRepGoal (API uses different field names)
    const duration = (firstSet as any).prescribedDuration || (firstSet as any).durationBasedRepGoal;
    if (duration !== undefined && duration > 0) {
      exercise.duration = duration;
    }

    // Note: We don't reconstruct isWarmup because it's not reliably used
    // (create_workout always sets warmUp: false)

    exercises.push(exercise);
  }

  return exercises;
}
