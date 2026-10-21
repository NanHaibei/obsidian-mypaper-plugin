import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian'] });
  const module = { exports: {} };
  vm.runInNewContext(out.outputFiles[0].text, { module, exports: module.exports, require, URL, process, console });
  return module.exports;
}
const { validateReadingNote, renderReadingNote, appendReadingNote, noteHash } = await load('src/reading/noteContent.ts');
const { normalizeReadingSettings } = await load('src/reading/config.ts');
const { canonicalPaperId, ReadingJobStore } = await load('src/reading/jobs.ts');
const { parseReadingResult } = await load('src/reading/result.ts');
const titles = ['问题背景', '现有工作的问题与论文动机', '论文方法', '实验结果', '方法缺陷与未来工作'];
export const validResult = () => ({ complete: true, markdown: titles.map((t, i) => `## ${i + 1}. ${t}✦\n\n解释对应问题与证据。✦${i === 2 ? '\n\n{{asset:Figure 1}}\n\n$$\nx_{t}=q^{*}\n$$' : ''}`).join('\n\n'),
  assets: [{ id: 'Figure 1', path: 'figures/fig1.png', captionSource: 'Figure 1: Original framework.', captionChinese: '图 1：原始框架。', page: 1 }], sourceInventory: ['Figure 1'], missing: [] });
export const source = { url: 'https://arxiv.org/pdf/1706.03762', text: 'Figure 1: Original framework.', pageCount: 1, captions: ['Figure 1'] };

test('unnumbered originals without captions retain explicit AI explanations and page-specific evidence',()=>{
 const r=validResult(),id='Table (unnumbered, page 2)';
 r.assets.push({id,path:'figures/table-no-caption.png',captionSource:'',captionChinese:'第 2 页未编号表（原文无独立表注；以下为 AI 说明）：模型结果。',page:2,captionStatus:'absent',sourceExcerpt:'Network capacity and model scaling results.'});
 r.sourceInventory.push(id);r.markdown+=`\n\n{{asset:${id}}}`;
 const s={...source,pageCount:2,pageTexts:[source.text,'Network capacity and model scaling results. Reward Goal Tracking'],text:source.text+'\nNetwork capacity and model scaling results.'};
 assert.doesNotThrow(()=>validateReadingNote(r,s));
 const check=mutate=>{const bad=structuredClone(r);mutate(bad.assets[1]);assert.throws(()=>validateReadingNote(bad,s));};
 check(a=>a.sourceExcerpt='Invented evidence about model scaling results.');
 check(a=>a.page=1);check(a=>a.id='Table (unnumbered, page 0)');
 check(a=>a.captionSource='A made-up original caption.');
 check(a=>a.captionChinese='第 2 页未编号表：模型结果。');
 check(a=>a.captionStatus=undefined);check(a=>a.sourceExcerpt='Results.');
 assert.throws(()=>validateReadingNote(r,{...s,pageTexts:undefined}),/原文定位片段/);
 const disguised=structuredClone(r);disguised.assets.shift();disguised.markdown=disguised.markdown.replace('{{asset:Figure 1}}','');
 assert.throws(()=>validateReadingNote(disguised,s),/Figure 1/);
});
test('an unnumbered original with a real caption still requires the original caption to match',()=>{
 const r=validResult(),id='Figure (unnumbered, page 1, item 2)';
 r.assets.push({id,path:'figures/unnum.png',captionSource:'Original environment layout.',captionChinese:'第 1 页未编号图：原始环境布局。',page:1,captionStatus:'present',sourceExcerpt:''});
 r.markdown+=`\n\n{{asset:${id}}}`;r.sourceInventory.push(id);
 const s={...source,text:source.text+'\nOriginal environment layout.'};
 assert.doesNotThrow(()=>validateReadingNote(r,s));r.assets[1].captionSource='Invented environment layout.';
 assert.throws(()=>validateReadingNote(r,s),/原始图注/);
});
test('structurally valid incomplete drafts are retained but can never be written as completed',()=>{
 const r=validResult();r.complete=false;r.missing=['The PDF cannot be accessed.'];
 const parsed=parseReadingResult(JSON.stringify(r));assert.equal(parsed.complete,false);
 assert.throws(()=>validateReadingNote(parsed,source),/The PDF cannot be accessed/);
 r.assets[0].captionStatus='unknown';assert.throws(()=>parseReadingResult(JSON.stringify(r)),/格式无效/);
});
test('original code listing numbers and captions are preserved rather than relabelled as algorithms',()=>{
 const r=validResult();r.assets.push({id:'Listing I',path:'figures/listing.png',page:1,captionSource:'Listing I: Python-like pseudocode (simplified).',captionChinese:'代码清单 I：类 Python 伪代码（简化版）。'});
 r.sourceInventory.push('Listing 1');r.markdown+='\n\n{{asset:Listing I}}';
 const s={...source,text:source.text+'\nListing I: Python-like pseudocode (simplified).',captions:['Figure 1','Listing I']};
 assert.doesNotThrow(()=>validateReadingNote(r,s));r.assets[1].captionSource='Listing I: Optimized Python code.';
 assert.throws(()=>validateReadingNote(r,s),/原始图注/);
});

