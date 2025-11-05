import TonalClient from '@dlwiest/ts-tonal-client';
import { validateOptionalLimit } from '../utils/validation.js';
import { MCPResponse } from '../types/index.js';

export async function getRecentWorkouts(client: TonalClient, args?: { limit?: number }): Promise<MCPResponse> {
  const limit = validateOptionalLimit(args?.limit);
  // Use activity summaries for completed workout data
  const activities = await client.getActivitySummaries();
  const recentActivities = activities.slice(0, limit);
  
  let report = `# 🏋️ Recent Workouts\n\n`;

  if (recentActivities.length === 0) {
    report += `No recent workouts found. Time to get moving! 💪\n`;
    return {
      content: [{ type: 'text' as const, text: report }],
    };
  }

  // Show summary stats
  const totalVolume = recentActivities.reduce((sum, w) => sum + w.totalVolume, 0);
  const totalTime = recentActivities.reduce((sum, w) => sum + w.duration, 0);
  const avgDuration = totalTime / recentActivities.length / 60;

  report += `**Summary (last ${recentActivities.length} workouts):**\n`;
  report += `- Total Volume: ${totalVolume.toLocaleString()} lbs\n`;
  report += `- Total Time: ${Math.round(totalTime / 60)} minutes\n`;
  report += `- Average Duration: ${Math.round(avgDuration)} minutes\n\n`;

  report += `## Workout History\n\n`;

  recentActivities.forEach((activity, index) => {
    const date = new Date(activity.timestamp);
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    const timeAgo = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
    
    const duration = Math.round(activity.duration / 60);
    const volume = activity.totalVolume.toLocaleString();
    
    report += `**${activity.name}** (${timeAgo})\n`;
    report += `- Duration: ${duration} min | Volume: ${volume} lbs | Reps: ${activity.totalReps}\n`;
    report += `- Target: ${activity.targetArea} | Type: ${activity.isGuidedWorkout ? 'Guided' : 'Free Lift'}\n`;
    
    if (activity.isInProgram) {
      report += `- Part of Program\n`;
    }
    
    report += `\n`;
  });

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

