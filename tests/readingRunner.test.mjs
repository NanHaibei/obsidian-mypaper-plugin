import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const bundle = await build({ entryPoints: ['src/reading/runner.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const module = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require, process, URL, setTimeout, clearTimeout, console });
const { runReadingSkill } = module.exports;

test('native skill item, selected model, bounded filesystem and final JSON are carried through the RPC protocol', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'paper-reading-runner-'));
  const exe = path.join(dir, 'fake codex.cjs');
  await writeFile(exe, `#!${process.execPath}
const fs=require('fs'),rl=require('readline').createInterface({input:process.stdin});
rl.on('line', line=>{const m=JSON.parse(line);if(!m.id)return;
 const reply=r=>process.stdout.write(JSON.stringify({id:m.id,result:r})+'\\n');
 if(m.method==='initialize')reply({});
 if(m.method==='thread/start'){fs.writeFileSync('thread-request.json',JSON.stringify(m.params));reply({thread:{id:'thread-test'}});}
 if(m.method==='turn/start'){fs.writeFileSync('turn-request.json',JSON.stringify(m.params));reply({turn:{id:'turn-test'}});
 if(m.params.model==='hang')return;
 if(m.params.model==='bad'){process.stdout.write(JSON.stringify({method:'turn/completed',params:{turn:{status:'failed',error:{message:'model unavailable'}}}})+'\\n');return;}
 process.stdout.write(JSON.stringify({method:'item/reasoning/summaryTextDelta',params:{delta:'private reasoning is not displayed'}})+'\\n');
 process.stdout.write(JSON.stringify({method:'item/completed',params:{item:{type:'agentMessage',text:'已核对全文与全部图表，正在整理正文。'}}})+'\\n');
 const result={complete:true,markdown:'Final note',assets:[],sourceInventory:[],missing:[]};
 process.stdout.write(JSON.stringify({method:'item/completed',params:{item:{type:'agentMessage',text:JSON.stringify(result)}}})+'\\n');
 process.stdout.write(JSON.stringify({method:'turn/completed',params:{turn:{status:'completed'}}})+'\\n');
 }});
`); await chmod(exe, 0o755);
  const settings = { executable: exe, model: 'selected-model', effort: 'high', proxyUrl: '', timeoutMinutes: 1 };
  try {
    const phases=[];
    const result = await runReadingSkill(settings, dir, path.join(dir, 'SKILL.md'), new AbortController().signal, p => phases.push(p));
    assert.ok(phases.includes('按 Skill 整理正文与证据'));
    assert.ok(phases.includes('模型进展：已核对全文与全部图表，正在整理正文。'));
    assert.ok(phases.every(p=>!p.includes('complete')));
    assert.ok(phases.every(p=>!p.includes('private reasoning')));
    assert.equal(result.markdown, 'Final note'); assert.equal(result.threadId, 'thread-test');
    const turn = JSON.parse(await readFile(path.join(dir, 'turn-request.json'), 'utf8'));
    assert.equal(turn.input[1].type, 'skill'); assert.equal(turn.input[1].name, 'write-obsidian-paper-notes');
    assert.equal(turn.model, 'selected-model'); assert.equal(turn.effort, 'high');
    assert.deepEqual(turn.sandboxPolicy.writableRoots, [dir]); assert.equal(turn.sandboxPolicy.excludeSlashTmp, true);
    assert.ok(turn.outputSchema.required.includes('sourceInventory'));
    await runReadingSkill(settings, dir, path.join(dir, 'SKILL.md'), new AbortController().signal, () => {}, true);
    const recoveryTurn=JSON.parse(await readFile(path.join(dir, 'turn-request.json'),'utf8'));
    assert.match(recoveryTurn.input[0].text,/recovery-input.json/);assert.match(recoveryTurn.input[0].text,/不从零重写/);
    await assert.rejects(runReadingSkill({ ...settings, model: 'bad' }, dir, path.join(dir, 'SKILL.md'), new AbortController().signal, () => {}), /model unavailable/);
    const abort = new AbortController(); const pending = runReadingSkill({ ...settings, model: 'hang' }, dir, path.join(dir, 'SKILL.md'), abort.signal, () => {});
    setTimeout(() => abort.abort(), 80); await assert.rejects(pending, /取消/);
    await assert.rejects(runReadingSkill({ ...settings, model: 'hang', timeoutMinutes: .003 }, dir, path.join(dir, 'SKILL.md'), new AbortController().signal, () => {}), /超时/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
