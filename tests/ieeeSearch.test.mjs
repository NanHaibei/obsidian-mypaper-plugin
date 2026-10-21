import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  crossrefResponse, crossrefWork, ieeeArticle, jsonResponse, loadSearchModule, mockRequests,
  withCitationDocument,
} from './helpers/searchHarness.mjs';

const { searchIEEE, isIEEEQuery } = await loadSearchModule('../../src/api/ieeeSearch.ts');

beforeEach(() => mockRequests());

test('recognizes IEEE identifiers without claiming arbitrary titles or other providers', () => {
  for (const query of [
    '10.1109/TEST.2024.1234567',
    ' https://doi.org/10.1109/TEST.2024.1234567 ',
    'doi:10.1109/TEST.2024.1234567',
    'https://ieeexplore.ieee.org/document/1234567',
    'https://ieeexplore.ieee.org/abstract/document/1234567',
    'https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=1234567',
    'ieee:1234567',
  ]) assert.equal(isIEEEQuery(query), true, query);

  for (const query of ['', 'SLAM for IEEE robots', 'arxiv:1706.03762',
    '10.1145/1234567', 'https://example.com/document/1234567',
    'https://ieeexplore.ieee.org.evil.test/document/1234567']) {
    assert.equal(isIEEEQuery(query), false, query);
  }
});

test('empty input does not send a network request', async () => {
  const requests = mockRequests();
  assert.deepEqual(await searchIEEE('  '), []);
  assert.deepEqual(await searchIEEE('\n', 'a-key'), []);
  assert.equal(requests.length, 0);
});

test('title searches without a key use Crossref restricted to IEEE', async () => {
  const requests = mockRequests(crossrefResponse([]));
  assert.deepEqual(await searchIEEE('  robot mapping & planning  '), []);
  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.hostname, 'api.crossref.org');
  assert.equal(url.pathname, '/works');
  assert.equal(url.searchParams.get('filter'), 'prefix:10.1109');
  assert.equal(url.searchParams.get('query.bibliographic'), 'robot mapping & planning');
  assert.equal(url.searchParams.has('apikey'), false);
});

test('Crossref results retain usable bibliographic fields and deduplicate affiliations', async () => {
  mockRequests(crossrefResponse([crossrefWork]));
  const [paper] = await searchIEEE('Dense Mapping');
  assert.ok(paper);
  assert.equal(paper.title, 'A & B: Dense Mapping');
  assert.equal(paper.journal, 'IEEE Transactions on Robotics');
  assert.equal(paper.date, '2024-06-07');
  assert.deepEqual(paper.authors, ['Ada Lovelace', 'Alan Turing']);
  assert.deepEqual(paper.institutions, ['Robotics Lab']);
  assert.equal(paper.abstract, 'A & B use maps.');
  assert.equal(paper.doi, crossrefWork.DOI);
  assert.equal(paper.source, 'ieee');
  assert.match(paper.url, /^https:\/\/(?:ieeexplore\.ieee\.org|doi\.org)\//);
});

test('Crossref cannot inject non-IEEE papers into IEEE search results', async () => {
  mockRequests(crossrefResponse([
    { ...crossrefWork, DOI: '10.1145/1234567', title: ['Unrelated publisher'] },
    crossrefWork,
  ]));
  const papers = await searchIEEE('Dense Mapping');
  assert.equal(papers.length, 1);
  assert.equal(papers[0].doi, crossrefWork.DOI);
});

test('a pasted IEEE DOI uses an exact Crossref lookup', async () => {
  const requests = mockRequests(jsonResponse({ status: 'ok', message: crossrefWork }));
  const papers = await searchIEEE(`https://doi.org/${crossrefWork.DOI}`);
  assert.equal(papers.length, 1);
  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.hostname, 'api.crossref.org');
  assert.equal(decodeURIComponent(url.pathname), `/works/${crossrefWork.DOI}`);
  assert.equal(url.searchParams.has('query.bibliographic'), false);
});

test('an unknown exact DOI returns no papers instead of a fuzzy substitute', async () => {
  const requests = mockRequests(jsonResponse({ message: 'Resource not found.' }, 404));
  assert.deepEqual(await searchIEEE('10.1109/TEST.2099.9999999'), []);
  assert.equal(requests.length, 1);
});

test('an exact Crossref DOI lookup rejects metadata for a different paper', async () => {
  mockRequests(jsonResponse({ status: 'ok', message: crossrefWork }));
  await assert.rejects(searchIEEE('10.1109/TEST.2099.9999999'));
});

test('title searches with a key use IEEE and preserve special characters in credentials', async () => {
  const requests = mockRequests(jsonResponse({ total_records: 0, articles: [] }));
  assert.deepEqual(await searchIEEE('mapping & "planning"', ' key&with=reserved?# + '), []);
  const url = new URL(requests[0].url);
  assert.equal(url.hostname, 'ieeexploreapi.ieee.org');
  assert.equal(url.searchParams.get('querytext'), 'mapping & "planning"');
  assert.equal(url.searchParams.get('apikey'), 'key&with=reserved?# +');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.has('with'), false);
});

test('IEEE API metadata maps into the same paper format', async () => {
  mockRequests(jsonResponse({ total_records: 1, articles: [ieeeArticle] }));
  const [paper] = await searchIEEE('Reliable SLAM', 'test-key');
  assert.ok(paper);
  assert.equal(paper.title, ieeeArticle.title);
  assert.equal(paper.journal, ieeeArticle.publication_title);
  assert.equal(paper.date, ieeeArticle.publication_date);
  assert.deepEqual(paper.authors, ['Ada Lovelace', 'Alan Turing']);
  assert.deepEqual(paper.institutions, ['Robotics Lab']);
  assert.equal(paper.doi, ieeeArticle.doi);
  assert.equal(paper.abstract, ieeeArticle.abstract);
  assert.equal(paper.source, 'ieee');
  assert.equal(paper.url, ieeeArticle.html_url);
});

