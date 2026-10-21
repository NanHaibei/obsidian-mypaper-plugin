import type { DataAdapter } from 'obsidian';
import type { PaperInfo } from '../types';
import type { ReadingSettings } from './config';
import type { ReadingResult } from './result';
import type { PaperSource } from './context';

export interface ReadingJob {
  id: string;
  path: string;
  paper: PaperInfo;
  choice: Pick<ReadingSettings, 'model' | 'effort'>;
  status: 'queued' | 'running' | 'failed' | 'completed' | 'cancelled';
  phase?: string;
  error?: string;
  deleted?: boolean;
  result?: ReadingResult;
  source?: PaperSource;
  written?: string;
  writeBaseHash?: string;
  threadId?: string;
  attempt?: number;
  repairAttempts?: number;
  repairs?: string[];
  startedAt?: number;
  lastActivityAt?: number;
}

export class ReadingJobStore {
  private writes: Promise<void> = Promise.resolve();
  constructor(private adapter: DataAdapter, private path: string) {}
  async load(): Promise<ReadingJob[]> {
    const pending = `${this.path}.tmp`;
    const source = await this.adapter.exists(pending) ? pending : this.path;
    if (!await this.adapter.exists(source)) return [];
    const value: unknown = JSON.parse(await this.adapter.read(source));
    if (!Array.isArray(value) || value.some(j => !j || typeof j.id !== 'string' || !/^[a-z0-9-]+$/.test(j.id) ||
      typeof j.path !== 'string' || (j.attempt != null && (!Number.isSafeInteger(j.attempt) || j.attempt < 1)) || !j.paper || typeof j.paper.title !== 'string' ||
      !j.choice || typeof j.choice.model !== 'string' || typeof j.choice.effort !== 'string' ||
      !['queued', 'running', 'failed', 'completed', 'cancelled'].includes(j.status))) throw new Error('论文任务记录损坏，已保留原文件');
    if (source === pending) await this.save(value as ReadingJob[]);
    return value as ReadingJob[];
  }
  save(jobs: ReadingJob[]): Promise<void> {
    const snapshot = JSON.stringify(jobs, null, 2);
    this.writes = this.writes.catch(() => {}).then(async () => {
      await this.adapter.write(`${this.path}.tmp`, snapshot);
      await this.adapter.write(this.path, snapshot);
      if (await this.adapter.read(this.path) !== snapshot) throw new Error('任务保存校验失败');
      await this.adapter.remove(`${this.path}.tmp`);
    });
    return this.writes;
  }
}

export function canonicalPaperId(paper: PaperInfo): string {
  const arxiv = paper.arxivId || paper.url?.match(/arxiv\.org\/(?:abs|pdf|html)\/([^?#]+)/i)?.[1];
  if (arxiv) return 'arxiv:' + arxiv.replace(/^https?:\/\/[^/]+\/(?:abs|pdf|html)\//, '').replace(/\.pdf$/, '').replace(/v\d+$/, '').toLowerCase();
  if (paper.doi) return 'doi:' + paper.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase();
  return 'title:' + paper.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
