/**
 * Duplicate-copy detection.
 *
 * Loading `vitest-auto-spy` twice in one process is a silent, expensive failure: each copy keeps
 * its own console spies and its own registries, so `expect(consoleWarnSpy)` asserts against a spy
 * that was never installed over the `console` the code under test called. The symptom looks like
 * "tests fail depending on order", and it has cost this project ~160 red tests once already.
 *
 * It happens two ways — a second install in the dependency tree, and one install loaded in both its
 * ESM and its CommonJS form — so a copy is identified by *package root plus module format*.
 * Identifying it that way is what makes the check trustworthy: one install serving several entries
 * (`vitest-auto-spy` + `vitest-auto-spy/angular`) is a single copy, and `vi.resetModules()`
 * re-instantiating this module registers the same copy again. Neither is a duplicate.
 */
import { DOCS_LINKS } from './docs-links';

/**
 * Registered copies, keyed by identity and valued by package root, kept on `globalThis` so that
 * every copy — each of which has its own module scope, which is the very thing being detected —
 * writes into the same map.
 */
declare global {
  // eslint-disable-next-line no-var -- a `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyPackageCopies__: Map<string, string> | undefined;
}

/** Strip the build layout (`/dist/…`, `/src/…`) off a module URL, leaving the package root. */
export function toPackageRoot(moduleUrl: string): string {
  const separatorIndex = Math.max(moduleUrl.lastIndexOf('/dist/'), moduleUrl.lastIndexOf('/src/'));

  return separatorIndex === -1 ? moduleUrl : moduleUrl.slice(0, separatorIndex);
}

/** Which build of the package a module URL belongs to. Only the CommonJS output carries `.cjs`. */
export function toModuleFormat(moduleUrl: string): 'cjs' | 'esm' {
  return moduleUrl.endsWith('.cjs') ? 'cjs' : 'esm';
}

function getCopies(): Map<string, string> {
  return (globalThis.__vitestAutoSpyPackageCopies__ ??= new Map());
}

/** Record the copy this module belongs to. Called once per entry, on import. */
export function registerPackageCopy(moduleUrl: string = import.meta.url): void {
  const root = toPackageRoot(moduleUrl);

  getCopies().set(`${root} (${toModuleFormat(moduleUrl)})`, root);
}

/**
 * Every copy seen so far, as `<package root> (<format>)`.
 *
 * @example
 * ```ts
 * expect(getPackageCopies()).toHaveLength(1);
 * ```
 */
export function getPackageCopies(): string[] {
  return [...getCopies().keys()];
}

/** Forget every recorded copy (test-only: the map is global and outlives a module reset). */
export function resetPackageCopies(): void {
  getCopies().clear();
}

/**
 * A ready-to-print explanation when more than one copy is loaded, or `undefined` when the process
 * holds exactly one. `setupAutoSpy()` turns this into a thrown error (or a warning).
 *
 * @example
 * ```ts
 * const report = describeDuplicateCopies();
 *
 * if (report) {
 *   throw new Error(report);
 * }
 * ```
 */
export function describeDuplicateCopies(): string | undefined {
  const copies = getCopies();

  if (copies.size < 2) {
    return undefined;
  }

  const distinctRoots = new Set(copies.values());
  const cause =
    distinctRoots.size > 1
      ? `vitest-auto-spy is loaded ${copies.size} times from different installs:`
      : `vitest-auto-spy is loaded ${copies.size} times from one install, in both module formats:`;

  return [
    cause,
    ...getPackageCopies().map((copy) => `  - ${copy}`),
    '',
    ...remedyFor(distinctRoots.size > 1),
    '',
    `Docs: ${DOCS_LINKS.setup}`,
  ].join('\n');
}

function remedyFor(separateInstalls: boolean): string[] {
  const shared = [
    'Each copy keeps its own console spies and registries, so assertions run against a spy that',
    'never replaced the console/property the code under test touched — tests then fail depending',
    'on file order.',
  ];

  if (separateInstalls) {
    return [
      ...shared,
      'Collapse the tree to one copy:',
      '  1. `npm ls vitest-auto-spy` (or `bun pm ls`) to see who pulls the second one in;',
      '  2. align the versions, or pin one with `overrides` (npm) / `resolutions` (yarn, bun);',
      '  3. re-run with a clean `node_modules` if a lockfile hoisted both.',
    ];
  }

  return [
    ...shared,
    'One install is being loaded both as ESM and as CommonJS. Pick one:',
    '  1. make sure nothing `require()`s the package while the rest of the suite `import`s it;',
    '  2. in Vitest, drop the package from `server.deps.inline` / `deps.optimizer` if it is listed there;',
    '  3. check that a setup file and a spec do not reach it through different specifiers.',
  ];
}
