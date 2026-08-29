/**
 * Which files `init` writes, and why each one is on the list.
 *
 * **Tier 1** is always written: `AGENTS.md` covers Codex, Cursor, Copilot, Cline, Windsurf, Zed,
 * OpenCode, Qwen, Roo, Junie and Aider; `CLAUDE.md` covers Claude Code and every client that is
 * it; `GEMINI.md` covers Gemini CLI, which does not read `AGENTS.md` by default.
 *
 * **Tier 2** is written only when the tool's own directory already exists, and is glob-scoped so
 * it costs no context on a non-test task. Those bodies are pointers, not copies — all of these
 * tools read `AGENTS.md` anyway.
 *
 * **Never created:** `.rules`, `.cursorrules`, `.windsurfrules`, `.clinerules` as a *file*. Zed
 * resolves instructions first-match-wins over an ordered list ending in `AGENTS.md`, so creating
 * any of them silently shadows the entire project's instructions. Appended to only if one exists.
 */
import { renderBody, wrapManaged } from './init-block';
import type { Profile } from './profile';

export type TargetKind = 'managed-if-exists' | 'managed' | 'owned';

export interface Target {
  readonly path: string;
  readonly kind: TargetKind;
  readonly note: string;
}

export interface TierTwoTarget extends Target {
  /** The directory whose existence proves the tool is in use in this repository. */
  readonly requiresDirectory: string;
}

export const TIER_ONE_MARKDOWN: readonly Target[] = [
  { path: 'AGENTS.md', kind: 'managed', note: 'Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider' },
  { path: 'CLAUDE.md', kind: 'managed', note: 'Claude Code, and GLM / Kimi running inside it' },
  { path: 'GEMINI.md', kind: 'managed', note: 'Gemini CLI — it does not read AGENTS.md by default' },
];

export const TIER_TWO: readonly TierTwoTarget[] = [
  { path: '.cursor/rules/vitest-auto-spy.mdc', kind: 'owned', requiresDirectory: '.cursor', note: 'Cursor, glob-scoped' },
  {
    path: '.github/instructions/vitest-auto-spy.instructions.md',
    kind: 'owned',
    requiresDirectory: '.github',
    note: 'GitHub Copilot, glob-scoped',
  },
  { path: '.windsurf/rules/vitest-auto-spy.md', kind: 'owned', requiresDirectory: '.windsurf', note: 'Windsurf / Cascade' },
  { path: '.devin/rules/vitest-auto-spy.md', kind: 'owned', requiresDirectory: '.devin', note: 'Devin' },
  { path: '.clinerules/vitest-auto-spy.md', kind: 'owned', requiresDirectory: '.clinerules', note: 'Cline' },
  { path: '.roo/rules/vitest-auto-spy.md', kind: 'owned', requiresDirectory: '.roo', note: 'Roo Code' },
];

export const LEGACY_FILES: readonly Target[] = [
  { path: '.rules', kind: 'managed-if-exists', note: 'Zed — appended to only because it already exists' },
  { path: '.cursorrules', kind: 'managed-if-exists', note: 'legacy Cursor file — appended to only because it already exists' },
  { path: '.windsurfrules', kind: 'managed-if-exists', note: 'legacy Windsurf file — appended to only because it already exists' },
];

const SPEC_GLOBS = '**/*.spec.ts, **/*.spec.tsx, **/*.test.ts, **/*.test.tsx';

const POINTER = [
  'Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses',
  '`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.',
].join('\n');

function scopedBody(profile: Profile): string {
  return `${POINTER}\n\nThis repository imports from \`${profile.entry}\`.`;
}

const FRONTMATTER: Record<string, string> = {
  '.cursor/rules/vitest-auto-spy.mdc': `---\ndescription: How to write tests with vitest-auto-spy\nglobs: ${SPEC_GLOBS}\nalwaysApply: false\n---`,
  '.github/instructions/vitest-auto-spy.instructions.md': `---\napplyTo: '${SPEC_GLOBS.split(', ').join(',')}'\n---`,
  '.windsurf/rules/vitest-auto-spy.md': `---\ntrigger: glob\nglobs: ${SPEC_GLOBS}\n---`,
  '.devin/rules/vitest-auto-spy.md': `---\ntrigger: glob\nglobs: ${SPEC_GLOBS}\n---`,
  '.clinerules/vitest-auto-spy.md': `---\ndescription: How to write tests with vitest-auto-spy\npaths: ["**/*.spec.ts", "**/*.test.ts"]\n---`,
  '.roo/rules/vitest-auto-spy.md': '',
};

/** The Claude Code skill stub: the shipped skill's frontmatter over a body that cannot go stale. */
export function skillStub(frontmatter: string, version: string): string {
  const body = [
    '# vitest-auto-spy',
    '',
    'This is a pointer, not a copy. The authoritative reference ships inside the package:',
    '',
    '```bash',
    'cat node_modules/vitest-auto-spy/AGENTS.md',
    '```',
    '',
    'The types are the authority when any document and the code disagree — read',
    '`node_modules/vitest-auto-spy/dist/index.d.ts` (one `.d.ts` per subpath).',
    '',
    'Run `npx vitest-auto-spy doctor` to find suite-level defects that never fail a run.',
  ].join('\n');

  return `---\n${frontmatter}\n---\n\n${wrapManaged(body, version)}\n`;
}

/** The full content of an owned tier-2 file. */
export function ownedContent(target: Target, profile: Profile, version: string): string {
  const frontmatter = FRONTMATTER[target.path] ?? '';
  const managed = wrapManaged(scopedBody(profile), version);

  return frontmatter === '' ? `${managed}\n` : `${frontmatter}\n\n${managed}\n`;
}

/** The managed block for a tier-1 (or legacy) Markdown file. */
export function managedBlock(profile: Profile, version: string): string {
  return wrapManaged(renderBody(profile), version);
}
