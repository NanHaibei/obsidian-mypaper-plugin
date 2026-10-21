import type { ReadingJob } from './jobs';
import type { ReadingResult } from './result';
import type { PaperSource } from './context';
import { normalizeReadingResult } from './captionEvidence';
import { collectReadingIssues, ReadingValidationError } from './noteContent';

export async function reviewReadingResult(job: ReadingJob, source: PaperSource, callbacks: {
  inspectAssets(result: ReadingResult): Promise<string[]>;
  preserve(result: ReadingResult, issues: string[]): Promise<void>;
  revise(result: ReadingResult, issues: string[]): Promise<ReadingResult>;
  persist(): Promise<void>;
  progress(message: string): void;
}): Promise<ReadingResult> {
  if (!job.result) throw new Error('缺少已生成的阅读草稿');
  for (;;) {
    const normalized = normalizeReadingResult(job.result, source);
    job.result = normalized.result;
    job.repairs = [...new Set([...(job.repairs || []), ...normalized.repairs])];
    const issues = [...new Set([...collectReadingIssues(job.result, source), ...await callbacks.inspectAssets(job.result)])];
    if (!issues.length) return job.result;
    await callbacks.preserve(job.result, issues);
    if ((job.repairAttempts || 0) >= 1) throw new ReadingValidationError(['自动核对后仍有无法确认的内容，草稿和图片已保留', ...issues]);
    job.repairAttempts = (job.repairAttempts || 0) + 1;
    await callbacks.persist();
    callbacks.progress(`正在自动核对并修复 ${issues.length} 项问题（1/1）`);
    // Preserve the original draft if the model service fails during correction.
    const corrected = await callbacks.revise(job.result, issues);
    job.result = corrected; job.threadId = corrected.threadId || job.threadId;
    await callbacks.persist();
  }
}
