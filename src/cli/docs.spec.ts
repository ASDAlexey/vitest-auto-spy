import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS } from '../lib/message-link';
import {
  BARE_RUN_DOCS,
  COVERAGE_MATCHING_DOCS,
  DOCTOR_CHECKS,
  JASMINE_MIGRATION_TABLE_DOCS,
  NOTHING_TO_READ_DOCS,
  VITEST_5_PERF_DOCS,
  docsFor,
} from './docs';

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

function landsOnHeading(link: string): void {
  const [page, fragment] = link.slice(DOCS.length + 1).split('#');

  expect(anchorsOf(String(page)), link).toContain(fragment);
}

/** Every literal check id a doctor or perf finding is built with. */
function reportedChecks(): string[] {
  const sources = [
    ...readdirSync(join(__dirname, 'checks')).map((name) => join('checks', name)),
    ...readdirSync(__dirname).filter((name) => name.startsWith('perf')),
  ].filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'));
  const ids = sources.flatMap((name) =>
    [...readFileSync(join(__dirname, name), 'utf8').matchAll(/check: '([a-z0-9-]+)'/g)].map((match) => String(match[1])),
  );

  return [...new Set(ids)].sort();
}

describe('the docs section every finding links to', () => {
  it('exists for every check a doctor or perf finding reports, and the doctor list is complete', () => {
    const checks = reportedChecks();

    expect(checks.length).toBeGreaterThan(20);

    for (const check of checks) {
      expect(docsFor(check), check).toBeDefined();
    }

    expect(DOCTOR_CHECKS.filter((check) => !checks.includes(check))).toEqual([]);
  });

  it.each(reportedChecks())('%s lands on a heading of its page', (check) => {
    landsOnHeading(String(docsFor(check)));
  });

  it.each([
    'ambiguous-entry-point',
    'codemod-broke-syntax',
    'jest-mock-type-arguments',
    'no-entry-table',
    'unmapped-legacy-export',
    'residue/jest-namespace',
  ])('the codemod note %s lands on a heading of its page', (check) => {
    landsOnHeading(String(docsFor(check)));
  });

  it('has nothing for a note no section describes', () => {
    expect(docsFor('unknown-jest-member')).toBeUndefined();
  });

  it.each([BARE_RUN_DOCS, NOTHING_TO_READ_DOCS, COVERAGE_MATCHING_DOCS, JASMINE_MIGRATION_TABLE_DOCS, VITEST_5_PERF_DOCS])(
    '%s lands on a heading',
    (link) => {
      landsOnHeading(link);
    },
  );
});
