import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkAgentInstructions } from './agent-instructions';

beforeEach(() => {
  const home = createTempRepo({ 'git/ignore': '' });

  vi.stubEnv('GIT_CONFIG_GLOBAL', join(home, 'none'));
  vi.stubEnv('XDG_CONFIG_HOME', home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const checksIn = (files: Record<string, string>): string[] =>
  checkAgentInstructions(readProfile(createTempRepo({ 'package.json': '{}', ...files }))).map((finding) => finding.check);

describe('checkAgentInstructions under CI', () => {
  it('stays quiet in CI when git keeps every instruction file out of the checkout', () => {
    vi.stubEnv('CI', 'true');

    expect(checksIn({ '.gitignore': '*.md\n.claude/\n' })).toEqual([]);
  });

  it('still speaks in CI when a tracked instruction file could carry the pointer', () => {
    vi.stubEnv('CI', 'true');

    expect(checksIn({ '.gitignore': 'AGENTS.md\n' })).toEqual(['no-agent-instructions']);
  });

  it.each(['', 'false', '0'])('treats CI=%j as not CI', (value) => {
    vi.stubEnv('CI', value);

    expect(checksIn({ '.gitignore': '*.md\n.claude/\n' })).toEqual(['no-agent-instructions']);
  });

  it('treats an unset CI as not CI', () => {
    vi.stubEnv('CI', undefined);

    expect(checksIn({ '.gitignore': '*.md\n.claude/\n' })).toEqual(['no-agent-instructions']);
  });
});
