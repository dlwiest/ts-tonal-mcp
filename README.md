# Tonal MCP Server

A Model Context Protocol (MCP) server that provides LLMs with access to Tonal fitness data. Built on top of [`@dlwiest/ts-tonal-client`](https://github.com/dlwiest/ts-tonal-client), this server enables AI assistants to answer questions about your workouts, fitness progress, and muscle readiness.

## Features

- 🏋️ **Workout History** - Access recent workout data and performance metrics
- 💪 **Muscle Readiness** - Get recovery status for workout planning
- 📊 **Fitness Statistics** - View lifetime stats, streaks, and progress trends
- 🎯 **Movement Database** - Browse and filter available Tonal exercises
- ✨ **Workout Creation and Editing** - Build and update custom workouts with per-set programming and supersets
- 🔧 **Extensible Architecture** - Easy to add new tools via registry pattern

## Installation

Clone and build from source:

```bash
git clone https://github.com/dlwiest/ts-tonal-mcp.git
cd ts-tonal-mcp
npm install
npm run build
```

## Configuration

The server requires your Tonal credentials as environment variables:

```bash
export TONAL_USERNAME="your_email@example.com"
export TONAL_PASSWORD="your_password"
```

Or create a `.env` file:
```env
TONAL_USERNAME=your_email@example.com
TONAL_PASSWORD=your_password
```

## Usage

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tonal": {
      "command": "node",
      "args": ["/path/to/ts-tonal-mcp/dist/index.js"],
      "env": {
        "TONAL_USERNAME": "your_email@example.com",
        "TONAL_PASSWORD": "your_password"
      }
    }
  }
}
```

### Claude Code

Add the server to Claude Code using the CLI:

```bash
claude mcp add tonal-mcp node /path/to/ts-tonal-mcp/dist/index.js -e TONAL_USERNAME=your_email -e TONAL_PASSWORD=your_password
```

### Hermes Agent

Put `TONAL_USERNAME` and `TONAL_PASSWORD` in `~/.hermes/.env`, then register the server under `mcp_servers.tonal` in `~/.hermes/config.yaml`. Values in `tools.include` are raw tool names such as `get_muscle_readiness`, never registry names such as `mcp__tonal__get_muscle_readiness`. Reload the Hermes gateway/MCP connection before expecting new tools in Telegram sessions.

See [`hermes-tonal`](https://github.com/dlwiest/hermes-tonal) for the complete read-only and full-access configurations and companion skill.

### Direct Usage

```bash
# Run the server directly (stdio mode)
npm start

# Or run the built JavaScript directly
node dist/index.js
```

## Available Tools

The server provides 18 tools for LLM interactions:

| Tool | Description |
|------|-------------|
| `get_muscle_readiness` | Get current muscle readiness percentages for recovery planning |
| `get_movements` | Browse Tonal movements/exercises, optionally filtered by muscle groups |
| `search_movements` | Advanced search with 11+ filters (muscle groups, equipment, arm angle, skill level, etc.) |
| `get_recent_workouts` | View recent workout history with summary statistics |
| `get_user_stats` | Get comprehensive fitness statistics and current streak |
| `get_recent_progress` | Analyze recent progress including workout frequency and trends |
| `get_goal_metrics` | Get weekly goal metrics (Volume, Work, Movement Quality Score, Strength Sets, Power Reps, Endurance Sets, Functional Strength Score) with the current week's actual, target, and range plus a recent trend; optional name `filter` |
| `get_strength_scores` | Get Tonal's headline current Strength Score by body region and a compact per-activity trend; optional `days` is a calendar-day lookback, not a row count |
| `list_workout_activities` | List one page of workout activities using the oldest-first API `offset` (default 0) and `limit` from 1 to 100 (default 20) |
| `get_workout_activity_details` | Get one completed activity with performed sets, movement names, weights, reps, one-rep max, volume, range of motion, prescriptions, set modifiers, reps in reserve, personal records, and set timing |
| `get_workout_summary` | Get one formatted workout summary with session metadata and a per-movement breakdown |
| `list_custom_workouts` | List all your custom workouts created on Tonal |
| `create_workout` | Create a new custom workout with exercises, sets, reps/duration, and block grouping |
| `delete_custom_workout` | Delete a custom workout by name; requires `confirm: true` |
| `get_custom_workout_details` | Get detailed information about a custom workout including all sets |
| `get_workout_for_editing` | Get the complete editable structure of an existing workout |
| `update_workout` | Update an existing workout by replacing its full set list |
| `estimate_workout_duration` | Estimate how long a prescribed workout would take, without creating or modifying anything |

### Per-set programming

`create_workout`, `update_workout`, and `estimate_workout_duration` accept `setDetails` when sets differ. Each entry may contain `reps`, `duration`, `weight`, `warmUp`, `dropSet`, `burnout`, and `description`. When present, `setDetails` is authoritative and its length is the set count. Without it, the existing `sets`, `reps`, `duration`, and `weight` fields still create uniform sets. An exercise-level `weight` acts as the fallback for any set that omits its own.

```json
{
  "title": "Bench Progression",
  "exercises": [
    {
      "movementName": "Bench Press",
      "setDetails": [
        { "reps": 10, "weight": 40, "warmUp": true },
        { "reps": 8, "weight": 55 },
        { "reps": 6, "weight": 65, "dropSet": true }
      ]
    }
  ]
}
```

Deletion also requires an explicit opt-in. Pass the exact workout name and `"confirm": true` to `delete_custom_workout`; requests without confirmation do not delete anything.

## Example Conversations

With the MCP server connected, you can ask Claude:

**Fitness Insights:**
- *"Should I work out today?"* → Gets muscle readiness data
- *"What did I do this week?"* → Shows recent workout history
- *"How's my progress lately?"* → Analyzes recent metrics and trends
- *"Am I staying consistent with my workouts?"* → Reviews frequency and streaks

**Exercise Discovery:**
- *"What chest exercises are available?"* → Filters movements by muscle group
- *"Show me beginner-friendly leg exercises"* → Searches with skill level filter
- *"Find exercises that use the bench"* → Filters by equipment

**Workout Management:**
- *"Show me my custom workouts"* → Lists all your created workouts
- *"Create a push/pull workout with warmup and cooldown"* → Builds a structured workout
- *"Show me details for 'Upper Body Blast'"* → View full workout structure with all sets
- *"Edit 'Upper Body Blast' and make its last set a drop set"* → Fetches the editable structure, then replaces the workout's full set list
- *"Delete my workout called 'Old Routine'"* → Removes a specific custom workout

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Type checking
npm run typecheck

# Development mode (watch)
npm run dev
```

