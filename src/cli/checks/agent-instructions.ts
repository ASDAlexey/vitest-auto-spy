/**
 * No agent in this repository has been told the library exists.
 *
 * The finding is `info`, not an error: it is a suggestion, and a repository is free to decline it.
 * It is here because the first run of the CLI is the one moment where saying so costs nothing —
 * a postinstall message would be the alternative, and npm, pnpm and Yarn have all spent five years
 * making install-time output invisible on purpose.
 */
import { join } from 'node:path';

import { gitignoreFilter, pathExists, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.claude/CLAUDE.md'];

/** `init --only` selects `.claude/CLAUDE.md` through its directory. */
function onlyEntry(file: string): string {
  return file.startsWith('.claude/') ? '.claude' : file;
}

function fixFor(profile: Profile): string {
  const ignored = gitignoreFilter(profile.cwd);
  const excluded = INSTRUCTION_FILES.filter((file) => ignored(file));

  if (excluded.length === INSTRUCTION_FILES.length) {
    return 'Run `npx vitest-auto-spy init` on your machine. CI never sees these files, because .gitignore keeps them out of git: pass `--ignore no-agent-instructions` there.';
  }

  const tracked = INSTRUCTION_FILES.filter((file) => !ignored(file) && pathExists(join(profile.cwd, file)));

  return excluded.length === 0 || tracked.length === 0
    ? 'Run `npx vitest-auto-spy init` to point them at `node_modules/vitest-auto-spy/AGENTS.md`.'
    : `Run \`npx vitest-auto-spy init --only ${[...new Set(tracked.map(onlyEntry))].join(',')}\` to point the tracked ones at \`node_modules/vitest-auto-spy/AGENTS.md\`.`;
}

export function checkAgentInstructions(profile: Profile): Finding[] {
  const mentioned = INSTRUCTION_FILES.some((file) => (readTextFile(join(profile.cwd, file)) ?? '').includes('vitest-auto-spy'));

  if (mentioned) {
    return [];
  }

  return [
    {
      check: 'no-agent-instructions',
      severity: 'info',
      message: 'No root AGENTS.md, CLAUDE.md, GEMINI.md or .claude/CLAUDE.md mentions vitest-auto-spy.',
      fix: fixFor(profile),
    },
  ];
}
