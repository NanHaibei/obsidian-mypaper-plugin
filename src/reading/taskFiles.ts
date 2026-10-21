/** Replace model-writable files atomically; never follow an existing destination symlink. */
export async function writeTaskJson(directory: string, name: string, value: unknown): Promise<void> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');
  if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error('任务文件名无效');
  const temporary = path.join(directory, `.host-${require('crypto').randomBytes(12).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
    await fs.rename(temporary, path.join(directory, name));
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
