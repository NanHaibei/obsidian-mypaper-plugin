import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const b=await build({entryPoints:['src/reading/taskFiles.ts'],bundle:true,write:false,platform:'node',format:'cjs'});const module={exports:{}};vm.runInNewContext(b.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url)});
test('a model-created destination symlink cannot redirect host recovery writes',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'paper-task-write-'));
 try{const outside=path.join(directory,'preserve.txt');await writeFile(outside,'original');await symlink(outside,path.join(directory,'recovery-input.json'));await module.exports.writeTaskJson(directory,'recovery-input.json',{issues:['test']});assert.equal(await readFile(outside,'utf8'),'original');assert.deepEqual(JSON.parse(await readFile(path.join(directory,'recovery-input.json'),'utf8')),{issues:['test']});}
 finally{await rm(directory,{recursive:true,force:true});}
});
