import { afterEach, describe, expect, it } from 'vitest';

import { createTempRepo, removeTempRepos } from '../cli/temp-repo';
import { isAngularUnitTestBuilder } from './angular-unit-test-builder';

afterEach(removeTempRepos);

function wrapper(source: string, extra: Record<string, string> = {}): string {
  return createTempRepo({
    'tools/bench/package.json': JSON.stringify({ builders: './builders.json' }),
    'tools/bench/builders.json': JSON.stringify({ builders: { test: { implementation: './test.mjs' } } }),
    'tools/bench/test.mjs': source,
    ...extra,
  });
}

describe('isAngularUnitTestBuilder', () => {
  it('recognises canonical builders and local wrappers invoking the named builder export', () => {
    expect(isAngularUnitTestBuilder('@angular/build:unit-test', '/absent')).toBe(true);
    expect(isAngularUnitTestBuilder('@nx/angular:unit-test', '/absent')).toBe(true);
    for (const source of [
      "const { executeUnitTestBuilder } = await import('@angular/build'); yield* executeUnitTestBuilder(options, context);",
      "import { executeUnitTestBuilder as execute } from '@angular/build'; execute(options, context);",
      'import { executeUnitTestBuilder } from "@angular/build"; executeUnitTestBuilder(options, context);',
      "const { executeUnitTestBuilder: execute } = await import('@angular/build'); execute(options, context);",
    ]) {
      expect(isAngularUnitTestBuilder('./tools/bench:test', wrapper(source))).toBe(true);
    }
  });

  it('does not execute modules or trust comments, strings, descriptions or unused imports', () => {
    for (const source of [
      "// const { executeUnitTestBuilder } = await import('@angular/build'); executeUnitTestBuilder();",
      "/* import { executeUnitTestBuilder } from '@angular/build'; executeUnitTestBuilder(); */",
      '`import { executeUnitTestBuilder } from "@angular/build"; executeUnitTestBuilder();`',
      "import { executeUnitTestBuilder } from '@angular/build'; throw new Error('must not run');",
      "import { executeUnitTestBuilder } from 'another-package'; executeUnitTestBuilder();",
      "const source = 'executeUnitTestBuilder()';",
      '// comment\nconst untouched = true;',
      '/* unterminated comment',
    ]) {
      expect(isAngularUnitTestBuilder('./tools/bench:test', wrapper(source))).toBe(false);
    }
    expect(isAngularUnitTestBuilder('@other/package:test', '/absent')).toBe(false);
    expect(isAngularUnitTestBuilder('./tools/bench', '/absent')).toBe(false);
  });

  it('ignores missing or unreadable manifests and implementations', () => {
    expect(isAngularUnitTestBuilder('./tools/bench:test', '/absent')).toBe(false);
    for (const manifest of ['null', '[]', '{', JSON.stringify({ builders: 1 }), JSON.stringify({ builders: './other.json' })]) {
      expect(isAngularUnitTestBuilder('./tools/bench:test', wrapper('', { 'tools/bench/package.json': manifest }))).toBe(false);
    }
    for (const manifest of [
      '{}',
      JSON.stringify({ builders: { test: { implementation: './other.mjs' } } }),
      JSON.stringify({ builders: { test: { implementation: './data.json' } } }),
    ]) {
      expect(isAngularUnitTestBuilder('./tools/bench:test', wrapper('', { 'tools/bench/builders.json': manifest }))).toBe(false);
    }
    expect(isAngularUnitTestBuilder('./tools/bench:other', wrapper(''))).toBe(false);
  });
});
