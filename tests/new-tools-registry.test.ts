import assert from 'node:assert/strict';
import test from 'node:test';
import { toolsRegistry } from '../src/tools/registry.js';

test('get_strength_score is renamed to get_strength_goal_progress (naming collision fix)', () => {
  assert.equal(
    toolsRegistry.get('get_strength_score'),
    undefined,
    'the old, misleading name must no longer be registered'
  );

  const tool = toolsRegistry.get('get_strength_goal_progress');
  assert.ok(tool, 'get_strength_goal_progress must be registered');
  assert.equal(tool!.annotations?.readOnlyHint, true);
  assert.equal(tool!.annotations?.destructiveHint, false);
  assert.ok('user' in tool!.inputSchema.properties);
  assert.deepEqual(tool!.inputSchema.required, []);
  assert.match(tool!.description, /NOT the app's headline/i);
  assert.match(tool!.description, /get_current_strength_scores/);
});

test('get_current_strength_scores is registered as read-only and accepts user', () => {
  const tool = toolsRegistry.get('get_current_strength_scores');
  assert.ok(tool, 'get_current_strength_scores must be registered');
  assert.equal(tool!.annotations?.readOnlyHint, true);
  assert.equal(tool!.annotations?.destructiveHint, false);
  assert.ok('user' in tool!.inputSchema.properties);
  assert.deepEqual(tool!.inputSchema.required, []);
});

test('get_strength_score_history is registered read-only, accepts user and optional days', () => {
  const tool = toolsRegistry.get('get_strength_score_history');
  assert.ok(tool, 'get_strength_score_history must be registered');
  assert.equal(tool!.annotations?.readOnlyHint, true);
  assert.equal(tool!.annotations?.destructiveHint, false);
  assert.ok('user' in tool!.inputSchema.properties);
  assert.ok('days' in tool!.inputSchema.properties);
  assert.deepEqual(tool!.inputSchema.required, []);
  assert.match(tool!.description, /calendar-day lookback/i);
});

test('get_tonal_achievements is registered as read-only and accepts user', () => {
  const tool = toolsRegistry.get('get_tonal_achievements');
  assert.ok(tool, 'get_tonal_achievements must be registered');
  assert.equal(tool!.annotations?.readOnlyHint, true);
  assert.equal(tool!.annotations?.destructiveHint, false);
  assert.ok('user' in tool!.inputSchema.properties);
  assert.deepEqual(tool!.inputSchema.required, []);
});

test('estimate_workout_duration is registered as read-only and mirrors create_workout exercise shape', () => {
  const estimateTool = toolsRegistry.get('estimate_workout_duration');
  const createTool = toolsRegistry.get('create_workout');
  assert.ok(estimateTool, 'estimate_workout_duration must be registered');
  assert.ok(createTool, 'create_workout must be registered (needed for shape comparison)');

  assert.equal(estimateTool!.annotations?.readOnlyHint, true);
  assert.equal(estimateTool!.annotations?.destructiveHint, false);
  assert.deepEqual(estimateTool!.inputSchema.required, ['exercises']);
  assert.ok('user' in estimateTool!.inputSchema.properties);

  const estimateExerciseProps = estimateTool!.inputSchema.properties.exercises.items.properties;
  const createExerciseProps = createTool!.inputSchema.properties.exercises.items.properties;

  assert.deepEqual(Object.keys(estimateExerciseProps).sort(), Object.keys(createExerciseProps).sort());
  assert.deepEqual(
    estimateTool!.inputSchema.properties.exercises.items.required,
    createTool!.inputSchema.properties.exercises.items.required
  );
});
