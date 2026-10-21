import type { ReadingSettings } from './config';
import { codexEnvironment } from './codexEnvironment';

export interface MentorModel {
  model: string;
  displayName: string;
  description: string;
  defaultEffort: string;
  efforts: { value: string; description: string }[];
}

export function parseModelPage(value: unknown): { models: MentorModel[]; cursor: string | null } {
  const page = value as { data?: unknown; nextCursor?: unknown } | null;
  if (!page || !Array.isArray(page.data)) throw new Error('Codex 返回的模型列表格式无效');
  const models: MentorModel[] = [];
  for (const row of page.data) {
    if (!row || typeof row.model !== 'string' || !row.model.trim() || row.hidden === true) continue;
    // 精读任务会传入论文图片，不展示明确声明仅支持文字的模型。
    if (Array.isArray(row.inputModalities) && !row.inputModalities.includes('image')) continue;
    const efforts: MentorModel['efforts'] = [];
    for (const option of Array.isArray(row.supportedReasoningEfforts) ? row.supportedReasoningEfforts : []) {
      if (typeof option?.reasoningEffort !== 'string' || !option.reasoningEffort || efforts.some(e => e.value === option.reasoningEffort)) continue;
      efforts.push({ value: option.reasoningEffort, description: typeof option.description === 'string' ? option.description : '' });
    }
    models.push({ model: row.model, displayName: typeof row.displayName === 'string' && row.displayName ? row.displayName : row.model,
      description: typeof row.description === 'string' ? row.description : '',
      defaultEffort: typeof row.defaultReasoningEffort === 'string' ? row.defaultReasoningEffort : '', efforts });
  }
  if (page.nextCursor != null && typeof page.nextCursor !== 'string') throw new Error('Codex 返回的分页信息无效');
  return { models, cursor: page.nextCursor || null };
}

/** Only initialize and list models: never create a thread or submit paper content. */
export async function readModelCatalog(
  settings: Pick<ReadingSettings, 'executable' | 'proxyUrl'>, cwd: string, signal: AbortSignal,
): Promise<MentorModel[]> {
  if (signal.aborted) throw new Error('已取消读取模型');
  const { spawn } = require('child_process') as typeof import('child_process');
  const path = require('path') as typeof import('path');
  return new Promise((resolve, reject) => {
    const child = spawn(settings.executable, ['app-server', '--listen', 'stdio://',
      '-c', 'model_provider="openai"', '-c', 'analytics.enabled=false'], {
      cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32',
      env: { ...codexEnvironment(process.env, settings.proxyUrl),
        PATH: `${path.dirname(settings.executable)}${path.delimiter}${process.env.PATH || ''}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let done = false, pending = '', expectedId = 1;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const models = new Map<string, MentorModel>();
    const cursors = new Set<string>();
    const kill = (force: boolean) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
        else child.kill(force ? 'SIGKILL' : 'SIGTERM');
      } catch { /* Already exited. */ }
    };
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      child.stdin.end();
      kill(false);
      killTimer = setTimeout(() => kill(true), 1500);
      if (error) reject(error);
      else resolve([...models.values()]);
    };
    const abort = () => finish(new Error('已取消读取模型'));
    const timer = setTimeout(() => finish(new Error('读取模型超时，请检查 Codex 登录状态和网络代理后重试')), 30_000);
    const send = (message: object) => { if (!done) child.stdin.write(JSON.stringify(message) + '\n'); };
    const list = (cursor: string | null) => send({ id: ++expectedId, method: 'model/list', params: { cursor, limit: 100, includeHidden: false } });
    signal.addEventListener('abort', abort, { once: true });
    child.stdin.on('error', () => finish(new Error('Codex 连接已关闭，请检查 CLI 版本后重试')));
    child.on('error', () => finish(new Error('无法启动 Codex，请检查可执行文件路径及安装')));
    child.on('close', () => {
      finish(new Error('Codex 在返回模型前退出，请检查 CLI 版本、登录状态和网络代理'));
      if (killTimer) clearTimeout(killTimer);
    });
    // Drain diagnostics without exposing account data in the settings UI.
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (done) return;
      pending += chunk;
      if (pending.length > 2_000_000) { finish(new Error('Codex 模型响应超过大小限制')); return; }
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (done || !line.trim()) continue;
        let response;
        try { response = JSON.parse(line); } catch { continue; }
        if (!response || response.id !== expectedId || response.method) continue;
        if (response.error) { finish(new Error('Codex 无法读取模型，请检查 CLI 版本、登录状态和网络代理')); return; }
        if (expectedId === 1) {
          send({ method: 'initialized', params: {} });
          list(null);
          continue;
        }
        try {
          const page = parseModelPage(response.result);
          page.models.forEach(model => models.set(model.model, model));
          if (!page.cursor) {
            finish(models.size ? undefined : new Error('Codex 未返回支持论文图片的模型，请检查登录状态后刷新'));
          } else {
            if (cursors.has(page.cursor) || cursors.size >= 100) throw new Error('Codex 模型分页异常');
            cursors.add(page.cursor);
            list(page.cursor);
          }
        } catch (error) { finish(error instanceof Error ? error : new Error('读取模型失败')); }
      }
    });
    if (signal.aborted) abort();
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'mypaper_model_picker', version: '1.0.0' } } });
  });
}
