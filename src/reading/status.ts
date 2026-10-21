import type { ReadingJob } from './jobs';

/** Time since real protocol activity, not a fabricated completion percentage. */
export function readingStatusText(job: ReadingJob, now = Date.now()): string {
  if (job.status === 'failed') return `未完成：${job.error || '请从更多操作中重试'}`;
  if (job.status === 'queued') return '阅读笔记排队中';
  if (job.status !== 'running') return job.phase || job.status;
  const phase = job.phase || '等待模型响应';
  if (!job.startedAt) return phase;
  const elapsed = Math.max(0, Math.floor((now - job.startedAt) / 1000));
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const silence = Math.max(0, Math.floor((now - (job.lastActivityAt || job.startedAt)) / 1000));
  const activity = silence >= 30 ? ` · ${silence} 秒未收到新进展` : '';
  return `${phase} · 已用 ${duration}${activity}`;
}
