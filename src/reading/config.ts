export interface ReadingSettings {
  executable: string;
  proxyUrl: string;
  model: string;
  effort: string;
  timeoutMinutes: number;
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  executable: 'codex', proxyUrl: '', model: '', effort: '', timeoutMinutes: 60,
};

/** Only migrate connection and model choices; discard the former teaching prompt. */
export function normalizeReadingSettings(value?: Partial<ReadingSettings>): ReadingSettings {
  const text = (v: unknown, fallback = '') => typeof v === 'string' ? v.trim() : fallback;
  return {
    executable: text(value?.executable, 'codex') || 'codex',
    proxyUrl: text(value?.proxyUrl), model: text(value?.model), effort: text(value?.effort),
    timeoutMinutes: typeof value?.timeoutMinutes === 'number' && Number.isFinite(value.timeoutMinutes)
      ? Math.min(180, Math.max(1, value.timeoutMinutes)) : 60,
  };
}

export function resolveCodexExecutable(configured: string): string {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const home = os.homedir();
  const directories = [...(process.env.PATH || '').split(path.delimiter),
    path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) directories.push(path.join(process.env.APPDATA, 'npm'));
    if (process.env.LOCALAPPDATA) directories.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
  }
  const candidates = [process.env.MYPAPER_CODEX_PATH || configured, ...directories.map(p => path.join(p, name))];
  if (process.platform === 'win32') candidates.push(...directories.map(p => path.join(p, 'codex.cmd')));
  const nvm = path.join(home, '.nvm', 'versions', 'node');
  try { for (const version of fs.readdirSync(nvm).sort().reverse()) candidates.push(path.join(nvm, version, 'bin', name)); }
  catch { /* NVM is optional. */ }
  const triples: Record<string, string> = { 'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
    'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl' };
  for (const candidate of candidates) {
    if (!candidate || !path.isAbsolute(candidate)) continue;
    try {
      if (!fs.statSync(candidate).isFile()) continue;
      const real = fs.realpathSync(candidate);
      const packageRoot = /\.cmd$/i.test(real) ? path.join(path.dirname(real), 'node_modules', '@openai', 'codex')
        : /[/\\]bin[/\\]codex\.js$/i.test(real) ? path.dirname(path.dirname(real)) : '';
      const triple = triples[`${process.platform}-${process.arch}`];
      if (packageRoot && triple) {
        const suffix = `${process.platform === 'win32' ? 'win32' : process.platform}-${process.arch}`;
        for (const root of [path.join(path.dirname(packageRoot), `codex-${suffix}`), packageRoot]) {
          for (const folder of ['bin', 'codex']) {
            const binary = path.join(root, 'vendor', triple, folder, name);
            if (fs.existsSync(binary)) return binary;
          }
        }
      }
      // Spawn the native Windows binary rather than a shell-only npm wrapper.
      if (!/\.cmd$/i.test(candidate)) return candidate;
    } catch { /* Try next location. */ }
  }
  return configured || name;
}
