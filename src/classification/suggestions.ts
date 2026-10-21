import type { FieldStyle } from '../types';
import { CLASSIFICATION_GROUPS, ClassificationGroup, groupForName, matchesTopic, topicKey } from './rules';

export interface ClassificationPaper {
  path: string;
  title: string;
  fields: string[];
  content: string;
}

export interface ClassificationSuggestion {
  fields: string[];
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

function defaultStyle(group: ClassificationGroup): FieldStyle {
  return {
    name: group.name, aliases: group.children.map(child => child.name),
    backgroundColor: group.color[0], textColor: group.color[1], borderColor: group.color[2],
    backgroundPattern: 'solid', roughness: 0, opacity: 100, roundness: 2,
    titleFontSize: 14, titleFontFamily: 4, metaFontSize: 11, metaFontFamily: 4,
    cardWidth: 280, cardHeight: 180, titleAlignment: 'left',
  };
}

/** Proposes a schema without mutating settings; every old name remains addressable. */
export function createSuggestedTaxonomy(current: FieldStyle[]): FieldStyle[] {
  const result = CLASSIFICATION_GROUPS.map(group => {
    const old = current.find(field => groupForName(field.name)?.name === group.name);
    return { ...defaultStyle(group), ...old, name: group.name, aliases: group.children.map(child => child.name) };
  });
  const claimed = new Set<string>();
  result.forEach(field => [field.name, ...field.aliases].forEach(name => claimed.add(name)));
  for (const field of current) {
    const group = groupForName(field.name);
    let fallback = group ? result.find(candidate => candidate.name === group.name) : undefined;
    if (!fallback && !claimed.has(field.name)) {
      fallback = { ...field, aliases: [] };
      result.push(fallback);
      claimed.add(field.name);
    }
    for (const name of [field.name, ...(field.aliases ?? [])]) {
      if (!name.trim() || claimed.has(name)) continue;
      const known = groupForName(name);
      const owner = (known && result.find(candidate => candidate.name === known.name)) ?? fallback;
      if (owner) {
        owner.aliases.push(name);
        claimed.add(name);
      }
    }
  }
  return result;
}

/** Read only explicit abstracts, never references or arbitrary body notes. */
function abstractText(content: string): string {
  const parts: string[] = [];
  const translated: string[] = [];
  const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (frontmatter) {
    const value = /^abstract:\s*(.*)(?:\r?\n((?:[ \t]+[^\n]*(?:\n|$))*))?/im.exec(frontmatter[1] ?? '');
    if (value) parts.push([value[1], value[2]].filter(Boolean).join(' '));
  }
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  const lines = body.split(/\r?\n/);
  let inAbstract = false;
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      inAbstract = /^#{1,6}\s+(?:abstract|摘要)(?:\s|[:：]|[（(]|$)/i.test(line);
      continue;
    }
    if (inAbstract && line.trim()) {
      if (/^>/.test(line)) translated.push(line.replace(/^>\s?/, ''));
      else parts.push(line);
    }
  }
  // Prefer the source abstract over machine-translated callouts, which may be noisy.
  return (parts.length ? parts : translated).join(' ').slice(0, 10000);
}

function supportingAbstract(abstract: string): string {
  const contribution = /\b(?:we (?:propose|introduce|present|develop)|this paper (?:proposes|introduces|presents))\b|我们(?:提出|采用)/i.exec(abstract);
  const evidence = contribution ? abstract.slice(contribution.index) : abstract;
  return evidence.split(/(?<=[.!?。！？;；])\s*/).map(sentence => {
    if (/\b(?:unlike|in contrast to|instead of|without|existing|traditional|prior work|previous|conventional|baselines?)\b|现有|传统|以往|无需|不依赖/i.test(sentence)) {
      const ownClaim = /\b(?:we (?:propose|introduce|use|develop|present|build)|our (?:method|model|framework|approach)|this paper (?:proposes|introduces))\b|我们(?:提出|使用|采用)/i.exec(sentence);
      return ownClaim ? sentence.slice(ownClaim.index) : '';
    }
    return sentence;
  }).join(' ');
}

function availableField(taxonomy: FieldStyle[], group: ClassificationGroup): FieldStyle | undefined {
  return taxonomy.find(field => matchesTopic(field.name, group))
    ?? taxonomy.find(field => [field.name, ...(field.aliases ?? [])].some(name =>
      matchesTopic(name, group) || group.children.some(child => matchesTopic(name, child))));
}

function isBroadCategory(name: string): boolean {
  const key = topicKey(name);
  const specificChild = CLASSIFICATION_GROUPS.some(group => group.children.some(child => topicKey(child.name) === key));
  if (specificChild && key !== 'attention') return false;
  return CLASSIFICATION_GROUPS.some(group => matchesTopic(name, group))
    || key === 'perception driven control';
}

function retainedTags(original: string[], taxonomy: FieldStyle[]): string[] {
  const refinements: Record<string, string> = {
    'whole body tracking': 'Motion Tracking',
    mimic: 'Motion Imitation',
    'loco manipulation': 'Mobile Manipulation',
  };
  const configured = new Set<string>();
  taxonomy.forEach(field => [field.name, ...(field.aliases ?? [])].forEach(name => configured.add(name)));
  const retained: string[] = [];
  for (const name of original) {
    const refined = refinements[topicKey(name)];
    if (refined && configured.has(refined)) retained.push(refined);
    else if (!isBroadCategory(name)) retained.push(name);
  }
  return retained;
}

