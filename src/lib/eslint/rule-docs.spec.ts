import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RULES_PAGE } from './define-rule';
import { rules } from './rules';

const SITE = join(__dirname, '..', '..', '..', 'docs-site');

// VitePress's slug rule, as `docs-links.spec.ts` spells it; a rule heading is its bare name.
function slug(heading: string): string {
  return heading
    .replace(/`/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function anchorsOf(page: string): Set<string> {
  const source = readFileSync(join(SITE, page), 'utf8');

  return new Set([...source.matchAll(/^#{2,6} (.*?)(?:\s*\{#([^}]+)\})?\s*$/gm)].map(([, heading, id]) => id ?? slug(String(heading))));
}

const english = anchorsOf('utilities/eslint-rules.md');
const russian = anchorsOf('ru/utilities/eslint-rules.md');

describe.each(Object.entries(rules))('%s', (name, rule) => {
  it('links to its own section of the rules page, in both languages', () => {
    expect(rule.meta.docs.url).toBe(`${RULES_PAGE}#${name}`);
    expect(english).toContain(name);
    expect(russian).toContain(name);
  });

  it('ends every message with that link and keeps the diagnosis short', () => {
    Object.values(rule.meta.messages).forEach((message) => {
      const suffix = ` Docs: ${rule.meta.docs.url}`;

      expect(message.endsWith(suffix)).toBe(true);
      expect(message.length - suffix.length).toBeLessThanOrEqual(450);
    });
  });
});
