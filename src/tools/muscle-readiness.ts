import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';

export async function getMuscleReadiness(client: TonalClient): Promise<MCPResponse> {
  const readiness = await client.getMuscleReadiness();
  
  // Group muscles by body region
  const upperBody = {
    Chest: readiness.Chest,
    Shoulders: readiness.Shoulders,
    Back: readiness.Back,
    Triceps: readiness.Triceps,
    Biceps: readiness.Biceps,
  };
  
  const core = {
    Abs: readiness.Abs,
    Obliques: readiness.Obliques,
  };
  
  const lowerBody = {
    Quads: readiness.Quads,
    Glutes: readiness.Glutes,
    Hamstrings: readiness.Hamstrings,
    Calves: readiness.Calves,
  };

  // Calculate averages
  const upperAvg = Math.round(Object.values(upperBody).reduce((a, b) => a + b, 0) / Object.values(upperBody).length);
  const coreAvg = Math.round(Object.values(core).reduce((a, b) => a + b, 0) / Object.values(core).length);
  const lowerAvg = Math.round(Object.values(lowerBody).reduce((a, b) => a + b, 0) / Object.values(lowerBody).length);
  const overallAvg = Math.round(Object.values(readiness).reduce((a, b) => a + b, 0) / Object.values(readiness).length);

  // Find muscles needing recovery
  const needsRecovery = Object.entries(readiness)
    .filter(([_, percentage]) => percentage < 60)
    .map(([muscle]) => muscle);

  let report = `# 🎯 Muscle Readiness Report\n\n`;
  report += `**Overall Readiness: ${overallAvg}%**\n\n`;
  
  report += `## Regional Breakdown\n`;
  report += `- **Upper Body**: ${upperAvg}% average\n`;
  report += `- **Core**: ${coreAvg}% average\n`;
  report += `- **Lower Body**: ${lowerAvg}% average\n\n`;

  report += `## Detailed Readiness\n`;
  report += `### Upper Body\n`;
  Object.entries(upperBody).forEach(([muscle, percentage]) => {
    const status = percentage >= 80 ? '🟢' : percentage >= 60 ? '🟡' : '🔴';
    report += `- ${muscle}: ${percentage}% ${status}\n`;
  });

  report += `\n### Core\n`;
  Object.entries(core).forEach(([muscle, percentage]) => {
    const status = percentage >= 80 ? '🟢' : percentage >= 60 ? '🟡' : '🔴';
    report += `- ${muscle}: ${percentage}% ${status}\n`;
  });

  report += `\n### Lower Body\n`;
  Object.entries(lowerBody).forEach(([muscle, percentage]) => {
    const status = percentage >= 80 ? '🟢' : percentage >= 60 ? '🟡' : '🔴';
    report += `- ${muscle}: ${percentage}% ${status}\n`;
  });

  if (needsRecovery.length > 0) {
    report += `\n## ⚠️ Recovery Needed\n`;
    report += `These muscle groups are below 60% readiness:\n`;
    needsRecovery.forEach(muscle => {
      const percentage = readiness[muscle as keyof typeof readiness];
      if (percentage !== undefined) {
        report += `- ${muscle}: ${percentage}%\n`;
      }
    });
    report += `\nConsider focusing on other muscle groups or taking a rest day.\n`;
  } else {
    report += `\n## ✅ All Systems Go!\n`;
    report += `All muscle groups are above 60% readiness. You're good for a full workout!\n`;
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: report,
      },
    ],
  };
}