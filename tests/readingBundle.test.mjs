import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const out=await build({entryPoints:['src/reading/skillBundle.ts'],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.md':'text','.py':'text'}});
const module={exports:{}};vm.runInNewContext(out.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url)});
test('a three-file plugin installation recreates the complete native Skill without a source checkout',async()=>{
 const cwd=await mkdtemp(path.join(tmpdir(),'paper-release-skill-'));
 try{
  const target=path.join(cwd,'.agents/skills/write-obsidian-paper-notes');
  await module.exports.writeBundledSkill(target);
  for(const name of ['SKILL.md','references/paper-teaching-guide.md','scripts/crop_figure.py']){
   assert.equal(await readFile(path.join(target,name),'utf8'),await readFile('skills/write-obsidian-paper-notes/'+name,'utf8'));
  }
 }finally{await rm(cwd,{recursive:true,force:true});}
});
