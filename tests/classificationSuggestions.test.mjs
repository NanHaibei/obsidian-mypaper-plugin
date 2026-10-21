import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/classification/suggestions.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm',
});
const { createSuggestedTaxonomy, suggestPaperClassification } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const taxonomy = createSuggestedTaxonomy([]);
const suggest = (title, fields = [], content = '', schema = taxonomy) =>
  suggestPaperClassification({ path: 'papers/example.md', title, fields, content }, schema);

test('robot tasks keep priority over Attention, PPO, and GAN methods', () => {
  for (const title of ['Locomotion with Self Attention and PPO', 'GAN for Robust Quadruped Locomotion']) {
    const result = suggest(title);
    assert.equal(result.fields[0], 'Locomotion');
    assert.equal(result.confidence, 'high');
  }
  const result = suggest('Locomotion with Self Attention and PPO');
  assert.ok(result.fields.includes('Self Attention'));
  assert.ok(result.fields.includes('PPO'));
  assert.ok(suggest('GAN for Robust Quadruped Locomotion').fields.includes('GAN'));
});

test('foundational attention and reinforcement-learning papers use the methods group', () => {
  assert.equal(suggest('Attention Is All You Need').fields[0], 'Learning Methods');
  const ppo = suggest('Proximal Policy Optimization Algorithms');
  assert.equal(ppo.fields[0], 'Learning Methods');
  assert.ok(ppo.fields.includes('PPO'));
  assert.ok(!ppo.fields.includes('GAE'));
});

test('an unknown title leaves every current label unchanged and requests review', () => {
  const current = ['Unsorted', 'My custom method', 'GAN'];
  const result = suggest('HoloMotion-1 Technical Report', current);
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.fields, current);
});

test('suggestions replace old broad categories while retaining methods and custom tags', () => {
  const current = ['Algorithm', 'PPO', 'My additional tag', 'Teacher-Student'];
  const result = suggest('Parkour for Legged Robots', current);
  assert.equal(result.fields[0], 'Locomotion');
  for (const name of current.slice(1)) assert.ok(result.fields.includes(name), name);
  assert.ok(!result.fields.includes('Algorithm'));
  assert.ok(result.fields.includes('Distillation'));
  assert.equal(result.confidence, 'medium');
  assert.match(result.reason, /沿用原分类/);
});

test('old broad categories are not carried into a task suggestion as method tags', () => {
  const broad = ['Legged Robot Locomotion', 'Perception-driven control', 'Algorithm', 'Attention',
    'Mimic', 'Whole-body Tracking', 'Computer Vision', 'Robotic Infra', 'Loco-Manipulation'];
  const schema = createSuggestedTaxonomy(broad.map(name => ({ ...taxonomy[0], name, aliases: [] })));
  const result = suggest('Robust Quadruped Locomotion with PPO', [...broad, 'Custom Method', 'GAN'], '', schema);
  assert.equal(result.fields[0], 'Locomotion');
  for (const name of broad) assert.ok(!result.fields.includes(name), name);
  for (const name of ['PPO', 'GAN', 'Custom Method', 'Motion Tracking', 'Motion Imitation', 'Mobile Manipulation']) {
    assert.ok(result.fields.includes(name), name);
  }
  const names = schema.flatMap(field => [field.name, ...field.aliases]);
  for (const name of broad) assert.ok(names.includes(name), name);
});

test('Attention is kept as a method only with text evidence after replacing its old group', () => {
  assert.ok(!suggest('Robot Parkour Learning', ['Attention']).fields.includes('Attention'));
  assert.ok(suggest('Locomotion with Attention', ['Attention']).fields.includes('Attention'));
  assert.deepEqual(suggest('An Unknown Report', ['Attention']).fields, ['Attention']);
});

test('a specific canonical child is retained even if it also appears among group synonyms', () => {
  const result = suggest('Whole-body Motion Tracking with PPO', ['Manipulation', 'Mobile Manipulation']);
  assert.equal(result.fields[0], 'Whole-body Motion');
  assert.ok(!result.fields.includes('Manipulation'));
  assert.ok(result.fields.includes('Mobile Manipulation'));
});

test('no method is inferred merely from a robot task', () => {
  const result = suggest('Robust Quadruped Locomotion');
  assert.equal(result.fields[0], 'Locomotion');
  assert.ok(!result.fields.includes('PPO'));
  assert.ok(!result.fields.includes('Distillation'));
  assert.equal(result.confidence, 'medium');
  assert.match(result.reason, /方法信息不足/);
});

test('abstract evidence is read without considering notes or references', () => {
  const notes = '# HoloMotion-1\n\n## 阅读笔记\nWhole-body motion tracking with PPO\n\n## References\nSelf Attention and GAN';
  assert.equal(suggest('Technical Report', ['Unsorted'], notes).confidence, 'low');
  const abstract = '# Technical Report\n\n## Abstract\nWhole-body motion tracking uses AMP and Dynamic Retargeting.\n\n## References\nPPO';
  const result = suggest('Technical Report', [], abstract);
  assert.equal(result.fields[0], 'Whole-body Motion');
  assert.ok(result.fields.includes('AMP'));
  assert.ok(result.fields.includes('Dynamic Retarget'));
  assert.ok(!result.fields.includes('PPO'));
  assert.equal(result.confidence, 'medium');
});

test('metadata abstract and translated abstract headings provide bounded evidence', () => {
  const result = suggest('Technical Report', [], '---\nabstract: |\n  Elevation mapping from a depth camera.\n---\n## Notes\nGAN');
  assert.equal(result.fields[0], 'Perception');
  assert.ok(result.fields.includes('Heightmap'));
  assert.ok(result.fields.includes('Depth'));
  assert.ok(!result.fields.includes('GAN'));
});

