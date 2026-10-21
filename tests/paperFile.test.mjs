import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/utils/fileUtils.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'mock-vault-types',
    setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: 'export class TFile {} export class TFolder {} export const normalizePath = p => p;',
      }));
    },
  }],
});
const { createPaperFile } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

async function savePaper(paper) {
  let saved;
  const app = { vault: {
    getAbstractFileByPath: () => null,
    create: async (path, content) => { saved = { path, content }; return saved; },
  } };
  await createPaperFile(app, {
    workspaceFolder: 'Papers', unreadFolderName: 'Unread', translateAbstract: false,
  }, paper, '待阅读');
  assert.ok(saved);
  return saved;
}

test('saving an IEEE paper retains its source, DOI and original article link', async () => {
  const { content } = await savePaper({
    title: 'IEEE metadata', authors: ['Ada'], source: 'ieee',
    doi: '10.1109/TEST.2024.1234567', url: 'https://ieeexplore.ieee.org/document/1234567',
  });
  assert.match(content, /^source: "ieee"$/m);
  assert.match(content, /^doi: "10\.1109\/TEST\.2024\.1234567"$/m);
  assert.match(content, /^url: "https:\/\/ieeexplore\.ieee\.org\/document\/1234567"$/m);
  assert.match(content, /\*\*原文\*\*：\[IEEE Xplore\]\(<https:\/\/ieeexplore\.ieee\.org\/document\/1234567>\)/);
});

test('unsafe metadata links fall back to DOI and existing arXiv links remain available', async () => {
  const { content } = await savePaper({
    title: 'A paper', authors: [], source: 'arxiv', arxivId: '1706.03762',
    doi: '10.1109/TEST.2024.1234567', url: 'javascript:alert(1)',
  });
  assert.doesNotMatch(content, /javascript:/);
  assert.match(content, /https:\/\/doi\.org\/10\.1109%2FTEST\.2024\.1234567/);
  assert.match(content, /https:\/\/arxiv\.org\/abs\/1706\.03762/);
  assert.match(content, /https:\/\/arxiv\.org\/pdf\/1706\.03762/);
});