test('settings migration keeps connection/model choices and removes the old prompt, switch and format', () => {
  const settings = normalizeReadingSettings({ model: 'chosen', effort: 'high', proxyUrl: 'http://localhost:7890',
    enabled: false, promptTemplate: 'Legacy robotics prompt', noteFormatVersion: 2 });
  assert.equal(settings.model, 'chosen'); assert.equal(settings.proxyUrl, 'http://localhost:7890');
  assert.equal(settings.promptTemplate, undefined); assert.equal(settings.enabled, undefined); assert.equal(settings.noteFormatVersion, undefined);
});
test('notes preserve human text, have no AI wrapper, and recover idempotently after a write', () => {
  const result = validResult(); validateReadingNote(result, source);
  const rendered = renderReadingNote(result, new Map([['Figure 1', 'Paper/manager/AI论文图片/job/fig1.png']]));
  assert.match(rendered, /!\[\[Paper\/manager\/AI论文图片\/job\/fig1.png\]\]\n\n图 1：原始框架。✦/);
  const original = '---\ntitle: Example\n---\n## 笔记\n我写的原始想法。\n';
  const output = appendReadingNote(original, rendered, noteHash(original));
  assert.ok(output.startsWith(original.trimEnd())); assert.doesNotMatch(output, /AI 论文精读导师|<!--/);
  assert.equal(appendReadingNote(output, rendered, 'old hash'), output);
  assert.throws(() => appendReadingNote(original + 'New edit', rendered, noteHash(original)), /已变化/);
  assert.doesNotMatch(appendReadingNote('Metadata\n## 笔记\n\n', rendered), /## 笔记/);
});
test('unmarked blocks, external media, malformed math, missing chapters and uncovered figures cannot be completed', () => {
  for (const mutate of [
    r => { r.markdown = r.markdown.replace('解释对应问题与证据。✦', 'Unmarked paragraph'); },
    r => { r.markdown += '\n\n![image](https://example.com/image.png)✦'; },
    r => { r.markdown = r.markdown.replace('x_{t}', 'x_t'); },
    r => { r.markdown = r.markdown.replace('1. 问题背景', '1. 摘要'); },
    r => { r.assets[0].path = '../outside.png'; },
    r => { r.assets[0].captionSource = 'Fabricated caption'; },
    r => { r.markdown = r.markdown.replace('{{asset:Figure 1}}', ''); },
    r => { r.sourceInventory.push('Table 2'); },
  ]) { const result = validResult(); mutate(result); assert.throws(() => validateReadingNote(result, source)); }
  assert.throws(() => validateReadingNote(validResult(), { ...source, captions: ['Figure 1', 'Table 3'] }), /Table 3/);
});
test('simple generated tables require an independent marker, while formulas remain clean', () => {
  const result = validResult(); result.markdown += '\n\n|A|B|\n|---|---|\n|1|2|\n\n✦';
  assert.doesNotThrow(() => validateReadingNote(result, source));
  result.markdown = result.markdown.replace(/\n\n✦$/, '');
  assert.throws(() => validateReadingNote(result, source), /简单表格/);
});
test('identity normalizes arXiv versions and DOI spelling, without treating similar titles as the same ID', () => {
  assert.equal(canonicalPaperId({ title: 'A', arxivId: '1706.03762v3' }), canonicalPaperId({ title: 'B', url: 'https://arxiv.org/abs/1706.03762v1' }));
  assert.equal(canonicalPaperId({ title: 'A', doi: 'https://doi.org/10.TEST/AbC' }), 'doi:10.test/abc');
});
test('job snapshots retain a per-paper model and recover a pending write without corrupting prior state', async () => {
  const files = new Map(); const adapter = { exists: async p => files.has(p), read: async p => files.get(p),
    write: async (p, s) => files.set(p, s), remove: async p => files.delete(p) };
  const store = new ReadingJobStore(adapter, 'jobs.json');
  const jobs = [{ id: 'a', path: 'A.md', paper: { title: 'A' }, choice: { model: 'first', effort: 'high' }, status: 'queued' }];
  await store.save(jobs); jobs[0].status = 'running';
  files.set('jobs.json.tmp', JSON.stringify(jobs));
  const recovered = await store.load();
  assert.equal(recovered[0].choice.model, 'first'); assert.equal(recovered[0].status, 'running'); assert.equal(files.has('jobs.json.tmp'), false);
  files.set('jobs.json', '[{}]'); await assert.rejects(store.load(), /损坏/);
});

test('original Roman table numbers remain valid and match an Arabic inventory label',()=>{
 const result=validResult();result.markdown+='\n\n{{asset:Table I}}';
 result.assets.push({id:'Table I',path:'figures/table-1.png',captionSource:'TABLE I: Training configurations.',captionChinese:'表 I：训练配置。',page:1});
 result.sourceInventory.push('Table 1');
 const original={...source,text:source.text+'\nTABLE I: Training configurations.',captions:['Figure 1','Table I']};
 assert.doesNotThrow(()=>validateReadingNote(result,original));
 result.assets.pop();assert.throws(()=>validateReadingNote(result,original),/原文图表未收录/);
});

test('PDF-flattened subscripts match caption text, while changed caption words still fail',()=>{
 const result=validResult();result.assets[0].captionSource='Figure 1: Loss L_denoise.';
 const original={...source,text:'Figure 1: Loss L denoise.'};
 assert.doesNotThrow(()=>validateReadingNote(result,original));
 result.assets[0].captionSource='Figure 1: Improved loss L_denoise.';
 assert.throws(()=>validateReadingNote(result,original),/原始图注/);
});
test('formula formatting is checked in translated captions as well as the body',()=>{
 const result=validResult();result.assets[0].captionChinese='图 1：状态 $x_t$。';
 assert.throws(()=>validateReadingNote(result,source),/上下标/);
});

test('original algorithms and supplementary figure numbers are supported without relabelling',()=>{
 const result=validResult();const captions=['Algorithm 1: Pre-training.','Figure A.1: Additional evidence.'];
 for(const [i,id] of ['Algorithm 1','Figure A.1'].entries()){result.assets.push({id,path:`figures/extra${i}.png`,page:1,captionSource:captions[i],captionChinese:`${id}：补充说明。`});result.sourceInventory.push(id);result.markdown+=`\n\n{{asset:${id}}}`;}
 assert.doesNotThrow(()=>validateReadingNote(result,{...source,text:source.text+'\n'+captions.join('\n')}));
});
test('validation reports multiple independent problems in a single review',()=>{
 const result=validResult();result.assets[0].captionSource='Invented caption';result.markdown=result.markdown.replace('x_{t}','x_t');
 assert.throws(()=>validateReadingNote(result,source),error=>error.issues.some(x=>x.includes('原始图注'))&&error.issues.some(x=>x.includes('上下标')));
});
