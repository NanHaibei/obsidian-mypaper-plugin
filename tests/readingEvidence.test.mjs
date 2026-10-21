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
