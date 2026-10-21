import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { MyPluginSettings } from '../settings';
import { PaperInfo } from '../types';
import { translateText } from './translationUtils';
import { getPaperUrl } from './paperLinks';

export function getExcalidrawPath(settings: MyPluginSettings): string {
  return normalizePath(`${settings.workspaceFolder}/论文关系图.md`);
}

/** Returns the user-configured excalidraw path, or the default if none is set. */
export function resolveExcalidrawPath(settings: MyPluginSettings): string {
  return settings.excalidrawFilePath
    ? normalizePath(settings.excalidrawFilePath)
    : getExcalidrawPath(settings);
}

export async function ensureWorkspaceFolders(
  app: App,
  settings: MyPluginSettings
): Promise<void> {
  const base = normalizePath(settings.workspaceFolder);
  await ensureFolder(app, base);
  await ensureFolder(app, normalizePath(`${base}/${settings.unreadFolderName}`));
  await ensureFolder(app, normalizePath(`${base}/${settings.readFolderName}`));

  const excalidrawPath = resolveExcalidrawPath(settings);
  if (!app.vault.getAbstractFileByPath(excalidrawPath)) {
    // Ensure the parent folder exists before creating the file
    const parentPath = excalidrawPath.substring(0, excalidrawPath.lastIndexOf('/'));
    if (parentPath) await ensureFolder(app, parentPath);
    await app.vault.create(excalidrawPath, initialExcalidrawContent());
  }
}

async function ensureFolder(app: App, path: string): Promise<void> {
  if (!app.vault.getAbstractFileByPath(path)) {
    await app.vault.createFolder(path);
  }
}

/**
 * Resolves the excalidraw file, creating it (and any missing parent folders) if it doesn't exist.
 */
export async function ensureExcalidrawFile(
  app: App,
  settings: MyPluginSettings
): Promise<TFile> {
  const path = resolveExcalidrawPath(settings);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  const parentPath = path.substring(0, path.lastIndexOf('/'));
  if (parentPath) await ensureFolder(app, parentPath);
  return await app.vault.create(path, initialExcalidrawContent());
}

function initialExcalidrawContent(): string {
  const data = JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements: [],
    appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
    files: {},
  });
  return [
    '---',
    '',
    'excalidraw-plugin: parsed',
    'tags: [excalidraw]',
    '',
    '---',
    '',
    '%%',
    '# Drawing',
    '```json',
    data,
    '```',
    '%%',
  ].join('\n');
}

export async function createPaperFile(
  app: App,
  settings: MyPluginSettings,
  paper: PaperInfo,
  category: string,
  onCreated?: (file: TFile) => Promise<void>
): Promise<TFile | null> {
  const base = normalizePath(settings.workspaceFolder);
  const safeName = sanitizeFileName(paper.title);
  let filePath: string;

  if (category === '待阅读') {
    filePath = normalizePath(`${base}/${settings.unreadFolderName}/${safeName}.md`);
  } else {
    filePath = normalizePath(
      `${base}/${settings.readFolderName}/【${category}】-${safeName}.md`
    );
  }

  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof TFile) return existing;

  try {
    // 翻译摘要（如果启用）
    let translatedAbstract = '';
    if (settings.translateAbstract && settings.siliconflowApiKey && paper.abstract) {
      try {
        translatedAbstract = await translateText(paper.abstract, settings.siliconflowApiKey, settings.translationModel);
      } catch (error) {
        console.error('[PaperPlugin] 翻译失败:', error);
        // 翻译失败不影响创建文件，只是不添加翻译
      }
    }

    const file = await app.vault.create(filePath, buildPaperContent(paper, translatedAbstract));
    // 只对本次新建的笔记入队；重复添加已有论文不重复启动 Codex。
    if (onCreated) {
      try { await onCreated(file); }
      catch (error) { console.error('[PaperPlugin] 精读任务入队失败:', error); }
    }
    return file;
  } catch (e) {
    console.error('[PaperPlugin] Failed to create paper file:', e);
    return null;
  }
}

