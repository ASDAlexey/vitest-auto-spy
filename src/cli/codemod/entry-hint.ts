/**
 * What the file itself says about which adapter its spec wants.
 *
 * The entry table answers "which entries export this name" and, for the Angular and Nest helpers,
 * the answer is several — `provideAutoSpy` alone is exported by five. The repository-level guess
 * (`profile.entry`) settles most of them, but it is silent in exactly the repository where it
 * matters: one whose `package.json` names no framework, or a Bun repository importing an Angular
 * helper. So before falling back, the resolver asks the file.
 *
 * Two questions, both cheap and both decided by evidence rather than by preference. An entry the
 * file *already imports from* is the strongest signal there is — the spec has committed to an
 * adapter, and every other name from that package belongs beside it. Failing that, the framework
 * the spec is written against: `TestBed` is Angular, `Test.createTestingModule` is Nest, and
 * neither appears by accident.
 *
 * Everything is read off the code mask plus the import specifiers, so the word "TestBed" in a
 * comment or an assertion string decides nothing.
 */
import { listImports } from './imports';
import type { TransformContext } from './transform-context';

const SUBPATH_PREFIX = 'vitest-auto-spy/';

/**
 * The framework each marker proves, most specific first. Deliberately three: these are the
 * frameworks whose helpers this package exports from more than one entry, so a fourth marker would
 * be a branch nothing can reach.
 */
const FRAMEWORK_MARKERS: readonly (readonly [string, RegExp])[] = [
  ['nestjs', /@nestjs\/|\bTest\s*\.\s*createTestingModule\b/],
  ['angular', /@angular\/|\bTestBed\b|\bprovideAutoSpyForToken\b/],
  ['vue', /@vue\/|\bdefineComponent\b|\bshallowMount\b/],
];

export interface FileHint {
  /** The subpath entries of this package the file already imports from. */
  readonly imported: readonly string[];
  /** `angular`, `nestjs` or `vue` when the file says so, `undefined` when nothing in it does. */
  readonly framework: string | undefined;
}

/** What a caller with no file in hand passes — `entryFor`, and the specs that pin the table alone. */
export const NO_HINT: FileHint = { imported: [], framework: undefined };

export function hintFor(context: TransformContext): FileHint {
  const specifiers = listImports(context.source, context.masked).map((statement) => statement.specifier);

  return {
    imported: specifiers.filter((specifier) => specifier.startsWith(SUBPATH_PREFIX)),
    // The specifiers are appended because the mask blanks the inside of a string: `@angular/core`
    // is invisible in the code view, and it is the single most reliable marker there is.
    framework: frameworkOf([context.masked, ...specifiers].join('\n')),
  };
}

function frameworkOf(haystack: string): string | undefined {
  const found = FRAMEWORK_MARKERS.filter(([, pattern]) => pattern.test(haystack));

  return found.length === 0
    ? undefined
    : found
        .map(([framework]) => framework)
        .slice(0, 1)
        .join('');
}
