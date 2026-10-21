import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const bundle=await build({entryPoints:['src/reading/config.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
function load(process,home){const module={exports:{}};vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,process,require:n=>n==='os'?{homedir:()=>home}:require(n)});return module.exports;}
test('Windows npm installations resolve the native executable without enabling a shell',async()=>{
 const home=await mkdtemp(path.join(tmpdir(),'paper-windows-'));
 try{
  const npm=path.join(home,'AppData/npm');await mkdir(npm,{recursive:true});await writeFile(path.join(npm,'codex.cmd'),'npm wrapper');
  const binary=path.join(npm,'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');await mkdir(path.dirname(binary),{recursive:true});await writeFile(binary,'native fixture');
  const {resolveCodexExecutable}=load({platform:'win32',arch:'x64',env:{PATH:npm}},home);
  assert.equal(resolveCodexExecutable('codex'),binary);
 }finally{await rm(home,{recursive:true,force:true});}
});
test('a user-provided absolute executable is retained even outside the GUI PATH',async()=>{
 const home=await mkdtemp(path.join(tmpdir(),'paper-binary-'));
 try{const exe=path.join(home,'custom codex');await writeFile(exe,'fixture');const {resolveCodexExecutable}=load({platform:'linux',arch:'x64',env:{PATH:''}},home);assert.equal(resolveCodexExecutable(exe),exe);}
 finally{await rm(home,{recursive:true,force:true});}
});