function buildPaperContent(paper: PaperInfo, translatedAbstract: string = ''): string {
  const paperFields = Array.from(
    new Set((paper.fields && paper.fields.length > 0 ? paper.fields : paper.field ? [paper.field] : []).filter(Boolean))
  );
  const primaryField = paperFields[0];
  const lines: string[] = ['---'];
  lines.push(`title: "${escapeYaml(paper.title)}"`);
  lines.push(`journal: "${escapeYaml(paper.journal || '')}"`);
  lines.push(`date: "${paper.date || ''}"`);
  lines.push(
    `authors: [${paper.authors.map(a => `"${escapeYaml(a)}"`).join(', ')}]`
  );
  if (paper.institutions && paper.institutions.length > 0) {
    lines.push(
      `institutions: [${paper.institutions
        .map(i => `"${escapeYaml(i)}"`)
        .join(', ')}]`
    );
  }
  if (paperFields.length > 0) {
    lines.push(`fields: [${paperFields.map(field => `"${escapeYaml(field)}"`).join(', ')}]`);
  }
  if (primaryField) lines.push(`field: "${escapeYaml(primaryField)}"`);
  if (paper.arxivId) lines.push(`arxivId: "${escapeYaml(paper.arxivId)}"`);
  if (paper.doi) lines.push(`doi: "${escapeYaml(paper.doi)}"`);
  if (paper.source) lines.push(`source: "${escapeYaml(paper.source)}"`);
  const paperUrl = getPaperUrl(paper);
  if (paperUrl) lines.push(`url: "${escapeYaml(paperUrl)}"`);
  lines.push('---', '');
  lines.push(`# ${paper.title}`, '');
  lines.push(`**期刊/会议**：${paper.journal || ''}  `);
  lines.push(`**发表时间**：${paper.date || ''}  `);
  lines.push(`**作者**：${paper.authors.join('; ')}  `);
  if (paper.institutions && paper.institutions.length > 0) {
    lines.push(`**作者单位**：${paper.institutions.join('; ')}  `);
  }
  if (paperFields.length > 0) {
    lines.push(`**研究领域**：${paperFields.join(' / ')}  `);
  }

  // 添加 arxivId 多链接
  if (paper.arxivId) {
    let arxivId = paper.arxivId;
    if (arxivId.includes('/')) {
      const parts = arxivId.split('/');
      arxivId = parts[parts.length - 1] || arxivId;
    }
    lines.push(`**arXiv**：[arXiv](https://arxiv.org/abs/${arxivId}), [PDF](https://arxiv.org/pdf/${arxivId}), [AlphaXiv](https://alphaxiv.org/abs/${arxivId}), [HTML](https://arxiv.org/html/${arxivId})  `);
  }

  if (paper.doi) {
    lines.push(`**DOI**：[${paper.doi}](<https://doi.org/${encodeURIComponent(paper.doi)}>)  `);
  }
  if (paperUrl && (paper.source === 'ieee' || !paper.arxivId)) {
    lines.push(`**原文**：[${paper.source === 'ieee' ? 'IEEE Xplore' : '查看原文'}](<${paperUrl}>)  `);
  }

  if (paper.abstract) {
    lines.push('', '## 摘要');
    // 如果有翻译，添加可折叠的中文翻译
    if (translatedAbstract) {
      lines.push('', '> [!翻译]-', '> ', '> ## 摘要翻译', '> ');
      const translatedLines = translatedAbstract.split('\n');
      translatedLines.forEach(line => lines.push('> ' + line));
    }
    // 英文原文作为正文（在可折叠区块外）
    lines.push('', paper.abstract);
  }
  lines.push('', '## 笔记', '', '');
  return lines.join('\n');
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
}

/**
 * Move a paper to any category (including back to 待阅读).
 * Strips any existing 【label】- prefix before applying the new one.
 */
export async function movePaper(
  app: App,
  settings: MyPluginSettings,
  file: TFile,
  targetCategory: string
): Promise<void> {
  const base = normalizePath(settings.workspaceFolder);
  const cleanName = file.basename.replace(/^【.+?】-/, '');
  if (targetCategory === '待阅读') {
    const newPath = normalizePath(`${base}/${settings.unreadFolderName}/${cleanName}.md`);
    await app.vault.rename(file, newPath);
  } else {
    const newName = `【${targetCategory}】-${cleanName}`;
    const newPath = normalizePath(`${base}/${settings.readFolderName}/${newName}.md`);
    await app.vault.rename(file, newPath);
  }
}

/**
 * @deprecated Use movePaper instead.
 * Move a paper from the unread folder to the read folder with a label prefix.
 */
export async function movePaperToCategory(
  app: App,
  settings: MyPluginSettings,
  file: TFile,
  label: string
): Promise<void> {
  return movePaper(app, settings, file, label);
}

export function getPapersByCategory(
  app: App,
  settings: MyPluginSettings
): Record<string, TFile[]> {
  const base = normalizePath(settings.workspaceFolder);
  const result: Record<string, TFile[]> = {};
  result['待阅读'] = [];
  for (const label of settings.labels) {
    result[label] = [];
  }

  const unread = app.vault.getAbstractFileByPath(
    normalizePath(`${base}/${settings.unreadFolderName}`)
  );
  if (unread instanceof TFolder) {
    for (const f of unread.children) {
      if (f instanceof TFile && f.extension === 'md') {
        result['待阅读'].push(f);
      }
    }
  }

  const read = app.vault.getAbstractFileByPath(
    normalizePath(`${base}/${settings.readFolderName}`)
  );
  if (read instanceof TFolder) {
    for (const f of read.children) {
      if (!(f instanceof TFile) || f.extension !== 'md') continue;
      const fileName = f.name;
      if (!fileName) continue;
      for (const label of settings.labels) {
        if (fileName.startsWith(`【${label}】`)) {
          const arr = result[label];
          if (arr) {
            arr.push(f);
          }
          break;
        }
      }
    }
  }

  return result;
}
