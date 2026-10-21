import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const requestHook = '__mypaperSearchTestRequestUrl';

export async function loadSearchModule(relativePath, modules = {}) {
  const mocks = {
    obsidian: `export const requestUrl = (...args) => globalThis.${requestHook}(...args);`,
    ...modules,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [{
      name: 'mock-obsidian-requests',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
          ? { path: args.path, namespace: 'test-mock' }
          : undefined);
        build.onLoad({ filter: /.*/, namespace: 'test-mock' }, args => ({
          contents: mocks[args.path],
          resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

export function mockRequests(...responses) {
  const requests = [];
  globalThis[requestHook] = async options => {
    requests.push(typeof options === 'string' ? { url: options } : options);
    if (responses.length === 0) throw new Error('Unexpected extra network request');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  };
  return requests;
}

export function jsonResponse(json, status = 200) {
  return { status, json, text: JSON.stringify(json), headers: {}, arrayBuffer: new ArrayBuffer(0) };
}

export function crossrefResponse(items) {
  return jsonResponse({ status: 'ok', 'message-type': 'work-list', message: { items } });
}

// Node has no browser DOM. Supply already-parsed citation nodes for page tests;
// parsing arbitrary HTML remains the browser's responsibility.
export async function withCitationDocument(metadata, run, canonical) {
  const original = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelectorAll(selector) {
          const name = /^meta\[name="([^"]+)"\]$/.exec(selector)?.[1];
          return (metadata[name] ?? []).map(content => ({ getAttribute: () => content }));
        },
        querySelector(selector) {
          return selector === 'link[rel="canonical"]' && canonical
            ? { getAttribute: () => canonical }
            : null;
        },
      };
    }
  };
  try {
    return await run();
  } finally {
    if (original === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = original;
  }
}

export const crossrefWork = {
  DOI: '10.1109/TEST.2024.1234567',
  title: ['A &amp; B: Dense Mapping'],
  'container-title': ['IEEE Transactions on Robotics'],
  published: { 'date-parts': [[2024, 6, 7]] },
  author: [
    { given: 'Ada', family: 'Lovelace', affiliation: [{ name: 'Robotics Lab' }] },
    { given: 'Alan', family: 'Turing', affiliation: [{ name: 'Robotics Lab' }] },
  ],
  abstract: '<jats:p>A &amp; B use <jats:italic>maps</jats:italic>.</jats:p>',
  resource: { primary: { URL: 'https://ieeexplore.ieee.org/document/1234567' } },
  URL: 'https://doi.org/10.1109/TEST.2024.1234567',
};

export const ieeeArticle = {
  article_number: '1234567',
  title: 'Reliable SLAM',
  publication_title: 'IEEE Robotics and Automation Letters',
  publication_date: 'June 2024',
  publication_year: 2024,
  doi: '10.1109/TEST.2024.1234567',
  abstract: 'A robust mapping method.',
  html_url: 'https://ieeexplore.ieee.org/document/1234567',
  authors: { authors: [
    { full_name: 'Ada Lovelace', affiliation: 'Robotics Lab' },
    { full_name: 'Alan Turing', affiliation: 'Robotics Lab' },
  ] },
};
