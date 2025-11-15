import TonalClient from '@dlwiest/ts-tonal-client';
import { validateStringArray } from '../utils/validation.js';
import { MCPResponse } from '../types/index.js';

interface MovementFilters {
  muscleGroups?: string[];
  equipment?: string[];      // Maps to offMachineAccessory
  armAngle?: string[];
  bodyRegion?: string[];
  pushPull?: string[];
  family?: string[];
  onMachine?: boolean;
  inFreeLift?: boolean;
  skillLevel?: number[];
  isBilateral?: boolean;
  isAlternating?: boolean;
  isTwoSided?: boolean;
}

export async function searchMovements(client: TonalClient, args?: MovementFilters): Promise<MCPResponse> {
  const movements = await client.getMovements();

  let filteredMovements = movements;
  const appliedFilters: string[] = [];

  // Apply muscle group filter
  if (args?.muscleGroups && args.muscleGroups.length > 0) {
    const muscleGroups = validateStringArray(args.muscleGroups, 'muscleGroups');
    filteredMovements = filteredMovements.filter(movement =>
      muscleGroups.some(targetGroup =>
        movement.muscleGroups.some(mg =>
          mg.toLowerCase().includes(targetGroup.toLowerCase())
        )
      )
    );
    appliedFilters.push(`Muscle Groups: ${muscleGroups.join(', ')}`);
  }

  // Apply equipment filter (checks both offMachineAccessory and onMachineInfo.accessory)
  if (args?.equipment && args.equipment.length > 0) {
    const equipment = validateStringArray(args.equipment, 'equipment');
    filteredMovements = filteredMovements.filter(movement => {
      const offMachineAcc = movement.offMachineAccessory?.toLowerCase() || '';
      const onMachineAcc = (movement as any).onMachineInfo?.accessory?.toLowerCase() || '';
      return equipment.some(eq => {
        const eqLower = eq.toLowerCase();
        return offMachineAcc.includes(eqLower) || onMachineAcc.includes(eqLower);
      });
    });
    appliedFilters.push(`Equipment: ${equipment.join(', ')}`);
  }

  // Apply arm angle filter
  if (args?.armAngle && args.armAngle.length > 0) {
    const armAngles = validateStringArray(args.armAngle, 'armAngle');
    filteredMovements = filteredMovements.filter(movement => {
      const armAngleValue = (movement as any).onMachineInfo?.armAngle;
      if (!armAngleValue) return false;
      return armAngles.some(angle =>
        armAngleValue.toLowerCase().includes(angle.toLowerCase())
      );
    });
    appliedFilters.push(`Arm Angle: ${armAngles.join(', ')}`);
  }

  // Apply body region filter
  if (args?.bodyRegion && args.bodyRegion.length > 0) {
    const bodyRegions = validateStringArray(args.bodyRegion, 'bodyRegion');
    filteredMovements = filteredMovements.filter(movement => {
      if (!movement.bodyRegion) return false;
      return bodyRegions.some(region =>
        movement.bodyRegion.toLowerCase().includes(region.toLowerCase())
      );
    });
    appliedFilters.push(`Body Region: ${bodyRegions.join(', ')}`);
  }

  // Apply push/pull filter
  if (args?.pushPull && args.pushPull.length > 0) {
    const pushPulls = validateStringArray(args.pushPull, 'pushPull');
    filteredMovements = filteredMovements.filter(movement => {
      if (!movement.pushPull) return false;
      return pushPulls.some(pp =>
        movement.pushPull.toLowerCase().includes(pp.toLowerCase())
      );
    });
    appliedFilters.push(`Push/Pull: ${pushPulls.join(', ')}`);
  }

  // Apply family filter
  if (args?.family && args.family.length > 0) {
    const families = validateStringArray(args.family, 'family');
    filteredMovements = filteredMovements.filter(movement => {
      if (!movement.family && !movement.familyDisplay) return false;
      return families.some(fam => {
        const famLower = fam.toLowerCase();
        const familyMatch = movement.family?.toLowerCase().includes(famLower);
        const displayMatch = movement.familyDisplay?.toLowerCase().includes(famLower);
        return familyMatch || displayMatch;
      });
    });
    appliedFilters.push(`Family: ${families.join(', ')}`);
  }

  // Apply onMachine filter
  if (args?.onMachine !== undefined) {
    filteredMovements = filteredMovements.filter(movement =>
      movement.onMachine === args.onMachine
    );
    appliedFilters.push(`On Machine: ${args.onMachine ? 'Yes' : 'No'}`);
  }

  // Apply inFreeLift filter
  if (args?.inFreeLift !== undefined) {
    filteredMovements = filteredMovements.filter(movement =>
      movement.inFreeLift === args.inFreeLift
    );
    appliedFilters.push(`In Free Lift: ${args.inFreeLift ? 'Yes' : 'No'}`);
  }

  // Apply skill level filter
  if (args?.skillLevel && args.skillLevel.length > 0) {
    filteredMovements = filteredMovements.filter(movement =>
      args.skillLevel!.includes(movement.skillLevel)
    );
    appliedFilters.push(`Skill Level: ${args.skillLevel.join(', ')}`);
  }

  // Apply isBilateral filter
  if (args?.isBilateral !== undefined) {
    filteredMovements = filteredMovements.filter(movement =>
      movement.isBilateral === args.isBilateral
    );
    appliedFilters.push(`Bilateral: ${args.isBilateral ? 'Yes' : 'No'}`);
  }

  // Apply isAlternating filter
  if (args?.isAlternating !== undefined) {
    filteredMovements = filteredMovements.filter(movement =>
      movement.isAlternating === args.isAlternating
    );
    appliedFilters.push(`Alternating: ${args.isAlternating ? 'Yes' : 'No'}`);
  }

  // Apply isTwoSided filter
  if (args?.isTwoSided !== undefined) {
    filteredMovements = filteredMovements.filter(movement =>
      movement.isTwoSided === args.isTwoSided
    );
    appliedFilters.push(`Two-Sided: ${args.isTwoSided ? 'Yes' : 'No'}`);
  }

  // Build report
  let report = `# 🔍 Movement Search Results\n\n`;

  if (appliedFilters.length > 0) {
    report += `**Found ${filteredMovements.length} movements** (out of ${movements.length} total)\n\n`;
  } else {
    report += `**Showing all ${movements.length} movements**\n\n`;
  }

  if (filteredMovements.length === 0) {
    report += `No movements found matching your criteria.\n\n`;
    report += `**Try adjusting your filters. Common values:**\n`;
    report += `- Muscle Groups: Chest, Back, Legs, Shoulders, Arms, Core\n`;
    report += `- Equipment: Bench, Mat, Roller, Handles, Rope, StraightBar, AnkleStraps\n`;
    report += `- Arm Angle: High, Middle, Low\n`;
    report += `- Body Region: UpperBody, LowerBody, Core\n`;
    report += `- Push/Pull: Push, Pull, N/A\n`;
    report += `- Family: Row, Squat, BenchPress, ChestPress, OverheadPress, Lunge, Plank, etc.\n`;
    report += `- Skill Level: 0, 1, 2, 3\n`;
    return {
      content: [{ type: 'text' as const, text: report }],
    };
  }

  // Group movements by primary muscle group
  const groupedMovements = filteredMovements.reduce((acc, movement) => {
    const primaryMuscle = movement.muscleGroups[0] || 'Other';
    if (!acc[primaryMuscle]) {
      acc[primaryMuscle] = [];
    }
    acc[primaryMuscle].push(movement);
    return acc;
  }, {} as Record<string, typeof movements>);

  // Sort and display movements
  Object.entries(groupedMovements)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([muscle, movementList]) => {
      report += `## ${muscle} (${movementList.length} movements)\n`;

      movementList
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 15) // Show more results since they're filtered
        .forEach(movement => {
          report += `- **${movement.name}**`;

          // Add relevant metadata
          const metadata: string[] = [];
          // Show off-machine equipment
          if (movement.offMachineAccessory && movement.offMachineAccessory !== 'None') {
            metadata.push(`Equipment: ${movement.offMachineAccessory}`);
          }
          // Show on-machine accessory
          const onMachineAccessory = (movement as any).onMachineInfo?.accessory;
          if (onMachineAccessory && !movement.offMachineAccessory) {
            metadata.push(`Accessory: ${onMachineAccessory}`);
          }
          const armAngleValue = (movement as any).onMachineInfo?.armAngle;
          if (armAngleValue) {
            metadata.push(`Arm Angle: ${armAngleValue}`);
          }
          if (movement.onMachine) metadata.push('On-Machine');
          if (movement.inFreeLift) metadata.push('Free-Lift');
          if (movement.pushPull) metadata.push(movement.pushPull);
          if (movement.isBilateral) metadata.push('Bilateral');
          if (movement.isAlternating) metadata.push('Alternating');
          if (movement.skillLevel) metadata.push(`Level ${movement.skillLevel}`);

          if (metadata.length > 0) {
            report += ` _(${metadata.join(', ')})_`;
          }

          if (movement.muscleGroups.length > 1) {
            const additionalMuscles = movement.muscleGroups.slice(1).join(', ');
            report += ` - Also: ${additionalMuscles}`;
          }
          report += `\n`;
        });

      if (movementList.length > 15) {
        report += `  _(and ${movementList.length - 15} more...)_\n`;
      }
      report += `\n`;
    });

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

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