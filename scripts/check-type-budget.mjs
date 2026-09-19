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
 * The treatment program also carries a second fixture, `surfaces.ts`, which the control does not
 * include. Both programs import the root barrel, so a type that merely rides the barrel is
 * declared in each program and instantiated in neither — its cost cancels out of the delta, and a
 * heavy conditional there could never fail this gate. That was not hypothetical: everything the
 * root entry gained in 5.19 (`captureArg`/`ArgCaptor`, `ConstructorSpy`/`SpyClassOptions`,
 * `moduleNamespace`, the prop-mock and emission helpers) sat in that blind spot, and the opt-in
 * entries — `/signal-forms` with Angular's `FieldTree`, the jasmine `JasmineSpy` surface — were
 * imported by no program at all. `surfaces.ts` instantiates each of them once against the same
 * fixture class, so what the delta measures is the consumer-paid cost of every public surface,
 * not only `Spy<T>`.
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
 * Instantiations attributable to the measured spy surface on the fixtures above: measured delta
 * plus ~20 % headroom.
 *
 * Baseline 2026-09-19, TypeScript 6.0.3: total 43 143, control 14 226, delta 28 917. The scope
 * widened the same day — the treatment program gained `surfaces.ts`, which instantiates the 5.19
 * root-barrel types, the jasmine `JasmineSpy` surface and `/signal-forms`, none of which the
 * delta could see before (barrel riders cancelled against the control; the opt-in entries were in
 * no program at all). Figures recorded before the widening are a different quantity and are not
 * comparable to this one.
 *
 * The surfaces carry 17 400 of the delta on the baseline tree: ~2 100 the 5.19 root-barrel
 * types, ~4 850 the jasmine surface, ~10 500 `/signal-forms`, whose `FieldTree` is Angular's and
 * is what a consumer of that entry pays. On the pre-widening scope the same toolchain measured
 * delta 11 517 (2026-09-19, with that day's edits to `lib/types.ts`), against the recorded
 * 10 410 (2026-09-12, TypeScript 6.0.3) and 9 126 (2026-09-02, TypeScript 5.9.3).
 *
 * A deep-proxy regression roughly doubles the `Spy<T>` part of the delta, so 20 % headroom
 * catches it while leaving room for a helper or two. Raise this only together with the number in
 * `docs-site/comparison.md` ("Type-check cost"), and only with the control's own movement
 * measured next to it.
 */
const BUDGET = 34_700;

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

/**
 * The opt-in surfaces fixture: one real use of every type the root barrel and the opt-in entries
 * carry, so none of them can hide behind the control's cancellation — both programs import the
 * root entry, and a type that is only declared, never instantiated, costs both sides equally and
 * drops out of the delta.
 *
 * It is a separate file because the control must not include it: an import in the shared fixture
 * would put these types on both sides of the subtraction again. Every import is referenced at
 * least once, because an unused import is elided and an uninstantiated type costs nothing —
 * `Spy<T>` itself is exercised the same way, through a fixture-class instantiation rather than a
 * name.
 */
function surfacesFixture(mainLabel) {
  return [
    `import { required } from '@angular/forms/signals';`,
    `import { of } from 'rxjs';`,
    `import { expect } from 'vitest';`,
    `import {`,
    `  assertMocked,`,
    `  captureArg,`,
    `  countMockedProps,`,
    `  createSpyClass,`,
    `  expectCompletion,`,
    `  expectEmission,`,
    `  expectEmissions,`,
    `  expectError,`,
    `  expectNoEmission,`,
    `  mockAccessorsProp,`,
    `  mockReadonlyProp,`,
    `  mockValueProp,`,
    `  moduleNamespace,`,
    `  reportPropsOutsideHooks,`,
    `  restoreMockedProps,`,
    `  setEmissionTimeout,`,
    `  type AccessorImplementations,`,
    `  type ArgCaptor,`,
    `  type AssertMockedOptions,`,
    `  type CallbackSubscribable,`,
    `  type CaptureArgOptions,`,
    `  type ConstructorSpy,`,
    `  type EmissionObserver,`,
    `  type EmissionOptions,`,
    `  type EmissionSource,`,
    `  type ModuleNamespace,`,
    `  type ModuleNamespaceOptions,`,
    `  type RestoreProp,`,
    `  type SpyClassOptions,`,
    `  type SubscribableLike,`,
    `} from 'vitest-auto-spy';`,
    `import {`,
    `  createFunctionSpy as createJasmineFunctionSpy,`,
    `  createSpyFromClass as createJasmineSpyFromClass,`,
    `  createSpyObj,`,
    `  provideAutoSpy,`,
    `  type AngularValueProvider,`,
    `  type JasmineClassSpyConfiguration,`,
    `  type JasmineSpy,`,
    `  type SpyObj,`,
    `} from 'vitest-auto-spy/jasmine';`,
    `import { createForm, registerFormMatchers, type CreateFormOptions, type FieldErrorMatch } from 'vitest-auto-spy/signal-forms';`,
    ``,
    `import { Fixture } from './${mainLabel}';`,
    ``,
    `const captorOptions: CaptureArgOptions = { where: (value) => typeof value === 'number' };`,
    `const numberCaptor: ArgCaptor<number> = captureArg<number>(captorOptions);`,
    `const idCaptor: ArgCaptor<{ id: number }> = captureArg<{ id: number }>();`,
    `void numberCaptor.values.length;`,
    `void idCaptor.captured;`,
    `numberCaptor.reset();`,
    ``,
    `const classOptions: SpyClassOptions = { statics: true };`,
    `const FixtureSpyClass: ConstructorSpy<Fixture> = createSpyClass(Fixture, { onlyMethodsToSpyOn: ['m0', 'm1', 'm3'] }, classOptions);`,
    `void FixtureSpyClass.calls.length;`,
    `void FixtureSpyClass.instances.length;`,
    ``,
    `const namespaceOptions: ModuleNamespaceOptions = { lenient: true };`,
    `const namespace: ModuleNamespace<{ load: (id: number) => void }> = moduleNamespace({ load: () => undefined }, namespaceOptions);`,
    `void namespace.load;`,
    `void namespace.default;`,
    `const mockedOptions: AssertMockedOptions = { specifier: 'surfaces-ns', exports: ['load'] };`,
    `void assertMocked(namespace, mockedOptions);`,
    ``,
    `const host = { version: 1, label: 'x' };`,
    `const accessors: AccessorImplementations = { get: () => 'patched' };`,
    `const restoreValue: RestoreProp = mockValueProp(host, 'version', 2);`,
    `const restoreReadonly: RestoreProp = mockReadonlyProp(host, 'label', 'readonly');`,
    `const restoreAccessors: RestoreProp = mockAccessorsProp(host, 'label', accessors);`,
    `restoreValue();`,
    `restoreReadonly();`,
    `restoreAccessors();`,
    `void countMockedProps();`,
    `reportPropsOutsideHooks('warn');`,
    `restoreMockedProps();`,
    ``,
    `const numbers$ = of(1, 2);`,
    `const numbersSource: EmissionSource<number> = numbers$;`,
    `const emissionOptions: EmissionOptions<number> = { label: 'numbers', timeout: 50, until: (value) => value > 0 };`,
    `const customSource: SubscribableLike<number> = {`,
    `  subscribe(observer) {`,
    `    observer.next?.(1);`,
    `    return { unsubscribe: () => undefined };`,
    `  },`,
    `};`,
    `const callbackSource: CallbackSubscribable<number> = {`,
    `  subscribe(next) {`,
    `    next(1);`,
    `    return { unsubscribe: () => undefined };`,
    `  },`,
    `};`,
    `const observer: EmissionObserver<number> = {`,
    `  next: (value) => { void value; },`,
    `  error: (error) => { void error; },`,
    `  complete: () => undefined,`,
    `};`,
    `void numbersSource;`,
    `void observer;`,
    `void expectEmission(numbers$, emissionOptions);`,
    `void expectEmissions(numbers$, 2);`,
    `void expectNoEmission(numbers$);`,
    `void expectCompletion(customSource);`,
    `void expectError(callbackSource);`,
    `setEmissionTimeout(5000);`,
    ``,
    `const jasmineConfig: JasmineClassSpyConfiguration<Fixture> = { methodsToSpyOn: ['m0'] };`,
    `const jspy: JasmineSpy<Fixture> = createJasmineSpyFromClass(Fixture, jasmineConfig);`,
    `jspy.m0.and.returnValue('m0');`,
    `jspy.m1.and.resolveTo({ id: 1, name: 'm1' });`,
    `jspy.m2.and.nextWith([1]);`,
    `jspy.m3.withArgs(1, 'b').and.returnValue(true);`,
    `void jspy.m0.calls.count();`,
    `void jspy.m0.calls.mostRecent();`,
    `jspy.accessorSpies.getters.m9.and.returnValue('m9');`,
    ``,
    `const fnSpy = createJasmineFunctionSpy<() => string>('fn');`,
    `fnSpy.and.returnValue('fn');`,
    ``,
    `const provider: AngularValueProvider<Fixture> = provideAutoSpy(Fixture);`,
    `void provider.useValue.m0.and.returnValue('m0');`,
    ``,
    `const store: SpyObj<'load' | 'save', 'id'> = createSpyObj('store', ['load', 'save'], { id: 7 });`,
    `store.load.and.returnValue(undefined);`,
    `void store.id;`,
    ``,
    `const formOptions: CreateFormOptions = {};`,
    `const expected: readonly FieldErrorMatch[] = [{ kind: 'required', message: 'Email is required' }];`,
    `const user = createForm(`,
    `  { email: '', name: '' },`,
    `  (path) => {`,
    `    required(path.email, { message: 'Email is required' });`,
    `    required(path.name);`,
    `  },`,
    `  formOptions,`,
    `);`,
    `expect(user.email).toHaveFieldErrors(expected);`,
    `registerFormMatchers();`,
    '',
  ].join('\n');
}

function tsconfig(files) {
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
          'vitest-auto-spy/jasmine': [join(REPO, 'src', 'jasmine.ts')],
          'vitest-auto-spy/rxjs': [join(REPO, 'src', 'rxjs.ts')],
          'vitest-auto-spy/signal-forms': [join(REPO, 'src', 'signal-forms.ts')],
          rxjs: [join(REPO, 'node_modules', 'rxjs')],
          vitest: [join(REPO, 'node_modules', 'vitest')],
          '@angular/forms/signals': [join(REPO, 'node_modules', '@angular', 'forms', 'types', 'signals.d.ts')],
        },
      },
      include: files,
    },
    null,
    2,
  );
}

