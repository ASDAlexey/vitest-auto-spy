import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as DOCS_LINKS from './docs-links';
import { DOCS } from './message-link';

const SITE = join(__dirname, '..', '..', 'docs-site');

// VitePress's own slug rule (@mdit-vue/shared): an em dash is not in the set, so it stays in the id.
function slug(heading: string): string {
  return heading
    .replace(/`/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

function anchorsOf(page: string): Set<string> {
  const source = readFileSync(join(SITE, `${page}.md`), 'utf8');

  return new Set([...source.matchAll(/^#{2,6} (.*?)(?:\s*\{#([^}]+)\})?\s*$/gm)].map(([, heading, id]) => id ?? slug(String(heading))));
}

describe('the docs links runtime messages print', () => {
  const sectioned = Object.entries(DOCS_LINKS).filter(([, link]) => link.startsWith(`${DOCS}/`) && link.includes('#'));

  it.each(sectioned)('%s lands on a heading of its page', (_key, link) => {
    const [page, fragment] = link.slice(DOCS.length + 1).split('#');

    expect(anchorsOf(String(page))).toContain(fragment);
  });
});
