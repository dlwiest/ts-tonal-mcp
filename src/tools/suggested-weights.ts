import TonalClient from '@dlwiest/ts-tonal-client';
import { MCPResponse } from '../types/index.js';
import { TonalMCPError, handleToolError } from '../utils/error-handler.js';
import { SUGGESTION_LOOKBACK_ACTIVITIES, describePrescription, findSuggestedWeights } from '../utils/pound-targets.js';

const MAX_MOVEMENTS = 20;

function validateMovementNames(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_MOVEMENTS ||
    value.some(name => typeof name !== 'string' || !name.trim())
  ) {
    throw new TonalMCPError(
      `movementNames must be an array of 1 to ${MAX_MOVEMENTS} non-empty movement names`,
      'VALIDATION_ERROR',
      400
    );
  }
  return value.map(name => (name as string).trim());
}

export async function getSuggestedWeights(
  client: TonalClient,
  args?: Record<string, unknown>
): Promise<MCPResponse> {
  try {
    const names = validateMovementNames(args?.movementNames);
    const catalog = new Map((await client.getMovements()).map(movement => [movement.name.toLowerCase(), movement]));
    const matched = names.map(name => ({ name, movement: catalog.get(name.toLowerCase()) }));
    const suggestions = await findSuggestedWeights(
      client,
      new Set(matched.flatMap(({ movement }) => (movement?.onMachine ? [movement.id] : [])))
    );

    let report = `# Tonal Suggested Weights\n\n`;
    report += `Each value is Tonal's last recorded suggested weight: an estimate of what 100% loads. A set's weight percentage is a share of Tonal's suggestion.\n\n`;
    for (const { name, movement } of matched) {
      if (movement === undefined) {
        report += `- **${name}**: not a Tonal movement name (use search_movements)\n`;
        continue;
      }
      if (!movement.onMachine) {
        report += `- **${movement.name}**: off-machine, no Tonal load\n`;
        continue;
      }
      const byPrescription = suggestions.get(movement.id);
      if (byPrescription === undefined || byPrescription.size === 0) {
        report += `- **${movement.name}**: no performed set with a Tonal suggested weight in your last ${SUGGESTION_LOOKBACK_ACTIVITIES} Tonal workouts\n`;
        continue;
      }
      // Reps before durations, each ascending.
      const entries = [...byPrescription].sort(([left], [right]) =>
        left[0] === right[0] ? Number(left.slice(1)) - Number(right.slice(1)) : left < right ? 1 : -1
      );
      report += `- **${movement.name}**:\n`;
      for (const [prescription, suggestion] of entries) {
        const pounds = Math.round(suggestion.pounds * 10) / 10;
        report += `  - at ${describePrescription(prescription)}: ${pounds} lb (1% ≈ ${(suggestion.pounds / 100).toFixed(2)} lb), from ${suggestion.performedAt}\n`;
      }
    }
    report += `\nTonal's suggestion depends on the prescribed reps (or duration), so use the one matching the set you're planning. Each comes from your most recent performed set at that prescription. Tonal may already have adjusted it since, and raises it as you progress, so treat the pounds as estimates.\n`;

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    return handleToolError(error, 'get_suggested_weights');
  }
}
