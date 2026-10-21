import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import yaml from 'js-yaml';

globalThis.__classificationYaml = yaml;
const bundle = await build({
  entryPoints: ['src/classification/storage.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', plugins: [{
    name: 'classification-vault',
    setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
        export class TFile {
          constructor(path, content) {
            this.path = path; this.content = content; this.stat = { mtime: 100 };
            this.name = path.split('/').pop(); this.extension = this.name.split('.').pop();
            this.basename = this.name.slice(0, -this.extension.length - 1);
          }
        }
        export class TFolder { constructor(path) { this.path = path; this.children = []; } }
        globalThis.__classificationFiles = { TFile, TFolder };
        export const normalizePath = path => path.replace(/\\/+/g, '/').replace(/^\\/|\\/$/g, '');
        export const parseYaml = text => globalThis.__classificationYaml.load(text);
        export const stringifyYaml = value => globalThis.__classificationYaml.dump(value);
        export function getFrontMatterInfo(content) {
          const opening = /^(?:\\uFEFF)?---[ \\t]*\\r?\\n/.exec(content);
          if (!opening) return { exists: false, from: 0, to: 0, contentStart: 0, frontmatter: '' };
          const closing = /^(?:---|\\.\\.\\.)[ \\t]*(?:\\r?\\n|$)/m.exec(content.slice(opening[0].length));
          if (!closing) return { exists: false, from: 0, to: 0, contentStart: 0, frontmatter: '' };
          const from = opening[0].length, to = from + closing.index;
          return { exists: true, from, to, contentStart: to + closing[0].length, frontmatter: content.slice(from, to) };
        }
      ` }));
    },
  }],
});
const storage = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { TFile, TFolder } = globalThis.__classificationFiles;
const style = name => ({ name, aliases: [], backgroundColor: '#fff', textColor: '#000', borderColor: '#aaa',
  roughness: 0, opacity: 100, roundness: 1, titleFontSize: 14, titleFontFamily: 1,
  metaFontSize: 11, metaFontFamily: 1, cardWidth: 280, cardHeight: 180, titleAlignment: 'left' });
const document = (fields = 'field: Old\nfields: [Old, Unknown]\n') => `---\n# Preserve this comment\ntitle: "A robot paper"\n${fields}authors: ["Ada", "Lin"]\ntags:\n  - untouched\nextra:\n  nested: value\n---\n# A robot paper\n\n**研究领域**：Old / Unknown  \n\n## 摘要\nRobot planning and learning.\n\n## 我的笔记\nKeep every word.\n\`\`\`md\n**研究领域**：this is code\n\`\`\`\n`;

function fixture() {
  const files = new Map();
  const writes = [];
  const folder = path => {
    if (files.has(path)) return files.get(path);
    const created = new TFolder(path); files.set(path, created);
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (parent) folder(parent).children.push(created);
    return created;
  };
  const add = (path, content) => {
    const file = new TFile(path, content); files.set(path, file);
    folder(path.slice(0, path.lastIndexOf('/'))).children.push(file);
    return file;
  };
  const vault = {
    getAbstractFileByPath: path => files.get(path) || null,
    read: async file => file.content,
    createFolder: async path => folder(path),
    create: async (path, content) => { writes.push({ kind: 'backup', path }); return add(path, content); },
    process: async (file, callback) => {
      if (vault.beforeProcess) await vault.beforeProcess(file);
      const next = callback(file.content);
      if (next !== file.content) writes.push({ kind: 'paper', path: file.path });
      file.content = next; file.stat.mtime++; return next;
    },
  };
  const host = {
    app: { vault }, settings: { workspaceFolder: 'Papers', unreadFolderName: 'Unread', readFolderName: 'Read',
      fields: [style('Old'), style('Unknown')], defaultField: 'Old', ieeeApiKey: 'SECRET', siliconflowApiKey: 'SECRET2',
      ideas: [{ id: 'idea-1', field: 'Old', content: 'private idea', title: 'Keep me' }] },
    saveSettings: async () => { writes.push({ kind: 'settings' }); },
  };
  const first = add('Papers/Unread/nested/a.md', document());
  add('Papers/Read/b.md', document('fields: Old\n'));
  add('Unrelated/private.md', 'not a paper');
  return { host, files, writes, add, first };
}

async function planFor(host, path) {
  const papers = await storage.scanClassificationPapers(host);
  const paper = papers.find(paper => paper.path === path) || papers[0];
  return { papers, plan: { taxonomy: [style('New'), style('Old'), style('Unknown')], defaultField: 'New',
    changes: [{ path: paper.path, beforeFields: paper.fields, afterFields: ['New', 'Unknown'] }] } };
}

test('scan traverses only both paper roots and normalizes legacy scalar fields', async () => {
  const { host } = fixture();
  const papers = await storage.scanClassificationPapers(host);
  assert.equal(papers.length, 2);
  assert.deepEqual(papers.find(paper => paper.path.endsWith('b.md')).fields, ['Old']);
  assert.deepEqual(papers.find(paper => paper.path.endsWith('a.md')).fields, ['Old', 'Unknown']);
});

test('scan keeps unclassified papers visibly empty and excludes custom idea tags from backup', async () => {
  const { host, first, files } = fixture();
  first.content = document('');
  host.settings.ideas.push({ id: 'custom', field: 'Personal custom tag', isCustomTag: true });
  assert.deepEqual((await storage.scanClassificationPapers(host)).find(paper => paper.path === first.path).fields, []);
  const path = await storage.createClassificationBackup(host, 'test');
  assert.equal(JSON.parse(files.get(path).content).ideaFields.length, 1);
});

test('backup contains full originals and classification settings, without unrelated settings or notes', async () => {
  const { host, files } = fixture();
  const path = await storage.createClassificationBackup(host, 'Before edit');
  const saved = files.get(path).content;
  const backup = JSON.parse(saved);
  assert.equal(backup.papers.length, 2);
  assert.equal(backup.papers.find(paper => paper.path.endsWith('a.md')).content, document());
  assert.deepEqual(Object.keys(backup.settings).sort(), ['defaultField', 'fields']);
  assert.deepEqual(backup.ideaFields, [{ id: 'idea-1', field: 'Old' }]);
  assert.doesNotMatch(saved, /SECRET|private idea|not a paper/);
  assert.deepEqual((await storage.listClassificationBackups(host)).map(entry => entry.path), [path]);
});

test('legacy backups with missing title alignment remain restorable with the standard default', async () => {
  const { host, files } = fixture();
  delete host.settings.fields[0].titleAlignment;
  const path = await storage.createClassificationBackup(host, 'Legacy settings');
  const snapshot = JSON.parse(files.get(path).content);
  delete snapshot.settings.fields[0].titleAlignment;
  files.get(path).content = JSON.stringify(snapshot);
  assert.equal((await storage.listClassificationBackups(host)).length, 1);
  const result = await storage.restoreClassificationBackup(host, path);
  assert.deepEqual(result.failed, []);
  assert.equal(host.settings.fields[0].titleAlignment, 'left');
});

test('backup write failure prevents every paper and settings mutation', async () => {
  const { host, writes, first } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  host.app.vault.create = async () => { throw new Error('Disk full'); };
  await assert.rejects(storage.applyClassificationPlan(host, papers, plan), /Disk full/);
  assert.equal(first.content, document());
  assert.equal(host.settings.defaultField, 'Old');
  assert.deepEqual(writes, []);
});

test('backup read-back mismatch prevents mutations', async () => {
  const { host, writes, first } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  const read = host.app.vault.read;
  host.app.vault.read = file => file.extension === 'json' ? Promise.resolve('{}') : read(file);
  await assert.rejects(storage.applyClassificationPlan(host, papers, plan), /校验失败/);
  assert.equal(first.content, document());
  assert.equal(writes.filter(write => write.kind !== 'backup').length, 0);
});

test('apply preserves other YAML verbatim, abstract, notes, unknown tags and code examples', async () => {
  const { host, writes, first, files } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.deepEqual(result.updated, [first.path]);
  assert.deepEqual(result.failed, []);
  assert.equal(writes[0].kind, 'backup');
  assert.match(first.content, /# Preserve this comment\ntitle: "A robot paper"/);
  assert.match(first.content, /authors: \["Ada", "Lin"\]\ntags:\n  - untouched\nextra:\n  nested: value/);
  assert.match(first.content, /\*\*研究领域\*\*：New \/ Unknown  /);
  assert.equal(first.content.slice(first.content.indexOf('## 摘要')), document().slice(document().indexOf('## 摘要')));
  assert.equal(files.get('Unrelated/private.md').content, 'not a paper');
  assert.equal(host.settings.ieeeApiKey, 'SECRET');
});

test('quoted classification keys, block lists and CRLF survive apply and restore without changing notes', async () => {
  const { host, first } = fixture();
  first.content = '\uFEFF' + document('"field": Old\n\'fields\':\n- Old\n- Unknown\n').replace(/\n/g, '\r\n');
  const notes = first.content.slice(first.content.indexOf('## 摘要'));
  const { papers, plan } = await planFor(host, first.path);
  const applied = await storage.applyClassificationPlan(host, papers, plan);
  assert.deepEqual(applied.failed, []);
  assert.ok(first.content.startsWith('\uFEFF---\r\n'));
  assert.equal(first.content.slice(first.content.indexOf('## 摘要')), notes);
  const restored = await storage.restoreClassificationBackup(host, applied.backupPath);
  assert.deepEqual(restored.failed, []);
  assert.deepEqual((await storage.scanClassificationPapers(host)).find(paper => paper.path === first.path).fields, ['Old', 'Unknown']);
  assert.equal(first.content.slice(first.content.indexOf('## 摘要')), notes);
});

test('changed and missing papers are reported and never overwritten', async () => {
  const { host, first, files, writes } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  first.content += '\nUser edit after preview';
  const other = papers.find(paper => paper.path !== first.path);
  plan.changes.push({ path: other.path, beforeFields: other.fields, afterFields: ['New'] });
  files.delete(other.path);
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.equal(result.skipped.length, 2);
  assert.match(result.skipped.find(item => item.path === first.path).reason, /发生变化/);
  assert.match(first.content, /User edit after preview/);
  assert.equal(writes.filter(write => write.kind === 'paper').length, 0);
});

test('atomic callback detects an edit immediately before writing', async () => {
  const { host, first } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  host.app.vault.beforeProcess = file => { file.content += '\nConcurrent edit'; };
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.equal(result.skipped.length, 1);
  assert.equal(first.stat.mtime, 100);
  assert.match(first.content, /field: Old/);
  assert.match(first.content, /Concurrent edit/);
});

test('restore backup failure and edits during restoration cannot overwrite current classifications', async () => {
  const { host, first, writes } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  const applied = await storage.applyClassificationPlan(host, papers, plan);
  const create = host.app.vault.create;
  host.app.vault.create = async () => { throw new Error('Cannot back up'); };
  writes.length = 0;
  await assert.rejects(storage.restoreClassificationBackup(host, applied.backupPath), /Cannot back up/);
  assert.match(first.content, /field: New/);
  assert.deepEqual(writes, []);
  host.app.vault.create = create;
  host.app.vault.beforeProcess = file => { file.content += '\nNote while restoring'; };
  const restored = await storage.restoreClassificationBackup(host, applied.backupPath);
  assert.equal(restored.skipped.length, 2);
  assert.match(first.content, /field: New/);
  assert.match(first.content, /Note while restoring/);
});

test('partial write failure reports the paper and keeps a verified recovery snapshot', async () => {
  const { host, first, files } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  const other = papers.find(paper => paper.path !== first.path);
  plan.changes.push({ path: other.path, beforeFields: other.fields, afterFields: ['New'] });
  const process = host.app.vault.process;
  host.app.vault.process = (file, callback) => {
    if (file.path === first.path) throw new Error('Read-only note');
    return process(file, callback);
  };
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.deepEqual(result.updated, [other.path]);
  assert.deepEqual(result.failed, [{ path: first.path, reason: 'Read-only note' }]);
  assert.ok(files.has(result.backupPath));
  assert.equal(first.content, document());
});

test('partial apply preserves a removed parent, its still-used child and their original style', async () => {
  const { host, first, files } = fixture();
  const originalStyle = { ...style('Old'), aliases: ['Old child'], backgroundColor: '#112233' };
  host.settings.fields = [originalStyle];
  first.content = document('fields: ["Old child"]\nfield: "Old child"\n');
  const papers = await storage.scanClassificationPapers(host);
  const plan = { taxonomy: [style('New')], defaultField: 'New', changes: papers.map(paper => ({
    path: paper.path, beforeFields: paper.fields, afterFields: ['New'],
  })) };
  first.content += '\nEdited after preview';
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.deepEqual(result.updated, ['Papers/Read/b.md']);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /已保留.*Old child/);
  assert.deepEqual(JSON.parse(JSON.stringify(host.settings.fields.find(field => field.name === 'Old'))), originalStyle);
  assert.match(files.get('Papers/Read/b.md').content, /field: New/);
  assert.match(first.content, /Old child/);
});

test('restore failure retains the current label and style alongside the restored taxonomy', async () => {
  const { host, first } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  const newStyle = { ...style('New'), backgroundColor: '#ffeedd' };
  plan.taxonomy = [newStyle];
  plan.changes = papers.map(paper => ({ path: paper.path, beforeFields: paper.fields, afterFields: ['New'] }));
  const applied = await storage.applyClassificationPlan(host, papers, plan);
  const process = host.app.vault.process;
  host.app.vault.process = (file, callback) => {
    if (file.path === first.path) throw new Error('Temporarily read-only');
    return process(file, callback);
  };
  const result = await storage.restoreClassificationBackup(host, applied.backupPath);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /已保留.*New/);
  assert.deepEqual(JSON.parse(JSON.stringify(host.settings.fields.find(field => field.name === 'New'))), newStyle);
  assert.equal(host.settings.defaultField, 'Old');
  assert.match(first.content, /field: New/);
});

test('restore preserves classifications and styles of papers added after the snapshot', async () => {
  const { host, add } = fixture();
  const path = await storage.createClassificationBackup(host, 'Before later papers');
  const laterStyle = { ...style('Later research'), backgroundColor: '#445566' };
  host.settings.fields.push(laterStyle);
  const later = add('Papers/Read/later.md', document('field: "Later research"\n'));
  const content = later.content;
  const result = await storage.restoreClassificationBackup(host, path);
  assert.deepEqual(result.failed, []);
  assert.equal(later.content, content);
  assert.equal(host.settings.defaultField, 'Old');
  assert.deepEqual(JSON.parse(JSON.stringify(host.settings.fields.find(field => field.name === 'Later research'))), laterStyle);
  assert.match(result.skipped.find(entry => entry.path === later.path).reason, /已保留.*Later research/);
});

test('apply preserves labels of papers added after the preview without touching their content', async () => {
  const { host, first, add } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  plan.taxonomy = [style('New')];
  plan.changes = papers.map(paper => ({ path: paper.path, beforeFields: paper.fields, afterFields: ['New'] }));
  const later = add('Papers/Unread/later.md', document('field: "Unlisted research"\n'));
  const content = later.content;
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.deepEqual(result.failed, []);
  assert.equal(later.content, content);
  assert.ok(host.settings.fields.some(field => field.name === 'Unlisted research'));
  assert.match(result.skipped.find(entry => entry.path === later.path).reason, /已保留.*Unlisted research/);
});

test('restore reinstates exact legacy field presence and taxonomy while preserving later notes and settings', async () => {
  const { host, first, files } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  const applied = await storage.applyClassificationPlan(host, papers, plan);
  first.content += '\nMy new insight';
  host.settings.ieeeApiKey = 'CHANGED_SECRET';
  host.settings.ideas[0].field = 'New';
  host.settings.ideas[0].content = 'Edited idea content';
  const restored = await storage.restoreClassificationBackup(host, applied.backupPath);
  assert.notEqual(restored.backupPath, applied.backupPath);
  assert.deepEqual(restored.failed, []);
  assert.match(first.content, /field: Old/);
  assert.match(first.content, /\*\*研究领域\*\*：Old \/ Unknown/);
  assert.match(first.content, /My new insight/);
  assert.match(files.get('Papers/Read/b.md').content, /fields: Old/);
  assert.doesNotMatch(files.get('Papers/Read/b.md').content, /^field:/m);
  assert.equal(host.settings.defaultField, 'Old');
  assert.equal(host.settings.ieeeApiKey, 'CHANGED_SECRET');
  assert.equal(host.settings.ideas[0].field, 'Old');
  assert.equal(host.settings.ideas[0].content, 'Edited idea content');
});

test('restore removes newly added classification properties when absent in original', async () => {
  const { host, first } = fixture();
  first.content = document('').replace('**研究领域**：Old / Unknown  \n', '');
  const { papers, plan } = await planFor(host, first.path);
  const applied = await storage.applyClassificationPlan(host, papers, plan);
  first.content += '\nLater note';
  await storage.restoreClassificationBackup(host, applied.backupPath);
  assert.doesNotMatch(first.content, /^fields?:/m);
  assert.match(first.content, /Later note/);
});

test('restore rejects duplicate or out-of-scope paper paths before making a backup or writes', async () => {
  for (const invalid of ['Unrelated/private.md', 'Papers/Unread/../outside.md', 'duplicate']) {
    const { host, files, writes } = fixture();
    const path = await storage.createClassificationBackup(host, 'original');
    const snapshot = JSON.parse(files.get(path).content);
    if (invalid === 'duplicate') snapshot.papers.push(snapshot.papers[0]);
    else snapshot.papers[0].path = invalid;
    files.get(path).content = JSON.stringify(snapshot);
    writes.length = 0;
    await assert.rejects(storage.restoreClassificationBackup(host, path), /路径|论文目录/);
    assert.deepEqual(writes, []);
  }
});

test('settings save failure returns a recoverable backup and restores in-memory settings', async () => {
  const { host, first, files } = fixture();
  const { papers, plan } = await planFor(host, first.path);
  host.saveSettings = async () => { throw new Error('Settings disk failure'); };
  const result = await storage.applyClassificationPlan(host, papers, plan);
  assert.deepEqual(result.updated, [first.path]);
  assert.match(result.failed[0].reason, /Settings disk failure/);
  assert.ok(files.has(result.backupPath));
  assert.equal(host.settings.defaultField, 'Old');
});

test('backup and apply batches are mutually exclusive and release the lock after errors', async () => {
  const { host } = fixture();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const originalRead = host.app.vault.read;
  let started;
  const reading = new Promise(resolve => { started = resolve; });
  host.app.vault.read = async file => { started(); await wait; return originalRead(file); };
  const first = storage.createClassificationBackup(host, 'one');
  await reading;
  await assert.rejects(storage.createClassificationBackup(host, 'two'), /正在进行/);
  release();
  await first;
  await storage.createClassificationBackup(host, 'three');
});
