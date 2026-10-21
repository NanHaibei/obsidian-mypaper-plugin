import instructions from '../../skills/write-obsidian-paper-notes/SKILL.md';
import teachingGuide from '../../skills/write-obsidian-paper-notes/references/paper-teaching-guide.md';
import cropScript from '../../skills/write-obsidian-paper-notes/scripts/crop_figure.py';

/** Standard Obsidian updates download main.js, manifest.json and styles.css only. */
export const BUNDLED_SKILL_FILES: Readonly<Record<string, string>> = {
  'SKILL.md': instructions,
  'references/paper-teaching-guide.md': teachingGuide,
  'scripts/crop_figure.py': cropScript,
};

export async function writeBundledSkill(target: string): Promise<void> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');
  for (const [relative, contents] of Object.entries(BUNDLED_SKILL_FILES)) {
    const file = path.join(target, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents, 'utf8');
  }
}
