import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { TonalMCPError } from '../utils/error-handler.js';

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