import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/reading/codexEnvironment.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { codexEnvironment, describeCodexFailure } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('blank proxy inherits the host environment without mutating it', () => {
  const parent = { PATH: '/bin', HTTPS_PROXY: 'http://existing:8080' };
  const env = codexEnvironment(parent, '');
  assert.deepEqual(env, parent);
  assert.notEqual(env, parent);
});

test('explicit proxy configures all CLI proxy variables even when Obsidian has none', () => {
  const parent = { PATH: '/bin', ALL_PROXY: 'socks://old:1234', NO_PROXY: 'localhost' };
  const env = codexEnvironment(parent, 'http://127.0.0.1:7890');
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    assert.equal(env[key], 'http://127.0.0.1:7890/');
  }
  assert.equal(env.NO_PROXY, 'localhost');
  assert.equal(parent.ALL_PROXY, 'socks://old:1234');
  assert.equal(parent.HTTPS_PROXY, undefined);
});

test('invalid proxy is rejected without reflecting credentials in the error', () => {
  for (const value of ['bad', 'file:///tmp/proxy', 'socks://user:secret@localhost:8080', 'https://host/path']) {
    assert.throws(() => codexEnvironment({}, value), error => {
      assert.match(error.message, /代理/);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
});

test('routing failures explain the proxy and authentication recovery paths', () => {
  assert.match(describeCodexFailure('workspace routing discovery failed'), /网络代理/);
  assert.match(describeCodexFailure('workspace routing discovery timed out'), /登录状态/);
  assert.equal(describeCodexFailure('model unavailable'), 'model unavailable');
});

test('service capacity is distinguished from account quota', () => {
  assert.match(describeCodexFailure('Selected model is at capacity. Please try a different model.'), /模型服务当前繁忙/);
  assert.match(describeCodexFailure('You have hit your usage limit'), /账号额度/);
});
