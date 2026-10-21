import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const chapterNames = ['问题背景', '现有工作的问题与论文动机', '论文方法', '实验结果', '方法缺陷与未来工作'];
const result = () => ({ complete: true, markdown: chapterNames.map((s, i) => `## ${i+1}. ${s}✦\n\n完整解释。✦${i===2?'\n\n{{asset:Figure 1}}':''}`).join('\n\n'),
 assets:[{id:'Figure 1',path:'figures/fig1.png',captionSource:'Figure 1: Framework.',captionChinese:'图 1：框架。',page:1}],sourceInventory:['Figure 1'],missing:[] });
const source = {url:'https://arxiv.org/pdf/1706.03762',text:'Figure 1: Framework.',pageCount:1,captions:['Figure 1']};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=','base64');
class TFile {constructor(p){this.path=p;this.basename=path.basename(p,'.md');this.content='## 笔记\n我写的想法\n';this.parent={path:path.dirname(p)};}}
class Adapter {constructor(base){this.base=base;}getBasePath(){return this.base;}async exists(p){return !!await import('node:fs/promises').then(fs=>fs.access(path.join(this.base,p)).then(()=>true,()=>false));}async write(p,s){await mkdir(path.dirname(path.join(this.base,p)),{recursive:true});await writeFile(path.join(this.base,p),s);}async read(p){return readFile(path.join(this.base,p),'utf8');}async remove(p){await rm(path.join(this.base,p));}async writeBinary(p,b){await this.write(p,Buffer.from(b));}}
async function setup(runner,beforeLoad) {
 const base=await mkdtemp(path.join(tmpdir(),'paper-reading-service-'));const dir='.obsidian/plugins/test';
 await mkdir(path.join(base,dir,'skills/write-obsidian-paper-notes'),{recursive:true});await writeFile(path.join(base,dir,'skills/write-obsidian-paper-notes/SKILL.md'),'test skill');
 const files=new Map(),handlers={},cleanup=[];const host={settings:{workspaceFolder:'Papers',paperReading:{executable:'codex',proxyUrl:'',model:'first-model',effort:'high',timeoutMinutes:1}},manifest:{id:'test',dir},register:f=>cleanup.push(f),registerEvent(){},addCommand(){},app:{workspace:{onLayoutReady(){}},vault:{adapter:new Adapter(base),configDir:'.obsidian',on:(n,f)=>{handlers[n]=f;},getAbstractFileByPath:p=>files.get(p),read:async f=>f.content,process:async(f,fn)=>{f.content=fn(f.content);}}}};
 const bundle=await build({entryPoints:['src/reading/service.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian'],plugins:[{name:'mock-materials',setup(b){b.onResolve({filter:/^\.\/context$/},()=>({path:'context',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const checkCropRuntime=async()=>"python3";export const preparePaperSource=globalThis.prepare;export const collectStyleSamples=async()=>[];export const vaultBase=v=>v.adapter.getBasePath();export const copySkill=async()=>{};'}));b.onResolve({filter:/^\.\/runner$/},()=>({path:'runner',namespace:'runner'}));b.onLoad({filter:/.*/,namespace:'runner'},()=>({contents:'export const runReadingSkill=globalThis.runner;'}));}}]});
 const module={exports:{}};let prepared=0;
 vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,process,URL,Blob,AbortController,console,setInterval,clearInterval,
 createImageBitmap:async()=>({width:1,height:1,close(){}}),
 require:n=>n==='obsidian'?{TFile,FileSystemAdapter:Adapter,Notice:class{},Platform:{isDesktopApp:true},getFrontMatterInfo:()=>({exists:false}),parseYaml:()=>({})}:require(n),
 prepare:async(_paper,cwd)=>{prepared++;await mkdir(path.join(cwd,'figures'),{recursive:true});await writeFile(path.join(cwd,'source-text.json'),'{}');await writeFile(path.join(cwd,'figures/fig1.png'),png);return {...source};},runner});
 if(beforeLoad)await beforeLoad({base,dir,host,files});
 const reading=new module.exports.PaperReading(host);
 return {reading,host,handlers,files,base,get prepared(){return prepared;},add(p){const f=new TFile(p);files.set(p,f);return f;},async dispose(){cleanup.forEach(f=>f());await rm(base,{recursive:true,force:true});}};
}
async function until(predicate){for(let i=0;i<400;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Queue did not reach expected state');}
const paper=(title,id)=>({title,authors:['Author'],arxivId:id,field:'Locomotion'});

test('queue is serial, freezes each model, deduplicates DOI/arXiv identity, follows rename and preserves human edits',async()=>{
 const waits=[],chosen=[];const h=await setup((settings)=>{chosen.push(settings.model);return new Promise(resolve=>waits.push(resolve));});
 try{
 const first=h.add('Papers/Unread/one.md'),second=h.add('Papers/Unread/two.md');
 await h.reading.enqueue(first,paper('one','1706.03762v1'));await h.reading.enqueue(first,paper('renamed title','1706.03762v2'));
 await h.reading.enqueue(second,paper('two','2401.00001'),{model:'second-model',effort:'medium'});
 h.host.settings.paperReading.model='later-global-model';await until(()=>waits.length===1);
 h.files.delete(first.path);const old=first.path;first.path='Papers/Read/moved.md';h.files.set(first.path,first);h.handlers.rename(first,old);first.content+='生成时补充的手写笔记\n';
 waits[0](result());await until(()=>waits.length===2);waits[1](result());await until(()=>h.reading.jobs.every(j=>j.status==='completed'));
 assert.deepEqual(chosen,['first-model','second-model']);assert.equal(h.reading.jobs.length,2);assert.match(first.content,/生成时补充的手写笔记/);assert.doesNotMatch(first.content,/AI 论文精读导师/);
 assert.equal(h.reading.jobs[0].path,first.path);await h.reading.enqueue(first,paper('one','1706.03762v1'));assert.equal(chosen.length,2);
 }finally{await h.dispose();}
});
test('write failure retains result and retry writes it without a second inference call',async()=>{
 let calls=0;const h=await setup(async()=>{calls++;return result();});
 try{
 const file=h.add('Papers/Unread/one.md'),original=h.host.app.vault.process;h.host.app.vault.process=async()=>{throw Error('write failed');};
 await h.reading.enqueue(file,paper('one','1706.03762'));await until(()=>h.reading.jobs[0].status==='failed');assert.ok(h.reading.jobs[0].result);
 h.host.app.vault.process=original;await h.reading.retryFailed();await until(()=>h.reading.jobs[0].status==='completed');assert.equal(calls,1);assert.match(file.content,/图 1：框架。✦/);
 }finally{await h.dispose();}
});
test('deletion and cancellation never write to a replacement file at the same path',async()=>{
 let finish;const h=await setup(()=>new Promise(resolve=>{finish=resolve;}));
 try{
 const first=h.add('Papers/Unread/one.md');await h.reading.enqueue(first,paper('one','1706.03762'));await until(()=>finish);
 h.files.delete(first.path);h.handlers.delete(first);const replacement=h.add(first.path);finish(result());await until(()=>h.reading.jobs[0].status==='cancelled');
 assert.equal(replacement.content,'## 笔记\n我写的想法\n');await h.reading.retryFailed();assert.equal(h.reading.jobs[0].status,'cancelled');
 }finally{await until(()=>!h.reading.running);await h.dispose();}
});
test('validation issues are repaired automatically without downloading or generating the whole paper again',async()=>{
 let calls=0;const recoveryFlags=[];const h=await setup(async(_settings,_dir,_skill,_signal,_progress,recovery)=>{recoveryFlags.push(!!recovery);calls++;const output=result();if(calls===1)output.markdown=output.markdown.replace('## 1. 问题背景✦','## 1. 问题背景');return output;});
 try{
 const file=h.add('Papers/Unread/one.md');await h.reading.enqueue(file,paper('one','1706.03762'));
 await until(()=>h.reading.jobs[0].status==='completed');const job=h.reading.jobs[0];
 const runtime=path.join(h.base,h.host.manifest.dir,'paper-reading-runtime',`${job.id}-attempt-${job.attempt}`);
 assert.ok((await readFile(path.join(runtime,'rejected-result.json'),'utf8')).includes('问题背景'));
 const feedback=JSON.parse(await readFile(path.join(runtime,'recovery-input.json'),'utf8'));assert.ok(feedback.issues.length>=2);
 assert.equal(calls,2);assert.deepEqual(recoveryFlags,[false,true]);assert.equal(h.prepared,1);assert.equal(job.repairAttempts,1);
 }finally{await h.dispose();}
});
test('failed automatic correction stops once, retains the draft and can later write cached results without inference',async()=>{
 let calls=0;const h=await setup(async()=>{calls++;const output=result();output.assets[0].captionSource='Invented caption';return output;});
 try{
 const file=h.add('Papers/Unread/one.md');await h.reading.enqueue(file,paper('one','1706.03762'));
 await until(()=>h.reading.jobs[0].status==='failed');const job=h.reading.jobs[0];
 assert.equal(calls,2);assert.equal(job.repairAttempts,1);assert.ok(job.result);assert.match(job.error,/自动核对后/);
 assert.equal(file.content,'## 笔记\n我写的想法\n');
 job.result.assets[0].captionSource='Figure 1: Framework.';await h.reading.retryFailed();
 await until(()=>job.status==='completed');assert.equal(calls,2);assert.equal(h.prepared,1);
 }finally{await h.dispose();}
});

test('missing asset files are automatically corrected before any note body is written',async()=>{
 let calls=0;const h=await setup(async()=>{calls++;const output=result();if(calls===1)output.assets[0].path='figures/missing.png';return output;});
 try{const file=h.add('Papers/Unread/one.md');await h.reading.enqueue(file,paper('one','1706.03762'));await until(()=>h.reading.jobs[0].status==='completed');assert.equal(calls,2);assert.equal(h.prepared,1);assert.match(file.content,/图 1：框架。✦/);}
 finally{await h.dispose();}
});

test('old rejected drafts are recovered on load and written without another model call',async()=>{
 let calls=0;const h=await setup(async()=>{calls++;throw Error('Must reuse cached draft');},async({base,dir,host,files})=>{
  files.set('Papers/Unread/one.md',new TFile('Papers/Unread/one.md'));
  await host.app.vault.adapter.write(dir+'/paper-reading-jobs.json',JSON.stringify([{id:'legacy',path:'Papers/Unread/one.md',paper:paper('one','1706.03762'),choice:{model:'first-model',effort:'high'},status:'failed',error:'Legacy caption failure',source}]));
  const runtime=path.join(base,dir,'paper-reading-runtime/legacy');await mkdir(path.join(runtime,'figures'),{recursive:true});await writeFile(path.join(runtime,'rejected-result.json'),JSON.stringify(result()));await writeFile(path.join(runtime,'source-text.json'),JSON.stringify({pages:[{text:source.text}]}));await writeFile(path.join(runtime,'figures/fig1.png'),png);
 });
 try{await h.reading.ready;assert.ok(h.reading.jobs[0].result);await h.reading.retryFailed();await until(()=>h.reading.jobs[0].status==='completed');assert.equal(calls,0);assert.equal(h.prepared,0);}
 finally{await h.dispose();}
});
