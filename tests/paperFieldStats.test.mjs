import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export { getPrimaryFieldGroups } from './src/utils/paperFieldStats';
      export { getMainPaperField } from './src/utils/paperFields';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { getPrimaryFieldGroups, getMainPaperField } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const settings = {
  defaultField: 'Locomotion',
  fields: [
    { name: 'Locomotion', aliases: ['Parkour', 'Legged Robot Locomotion'], backgroundColor: '#ffe3e3' },
    { name: 'Perception', aliases: ['Heightmap', 'LiDAR', 'State Estimation'], backgroundColor: '#e6fcf5' },
    { name: 'Learning Methods', aliases: ['PPO', 'Distillation'], backgroundColor: '#b2f2bb' },
  ],
};
const paper = (path, fields, field) => ({ path, metadata: { fields, field } });
const groupsFor = (papers, config = settings) =>
  getPrimaryFieldGroups(config, papers, item => item.metadata);
const counts = groups => groups.map(({ name, count }) => [name, count]);

test('method tags in other groups do not count a paper more than once', () => {
  const papers = [
    paper('robot.md', ['Locomotion', 'Heightmap', 'PPO', 'Distillation']),
    paper('map.md', ['Perception', 'LiDAR', 'PPO']),
    paper('ppo.md', ['Learning Methods', 'PPO']),
  ];
  const groups = groupsFor(papers);
  assert.deepEqual(counts(groups), [['Locomotion', 1], ['Perception', 1], ['Learning Methods', 1]]);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), papers.length);
  assert.deepEqual(groups[0].papers, [papers[0]]);
  assert.deepEqual(groups[1].papers, [papers[1]]);
  assert.deepEqual(groups[2].papers, [papers[2]]);
});

test('an explicit main field takes priority over a method appearing first', () => {
  assert.equal(getMainPaperField(settings, { fields: ['PPO', 'Heightmap', 'Locomotion'] }), 'Locomotion');
  assert.equal(getMainPaperField(settings, { fields: ['PPO'], field: 'Locomotion' }), 'Locomotion');
  const groups = groupsFor([paper('robot.md', ['PPO', 'Locomotion', 'Heightmap'])]);
  assert.deepEqual(counts(groups), [['Locomotion', 1]]);
});

test('multiple explicit main fields use the first in normalized metadata order', () => {
  const source = { fields: ['Perception', 'Locomotion', 'Learning Methods'], field: 'Locomotion' };
  assert.equal(getMainPaperField(settings, source), 'Perception');
  assert.deepEqual(counts(groupsFor([paper('map.md', source.fields, source.field)])), [['Perception', 1]]);
});

test('legacy aliases resolve to their parent when there is no explicit main field', () => {
  assert.equal(getMainPaperField(settings, { field: 'Legged Robot Locomotion' }), 'Locomotion');
  assert.equal(getMainPaperField(settings, { fields: ['Heightmap', 'PPO'] }), 'Perception');
  const groups = groupsFor([
    paper('old.md', undefined, 'Legged Robot Locomotion'),
    paper('heightmap.md', ['Heightmap', 'PPO']),
  ]);
  assert.deepEqual(counts(groups), [['Locomotion', 1], ['Perception', 1]]);
});

test('each path appears once in counts and in the group click-through papers', () => {
  const robot = paper('robot.md', ['Locomotion', 'PPO']);
  const map = paper('map.md', ['Perception', 'Heightmap']);
  const groups = groupsFor([robot, map, robot, { ...map }]);
  assert.deepEqual(counts(groups), [['Locomotion', 1], ['Perception', 1]]);
  const groupedPapers = groups.flatMap(group => {
    assert.equal(group.papers.length, group.count);
    return group.papers;
  });
  assert.equal(groupedPapers.length, 2);
  assert.equal(new Set(groupedPapers.map(item => item.path)).size, 2);
  assert.strictEqual(groups[0].papers[0], robot);
  assert.strictEqual(groups[1].papers[0], map);
});

test('unknown main fields remain visible after configured groups without losing papers', () => {
  const papers = [
    paper('unknown.md', ['My Topic', 'PPO']),
    paper('methods.md', ['Learning Methods']),
    paper('locomotion.md', ['Locomotion']),
    paper('unknown-2.md', ['My Topic']),
    paper('other.md', ['Other Topic']),
  ];
  const groups = groupsFor(papers);
  assert.deepEqual(counts(groups), [['Locomotion', 1], ['Learning Methods', 1], ['My Topic', 2], ['Other Topic', 1]]);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), papers.length);
  assert.deepEqual(groups.find(group => group.name === 'My Topic').papers, [papers[0], papers[3]]);
  for (const group of groups) assert.equal(group.papers.length, group.count);
});

test('missing classification uses the default, or Unsorted if no default exists', () => {
  const papers = [paper('empty.md', []), { path: 'no-metadata.md' }];
  assert.deepEqual(counts(groupsFor(papers)), [['Locomotion', 2]]);
  const noDefault = { ...settings, defaultField: '' };
  assert.deepEqual(counts(groupsFor(papers, noDefault)), [['Unsorted', 2]]);
});

test('configured ordering and background colors stay consistent with main field styles', () => {
  const papers = [paper('ppo.md', ['Learning Methods']), paper('map.md', ['Perception']), paper('robot.md', ['Locomotion'])];
  const before = JSON.stringify({ settings, papers });
  const groups = groupsFor(papers);
  assert.deepEqual(groups.map(group => group.name), settings.fields.map(field => field.name));
  assert.deepEqual(groups.map(group => group.color), settings.fields.map(field => field.backgroundColor));
  assert.equal(JSON.stringify({ settings, papers }), before);
});

test('an empty paper list produces no group and no phantom default count', () => {
  assert.deepEqual(groupsFor([]), []);
});
