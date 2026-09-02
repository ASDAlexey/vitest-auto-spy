/**
 * `@angular/build` in the window where the unit-test build has code splitting off.
 *
 * From 22.1.5 the builder disabled splitting for the unit-test bundle to dodge a live-binding /
 * undefined-export class of failures. The cost is invisible until it is fatal: every spec becomes
 * a self-contained bundle, a mid-size suite emits hundreds of chunks (791 chunks / 596 MB on a
 * 784-spec suite), and `--coverage` grows by hundreds of megabytes with no plateau until the run is
 * killed. The builder emits no warning. PR #33961 restores the option with splitting on by default,
 * so 22.1.7 closes the window.
 *
 * Two readers share the window and the wording, so they cannot drift: the `doctor` check, which a
 * person has to run, and the notice `setupAutoSpy()` prints from inside the run where it hurts.
 *
 * The notice is the one place the library reads the disk: a single `package.json`, read-only,
 * through `process.getBuiltinModule` rather than a static `node:fs` import so that `/setup` stays
 * importable where there is no `process`. Nothing but the warning depends on what it finds.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { writeWarning } from './write-warning';

declare global {
  // eslint-disable-next-line no-var -- a `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyAngularBuildNoticed__: boolean | undefined;
}

const FIRST_AFFECTED = [22, 1, 5];
const FIRST_FIXED = [22, 1, 7];

/**
 * Set by the builder's own `vitest-mock-patch` setup file, which it prepends to the user's setup
 * files (`build-options.js` in 22.1.5 and 22.1.6, `executor.js` for the order).
 */
const ANGULAR_VITEST_MOCK_PATCH = Symbol.for('@angular/cli/vitest-mock-patch');

const MANIFEST = 'node_modules/@angular/build/package.json';

/** Parses `major.minor.patch`, ignoring any prerelease or build suffix. */
export function parseVersion(raw: string): number[] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());

  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function isAffectedVersion(version: readonly number[]): boolean {
  return compareVersions(version, FIRST_AFFECTED) >= 0 && compareVersions(version, FIRST_FIXED) < 0;
}

/** Whether a `package.json` version string falls in the window. */
export function isAffectedRelease(raw: string): boolean {
  const version = parseVersion(raw);

  return version !== undefined && isAffectedVersion(version);
}

/** The finding, worded once for the doctor and for the runtime notice. */
export function describeSplittingOff(version: string): string {
  return `@angular/build ${version} builds the unit-test bundle with code splitting off: one self-contained bundle per spec, and \`--coverage\` grows by hundreds of megabytes with no plateau.`;
}

export const SPLITTING_OFF_FIX = 'Upgrade to 22.1.7 or newer and set `"splitting": true` on the test target.';

export type ReadFile = (path: string) => string | undefined;

interface BuiltinFs {
  readFileSync(path: string, encoding: 'utf8'): string;
}

/** `undefined` for every way this can fail: no `process`, a Node before `getBuiltinModule`, ENOENT. */
function readWithBuiltinFs(path: string): string | undefined {
  const load: ((id: 'node:fs') => BuiltinFs) | undefined = globalThis.process?.getBuiltinModule;

  try {
    return load?.('node:fs').readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function versionIn(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }

  try {
    const manifest: unknown = JSON.parse(text);

    return typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string'
      ? manifest.version
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The version of the `@angular/build` that `cwd` resolves to, walking up the way `require` would,
 * or `undefined` when there is none. `readFile` is injectable for the spec.
 */
export function readInstalledAngularBuildVersion(cwd: string, readFile: ReadFile = readWithBuiltinFs): string | undefined {
  let directory = cwd;

  for (;;) {
    const version = versionIn(readFile(`${directory}/${MANIFEST}`));

    if (version !== undefined) {
      return version;
    }

    const parent = directory.replace(/[/\\][^/\\]*$/, '');

    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

/** Whether the process is a worker of `@angular/build:unit-test`, which patches `vi.mock` and says so. */
export function underAngularUnitTestBuilder(): boolean {
  return Reflect.get(globalThis, ANGULAR_VITEST_MOCK_PATCH) === true;
}

function readInstalledVersionFromCwd(): string | undefined {
  const cwd = globalThis.process?.cwd();

  return cwd === undefined ? undefined : readInstalledAngularBuildVersion(cwd);
}

/**
 * Say once per process that the builder is in the window — in the run where it hurts, which the
 * doctor check and the docs page, both of which have to be sought out, cannot.
 *
 * The builder runs Vitest with `isolate: false` and evaluates the setup file once per worker, so
 * the flag on `globalThis` makes this one line per worker. Both arguments are injectable for the
 * spec: the channel, and the version source.
 */
export function noticeAngularBuildSplitting(
  write: (message: string) => void = writeWarning,
  readVersion: () => string | undefined = readInstalledVersionFromCwd,
): void {
  if (globalThis.__vitestAutoSpyAngularBuildNoticed__ === true || !underAngularUnitTestBuilder()) {
    return;
  }

  // Marked before the read rather than after the write: one disk read per process, whatever it finds.
  globalThis.__vitestAutoSpyAngularBuildNoticed__ = true;

  const version = readVersion();

  if (version === undefined || !isAffectedRelease(version)) {
    return;
  }

  write(
    withDocs(
      `[vitest-auto-spy] ${describeSplittingOff(version)} ${SPLITTING_OFF_FIX} \`npx vitest-auto-spy doctor\` reports this as ` +
        'angular-build-splitting-off. Pass setupAutoSpy({ angularBuildHint: false }) to silence this.',
      DOCS_LINKS.angular,
    ),
  );
}

/** Forget that the notice was given (test-only: the flag is global and outlives a module reset). */
export function resetAngularBuildNotice(): void {
  globalThis.__vitestAutoSpyAngularBuildNoticed__ = undefined;
}
