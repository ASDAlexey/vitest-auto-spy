#!/usr/bin/env node

/**
 * Keep `Spy<T>` from quietly degenerating into a deep proxy.
 *
 * The one type-level claim `docs-site/comparison.md` makes is that `Spy<T>` costs the type-checker
 * roughly half of what deep-proxy mocks cost (2 656 instantiations against 5 092 and 5 614 on the
 * 2026-08-29 survey fixture). Nothing in the gate measured it: a conditional type added to
 * `AddSpyMethodsByReturnTypes`, a distributive branch in `Spy<T>`, a helper that re-instantiates
 * the whole method type per call — each would compile, pass every type test, and double the bill
 * every consumer pays on every `tsc` run, with no signal until somebody re-ran the survey.
 *
 * This is that signal. It generates a fixture of the survey's shape — a class of `MEMBERS`
 * members, `SPIES` `createSpyFromClass` declarations, `TOUCHES` member touches — into a temp
 * directory, type-checks it against the library's **sources** with `tsc --extendedDiagnostics`,
 * and reads the `Instantiations:` line. A second program with the same class and imports but no
 * spies and no touches is the control; the budget applies to the difference, which is the cost
 * attributable to `Spy<T>` and its helpers. The count is deterministic for a given fixture and
 * TypeScript version, so a run that differs from the last one is a change in the types, never
 * noise.
 *
 * The fixture is generated rather than committed because a 600-line file under `src/` would be
 * linted, scanned by jscpd and type-checked by the main gate for no benefit; `--print` shows it.
 *
 * The fixture differs from the survey's (which was never committed), so its numbers are not
 * comparable to the 2 656 — only to themselves across commits.
 *
 * Usage:
 *   node scripts/check-type-budget.mjs             # fails when delta > BUDGET
 *   node scripts/check-type-budget.mjs --measure   # prints the numbers, never fails
 *   node scripts/check-type-budget.mjs --print     # dumps the generated fixture
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The survey fixture's shape: an 80-member class, 30 spy declarations, 600 member touches. */
const MEMBERS = 80;
const SPIES = 30;
const TOUCHES = 600;

/**
 * Instantiations attributable to `Spy<T>` on the fixture above: measured delta plus ~20 % headroom.
 *
 * Baseline 2026-09-02, TypeScript 5.9.3: total 19 933, control 10 807, delta 9 126. A deep-proxy
 * regression roughly doubles the delta, so 20 % catches it while leaving room for a helper or two.
 * Raise this only together with the number in `docs-site/comparison.md` ("Type-check cost").
 */
const BUDGET = 11_000;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function fail(message) {
  process.stderr.write(`check-type-budget: ${message}\n`);
  process.exit(1);
}

/**
 * Member `i` of the fixture class. Every tenth pair is a property and a getter; the rest cycle over
 * the four return shapes `Spy<T>` distinguishes — sync, `Promise`, `Observable`, and sync with
 * arguments — so every branch of `AddSpyMethodsByReturnTypes` is on the bill.
 */
function member(i) {
  const name = `m${i}`;

  switch (i % 10) {
    case 8:
      return { name, kind: 'property', source: `  ${name} = ${i};` };
    case 9:
      return { name, kind: 'getter', source: `  get ${name}(): string {\n    return '${name}';\n  }` };
    default:
      break;
  }

  switch (i % 4) {
    case 0:
      return { name, kind: 'sync', source: `  ${name}(): string {\n    return '${name}';\n  }` };
    case 1:
      return {
        name,
        kind: 'promise',
        source: `  ${name}(_id: number): Promise<{ id: number; name: string }> {\n    return Promise.resolve({ id: _id, name: '${name}' });\n  }`,
      };
    case 2:
      return { name, kind: 'observable', source: `  ${name}(_query: string): Observable<number[]> {\n    return of([${i}]);\n  }` };
    default:
      return { name, kind: 'args', source: `  ${name}(_a: number, _b: string, _c?: boolean): boolean {\n    return _c ?? false;\n  }` };
  }
}

