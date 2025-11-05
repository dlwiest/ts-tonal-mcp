import TonalClient from '@dlwiest/ts-tonal-client';
import { validateStringArray } from '../utils/validation.js';
import { MCPResponse } from '../types/index.js';

export async function getMovements(client: TonalClient, args?: { muscleGroups?: string[] }): Promise<MCPResponse> {
  const muscleGroups = validateStringArray(args?.muscleGroups, 'muscleGroups');
  const movements = await client.getMovements();
  
  // Filter by muscle groups if specified
  let filteredMovements = movements;
  if (muscleGroups && muscleGroups.length > 0) {
    filteredMovements = movements.filter(movement => 
      muscleGroups.some(targetGroup =>
        movement.muscleGroups.some(mg => 
          mg.toLowerCase().includes(targetGroup.toLowerCase())
        )
      )
    );
  }

  let report = `# 💪 Available Movements\n\n`;
  
  if (muscleGroups && muscleGroups.length > 0) {
    report += `**Filtered by: ${muscleGroups.join(', ')}**\n`;
    report += `Found ${filteredMovements.length} movements (out of ${movements.length} total)\n\n`;
  } else {
    report += `**All movements** (${movements.length} total)\n\n`;
  }

  if (filteredMovements.length === 0) {
    const filterText = muscleGroups && muscleGroups.length > 0 ? ` for "${muscleGroups.join(', ')}"` : '';
    report += `No movements found${filterText}.\n`;
    report += `Try terms like: Chest, Back, Legs, Shoulders, Arms, Core\n`;
    return {
      content: [{ type: 'text' as const, text: report }],
    };
  }

  // Group movements by primary muscle group for better organization
  const groupedMovements = filteredMovements.reduce((acc, movement) => {
    const primaryMuscle = movement.muscleGroups[0] || 'Other';
    if (!acc[primaryMuscle]) {
      acc[primaryMuscle] = [];
    }
    acc[primaryMuscle].push(movement);
    return acc;
  }, {} as Record<string, typeof movements>);

  // Sort muscle groups and show movements
  Object.entries(groupedMovements)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([muscle, movementList]) => {
      report += `## ${muscle} (${movementList.length} movements)\n`;
      
      movementList
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 10) // Limit to 10 per group to avoid overwhelming output
        .forEach(movement => {
          report += `- **${movement.name}**`;
          if (movement.muscleGroups.length > 1) {
            const additionalMuscles = movement.muscleGroups.slice(1).join(', ');
            report += ` _(also: ${additionalMuscles})_`;
          }
          report += `\n`;
        });
      
      if (movementList.length > 10) {
        report += `  _(and ${movementList.length - 10} more...)_\n`;
      }
      report += `\n`;
    });

  return {
    content: [
      {
        type: 'text' as const,
        text: report,
      },
    ],
  };
}