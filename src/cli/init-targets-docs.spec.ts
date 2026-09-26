import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FRONTMATTER, POINTER } from './init-targets';

const ROOT = join(__dirname, '..', '..');
const PAGES = ['README.md', 'docs-site/agents.md', 'docs-site/ru/agents.md'];
const HAND_WRITTEN = [
  '.cursor/rules/vitest-auto-spy.mdc',
  '.github/instructions/vitest-auto-spy.instructions.md',
  '.windsurf/rules/vitest-auto-spy.md',
];

function snippetsOf(text: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const match of text.matchAll(/^\*\*`([^`]+)`\*\*.*\n\n```md\n([\s\S]*?)\n```$/gm)) {
    found.set(match[1] ?? '', match[2] ?? '');
  }

  return found;
}

describe.each(PAGES)('hand-written agent rules in %s', (page) => {
  const text = readFileSync(join(ROOT, page), 'utf8');
  const snippets = snippetsOf(text);

  it('shows one snippet per glob-scoped tool', () => {
    expect([...snippets.keys()]).toEqual(HAND_WRITTEN);
  });

  it.each(HAND_WRITTEN)('matches what init writes for %s', (path) => {
    expect(snippets.get(path)).toBe(`${FRONTMATTER[path]}\n\n${POINTER}`);
  });

  it('keeps the snippets out of Prettier, which turns frontmatter into a heading', () => {
    const start = text.indexOf('<!-- prettier-ignore-start -->\n\n**`.cursor/rules/');

    expect(start).toBeGreaterThan(-1);
    expect(text.indexOf('<!-- prettier-ignore-end -->', start)).toBeGreaterThan(start);
    expect(text).not.toMatch(/^## <!-- \./m);
  });
});
