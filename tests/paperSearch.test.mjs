import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadSearchModule } from './helpers/searchHarness.mjs';

const arxivModule = fileURLToPath(new URL('../src/api/arxivSearch.ts', import.meta.url));
const ieeeModule = fileURLToPath(new URL('../src/api/ieeeSearch.ts', import.meta.url));
const { searchPapers } = await loadSearchModule('../../src/api/paperSearch.ts', {
  './arxivSearch': `
    export { isArxivQuery } from ${JSON.stringify(arxivModule)};
    export const searchArxiv = (...args) => globalThis.__mypaperRoutingArxiv(...args);
  `,
  './ieeeSearch': `
    export { isIEEEQuery } from ${JSON.stringify(ieeeModule)};
    export const searchIEEE = (...args) => globalThis.__mypaperRoutingIEEE(...args);
  `,
});

const arxivPaper = { title: 'An arXiv paper', authors: [], source: 'arxiv', arxivId: '1706.03762' };
const ieeePaper = { title: 'An IEEE paper', authors: [], source: 'ieee', doi: '10.1109/TEST.2024.1234567' };
let arxivCalls;
let ieeeCalls;

beforeEach(() => {
  arxivCalls = [];
  ieeeCalls = [];
  globalThis.__mypaperRoutingArxiv = async (...args) => {
    arxivCalls.push(args);
    return [arxivPaper];
  };
  globalThis.__mypaperRoutingIEEE = async (...args) => {
    ieeeCalls.push(args);
    return [ieeePaper];
  };
});

test('the arXiv selection keeps ordinary keyword searches on arXiv', async () => {
  const result = await searchPapers('  robot mapping  ', 'arxiv', 'test-key');
  assert.deepEqual(result, { papers: [arxivPaper], failures: [] });
  assert.deepEqual(arxivCalls, [['robot mapping']]);
  assert.deepEqual(ieeeCalls, []);
});

test('the IEEE selection sends keywords and the configured key only to IEEE', async () => {
  const result = await searchPapers('robot mapping', 'ieee', 'test-key');
  assert.deepEqual(result, { papers: [ieeePaper], failures: [] });
  assert.deepEqual(arxivCalls, []);
  assert.deepEqual(ieeeCalls, [['robot mapping', 'test-key']]);
});

test('IEEE identifiers choose IEEE even when the source selector still says arXiv', async () => {
  const query = 'https://ieeexplore.ieee.org/document/1234567';
  const result = await searchPapers(query, 'arxiv', 'test-key');
  assert.deepEqual(result.papers, [ieeePaper]);
  assert.deepEqual(arxivCalls, []);
  assert.deepEqual(ieeeCalls, [[query, 'test-key']]);
});

test('arXiv identifiers choose arXiv even when the source selector says IEEE', async () => {
  const result = await searchPapers('arxiv:1706.03762', 'ieee', 'test-key');
  assert.deepEqual(result.papers, [arxivPaper]);
  assert.deepEqual(arxivCalls, [['arxiv:1706.03762']]);
  assert.deepEqual(ieeeCalls, []);
});

test('searching both providers combines successful results', async () => {
  const result = await searchPapers('robot mapping', 'all', 'test-key');
  assert.deepEqual(result, { papers: [arxivPaper, ieeePaper], failures: [] });
  assert.equal(arxivCalls.length, 1);
  assert.equal(ieeeCalls.length, 1);
});

test('an IEEE failure preserves arXiv results and reports the failed provider', async () => {
  const failure = new Error('IEEE unavailable');
  globalThis.__mypaperRoutingIEEE = async () => { throw failure; };
  const result = await searchPapers('robot mapping', 'all', 'test-key');
  assert.deepEqual(result.papers, [arxivPaper]);
  assert.deepEqual(result.failures, [{ source: 'IEEE', error: failure }]);
});

test('an arXiv failure preserves IEEE results and reports the failed provider', async () => {
  const failure = new Error('arXiv unavailable');
  globalThis.__mypaperRoutingArxiv = async () => { throw failure; };
  const result = await searchPapers('robot mapping', 'all', '');
  assert.deepEqual(result.papers, [ieeePaper]);
  assert.deepEqual(result.failures, [{ source: 'arXiv', error: failure }]);
});

test('empty searches do not contact either provider', async () => {
  assert.deepEqual(await searchPapers(' \n ', 'all', 'test-key'), { papers: [], failures: [] });
  assert.deepEqual(arxivCalls, []);
  assert.deepEqual(ieeeCalls, []);
});
