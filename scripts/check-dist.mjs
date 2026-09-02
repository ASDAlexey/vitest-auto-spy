#!/usr/bin/env node
// Two invariants over the built package, checked on every `npm run build`.
//
//   1. **No runtime dependencies.** This is a test-double library; a `dependencies` entry would be
//      installed into every consumer's tree, and a dev dependency with a supply chain is exactly
//      what the ecosystem has spent the last two years learning to refuse.
//   2. **`node:fs` stays in the three entries that have a reason for it.** The library does not
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
const FILESYSTEM_ALLOWED = new Set([CLI_BUNDLE, 'bun-angular.js', 'setup.js']);
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
  checkCliBin(manifest);

  if (process.exitCode === undefined || process.exitCode === 0) {
    const allowed = [...FILESYSTEM_ALLOWED].join(', ');

    process.stdout.write(`check-dist: no runtime dependencies, node:fs confined to ${allowed}\n`);
  }
}

main();
