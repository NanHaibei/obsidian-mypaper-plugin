import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const bundle = await build({ entryPoints: ['src/reading/modelCatalog.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const row = (model, extra = {}) => ({ model, displayName: `Display ${model}`, supportedReasoningEfforts: [
  { reasoningEffort: 'low', description: 'Quick' }, { reasoningEffort: 'high' },
], defaultReasoningEffort: 'low', ...extra });

function harness(respond) {
  const messages = [], kills = [], spawns = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
  child.stderr = { resume() {} };
  child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  child.stdin.write = line => {
    const message = JSON.parse(line); messages.push(message);
    queueMicrotask(() => respond?.(message, child));
  };
  child.kill = signal => { kills.push(signal); queueMicrotask(() => child.emit('close', 0)); };
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, URL, process: { platform: 'win32', env: { PATH: '/bin' } },
    setTimeout: (fn, ms) => setTimeout(fn, ms === 30_000 ? 40 : ms), clearTimeout,
    require: name => name === 'child_process' ? { spawn: (...args) => { spawns.push(args); return child; } } : require(name),
  });
  return { ...module.exports, messages, kills, spawns, child };
}
const reply = (child, id, result) => {
  const line = JSON.stringify({ id, result }) + '\n';
  child.stdout.emit('data', line.slice(0, 9));
  child.stdout.emit('data', line.slice(9));
};
const settings = { executable: '/path with spaces/codex', proxyUrl: 'http://localhost:7890' };

test('catalog validates pages, retains display names and efforts, filters hidden/text-only models', () => {
  const { parseModelPage } = harness();
  const page = parseModelPage({ data: [null, {}, row('vision'), row('hidden', { hidden: true }),
    row('text', { inputModalities: ['text'] }), row('custom', { supportedReasoningEfforts: [null, { reasoningEffort: 'future' }] })] });
  assert.equal(page.models.length, 2);
  assert.equal(page.models[0].displayName, 'Display vision');
  assert.equal(page.models[0].defaultEffort, 'low');
  assert.equal(page.models[1].efforts[0].value, 'future');
  assert.throws(() => parseModelPage({}), /格式/);
  assert.throws(() => parseModelPage({ data: [], nextCursor: 8 }), /分页/);
});

test('stdio handshake, chunked responses and pagination read all models without starting inference', async () => {
  const h = harness((message, child) => {
    if (message.method === 'initialize') reply(child, message.id, {});
    if (message.method === 'model/list') reply(child, message.id, message.params.cursor
      ? { data: [row('one'), row('two')], nextCursor: null } : { data: [row('one')], nextCursor: 'page2' });
  });
  const models = await h.readModelCatalog(settings, '/vault', new AbortController().signal);
  assert.equal(models.map(m => m.model).join(','), 'one,two');
  assert.equal(h.messages.map(m => m.method).join(','), 'initialize,initialized,model/list,model/list');
  assert.equal(h.spawns[0][0], settings.executable);
  assert.equal(h.spawns[0][2].shell, false);
  assert.equal(h.spawns[0][2].env.HTTPS_PROXY, 'http://localhost:7890/');
  assert.equal(h.kills.length, 1);
});

test('empty catalogs, malformed results, RPC errors and repeated cursors fail with cleanup', async () => {
  for (const mode of ['empty', 'malformed', 'rpc', 'cursor']) {
    const h = harness((message, child) => {
      if (message.method === 'initialize') reply(child, message.id, {});
      if (message.method !== 'model/list') return;
      if (mode === 'rpc') child.stdout.emit('data', JSON.stringify({ id: message.id, error: { message: 'private account detail' } }) + '\n');
      else reply(child, message.id, mode === 'empty' ? { data: [] } : mode === 'malformed' ? {} : { data: [row('one')], nextCursor: 'repeat' });
    });
    await assert.rejects(h.readModelCatalog(settings, '/vault', new AbortController().signal), error => {
      assert.doesNotMatch(error.message, /private account detail/); return true;
    });
    assert.equal(h.kills.length, 1);
  }
});

test('timeout, abort, spawn failure and premature close settle and stop the child', async () => {
  for (const mode of ['timeout', 'abort', 'spawn', 'close']) {
    const h = harness();
    const abort = new AbortController();
    const promise = h.readModelCatalog(settings, '/vault', abort.signal);
    if (mode === 'abort') abort.abort();
    if (mode === 'spawn') h.child.emit('error', new Error('ENOENT'));
    if (mode === 'close') h.child.emit('close', 1);
    await assert.rejects(promise, /超时|取消|无法启动|退出/);
    assert.equal(h.kills.length, 1);
  }
  const h = harness();
  const abort = new AbortController(); abort.abort();
  await assert.rejects(h.readModelCatalog(settings, '/vault', abort.signal), /取消/);
  assert.equal(h.spawns.length, 0);
});