function methodTags(paper: ClassificationPaper, abstract: string, taxonomy: FieldStyle[]): { fields: string[]; fromText: boolean } {
  const fields: string[] = [];
  let fromText = false;
  for (const group of CLASSIFICATION_GROUPS) {
    for (const rule of group.children.filter(child => child.method)) {
      const inText = rule.pattern.test(paper.title) || rule.pattern.test(abstract);
      const inOldTags = paper.fields.some(name => !isBroadCategory(name) && matchesTopic(name, rule));
      if (!inText && !inOldTags) continue;
      // Methods may live under a different task after the user edits the schema.
      const labels: string[] = [];
      taxonomy.forEach(field => labels.push(field.name, ...(field.aliases ?? [])));
      const configured = labels.find(label => label === rule.name)
        ?? labels.find(label => matchesTopic(label, rule));
      if (configured) {
        fields.push(configured);
        fromText ||= inText;
      }
    }
  }
  return { fields: Array.from(new Set(fields)), fromText };
}

interface Candidate {
  group: ClassificationGroup;
  field: FieldStyle;
  score: number;
  titleMatch: boolean;
  evidence: string[];
  children: string[];
}

function candidateFor(group: ClassificationGroup, field: FieldStyle, title: string, abstract: string): Candidate | undefined {
  const titleMatch = group.pattern.test(title);
  const abstractMatch = group.pattern.test(abstract);
  const children: string[] = [];
  const evidence: string[] = [];
  let childTitleMatches = 0;
  let childAbstractMatches = 0;
  for (const rule of group.children) {
    const inTitle = rule.pattern.test(title);
    const inAbstract = rule.pattern.test(abstract);
    if (!inTitle && !inAbstract) continue;
    const configured = (field.aliases ?? []).find(alias => matchesTopic(alias, rule));
    if (configured) children.push(configured);
    evidence.push(rule.name);
    if (inTitle) childTitleMatches++;
    else childAbstractMatches++;
  }
  // Child phrases such as "robust" are too broad to establish a topic alone.
  if (!titleMatch && !abstractMatch) return undefined;
  const focus = title.split(/\b(?:via|using|with|through|for)\b/i)[0] ?? title;
  const explicitFocus = group.focusPattern?.test(focus) ?? (group.task && group.pattern.test(focus));
  const score = (titleMatch ? 12 : 0) + (abstractMatch ? 4 : 0) + (explicitFocus ? 8 : 0)
    + Math.min(childTitleMatches, 2) * 2 + Math.min(childAbstractMatches, 2);
  return { group, field, score, titleMatch, evidence, children };
}

/** Local keyword evidence proposes edits; it does not claim to understand the full paper. */
export function suggestPaperClassification(paper: ClassificationPaper, taxonomy: FieldStyle[]): ClassificationSuggestion {
  const original = [...paper.fields];
  const abstract = supportingAbstract(abstractText(paper.content));
  const candidates: Candidate[] = [];
  for (const group of CLASSIFICATION_GROUPS) {
    const field = availableField(taxonomy, group);
    if (!field) continue;
    const candidate = candidateFor(group, field, paper.title, abstract);
    if (candidate) candidates.push(candidate);
  }
  // Explicit tasks in the title outrank incidental algorithms and background tasks in the abstract.
  const taskTitles = candidates.filter(candidate => candidate.group.task && candidate.titleMatch);
  const titleCandidates = candidates.filter(candidate => candidate.titleMatch);
  const taskCandidates = candidates.filter(candidate => candidate.group.task);
  const pool = taskTitles.length ? taskTitles : titleCandidates.length ? titleCandidates
    : taskCandidates.length ? taskCandidates : candidates;
  pool.sort((left, right) => right.score - left.score);
  const best = pool[0];
  if (!best) {
    return { fields: original, confidence: 'low', reason: '标题和明确标注的摘要中缺少可用依据，或对应领域未配置；保留原分类，请人工判断。' };
  }
  const second = pool[1];
  const ambiguous = second !== undefined && second.field.name !== best.field.name && best.score - second.score < 3;
  const methods = methodTags(paper, abstract, taxonomy);
  const proposed = [best.field.name, ...best.children, ...methods.fields];
  // Replace obsolete broad categories; preserve specific methods and unknown tags.
  // Legacy names remain in the proposed schema so unedited papers still resolve.
  const retained = retainedTags(original, taxonomy);
  const fields = Array.from(new Set([...proposed, ...retained]));
  const removedCategories = original.some(name => isBroadCategory(name) && !fields.includes(name));
  const source = best.titleMatch ? (abstract ? '标题与摘要' : '标题') : '摘要';
  const evidence = best.evidence.length ? best.evidence.slice(0, 3).join('、') : best.group.name;
  const notes = [ `${source}命中“${evidence}”相关词，建议归入“${best.field.name}”。` ];
  if (best.group.task) notes.push('按研究任务确定主领域。');
  if (!methods.fields.length) notes.push('方法信息不足，未推断具体算法，请补充确认。');
  else if (!methods.fromText) notes.push('方法标签沿用原分类，需结合论文确认。');
  if (ambiguous) notes.push(`也涉及“${second.field.name}”，请复核主领域。`);
  if (retained.some(name => !proposed.includes(name))) notes.push('原有方法和自定义标签已保留，请检查其归属。');
  if (removedCategories) notes.push('旧主领域已替换；有细分含义的旧分类已规范成短标签。');
  return { fields, confidence: best.titleMatch && !ambiguous && methods.fromText ? 'high' : 'medium', reason: notes.join('') };
}
