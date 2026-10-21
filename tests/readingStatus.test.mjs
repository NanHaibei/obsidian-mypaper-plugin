import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['src/reading/status.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {readingStatusText}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('running status shows elapsed time and honest silence without claiming progress',()=>{
 const job={status:'running',phase:'生成阅读笔记正文',startedAt:1000,lastActivityAt:21000};
 assert.equal(readingStatusText(job,26000),'生成阅读笔记正文 · 已用 0:25');
 assert.equal(readingStatusText(job,61000),'生成阅读笔记正文 · 已用 1:00 · 40 秒未收到新进展');
});
test('failure reason is visible inline instead of hidden behind a tooltip',()=>{
 assert.equal(readingStatusText({status:'failed',phase:'未完成，可重试',error:'模型服务繁忙'}),'未完成：模型服务繁忙');
 assert.equal(readingStatusText({status:'completed',phase:'阅读笔记已完成'}),'阅读笔记已完成');
});
test('long model diagnostics stay intact in the job but do not fill the entire paper row',()=>{
 const error='PDF 原文有未编号图表，缺少合法表示方式。'.repeat(50);const job={status:'failed',error};
 const label=readingStatusText(job);assert.ok(label.length<150);assert.match(label,/查看详情/);assert.equal(job.error,error);
});
