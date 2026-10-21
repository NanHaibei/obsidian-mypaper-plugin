import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const bundle=await build({entryPoints:['src/main.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian'],loader:{'.md':'text','.py':'text'}});
class TFile {constructor(file){this.path=file;this.basename='Fixture';}}
class Adapter {
 constructor(base){this.base=base;}
 getBasePath(){return this.base;}
 async exists(p){return readFile(path.join(this.base,p)).then(()=>true,()=>false);}
 async read(p){return readFile(path.join(this.base,p),'utf8');}
 async write(p,c){await mkdir(path.dirname(path.join(this.base,p)),{recursive:true});await writeFile(path.join(this.base,p),c);}
 async remove(p){await rm(path.join(this.base,p));}
}
test('production plugin can prepare a native Skill from a fresh standard three-file install',async()=>{
 const base=await mkdtemp(path.join(tmpdir(),'mypaper-fresh-'));
 const cleanup=[];const relative='.obsidian/plugins/obsidian-mypaper-plugin';const directory=path.join(base,relative);
 try{
  await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'main.js'),bundle.outputFiles[0].text);
  await writeFile(path.join(directory,'manifest.json'),await readFile('manifest.json'));await writeFile(path.join(directory,'styles.css'),'');
  class Plugin {
   constructor(app,manifest){this.app=app;this.manifest=manifest;}
   async loadData(){return {workspaceFolder:'Paper'};}
   register(fn){cleanup.push(fn);} registerEvent(){} addCommand(){} registerView(){} addRibbonIcon(){} addSettingTab(){}
  }
  const obsidian=new Proxy({Plugin,FileSystemAdapter:Adapter,TFile,Notice:class{},Platform:{isDesktopApp:true},
   requestUrl:async()=>{throw Error('Fixture prevents all network access');}}, {get:(target,key)=>key in target?target[key]:class{}});
  const module={exports:{}};
  vm.runInNewContext(await readFile(path.join(directory,'main.js'),'utf8'),{module,exports:module.exports,console,URL,process,AbortController,setInterval,clearInterval,setTimeout,clearTimeout,
   require:n=>n==='obsidian'?obsidian:n==='child_process'?{execFile:(_exe,_args,_options,callback)=>callback(null),spawn:()=>{throw Error('No model call may occur in an install test');}}:require(n)});
  const file=new TFile('Paper/Unread/Fixture.md');const app={vault:{adapter:new Adapter(base),configDir:'.obsidian',on(){},getAbstractFileByPath:()=>file},workspace:{onLayoutReady(){}}};
  const p=new module.exports.default(app,{id:'obsidian-mypaper-plugin',dir:relative});await p.onload();
  await p.paperReading.enqueue(file,{title:'Fixture',authors:[],arxivId:'1706.03762',field:'Locomotion'});
  for(let i=0;i<200&&p.paperReading.jobs[0].status!=='failed';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(p.paperReading.jobs[0].status,'failed');
  const task=path.join(directory,'paper-reading-runtime',`${p.paperReading.jobs[0].id}-attempt-${p.paperReading.jobs[0].attempt}`,'.agents/skills/write-obsidian-paper-notes');
  for(const name of ['SKILL.md','references/paper-teaching-guide.md','scripts/crop_figure.py'])assert.equal(await readFile(path.join(task,name),'utf8'),await readFile('skills/write-obsidian-paper-notes/'+name,'utf8'));
  assert.equal(await app.vault.adapter.exists(relative+'/skills/write-obsidian-paper-notes/SKILL.md'),false);
 }finally{cleanup.forEach(fn=>fn());await rm(base,{recursive:true,force:true});}
});
