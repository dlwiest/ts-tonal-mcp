import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { TonalMCPError, handleToolError } from '../utils/error-handler.js';

interface ExerciseInput {
  movementName: string;
  sets: number;
  reps?: number; // For reps-based movements
  duration?: number; // For duration-based movements (in seconds)
  weight?: number; // Optional weight percentage (0-100)
  isWarmup?: boolean;
  block?: number; // Group exercises into the same block
}

interface CreateWorkoutInput {
  title: string;
  exercises: ExerciseInput[];
  description?: string;
}

export async function listCustomWorkouts(client: TonalClient): Promise<MCPResponse> {
  // Get all user workouts - getUserWorkouts() likely returns only custom workouts
  const customWorkouts = await client.getUserWorkouts(0, 100);
  
  let report = `# 🏗️ Your Custom Workouts\n\n`;
  report += `Found ${customWorkouts.length} custom workouts\n\n`;

  if (customWorkouts.length === 0) {
    report += `No custom workouts found. Create your own workouts on the Tonal!\n`;
    return {
      content: [{ type: 'text' as const, text: report }],
    };
  }

  // Sort by creation date, most recent first
  customWorkouts.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  customWorkouts.forEach((workout, index) => {
    const date = new Date(workout.createdAt).toLocaleDateString();
    const duration = Math.round(workout.duration / 60);
    
    report += `## ${index + 1}. ${workout.title}\n`;
    report += `- **Created**: ${date}\n`;
    report += `- **Duration**: ${duration} minutes\n`;
    report += `- **Target**: ${workout.targetArea || 'Not specified'}\n`;
    report += `- **Sets**: ${workout.sets?.length || 0}\n`;
    
    if (workout.description) {
      report += `- **Description**: ${workout.description}\n`;
    }
    
    report += `- **ID**: \`${workout.id}\`\n`;
    report += `\n`;
  });

  report += `\n💡 **Tip**: To delete a workout, use the exact title in quotes.\n`;

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

export async function deleteCustomWorkout(client: TonalClient, args?: { workoutName?: string }): Promise<MCPResponse> {
  if (!args?.workoutName) {
    throw new TonalMCPError('Workout name is required', 'VALIDATION_ERROR', 400);
  }
  
  // Get all user workouts
  const allWorkouts = await client.getUserWorkouts(0, 100);
  
  // Find workouts with matching name
  const matchingWorkouts = allWorkouts.filter(workout => 
    workout.title.toLowerCase() === args.workoutName!.toLowerCase()
  );

  if (matchingWorkouts.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `❌ No custom workout found with name "${args.workoutName}".\n\nUse the list custom workouts tool to see available workouts.`,
      }],
    };
  }

  if (matchingWorkouts.length > 1) {
    return {
      content: [{
        type: 'text' as const,
        text: `⚠️ Found ${matchingWorkouts.length} workouts with the name "${args.workoutName}".\n\nPlease make workout names unique before deleting.`,
      }],
    };
  }

  const workoutToDelete = matchingWorkouts[0];

  try {
    await client.deleteWorkout(workoutToDelete.id);
    
    return {
      content: [{
        type: 'text' as const,
        text: `✅ Successfully deleted workout: **${workoutToDelete.title}**\n\nID: \`${workoutToDelete.id}\``,
      }],
    };
  } catch (error) {
    throw new TonalMCPError(
      `Failed to delete workout: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DELETE_ERROR',
      500
    );
  }
}

export async function getCustomWorkoutDetails(client: TonalClient, args?: { workoutName?: string }): Promise<MCPResponse> {
  if (!args?.workoutName) {
    throw new TonalMCPError('Workout name is required', 'VALIDATION_ERROR', 400);
  }
  
  // Get all user workouts
  const allWorkouts = await client.getUserWorkouts(0, 100);
  
  // Find workout with matching name
  const matchingWorkouts = allWorkouts.filter(workout => 
    workout.title.toLowerCase() === args.workoutName!.toLowerCase()
  );

  if (matchingWorkouts.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `❌ No custom workout found with name "${args.workoutName}".\n\nUse the list custom workouts tool to see available workouts.`,
      }],
    };
  }

  if (matchingWorkouts.length > 1) {
    return {
      content: [{
        type: 'text' as const,
        text: `⚠️ Found ${matchingWorkouts.length} workouts with the name "${args.workoutName}".\n\nShowing the most recent one.`,
      }],
    };
  }

  const workout = matchingWorkouts[0];
  
  // Fetch full workout details
  const detailedWorkout = await client.getWorkoutById(workout.id);
  
  // Get movements to resolve names
  const movements = await client.getMovements();
  const movementMap = new Map(movements.map(m => [m.id, m.name]));
  
  let report = `# 📋 ${detailedWorkout.title}\n\n`;
  
  // Basic info
  report += `## Overview\n`;
  report += `- **Created**: ${new Date(detailedWorkout.createdAt).toLocaleDateString()}\n`;
  report += `- **Duration**: ${Math.round(detailedWorkout.duration / 60)} minutes\n`;
  report += `- **Target Area**: ${detailedWorkout.targetArea || 'Not specified'}\n`;
  report += `- **Total Sets**: ${detailedWorkout.sets?.length || 0}\n`;
  
  if (detailedWorkout.description) {
    report += `- **Description**: ${detailedWorkout.description}\n`;
  }
  
  if (detailedWorkout.accessories?.length) {
    report += `- **Equipment**: ${detailedWorkout.accessories.join(', ')}\n`;
  }
  
  report += `\n`;
  
  // Movement breakdown
  if (detailedWorkout.sets && detailedWorkout.sets.length > 0) {
    report += `## Workout Structure\n\n`;
    
    let currentBlock = -1;
    detailedWorkout.sets.forEach((set, index) => {
      // New block indicator
      if (set.blockNumber !== currentBlock) {
        currentBlock = set.blockNumber;
        if (index > 0) report += `\n`;
        report += `### Block ${currentBlock + 1}\n`;
      }
      
      // Format set info
      const movementName = movementMap.get(set.movementId) || `Unknown (${set.movementId})`;
      report += `${index + 1}. **${movementName}**\n`;
      report += `   - Reps: ${set.prescribedReps}`;
      
      if (set.weightPercentage) {
        report += ` @ ${set.weightPercentage}% weight`;
      }
      
      if (set.warmUp) {
        report += ` (Warm-up)`;
      }
      
      if (set.dropSet) {
        report += ` (Drop set)`;
      }
      
      if (set.burnout) {
        report += ` (Burnout)`;
      }
      
      report += `\n`;
    });
  }
  
  report += `\n## Workout ID\n`;
  report += `\`${detailedWorkout.id}\`\n`;

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

export async function createWorkout(client: TonalClient, args?: Record<string, unknown>): Promise<MCPResponse> {
  try {
    const workoutData = args as CreateWorkoutInput | undefined;

    if (!workoutData || !workoutData.title?.trim()) {
      return handleToolError(new Error('Workout title is required'), 'create_workout');
    }

    if (!workoutData.exercises || workoutData.exercises.length === 0) {
      return handleToolError(new Error('At least one exercise is required'), 'create_workout');
    }

    // Get all movements to map names to IDs and check countReps property
    const movements = await client.getMovements();
    const movementMap = new Map(movements.map(m => [m.name.toLowerCase(), m]));

    // First pass: validate exercises and assign block numbers
    interface ProcessedExercise {
      exercise: ExerciseInput;
      movementId: string;
      blockNumber: number;
      isDurationBased: boolean;
    }

    const processedExercises: ProcessedExercise[] = [];
    const blockGroupToBlockNumber = new Map<number, number>();
    let nextBlockNumber = 1;

    for (const exercise of workoutData.exercises) {
      // Find movement
      const movement = movementMap.get(exercise.movementName.toLowerCase());
      if (!movement) {
        return handleToolError(new Error(`Movement "${exercise.movementName}" not found. Use search_movements to find valid movement names.`), 'create_workout');
      }

      // Check if movement is duration-based or reps-based
      const isDurationBased = !movement.countReps;

      // Validate sets
      if (!exercise.sets || exercise.sets < 1) {
        return handleToolError(new Error(`Exercise "${exercise.movementName}" must have at least 1 set`), 'create_workout');
      }

      // Validate reps or duration based on movement type
      if (isDurationBased) {
        if (!exercise.duration || exercise.duration < 1) {
          return handleToolError(new Error(`Exercise "${exercise.movementName}" is duration-based and requires a duration in seconds (e.g., duration: 30)`), 'create_workout');
        }
      } else {
        if (!exercise.reps || exercise.reps < 1) {
          return handleToolError(new Error(`Exercise "${exercise.movementName}" is reps-based and requires reps (e.g., reps: 10)`), 'create_workout');
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
        isDurationBased
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
      const maxSets = Math.max(...exercisesInBlock.map(pe => pe.exercise.sets));

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

    // Create the workout
    const workout = await client.createWorkout({
      title: workoutData.title,
      sets: sets,
      description: workoutData.description || '',
      createdSource: 'WorkoutBuilder',
    });

    let report = `# ✅ Workout Created Successfully\n\n`;
    report += `**${workout.title}**\n\n`;
    report += `**Workout ID:** ${workout.id}\n`;
    report += `**Estimated Duration:** ${Math.round(workout.duration / 60)} minutes\n\n`;

    report += `## Exercises (${workoutData.exercises.length} total)\n\n`;
    workoutData.exercises.forEach((ex, idx) => {
      if (ex.duration) {
        report += `${idx + 1}. **${ex.movementName}** - ${ex.sets} sets × ${ex.duration}s`;
      } else {
        report += `${idx + 1}. **${ex.movementName}** - ${ex.sets} sets × ${ex.reps} reps`;
      }
      if (ex.weight) {
        report += ` @ ${ex.weight}%`;
      }
      if (ex.isWarmup) {
        report += ` (Warmup)`;
      }
      report += `\n`;
    });

    report += `\n_Your workout has been saved and is ready to use on your Tonal!_\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    // Extract detailed error information if available
    if (error && typeof error === 'object' && 'originalError' in error) {
      const originalError = (error as any).originalError;
      if (originalError && typeof originalError === 'object') {
        const errorDetails = JSON.stringify(originalError, null, 2);
        const errorMessage = (error as any).message || 'Unknown error';
        return {
          content: [{
            type: 'text' as const,
            text: `❌ **Error creating workout**\n\n${errorMessage}\n\n**Details:**\n\`\`\`json\n${errorDetails}\n\`\`\``,
          }],
        };
      }
    }
    return handleToolError(error, 'create_workout');
  }
}