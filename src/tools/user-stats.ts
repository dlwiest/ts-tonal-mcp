import TonalClient, { TonalActivitySummary } from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';

export async function getUserStats(client: TonalClient): Promise<MCPResponse> {
  const [userInfo, stats, streak] = await Promise.all([
    client.getUserInfo(),
    client.getUserStatistics(),
    client.getCurrentStreak(),
  ]);

  let report = `# 📊 Your Fitness Stats\n\n`;

  report += `## Profile\n`;
  report += `**${userInfo.firstName} ${userInfo.lastName}** - Level ${userInfo.level}\n`;
  if (userInfo.location) {
    report += `📍 ${userInfo.location}\n`;
  }
  report += `\n`;

  report += `## Lifetime Stats\n`;
  report += `- **Total Workouts**: ${stats.workouts.total.toLocaleString()}\n`;
  report += `- **Total Volume**: ${stats.volume.total.toLocaleString()} lbs\n`;
  report += `- **Total Time**: ${Math.round(stats.workouts.totalDuration / 3600)} hours\n`;
  report += `- **Average per Workout**: ${stats.volume.avgVolumePerWorkout.toLocaleString()} lbs\n`;
  report += `- **Unique Movements**: ${stats.movements.total}\n`;
  report += `\n`;

  report += `## Current Streak 🔥\n`;
  report += `- **Current**: ${streak.currentStreak} workout${streak.currentStreak !== 1 ? 's' : ''}\n`;
  report += `- **Personal Best**: ${streak.maxStreak} workout${streak.maxStreak !== 1 ? 's' : ''}\n`;

  if (streak.currentStreak > 0) {
    const progress = Math.round((streak.currentStreak / streak.maxStreak) * 100);
    report += `- **Progress to PB**: ${progress}%\n`;
  }

  report += `\n`;

  // Add motivational messaging based on streak
  if (streak.currentStreak === 0) {
    report += `💡 **Ready to start a new streak? Every journey begins with a single workout!**\n`;
  } else if (streak.currentStreak >= streak.maxStreak) {
    report += `🎉 **New personal best! You're crushing it!**\n`;
  } else if (streak.currentStreak >= 5) {
    report += `🚀 **Great momentum! Keep it going!**\n`;
  } else {
    report += `💪 **Building momentum! You're on your way!**\n`;
  }

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}

export async function getRecentProgress(client: TonalClient): Promise<MCPResponse> {
  const [dailyMetrics, activities] = await Promise.all([
    client.getDailyMetrics(30), // Last 30 days
    client.getActivitySummaries().then(all => all.slice(0, 10)), // Recent 10 activities
  ]);

  let report = `# 📈 Recent Progress (30 days)\n\n`;

  // Analyze daily metrics
  const activeDays = dailyMetrics.filter(day => day.totalWorkouts > 0);
  const workoutFrequency = (activeDays.length / dailyMetrics.length) * 100;
  const totalVolume = activeDays.reduce((sum, day) => sum + day.totalVolume, 0);
  const avgDuration = activeDays.length > 0
    ? activeDays.reduce((sum, day) => sum + day.totalDuration, 0) / activeDays.length / 60
    : 0;

  report += `## Monthly Overview\n`;
  report += `- **Workout Days**: ${activeDays.length} out of 30 (${workoutFrequency.toFixed(1)}%)\n`;
  report += `- **Total Volume**: ${totalVolume.toLocaleString()} lbs\n`;
  report += `- **Average Workout**: ${Math.round(avgDuration)} minutes\n`;
  report += `\n`;

  // Workout consistency analysis
  if (workoutFrequency >= 80) {
    report += `🔥 **Exceptional consistency! You're a fitness machine!**\n`;
  } else if (workoutFrequency >= 60) {
    report += `💪 **Great consistency! Keep up the strong routine!**\n`;
  } else if (workoutFrequency >= 40) {
    report += `📈 **Good progress! Consider adding more workout days for better results.**\n`;
  } else if (workoutFrequency >= 20) {
    report += `🌱 **Building a habit! Try to be more consistent for better momentum.**\n`;
  } else {
    report += `💡 **Ready to get started? Consistency is key to seeing results!**\n`;
  }

  report += `\n## Recent Activity\n`;

  if (activities.length === 0) {
    report += `No recent activities found.\n`;
  } else {
    activities.slice(0, 5).forEach((activity, index) => {
      const daysAgo = Math.floor((Date.now() - new Date(activity.timestamp).getTime()) / (1000 * 60 * 60 * 24));
      const timeAgo = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;

      report += `${index + 1}. **${activity.name}** (${timeAgo})\n`;
      report += `   - ${activity.totalVolume.toLocaleString()} lbs | ${Math.round(activity.duration / 60)} min\n`;
    });
  }

  return {
    content: [{ type: 'text' as const, text: report }],
  };
}