import type { ReadingResult } from './result';
import { rasterExtension } from './imageSources';

/** Check all files before writing any of them into the user's attachment directory. */
export async function inspectReadingAssets(directory: string, result: ReadingResult): Promise<{ issues: string[]; files: Map<string, Uint8Array> }> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');
  const allowed = path.join(await fs.realpath(directory), 'figures') + path.sep;
  const issues: string[] = [], files = new Map<string, Uint8Array>();
  for (const asset of result.assets) {
    try {
      if (!/^figures\/[A-Za-z0-9_.-]+\.png$/.test(asset.path)) throw new Error('图片路径无效');
      const source = await fs.realpath(path.join(directory, asset.path));
      if (!source.startsWith(allowed)) throw new Error('图片路径超出当前任务目录');
      const data = await fs.readFile(source);
      const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      if (data.byteLength > 15 * 1024 * 1024 || rasterExtension(bytes) !== 'png') throw new Error('图片不是有效 PNG 或超过大小限制');
      const bitmap = await createImageBitmap(new Blob([bytes]));
      try { if (!bitmap.width || !bitmap.height) throw new Error('图片无法解码'); }
      finally { bitmap.close(); }
      files.set(asset.id, data);
    } catch (error) { issues.push(`${asset.id}：${error instanceof Error ? error.message : String(error)}`); }
  }
  return { issues, files };
}
