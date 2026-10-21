import { getFrontMatterInfo, parseYaml } from 'obsidian';
import type { PaperInfo } from '../types';

/** 只提取论文属性与明确标注的摘要，不把手写笔记或已有 AI 回复作为提示词。 */
export function readExistingPaper(content: string, fallbackTitle: string): PaperInfo {
  const info = getFrontMatterInfo(content);
  const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
  if (parsed != null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error('论文 YAML 必须为属性对象');
  }
  const metadata = (parsed || {}) as Record<string, unknown>;
  const text = (value: unknown): string => typeof value === 'string' ? value.trim()
    : typeof value === 'number' ? String(value) : '';
  const list = (value: unknown): string[] => (Array.isArray(value) ? value
    : text(value).split(/[;；]/)).map(text).filter(Boolean);
  const body = content.slice(info.exists ? info.contentStart : 0);
  // 只读取正文的第一个二级小节；后面的笔记即便包含“摘要”标题也不读取。
  const firstSection = /^##[ \t]+([^\r\n]+)\r?\n/m.exec(body);
  let abstract = text(metadata.abstract);
  if (!abstract && firstSection && /^(摘要|abstract)$/i.test(firstSection[1]!.trim())) {
    const section = body.slice(firstSection.index + firstSection[0].length).split(/^#{1,6}[ \t]+/m)[0] || '';
    abstract = section.split(/\r?\n/).filter(line => !/^\s*>/.test(line)).join('\n').trim();
  }
  const source = text(metadata.source);
  return {
    title: text(metadata.title) || /^#[ \t]+([^\r\n]+)/m.exec(body)?.[1]?.trim() || fallbackTitle,
    authors: list(metadata.authors), institutions: list(metadata.institutions ?? metadata.affiliations),
    journal: text(metadata.journal ?? metadata.venue), field: text(metadata.field), fields: list(metadata.fields),
    date: text(metadata.date ?? metadata.publishDate ?? metadata.year),
    url: text(metadata.url), doi: text(metadata.doi), arxivId: text(metadata.arxivId), abstract,
    source: source === 'arxiv' || source === 'ieee' || source === 'semantic_scholar' ? source : undefined,
  };
}