### Adding New Tools

Thanks to the registry pattern, adding new tools is straightforward:

1. Create your tool function in the appropriate file (e.g., `src/tools/analytics.ts`)
2. Add the tool definition to `src/tools/registry.ts`
3. The server automatically discovers and registers new tools

## Protocol

This server uses the Model Context Protocol (MCP) over stdio for communication. It's compatible with:

- ✅ Claude Desktop
- ✅ Claude Code
- ✅ Other MCP-compatible LLM tools

## Security

- Credentials are handled securely via environment variables
- Movement metadata is cached locally for up to 24 hours; credentials are not stored or logged
- All communication with Tonal's API uses the official client library

## Dependencies

- [`@dlwiest/ts-tonal-client`](https://github.com/dlwiest/ts-tonal-client) - Tonal API client
- [`@modelcontextprotocol/sdk`](https://modelcontextprotocol.io/) - MCP SDK

## License

ISC

## Contributing

Contributions welcome! This server is designed to be easily extensible. Please feel free to:

- Add new tools for additional Tonal data
- Improve error handling and validation
- Enhance documentation and examples

### Adding a tool

A tool name lives in six places and **nothing in the build validates any of them.**
`src/tools/registry.ts` is the only source of truth; the rest are hand-maintained and drift
silently. They split into two layers that fail differently:

*Can the tool be called at all?*

1. `src/tools/registry.ts` — the definition.
2. `hermes-tonal/config/mcp_servers.tonal.yaml` — read-only profile allowlist (raw names, no
   `mcp__tonal__` prefix). Read-only tools only.
3. `hermes-tonal/config/mcp_servers.tonal.full.yaml` — full profile allowlist, every tool.

Miss these and Hermes never exposes the tool, however good the server is.

*Does the agent know when and how to use it?*

4. This README's tool table, plus any stated tool count.
5. `hermes-tonal/skills/health/tonal/SKILL.md` — the `mcp__tonal__*` inventory, the read-only
   count, **and** the relevant `## Read workflows` entry. Inventory membership alone is not
   enough.
6. `hermes-tonal/skills/health/tonal/references/*.md` — the runbook that actually drives
   behavior. A "when to use" line pointing at a workflow no runbook describes is worse than
   silence, because it implies a procedure that does not exist.

Verify mechanically rather than by eye: load the built `dist/tools/registry.js` and check each
inventory in both directions — nothing missing, and no name that is not registered. When
checking `SKILL.md` for guidance coverage, strip the bare inventory list first so roster
membership does not count as coverage.

Note also that `npm run typecheck` covers `tests/` via `tsconfig.test.json`, while `npm test`
does not typecheck at all — `tsx` strips types without checking them. A test fixture that
omits an optional field is only a type-honesty guard if `npm run typecheck` runs.

## Contact

For questions or support, please contact [Derrick Wiest](mailto:me@dlwiest.com).