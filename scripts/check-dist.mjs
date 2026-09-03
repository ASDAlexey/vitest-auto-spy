#!/usr/bin/env node
// Two invariants over the built package, checked on every `npm run build`.
//
//   1. **No runtime dependencies.** This is a test-double library; a `dependencies` entry would be
//      installed into every consumer's tree, and a dev dependency with a supply chain is exactly
//      what the ecosystem has spent the last two years learning to refuse.
//   2. **rxjs is named by no declaration but the two entries that are about rxjs.** `import type`
//      does not help: TypeScript resolves a type-only import exactly as it resolves a value one, so
//      the reference in the shared `types-*.d.ts` chunk pulled 189 rxjs `.d.ts` files into the
//      program of every React / Vue / Svelte / Node consumer (303 files against 114 for the same
//      fixture without it) and raised `TS2307` for anyone without the optional peer and
//      `skipLibCheck: false`. Removing it was a breaking type change and cost a major; one
//      `import type { Observable }` written back into `lib/types.ts` would undo it silently, in a
//      file whose own compile stays green. Bare side-effect `import 'rxjs';` lines are inert —
//      TypeScript reports nothing for an unresolvable one in a declaration file and loads nothing —
//      so they are not what this looks for.
//   3. **`node:fs` stays in the three entries that have a reason for it.** The library does not
//      read the disk to decide anything — the moment it does, a spec's behaviour depends on a file
//      nobody wrote down. `dist/cli.js` must (`doctor` and `init` are about a repository), and
//      `dist/bun-angular.js` must (Bun has no Angular compiler, so the preload inlines
//      `templateUrl` / `styleUrl` from disk itself). `dist/setup.js` is the one deliberate
//      exception on the library side: `setupAutoSpy()` reads a single `node_modules/@angular/build/
//      package.json`, read-only and through `process.getBuiltinModule` so the entry still loads
//      where there is no `process`, and the only thing that depends on what it finds is one warning
//      line. Anything else reaching for a filesystem — and the literal landing in a shared chunk
//      instead of `setup.js` — is the regression this catches.
//
// Both are cheap to state and impossible to keep by intention alone, which is what makes them
// worth a script rather than a paragraph in CONTRIBUTING.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const CLI_BUNDLE = 'cli.js';
// `perf-reporter.js` is the fourth: it is the reporter `vitest-auto-spy perf` attaches to a
// consumer's run, and writing the measurement to a file is the whole of what it does.
const FILESYSTEM_ALLOWED = new Set([CLI_BUNDLE, 'bun-angular.js', 'setup.js', 'perf-reporter.js']);
// `rxjs` is the entry that *is* the observable layer; `observer-spy` is the `@hirez_io/observer-spy`
// port, which has no meaning without it. Both are opt-in subpaths nobody reaches without rxjs.
const RXJS_TYPES_ALLOWED = new Set(['rxjs', 'observer-spy']);
const RXJS_IMPORT = /(?:^|\n)\s*import(?:\s+type)?\s+[^;'"]*\bfrom\s*['"]rxjs(?:\/[^'"]*)?['"]/;
const NODE_BUILTINS = /(?:^|[^\w])(?:node:fs|node:os|node:child_process)(?:$|[^\w])/;

function fail(message) {
  process.stderr.write(`check-dist: ${message}\n`);
  process.exitCode = 1;
}

function readManifest() {
  return JSON.parse(readFileSync('package.json', 'utf8'));
}

function checkNoDependencies(manifest) {
  const declared = Object.keys(manifest.dependencies ?? {});

  if (declared.length > 0) {
    fail(`package.json declares ${declared.length} runtime dependencies (${declared.join(', ')}); this package ships none.`);
  }
}

function distBundles() {
  return readdirSync(DIST)
    .filter((name) => name.endsWith('.js') || name.endsWith('.cjs'))
    .sort();
}

function checkFilesystemAccess() {
  const offenders = distBundles().filter(
    (name) => !FILESYSTEM_ALLOWED.has(name) && NODE_BUILTINS.test(readFileSync(join(DIST, name), 'utf8')),
  );

  if (offenders.length > 0) {
    const allowed = [...FILESYSTEM_ALLOWED].map((name) => `dist/${name}`).join(' and ');

    fail(`${offenders.join(', ')} reach for node:fs / node:os / node:child_process. Only ${allowed} may.`);
  }
}

function distDeclarations() {
  return readdirSync(DIST)
    .filter((name) => name.endsWith('.d.ts') || name.endsWith('.d.cts'))
    .sort();
}

/** The entry a declaration file belongs to: `angular.d.ts` and `angular.d.cts` are both `angular`. */
function entryOf(name) {
  return name.replace(/\.d\.c?ts$/, '');
}

function checkRxjsIsNotInTheTypes() {
  const offenders = distDeclarations().filter(
    (name) => !RXJS_TYPES_ALLOWED.has(entryOf(name)) && RXJS_IMPORT.test(readFileSync(join(DIST, name), 'utf8')),
  );

  if (offenders.length > 0) {
    const allowed = [...RXJS_TYPES_ALLOWED].map((entry) => `dist/${entry}.d.ts`).join(' and ');

    fail(
      `${offenders.join(', ')} import rxjs types. Only ${allowed} may — everything else reaches rxjs through ` +
        `\`ObservableLike\` / \`SubjectOf\` in lib/types.ts, so a consumer without the peer never loads it.`,
    );
  }
}

function checkCliBin(manifest) {
  const declared = manifest.bin?.['vitest-auto-spy'];

  if (declared !== `./${DIST}/${CLI_BUNDLE}`) {
    fail(`package.json "bin" should point at ./${DIST}/${CLI_BUNDLE}, not ${declared}.`);

    return;
  }

  const source = readFileSync(join(DIST, CLI_BUNDLE), 'utf8');

  if (!source.startsWith('#!/usr/bin/env node')) {
    fail(`dist/${CLI_BUNDLE} has no shebang — npm links it as an executable.`);
  }

  if ((statSync(join(DIST, CLI_BUNDLE)).mode & 0o111) === 0) {
    fail(`dist/${CLI_BUNDLE} is not executable.`);
  }
}

function main() {
  const manifest = readManifest();

  checkNoDependencies(manifest);
  checkFilesystemAccess();
  checkRxjsIsNotInTheTypes();
  checkCliBin(manifest);

  if (process.exitCode === undefined || process.exitCode === 0) {
    const allowed = [...FILESYSTEM_ALLOWED].join(', ');

    const rxjsAllowed = [...RXJS_TYPES_ALLOWED].join(', ');

    process.stdout.write(`check-dist: no runtime dependencies, node:fs confined to ${allowed}, rxjs types confined to ${rxjsAllowed}\n`);
  }
}

main();