/** Touch `t`: spread across the spies and the members, alternating between the helpers each shape carries. */
function touch(t, members) {
  const spy = `spy${t % SPIES}`;
  const { name, kind } = members[(t * 7) % MEMBERS];
  const variant = Math.floor(t / SPIES) % 3;

  switch (kind) {
    case 'sync':
      return [
        `${spy}.${name}.mockReturnValue('${name}');`,
        `${spy}.${name}.calledWith().returnValue('${name}');`,
        `void ${spy}.${name}();`,
      ][variant];
    case 'promise':
      return [
        `${spy}.${name}.resolveWith({ id: ${t}, name: '${name}' });`,
        `${spy}.${name}.calledWith(${t}).resolveWith({ id: ${t}, name: '${name}' });`,
        `void ${spy}.${name}(${t});`,
      ][variant];
    case 'observable':
      return [`${spy}.${name}.nextWith([${t}]);`, `${spy}.${name}.calledWith('q${t}').nextWith([${t}]);`, `void ${spy}.${name}('q${t}');`][
        variant
      ];
    case 'args':
      return [
        `${spy}.${name}.mockReturnValue(true);`,
        `${spy}.${name}.calledWith(${t}, 'b', true).returnValue(false);`,
        `void ${spy}.${name}(${t}, 'b');`,
      ][variant];
    case 'property':
      return [`${spy}.${name} = ${t};`, `void ${spy}.${name};`, `void ${spy}.accessorSpies.setters.${name};`][variant];
    default:
      return [
        `void ${spy}.${name};`,
        `void ${spy}.accessorSpies.getters.${name};`,
        `${spy}.accessorSpies.getters.${name}.mockReturnValue('${name}');`,
      ][variant];
  }
}

function fixture(withSpies) {
  const members = Array.from({ length: MEMBERS }, (_, i) => member(i));
  const lines = [
    `import { Observable, of } from 'rxjs';`,
    `import { createSpyFromClass, type Spy } from 'vitest-auto-spy';`,
    '',
    'export class Fixture {',
    members.map((m) => m.source).join('\n\n'),
    '}',
    '',
  ];

  if (withSpies) {
    for (let s = 0; s < SPIES; s += 1) {
      lines.push(`const spy${s}: Spy<Fixture> = createSpyFromClass(Fixture);`);
    }

    lines.push('');

    for (let t = 0; t < TOUCHES; t += 1) {
      lines.push(touch(t, members));
    }

    lines.push('');
  }

  // The control keeps the same import graph without tripping `noUnusedLocals`.
  lines.push(`export { createSpyFromClass };`, `export type { Spy };`, '');

  return lines.join('\n');
}

function tsconfig(fixtureFile) {
  return JSON.stringify(
    {
      extends: join(REPO, 'tsconfig.json'),
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        incremental: false,
        types: ['node'],
        typeRoots: [join(REPO, 'node_modules', '@types')],
        paths: {
          'vitest-auto-spy': [join(REPO, 'src', 'index.ts')],
          'vitest-auto-spy/rxjs': [join(REPO, 'src', 'rxjs.ts')],
          rxjs: [join(REPO, 'node_modules', 'rxjs')],
        },
      },
      include: [fixtureFile],
    },
    null,
    2,
  );
}

/** Type-check one generated program and return its `Instantiations:` count. */
function instantiations(dir, label, withSpies) {
  const fixtureFile = join(dir, `${label}.ts`);
  const configFile = join(dir, `tsconfig.${label}.json`);

  writeFileSync(fixtureFile, fixture(withSpies));
  writeFileSync(configFile, tsconfig(fixtureFile));

  const tsc = require.resolve('typescript/lib/tsc.js');
  const result = spawnSync(process.execPath, [tsc, '--extendedDiagnostics', '-p', configFile], { encoding: 'utf8', cwd: REPO });

  if (result.status !== 0) {
    fail(`the ${label} fixture does not compile:\n${result.stdout}${result.stderr}`);
  }

  const match = /^Instantiations:\s+(\d+)/m.exec(result.stdout);

  if (match === null) {
    fail(`no "Instantiations:" line in tsc --extendedDiagnostics output for the ${label} fixture:\n${result.stdout}`);
  }

  return Number(match[1]);
}

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has('--print')) {
    process.stdout.write(fixture(true));

    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'vitest-auto-spy-type-budget-'));
  let total;
  let control;

  try {
    total = instantiations(dir, 'fixture', true);
    control = instantiations(dir, 'control', false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const delta = total - control;
  const shape = `${MEMBERS} members, ${SPIES} spies, ${TOUCHES} touches`;
  const summary = `total ${total}, control ${control}, delta ${delta} (budget ${BUDGET}; ${shape})`;

  if (args.has('--measure')) {
    process.stdout.write(`check-type-budget: ${summary}\n`);

    return;
  }

  if (delta > BUDGET) {
    fail(
      `Spy<T> costs ${delta} type instantiations on the fixture (${shape}), over the budget of ${BUDGET}.\n` +
        `  ${summary}\n` +
        `  The change made Spy<T> or its helpers heavier for every consumer's tsc run — reconsider it. ` +
        `If the growth is deliberate, raise BUDGET in scripts/check-type-budget.mjs together with the ` +
        `number in docs-site/comparison.md ("Type-check cost").`,
    );
  }

  process.stdout.write(`check-type-budget: ${summary}\n`);
}

main();