/** Type-check one generated program and return its `Instantiations:` count. */
function instantiations(dir, label, { withSpies, withSurfaces = false }) {
  const fixtureFile = join(dir, `${label}.ts`);
  const configFile = join(dir, `tsconfig.${label}.json`);
  const files = [fixtureFile];

  writeFileSync(fixtureFile, fixture(withSpies));

  if (withSurfaces) {
    const surfacesFile = join(dir, 'surfaces.ts');

    writeFileSync(surfacesFile, surfacesFixture(label));
    files.push(surfacesFile);
  }

  writeFileSync(configFile, tsconfig(files));

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
    process.stdout.write([fixture(true), surfacesFixture('fixture')].join('\n'));

    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'vitest-auto-spy-type-budget-'));
  let total;
  let control;

  try {
    total = instantiations(dir, 'fixture', { withSpies: true, withSurfaces: true });
    control = instantiations(dir, 'control', { withSpies: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const delta = total - control;
  const shape = `${MEMBERS} members, ${SPIES} spies, ${TOUCHES} touches, opt-in surfaces`;
  const summary = `total ${total}, control ${control}, delta ${delta} (budget ${BUDGET}; ${shape})`;

  if (args.has('--measure')) {
    process.stdout.write(`check-type-budget: ${summary}\n`);

    return;
  }

  if (delta > BUDGET) {
    fail(
      `The measured spy surface costs ${delta} type instantiations on the fixture (${shape}), over the budget of ${BUDGET}.\n` +
        `  ${summary}\n` +
        `  The change made Spy<T>, its helpers, or one of the measured opt-in surfaces heavier for every ` +
        `consumer's tsc run — reconsider it. If the growth is deliberate, raise BUDGET in ` +
        `scripts/check-type-budget.mjs together with the number in docs-site/comparison.md ("Type-check cost").`,
    );
  }

  process.stdout.write(`check-type-budget: ${summary}\n`);
}

main();