test('a DOI with a key uses the IEEE DOI parameter', async () => {
  const requests = mockRequests(jsonResponse({ total_records: 1, articles: [ieeeArticle] }));
  await searchIEEE(`doi:${crossrefWork.DOI}`, 'test-key');
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get('doi'), crossrefWork.DOI);
  assert.equal(url.searchParams.has('querytext'), false);
  assert.equal(url.searchParams.has('article_number'), false);
});

test('all supported Xplore link forms use an exact article number when a key is set', async () => {
  for (const query of [
    'https://ieeexplore.ieee.org/document/1234567',
    'https://ieeexplore.ieee.org/abstract/document/1234567',
    'https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=1234567',
    'ieee:1234567',
  ]) {
    const requests = mockRequests(jsonResponse({ total_records: 1, articles: [ieeeArticle] }));
    await searchIEEE(query, 'test-key');
    const url = new URL(requests[0].url);
    assert.equal(url.searchParams.get('article_number'), '1234567', query);
    assert.equal(url.searchParams.has('querytext'), false, query);
    assert.equal(requests.length, 1);
  }
});

test('exact IEEE lookups do not import a different article from the API response', async () => {
  for (const query of ['ieee:9999999', '10.1109/TEST.2099.9999999']) {
    const requests = mockRequests(jsonResponse({ total_records: 1, articles: [ieeeArticle] }));
    assert.deepEqual(await searchIEEE(query, 'test-key'), []);
    assert.equal(requests.length, 1);
  }
});

test('unsupported Xplore links are not sent to a keyword search', async () => {
  const requests = mockRequests();
  await assert.rejects(searchIEEE('https://ieeexplore.ieee.org/invalid/document'));
  assert.equal(requests.length, 0);
});

test('an IEEE API error payload is not mistaken for an empty successful search', async () => {
  mockRequests(jsonResponse({ error: 'Invalid API key', articles: [], total_records: 0 }));
  await assert.rejects(searchIEEE('robot mapping', 'test-key'));
});

test('network errors cannot expose an IEEE API key in the displayed error', async () => {
  const key = 'private-credential';
  mockRequests(new Error(`Failed request https://ieeexploreapi.ieee.org?apikey=${key}`));
  await assert.rejects(searchIEEE('robot mapping', key), error => {
    assert.equal(error.message.includes(key), false);
    assert.match(error.message, /IEEE/i);
    return true;
  });
});

test('a blocked Xplore page without a key gives recovery advice and never fuzzy-searches', async () => {
  const requests = mockRequests(jsonResponse({}, 403));
  await assert.rejects(searchIEEE('https://ieeexplore.ieee.org/document/1234567'), error => {
    assert.match(error.message, /DOI/i);
    assert.match(error.message, /API\s*key/i);
    return true;
  });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).hostname, 'ieeexplore.ieee.org');
});

test('an Xplore page DOI is resolved by exact Crossref lookup without an API key', async () => {
  await withCitationDocument({ citation_doi: [crossrefWork.DOI] }, async () => {
    const requests = mockRequests(
      { status: 200, text: '<html></html>' },
      jsonResponse({ status: 'ok', message: crossrefWork }),
    );
    const papers = await searchIEEE('https://ieeexplore.ieee.org/document/1234567');
    assert.equal(papers.length, 1);
    assert.equal(papers[0].doi, crossrefWork.DOI);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[0].url).hostname, 'ieeexplore.ieee.org');
    const crossrefUrl = new URL(requests[1].url);
    assert.equal(crossrefUrl.hostname, 'api.crossref.org');
    assert.equal(decodeURIComponent(crossrefUrl.pathname), `/works/${crossrefWork.DOI}`);
    assert.equal(crossrefUrl.searchParams.has('query.bibliographic'), false);
  });
});

test('an Xplore challenge page is not imported as a paper or used for fuzzy search', async () => {
  await withCitationDocument({}, async () => {
    const requests = mockRequests({ status: 200, text: '<html><h1>Sign in</h1></html>' });
    await assert.rejects(searchIEEE('ieee:1234567'), error => {
      assert.match(error.message, /DOI/i);
      assert.match(error.message, /API\s*key/i);
      return true;
    });
    assert.equal(requests.length, 1);
  });
});

test('metadata for a different canonical Xplore article is rejected', async () => {
  await withCitationDocument({
    citation_title: ['A different paper'], citation_doi: [crossrefWork.DOI],
  }, async () => {
    const requests = mockRequests({ status: 200, text: '<html></html>' });
    await assert.rejects(searchIEEE('ieee:1234567'));
    assert.equal(requests.length, 1);
  }, 'https://ieeexplore.ieee.org/document/9999999');
});

for (const [name, query, key] of [
  ['Crossref', 'robot mapping', ''],
  ['IEEE API', 'robot mapping', 'test-key'],
]) {
  test(`${name} does not report network failures as no results`, async () => {
    const requests = mockRequests(new Error('Connection unavailable'));
    await assert.rejects(searchIEEE(query, key));
    assert.equal(requests.length, 1);
  });

  for (const status of [401, 403, 429, 500]) {
    test(`${name} reports HTTP ${status} failures`, async () => {
      mockRequests(jsonResponse({}, status));
      await assert.rejects(searchIEEE(query, key));
    });
  }

  test(`${name} reports invalid successful response bodies`, async () => {
    mockRequests(jsonResponse({ unexpected: 'invalid response' }));
    await assert.rejects(searchIEEE(query, key));
  });
}
