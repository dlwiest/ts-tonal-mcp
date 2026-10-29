import assert from 'node:assert/strict';
import test from 'node:test';
import { toolsRegistry } from '../src/tools/registry.js';

test('both new tools are registered and annotated read-only', () => {
  for (const name of ['get_goal_metrics', 'estimate_workout_duration']) {
    const tool = toolsRegistry.get(name);
    assert.ok(tool, `${name} must be registered`);
    assert.equal(tool.annotations?.readOnlyHint, true, `${name} must be read-only`);
    assert.equal(tool.annotations?.destructiveHint, false, `${name} must be non-destructive`);
  }
});

test('get_goal_metrics takes an optional filter and nothing else', () => {
  const tool = toolsRegistry.get('get_goal_metrics');
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, []);
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ['filter']);
});

test('estimate_workout_duration requires exercises', () => {
  const tool = toolsRegistry.get('estimate_workout_duration');
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ['exercises']);
});

// The exercise schema was duplicated per tool before and the copies drifted apart. Assert
// shape equivalence rather than object identity: a reintroduced fork is caught either way,
// but deepEqual survives a benign refactor that clones or freezes the shared object.
test('create_workout, update_workout, and estimate_workout_duration accept the same exercise shape', () => {
  const names = ['create_workout', 'update_workout', 'estimate_workout_duration'];
  const schemas = names.map(name => {
    const tool = toolsRegistry.get(name);
    assert.ok(tool, `${name} must be registered`);
    return tool.inputSchema.properties.exercises.items;
  });

  const [first, ...rest] = schemas;
  for (const [index, schema] of rest.entries()) {
    assert.deepEqual(schema, first, `${names[index + 1]} must accept the same exercise shape`);
  }

  assert.deepEqual(first.required, ['movementName']);
  assert.deepEqual(Object.keys(first.properties).sort(), [
    'block',
    'duration',
    'isWarmup',
    'movementName',
    'reps',
    'setDetails',
    'sets',
    'weight',
    'weightLb',
  ]);
});

test('all exercise schemas accept boolean training modes', () => {
  for (const name of ['create_workout', 'update_workout', 'estimate_workout_duration']) {
    const tool = toolsRegistry.get(name);
    assert.ok(tool);
    const properties = tool.inputSchema.properties.exercises.items.properties.setDetails.items.properties;
    for (const mode of ['spotter', 'eccentric', 'chains', 'flex', 'burnout']) {
      assert.equal(properties[mode]?.type, 'boolean', `${name} must accept ${mode}`);
    }
  }
});