test('a title task outranks background tasks mentioned only in its abstract', () => {
  const result = suggest('PPO for Quadruped Locomotion', [], '## Abstract\nState estimation and mapping provide observations.\n');
  assert.equal(result.fields[0], 'Locomotion');
  assert.ok(result.fields.includes('PPO'));
});

test('only configured labels are added, including when a parent is renamed', () => {
  const renamed = [{ ...taxonomy[0], name: 'My Robot Topic', aliases: ['Parkour'] }];
  const result = suggest('Parkour for Quadruped Robots with PPO', [], '', renamed);
  assert.deepEqual(result.fields, ['My Robot Topic', 'Parkour']);
  assert.deepEqual(suggest('Attention Is All You Need', ['Keep me'], '', renamed).fields, ['Keep me']);
  assert.deepEqual(suggest('Quadruped Locomotion', [], '', []).fields, []);
});

test('all old names survive migration exactly once and unknown groups retain their style', () => {
  const current = [
    { ...taxonomy[0], name: 'Legged Robot Locomotion', aliases: ['Standing-up', 'GAN', 'State Estimation', 'Private tag'] },
    { ...taxonomy[0], name: 'Perception-driven control', aliases: ['elevation map', 'Privilege Etimation'] },
    { ...taxonomy[0], name: 'Algorithm', aliases: ['GAE', 'PPO', 'Teacher-Student', 'MultiCritic', 'DAgger'] },
    { ...taxonomy[0], name: 'My untouched group', backgroundColor: '#123456', aliases: ['Unknown method'] },
  ];
  const before = JSON.stringify(current);
  const result = createSuggestedTaxonomy(current);
  const labels = result.flatMap(field => [field.name, ...field.aliases]);
  assert.equal(new Set(labels).size, labels.length);
  for (const field of current) {
    for (const label of [field.name, ...field.aliases]) assert.ok(labels.includes(label), label);
  }
  assert.ok(result.find(field => field.name === 'Learning Methods').aliases.includes('GAN'));
  assert.ok(result.find(field => field.name === 'Perception').aliases.includes('State Estimation'));
  assert.equal(result.find(field => field.name === 'My untouched group').backgroundColor, '#123456');
  assert.equal(JSON.stringify(current), before);
});

test('new taxonomy uses short English labels and no duplicate names', () => {
  const names = taxonomy.flatMap(field => [field.name, ...field.aliases]);
  assert.equal(names.length, new Set(names).size);
  for (const name of names) {
    assert.doesNotMatch(name, /[\u3400-\u9fff]/);
    assert.ok(name.split(/\s+/).length <= 3, name);
  }
});

test('the title task and contribution outrank robot type and methods introduced with via', () => {
  assert.equal(suggest('Legged Robot State Estimation with Attention').fields[0], 'Perception');
  assert.equal(suggest('Humanoid Locomotion on Stairs via LiDAR Elevation Mapping').fields[0], 'Locomotion');
  assert.equal(suggest('A Heightmap Generator for Humanoid Locomotion').fields[0], 'Perception');
  assert.equal(suggest('Whole-Body Control for Hyper-Dexterous Humanoids').fields[0], 'Whole-body Motion');
  assert.equal(suggest('Terrain Adaptation of Humanoid Robots via Mixture of Experts').fields[0], 'Locomotion');
  assert.equal(suggest('Humanoid Control via Reinforcement Learning').fields[0], 'Whole-body Motion');
});

test('foundational GAE work is not classified by its locomotion benchmarks', () => {
  const result = suggest('High-Dimensional Control Using Generalized Advantage Estimation', [],
    '## Abstract\nOur approach learns running and standing-up behaviors in simulated robots.');
  assert.equal(result.fields[0], 'Learning Methods');
  assert.ok(result.fields.includes('GAE'));
});

test('background comparisons and noisy translations do not become method claims', () => {
  const abstract = '## 摘要\n> ## 摘要翻译\n> GAN PPO model-based control\n\n'
    + 'Traditional model-based controllers use PPO. We propose locomotion with Self Attention. '
    + 'Unlike existing GAN methods, our framework uses LiDAR.\n\n## Notes\nDAgger';
  const result = suggest('Attention-Based Legged Locomotion', [], abstract);
  assert.ok(result.fields.includes('Self Attention'));
  assert.ok(result.fields.includes('LiDAR'));
  for (const method of ['PPO', 'GAN', 'DAgger', 'Model-based Control']) assert.ok(!result.fields.includes(method), method);
});

test('a physics model based on a theory is not evidence of model-based policy control', () => {
  const result = suggest('Locomotion on Granular Terrain', [],
    '## Abstract\nWe present a contact model based on resistive force theory. We train policies using a variational autoencoder.');
  assert.ok(!result.fields.includes('Model-based Control'));
  assert.ok(result.fields.includes('VAE'));
});

test('image inpainting and motion inpainting have distinct labels', () => {
  const image = suggest('Generative Image Inpainting');
  assert.equal(image.fields[0], 'Vision');
  assert.ok(image.fields.includes('Inpainting'));
  const motion = suggest('Whole-Body Motion Tracking with Diffusion', [],
    '## Abstract\nWe propose motion inpainting using a diffusion model.');
  assert.ok(motion.fields.includes('Motion Inpainting'));
  assert.ok(!motion.fields.includes('Inpainting'));
});
