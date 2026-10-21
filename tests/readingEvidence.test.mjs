import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({entryPoints:['src/reading/captionEvidence.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {captionMatchesSource,normalizeReadingResult}=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
const asset={id:'Figure 9(a)',page:1,captionSource:'Figure 9: Latent space visualization and analysis. (a) Tracking trajectories segment the latent space (2D).'};
const original='(a) Tracking trajectories segment the\nlatent space (2D). (b) Representative latents (3D).\nFigure 9: Latent space visualization and analysis.';
test('a common caption and its genuine panel label match regardless of extraction order',()=>{
 assert.equal(captionMatchesSource(asset,{text:original,pageTexts:[original]}),true);
 assert.equal(captionMatchesSource({...asset,id:'Figure 9(b)',captionSource:asset.captionSource.replace('(a)','(b)')},{text:original,pageTexts:[original]}),false);
 assert.equal(captionMatchesSource({...asset,captionSource:asset.captionSource.replace('segment','improve')},{text:original,pageTexts:[original]}),false);
 assert.equal(captionMatchesSource({...asset,captionSource:asset.captionSource.replace('Figure 9:','Figure 90:')},{text:original.replace('Figure 9:','Figure 90:'),pageTexts:[original.replace('Figure 9:','Figure 90:')]}),false);
});
test('caption evidence is checked on the declared page, not against arbitrary text elsewhere',()=>{
 assert.equal(captionMatchesSource(asset,{text:original,pageTexts:['An unrelated page.',original]}),false);
});
test('mathematical minus signs and extracted ellipses normalize without changing quantities',()=>{
 const a={id:'Table 2',page:1,captionSource:'Table 2: o_{t,H} = {o_{t-H}, a_{t-H}, ..., o_t}. 100 steps.'};
 const source={text:'Table 2: o t,H = {o t−H, a t−H, . . . , o t}. 100 steps.'};
 assert.equal(captionMatchesSource(a,source),true);
 assert.equal(captionMatchesSource({...a,captionSource:a.captionSource.replace('100','200')},source),false);
});
test('only overescaped inline caption commands are normalized, and this is idempotent',()=>{
 const r={assets:[{id:'Figure 3',captionChinese:'图 3：$E_{\\\\mathrm{mpjpe}}$。'}]};
 const fixed=normalizeReadingResult(r);assert.equal(fixed.result.assets[0].captionChinese,'图 3：$E_{\\mathrm{mpjpe}}$。');assert.equal(fixed.repairs.length,1);assert.deepEqual(normalizeReadingResult(fixed.result).repairs,[]);
});
test('PDF line-break hyphens accept compound words and discretionary wraps in the same caption',()=>{
 const text='Figure 17: A two-\ndimensional repre-\nsentation of 25 states.';
 const a={id:'Figure 17',page:1,captionSource:'Figure 17: A two-dimensional representation of 25 states.'};
 assert.equal(captionMatchesSource(a,{text,pageTexts:[text]}),true);
 assert.equal(captionMatchesSource({...a,captionSource:a.captionSource.replace('25','75')},{text}),false);
 assert.equal(captionMatchesSource({...a,captionSource:a.captionSource.replace('two-dimensional','three-dimensional')},{text}),false);
 assert.equal(captionMatchesSource({id:'Figure 1',page:1,captionSource:'Figure 1: We resign the policy.'},{text:'Figure 1: We re-sign the policy.'}),false);
 assert.equal(captionMatchesSource({...a,page:0},{text,pageTexts:[text]}),false);
});
test('inline drawing transcriptions are separated from text evidence only at actual PDF gaps',()=>{
 const text='Figure 5: Reach a target (star shape   ) avoiding forbidden positions (red shape   ).';
 const a={id:'Figure 5',page:1,captionSource:'Figure 5: Reach a target (star shape ★) avoiding forbidden positions (red shape ●).',captionChinese:'图 5：到达目标（星形 ★），避开禁止位置（红色圆点 ●）。'};
 const r={assets:[a]};const source={text,pageTexts:[text]};
 const fixed=normalizeReadingResult(r,source);
 assert.equal(captionMatchesSource(a,source),false);
 assert.equal(captionMatchesSource(fixed.result.assets[0],source),true);
 assert.equal(fixed.result.assets[0].captionChinese,a.captionChinese);
 assert.equal(fixed.repairs.length,1);
 assert.deepEqual(normalizeReadingResult(fixed.result,source).repairs,[]);
 for(const bad of [a.captionSource.replace('target','nearest target'),a.captionSource.replace('Figure 5','Figure 6')]) {
  assert.equal(normalizeReadingResult({assets:[{...a,captionSource:bad}]},source).repairs.length,0);
 }
 assert.equal(normalizeReadingResult({assets:[{...a,page:2}]},source).repairs.length,0);
 assert.equal(normalizeReadingResult({assets:[{...a,captionChinese:'图 5：目标。'}]},source).repairs.length,0);
 const inserted={...a,captionSource:'Figure 5: Fra★mework.',captionChinese:'图 5：框架 ★。'};
 assert.equal(normalizeReadingResult({assets:[inserted]},{text:'Figure 5: Framework.'}).repairs.length,0);
 // Mathematical operators are never treated as missing drawings.
 const math={...a,captionSource:'Figure 5: Value 25 + 75.',captionChinese:'图 5：25 + 75。'};
 assert.equal(normalizeReadingResult({assets:[math]},{text:'Figure 5: Value 25   75.'}).repairs.length,0);
});
