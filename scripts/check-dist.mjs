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
//   3. **A file reached only by a bare `import './x.js'` is named in `sideEffects`.** The library
//      registers its mock adapter by evaluating a module, and esbuild is free to move that
//      expression into a shared chunk — which `dist/bun.js` and `dist/bun-angular.js` then pull in
//      with nothing but a side-effect import. A bundler that honours `sideEffects` drops such an
//      import from a file the field calls pure, and the consumer gets "No mock adapter registered"
//      out of a build that looked fine here. The chunk's name carries a content hash, so the field
//      cannot name it; the pattern has to.
//   4. **A `require`-condition declaration matches what `require` returns.** `dist/*.cjs` that end
//      in `module.exports = x` hand back the value itself, and a `.d.cts` that exports a `default`
//      instead then rejects the code that works and accepts the code that throws.
//   5. **`node:fs` stays in the three entries that have a reason for it.** The library does not
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
// `perf-profiler.js` is the fifth: the setup file that reporter adds to a confirmation pass, which writes
// one CPU profile per spec file and is never loaded by an ordinary run.
const FILESYSTEM_ALLOWED = new Set([CLI_BUNDLE, 'bun-angular.js', 'setup.js', 'perf-reporter.js', 'perf-profiler.js']);
// `rxjs` is the entry that *is* the observable layer; `observer-spy` is the `@hirez_io/observer-spy`
// port, which has no meaning without it. Both are opt-in subpaths nobody reaches without rxjs.
const RXJS_TYPES_ALLOWED = new Set(['rxjs', 'observer-spy']);
const NODE_BUILTINS = /(?:^|[^\w])(?:node:fs|node:os|node:child_process)(?:$|[^\w])/;
// The two entries that run on another runner entirely: their bundles never touch `vitest`, so a
// declaration that names it installs the whole runner on a Bun or `node:test` consumer.
const VITEST_TYPES_FORBIDDEN = new Set(['bun', 'bun-angular', 'node']);
// A relative `import`/`export` in a bundle: the third group is the target, the second is empty when
// nothing is bound from it — a bare side-effect import.
const RELATIVE_EDGE = /(?:^|\n)\s*(?:import|export)\s+(?:([^'";]*?)\s+from\s+)?['"](\.\/[^'"]+)['"]/g;

function typeImportOf(peer) {
  return new RegExp(String.raw`(?:^|\n)\s*import(?:\s+type)?\s+[^;'"]*\bfrom\s*['"]${peer}(?:\/[^'"]*)?['"]`);
}

function fail(message) {
  process.stderr.write(`check-dist: ${message}\n`);
  process.exitCode = 1;
}

function warn(message) {
  process.stderr.write(`check-dist: warning: ${message}\n`);
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

/** Declarations that name `peer` in a way TypeScript resolves — a bare `import 'x';` is inert. */
function declarationsNaming(peer, isAllowed) {
  const names = typeImportOf(peer);

  return distDeclarations().filter((name) => !isAllowed(entryOf(name)) && names.test(readFileSync(join(DIST, name), 'utf8')));
}

function checkRxjsIsNotInTheTypes() {
  const offenders = declarationsNaming('rxjs', (entry) => RXJS_TYPES_ALLOWED.has(entry));

  if (offenders.length > 0) {
    const allowed = [...RXJS_TYPES_ALLOWED].map((entry) => `dist/${entry}.d.ts`).join(' and ');

    fail(
      `${offenders.join(', ')} import rxjs types. Only ${allowed} may — everything else reaches rxjs through ` +
        `\`ObservableLike\` / \`SubjectOf\` in lib/types.ts, so a consumer without the peer never loads it.`,
    );
  }
}

/**
 * The same shape for `vitest`, and deliberately a warning rather than a failure.
 *
 * `/bun` and `/node` run on another runner and their bundles contain no `vitest` at all, but their
 * declarations still re-export a shared type chunk that names `Mock` / `MockInstance`. Replacing
 * those with structural types is a change to `src/lib/types.ts` and a breaking one for anyone who
 * assigns a spy to a `Mock`, so it belongs to a major. Until then the peer is optional
 * (`peerDependenciesMeta`) and this line is what keeps the gap visible.
 */
function reportVitestInTheTypes() {
  const offenders = declarationsNaming('vitest', (entry) => !VITEST_TYPES_FORBIDDEN.has(entry));

  if (offenders.length > 0) {
    warn(
      `${offenders.join(', ')} import vitest types, and neither entry loads vitest at runtime. ` +
        'Structural types in lib/types.ts would free them; that is a breaking type change and waits for a major.',
    );
  }
}

// The `sideEffects` globs as matchers over a flat `dist/`: a leading `**/` is dropped and `*`
// matches within one path segment, so `**/chunk-*.js` matches every emitted chunk whatever its hash.
function sideEffectMatchers(manifest) {
  const patterns = manifest.sideEffects;

  if (!Array.isArray(patterns)) {
    fail('package.json declares no `sideEffects` array; a bundler then assumes every file has side effects.');

    return [];
  }

  return patterns.map((pattern) => {
    const tail = pattern.startsWith('**/') ? pattern.slice(3) : pattern;
    const source = tail.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');

    return new RegExp(`^${source}$`);
  });
}

/** Every ESM entry file in `exports`, relative to `dist/`. */
function esmEntryFiles(manifest) {
  return Object.values(manifest.exports ?? {}).flatMap((target) => {
    const file = typeof target === 'string' ? target : (target.import?.default ?? target.import ?? target.default);

    return typeof file === 'string' && file.endsWith('.js') ? [file.replace(`./${DIST}/`, '')] : [];
  });
}

/**
 * Walks each entry's graph and reports a file that is only ever reached by a bare
 * `import './x.js';` while `sideEffects` calls it pure — the shape a bundler is allowed to drop.
 */
function checkBareImportsAreDeclared(manifest) {
  const matchers = sideEffectMatchers(manifest);
  const declared = (name) => matchers.some((matcher) => matcher.test(name));
  const offenders = new Map();

  for (const entry of esmEntryFiles(manifest)) {
    const seen = new Set();
    const stack = [entry];
    const edges = new Map();

    while (stack.length > 0) {
      const file = stack.pop();

      if (seen.has(file)) {
        continue;
      }

      seen.add(file);

      for (const [, bound, target] of readFileSync(join(DIST, file), 'utf8').matchAll(RELATIVE_EDGE)) {
        const name = target.slice(2);

        edges.set(name, (edges.get(name) ?? false) || Boolean(bound));
        stack.push(name);
      }
    }

    for (const [name, bound] of edges) {
      if (!bound && !declared(name)) {
        offenders.set(name, entry);
      }
    }
  }

  for (const [name, entry] of offenders) {
    fail(
      `dist/${name} is reached from dist/${entry} only by a bare \`import\` and is not matched by \`sideEffects\` — ` +
        'a bundler that honours the field will drop it, and whatever it registers goes with it.',
    );
  }
}

/**
 * A `.cjs` that ends in `module.exports = x` returns the value itself, so the `.d.cts` beside it has
 * to be an `export =`. A `default` there is the masquerading-default bug: it rejects the `require`
 * that works and accepts the `.default` that throws.
 */
function checkCjsTypesMatchTheRuntime() {
  for (const name of distBundles().filter((file) => file.endsWith('.cjs'))) {
    if (!/module\.exports = [A-Za-z_$][\w$]*;\s*$/.test(readFileSync(join(DIST, name), 'utf8'))) {
      continue;
    }

    const types = `${name.replace(/\.cjs$/, '')}.d.cts`;
    let declaration;

    try {
      declaration = readFileSync(join(DIST, types), 'utf8');
    } catch {
      fail(`dist/${name} has no dist/${types} beside it, so the \`require\` condition ships no types.`);
      continue;
    }

    if (!/(?:^|\n)export = /.test(declaration)) {
      fail(
        `dist/${name} ends in \`module.exports = …\`, so \`require()\` returns that value — but dist/${types} ` +
          'declares a module namespace. It has to be `export =`.',
      );
    }
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
  reportVitestInTheTypes();
  checkBareImportsAreDeclared(manifest);
  checkCjsTypesMatchTheRuntime();
  checkCliBin(manifest);

  if (process.exitCode === undefined || process.exitCode === 0) {
    const allowed = [...FILESYSTEM_ALLOWED].join(', ');

    const rxjsAllowed = [...RXJS_TYPES_ALLOWED].join(', ');

    process.stdout.write(
      `check-dist: no runtime dependencies, node:fs confined to ${allowed}, rxjs types confined to ${rxjsAllowed}, ` +
        'every bare import declared in sideEffects, CJS types match their runtime\n',
    );
  }
}

main();
