/**
 * No agent in this repository has been told the library exists.
 *
 * The finding is `info`, not an error: it is a suggestion, and a repository is free to decline it.
 * It is here because the first run of the CLI is the one moment where saying so costs nothing —
 * a postinstall message would be the alternative, and npm, pnpm and Yarn have all spent five years
 * making install-time output invisible on purpose.
 */
import { join } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];

export function checkAgentInstructions(profile: Profile): Finding[] {
  const mentioned = INSTRUCTION_FILES.some((file) => (readTextFile(join(profile.cwd, file)) ?? '').includes('vitest-auto-spy'));

  if (mentioned) {
    return [];
  }

  return [
    {
      check: 'no-agent-instructions',
      severity: 'info',
      message: 'No root AGENTS.md, CLAUDE.md or GEMINI.md mentions vitest-auto-spy.',
      fix: 'Run `npx vitest-auto-spy init` to write a pointer to `node_modules/vitest-auto-spy/AGENTS.md` into the files the agents in this repository read.',
    },
  ];
}
