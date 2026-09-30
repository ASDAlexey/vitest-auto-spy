# IDEAS — improvements found while using the library

The inbox for what real suites and research runs turned up: consumer upgrades, audits, perf and
mocking research. Every entry was checked against the source when it was written down, so it is not
shipped, not already an open item in [`TODO.md`](./TODO.md), and not declined in
[`DECISIONS.md`](./DECISIONS.md). An entry moves to `TODO.md` once it is scheduled, to `DECISIONS.md`
once it is declined, and is deleted once it ships: shipped work lives in `CHANGELOG.md`.

How to add an entry:

- Search this file, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md` and `src/` first. Do not add what is
  already shipped or already declined.
- One `- [ ]` block: what is wrong or missing, where it shows up, the proposed fix, and the evidence
  (`file:line`, a grep that finds nothing). Add the date and the library version it was seen on.
- This repository is public. Describe consumer code by its shape and size ("a conaumer suite of ~12k
  tests, 60 call sites"), never by project name, path, package scope or ticket.

Checked against 5.49.0 on 2026-09-29.

## Release and packaging

- [x] **The published `dist/cli.js` carries the previous version in `EXPORT_MAP_VERSION`.** The 5.49.0
      tarball has `"5.48.0"`: `auto-release.yml` builds before `npm version`, and the `version` script
      regenerates `src/cli/checks/export-map.generated.ts` after the build. Harmless until a major, where
      the major comparison in `entry-imports.ts` reads the wrong one. Rebuild after `npm version`, or read
      the version from `package.json` at runtime.
- [x] **`Symbol.dispose` in the public types breaks consumers without `@types/node` or
      `esnext.disposable`** (TS2550 in `types-*.d.ts`). The CI probe uses `types: ["node"]` and cannot
      see it. A package-owned `unique symbol` shim, plus a type fixture with `"types": []` and
      `skipLibCheck: false`.
- [x] **Undeclared runtime peers.** `dist/angular-matchers.js` and `dist/bun-angular.js` import
      `@angular/compiler`, `dist/rstest.js` imports `@rstest/core`; neither is in `peerDependencies`.
      Declare both as optional peers and make `check-dist` assert that every bare import in `dist` is a
      declared peer. A pnpm tarball install in CI is what would catch the next one.
- [x] **`check-dist` calls a bare side-effect import inert, which it is not.** A `node:test`-only consumer
      with `skipLibCheck: false` gets TS2882 in `node.d.ts` and TS2307 in `bun.d.ts`. Fix the comment
      (`scripts/check-dist.mjs:14`, `:128`) and stop exempting bare imports in `declarationsNaming`.
- [x] **The shared `.d.ts` chunk is named `bun`.** Go-to-definition from the root lands in `bun.d.ts`,
      and size audits count ~58 K as "bun". Rename the chunk to `core`.
- [x] **`/console` still imports `vitest`** (`src/lib/console-spy.ts:20`, `useVitestAdapter()` at import),
      so `node:test`, Rstest and Bun consumers cannot use it without Vitest installed. Take the hooks and
      the adapter from the registered runner.
- [x] **No runner-agnostic Nest entry.** `/nestjs` goes through `useVitestAdapter`, so a Nest suite on
      `node --test` cannot load `createNestUnit`. Add `/nest-unit` or re-export from `/node` and `/bun`.
      The 5.19.0 CHANGELOG entry says this "is in TODO.md"; it is not.
- [x] **`RouteResources` is not re-exported from `vitest-auto-spy/angular-router`**: it is exported from
      `src/lib/angular-router.ts:60`, not from `src/angular-router.ts`.
- [x] **`JasmineWithArgsStrategies` is not exported** from `/jasmine` or `/jasmine-compat`.
- [x] **`ɵSIGNAL` is a named import** (`run-effect.ts:35`, `angular-internals.ts:19`), so an Angular
      major without it breaks `/angular` and `/angular/matchers` at link time. Read it structurally.
- [x] **The CLI imports the codemod statically** (`src/cli/main.ts:11`), so `--version`, `init` and
      `doctor` all parse it. `await import('./codemod/run')` inside the command.

## Spy engine and factories

- [x] **A class double that declares `then()` is a thenable that never settles**: `await double` hangs.
      Skip `then` in `extractMethodsFromObject` unless named explicitly, and warn once.
- [x] **`createSpyFromClass` harvests built-in base prototypes**: `extends Error` / `Array` spies
      `toString`, `at`, `message`. Stop `walkOwnPrototypes` at native prototypes.
- [x] **`mockReset()` keeps the `mockName()`**; Vitest resets it (`fast-spy.ts:601-605`).
- [x] **A fast spy's `length` is always 0**; `vi.fn(impl).length` is `impl.length`.
- [x] **`createAutoMock` materialises spies for `toString` / `valueOf`**, so logging the double pollutes
      `ownKeys` and snapshots. `isProtocolKey` in `proxy-props.ts` covers neither.
- [x] **`withImplementation` skips the dispatch-replaced report** and silently disables a `calledWith`
      chain (`fast-spy.ts:427-440`). Route it through `implementationReplaced()`, or document it.
- [x] **`.once()` / `.times(n)` on a sync `calledWith` handle.** `WithMockReturnValue` has only
      `mockReturnValue` / `returnValue`.
- [x] **One-time hint when a lenient `calledWith` misses at the same arity**, through
      `reportMisconfiguration`.
- [x] **`accessorSpies` is an enumerable own key on every double** (`accessor-spy.ts:79-83`), so it leaks
      into `Object.keys`, spread and snapshots. Make it non-enumerable.
- [x] **Undone prop-mock journal entries keep `object` and `descriptor`** (`prop-mock.ts:261-271`), so the
      journal grows per worker without `setupAutoSpy` and `countMockedProps` is O(n). Null both on undo.
- [x] **`keepMockRegistered` holds mocks strongly** (a plain array, `mock-registry.ts:116`), which defeats
      Vitest 5's WeakRef registry.
- [x] **The `node:test` adapter's `reset` keeps the implementation** (`node-adapter.ts:84`), against the
      `MockAdapter` contract. `mock.restore?.()`, then `resetCalls()`.
- [x] **`setSpyEngine` is worker-global with no undo** and leaks across files under `isolate: false`.
      Return an undo, or document it as setup-file only.
- [x] **`adoptMock` and module passthrough call the real function with `this` undefined**
      (`adopt-mock.ts:49`, `module-mocks.ts:188`). Pass the receiver, or one docs line, EN and RU.
- [x] **`explainSpy(undefined | null)` throws**, though its contract says it never does
      (`explain-spy.ts:237`).
- [x] **Strict doubles need every void method spelled `returns: { m: undefined }`** — six entries for one
      store in a consumer suite. A list option beside `selfReturning`, for example
      `returnsUndefined: OnlyMethodKeysOf<T>[]`.
- [x] **Measure the fast-spy call-state growth cascade 4 → 8 → 17**: about −20 % at 5–8 calls.
      `DECISIONS.md` ("seeded at four, regrown to seventeen") says "not done yet".
- [x] **Derive `settledResults` and `instances` on first read (M3)**: −193 B per called method, −95 B per
      later call, −12…−19 % per double. `fast-mock-state.ts` still pushes both on every call.
- [x] **`createSpyForToken` forces `lazySpies: true`** (`track-injections.ts:37`), so wide token classes
      never get the `'proxy'` default.
- [x] **`createAutoMock` cannot take a config without a placeholder first argument.** The only
      signature is `createAutoMock<T, Options extends SpyOptions = SpyOptions>(overrides?:
DeepPartial<T>, config?: AutoMockConfiguration<T>)` (`auto-mock.ts:76`), so a spec that seeds
      nothing but wants `returnsUndefined` — added in 5.51.0 — has to spell
      `createAutoMock<EventSource>(undefined, { returnsUndefined: ['close'] })`: the bag alone binds
      to `overrides` and is stored as a seed instead of being read as configuration. A config-only
      overload `createAutoMock<T>(config?: AutoMockConfiguration<T>)` is safe to add, because a
      literal whose keys are `returnsUndefined` / `selfReturning` / `strict` fails `DeepPartial<T>`
      for any `T` without those members and falls through to it. The other factories that gained
      `returnsUndefined` take a required first argument (`createSpyFromClass(Store, { … })`), so
      the placeholder is `createAutoMock`'s alone. One call site in a consumer suite
      (2026-09-29, 5.51.0).
- [x] **A one-call shape for "this factory method returns a double of that class".** Today the
      pattern is two statements: build what the method returns with `createSpyFromClass(Inner)`,
      then thread it into the outer double's config as `provideAutoSpy(Outer, { returns: { factory:
asInstance(innerSpy) } })`, where `asInstance` exists only to satisfy the config's type. A
      helper or option that takes the class and does both — say `returnsClass: { factory: Inner }`
      beside `returns`, or a `spyOf(Inner)` value `returns` accepts — would state the intent once
      and keep the inner double's construction out of the spec. Seen exactly once in a consumer
      suite, so a convenience, not a pattern (2026-09-29, 5.51.0).

- [x] **`returnsClass` cannot configure the inner double.** Seen 2026-09-30 on 5.57.0. Under global
      `strict`, a factory method whose returned object has a void method
      (`createSpyFromClass(SnackBarRef, { returnsUndefined: ['dismiss'] })` fed to
      `returns: { openFromComponent: asInstance(ref) }`) cannot move to `returnsClass`: `MethodReturnsClass<T>`
      takes only a class, so the inner `dismiss` throws as unconfigured. Also accept a pair,
      `returnsClass: { m: [Class, config] }` or `{ class, config }`. Evidence: `MethodReturnsClass` in
      `src/lib/types.ts` is `ClassType<ReturnType<T[K]>>`; one consumer call site, kept on the two-step form.
- [x] **No unrecorded way to reach the `returnsClass` inner double.** `asSpy(outer.create(...))` is itself a
      recorded call, so a spec that asserts `toHaveBeenCalledExactlyOnceWith` on the factory method, or
      reads the inner double before any call, has to stay on the two-step form (the docs say so). A reader
      such as `innerDouble(outer, 'create')` that returns the per-outer double without calling the method
      would let those specs move too. Seen 2026-09-30 on 5.57.0: one consumer spec, 9 tests counting calls.

## Angular helpers

- [x] **Typed stub of a plain `HTMLElement` in `/dom-stubs`**: `classList`, `style`, attributes and
      listeners on spies, so a directive or a DOM-touching service is tested by calls on the stub over
      `ElementRef`. `/dom-stubs` has observers, rAF, media, rects, storage and Worker, not an element.
- [x] **`fillMissingDomApis()` in `/dom-stubs`, run before `setupAutoSpy`**: the `PointerEvent` polyfill,
      a no-op `ResizeObserver` when missing, no-op `scrollTo` / `scrollBy` / `scrollIntoView`, a cheap
      `getComputedStyle`, `document.doctype`. Consumers hand-write this per worker, and installing it
      before the snapshot keeps the global-patch guard from blaming a test. `perf` already tells users to
      "stub the measurement" and there is nothing to stub it with.
- [x] **`mockSignalProps(store, { a, b, c })`**: one call per `signalStore` double instead of one
      `mockSignalProp` per key; returns a record of handles.
- [x] **`toHaveSignalValue` misleads when the component copied the signal into a field at construction.**
      The message only says "use mockSignalProp()", which cannot reach the copy; the fix is
      `overrides: { x: signal(v) }` before render. Add that case to the message
      (`signal-matchers.ts:101`) and to `agent-docs/errors.md`.
- [x] **`prepareShallow(...).create({ providers })` replaces the shared providers** instead of adding to
      them (`render-shallow.ts:389-394`). An additive `extraProviders`, or concatenate `providers` and
      `imports`.
- [x] **`renderShallow` `keepChildren` is a silent no-op on a non-standalone component**: the
      non-standalone path ignores it. Add to `declarations`, or throw with the
      `imports: [DeclaringModule]` hint.
- [x] **When `prepareShallow` pays off is not stated** (2026-09-29, 5.49.0). A consumer rollout picked specs
      by `renderShallow` count (10 and 6 calls) and found no shared options in either: each call passes
      different `inputs` or none, so `prepareShallow(X)` would only rename. Say in the JSDoc and
      `agent-docs/angular.md` that it needs a shared non-empty `providers` / `imports`; a lint hint could
      fire at ≥ 3 `renderShallow` calls in one describe with the same such options.
- [x] **No TestBed metadata passthrough on `renderShallow`**: `deferBlockBehavior`, `errorOnUnknown*`,
      `teardown`. `testBed?: Omit<TestModuleMetadata, 'imports' | 'declarations' | 'providers'>`.
- [x] **`renderShallow` after `TestBed.inject` shows Angular's bare "already instantiated" error.** Catch
      and rethrow naming `renderShallow` and `beforeCreate`.
- [x] **`overrideComponentProvider` must precede the first `injectSpy` in `beforeCreate`** — only the
      JSDoc says so. One sentence in `agent-docs/angular.md` and `docs-site/adapters/angular.md` (EN and
      RU); optionally teach `no-inject-before-override` about it (`OVERRIDES_THE_MODULE` in
      `testbed-order.ts`).
- [x] **`extendWithAutoSpies` builds every declared spy in every test**, though its docblock promises an
      entry a test does not destructure is never built (eager `useValue`). A lazy `useFactory` per entry,
      or correct the docblock.
- [x] **`provideAutoSpy()` accepts a component or directive class**, which is always a mistake; consumers
      keep a local lint rule for it. A runtime check on static `ɵcmp` / `ɵdir`, or a plugin rule.
- [x] **No diagnosis when Vitest externalizes the package and `@angular/core/testing` splits into two
      TestBeds.** `injectSpy` throws "Need to call TestBed.initTestEnvironment() first" or "Cannot read
      properties of null (reading 'ngModule')"; only `server.deps.inline: ['vitest-auto-spy']` helps, and
      it took a consumer a full debugging session. A `doctor` check for a plain-Vitest Angular config
      without it, and/or `injectSpy` naming the two-instance cause.
- [x] **No clean-bed check at file end**: a leftover `_testModuleRef`, live fixtures or wrapped TestBed
      methods pass unnoticed. An `afterAll` from `setupAutoSpy`, which can also reset the diagnostics and
      testbed-diagnostics module state in one place.
- [x] **Candidate doubles with no helper**: `PLATFORM_ID` / `IS_PLATFORM_BROWSER` (156 hand-rolled
      providers in one suite), `DomSanitizer`, `Overlay`, `ChangeDetectorRef`.
- [x] **Docs: `flushEffects()` and `stable()` each cost a full change-detection pass.** One sentence in
      `agent-docs/angular.md` and the site, EN and RU.
- [x] **Docs page "Material idioms → library"**: `ScrollStrategy`, `MAT_ICON_LOCATION`,
      `MATERIAL_ANIMATIONS`, `ScrollDispatcher` literal doubles turned into `provideAutoSpyForToken` /
      `createSpyFromClass`, plus a partial-double recipe.

## Async, timers, HTTP, console

- [x] **`expectUnhandledObservableErrors` rejects `HttpErrorResponse`**, which does not extend `Error`:
      the class form is typed `abstract new () => Error` and the `{ message }` form requires
      `instanceof Error` (`stray-timers.ts:830-845`). Widen to `abstract new (...args: never[]) => unknown`
      and match `{ message }` on any object with a string `message`.
- [x] **Synchronous `RequestExpectation.flush` / `error`.** `{ tick: false }` shipped in 5.46.0, but both
      still return `Promise<void>`, so a spec with ten sync `it()` blocks around a token flush cannot use
      them. A `tick: false` overload returning `void`.
- [x] **Synchronous `expectNoEmission`**: it is async only (`expect-emission.ts:758`).
- [x] **`withFakeTimers(fn)`**: a scoped run under fake timers, asked for across 14 slices of a consumer
      migration. Only `setupFakeTimers` exists.
- [x] **Emission timeout and completion errors print counts, not the values received**
      (`expect-emission.ts:595`, `:629`). Keep the first N values and print them.
- [x] **`ObserverSpy.onComplete` / `onError` hang on a stream that never ends.** An optional timeout, or
      point to `expectCompletion`.
- [x] **No way to assert "no active subscriptions" on an observable prop spy** — the most common Angular
      leak. `x$.subscriberCount()` or `toHaveNoActiveSubscriptions()`.
- [x] **A flat `consoleLines()`**: one list across channels in call order, `[['warn', …], ['info', …]]`.
      `consoleOutput()` groups per channel only.
- [x] **`jasmine.clock().mockDate()` without `install()` does not throw**; jasmine does. Warn now, throw in
      the next major, record the decision.
- [x] **A custom mock-registry pruner silently drops the `clearAllMocks` sweep sentinel**, after which
      `vi.clearAllMocks()` stops clearing auto-spies. Nothing tells a hand-written pruner to keep
      `Symbol.for('vitest-auto-spy.sweepSentinel')`. A docs line in `agent-docs/setup.md`, and a `doctor`
      check for hand-rolled registry capture.

## ESLint plugin

- [x] **`no-real-component-provider` prints a literal `Component`** in
      `overrideComponentProvider(Component, …)` (`real-component-provider.ts:172`), though `scan.rendered`
      already knows the class when only one is rendered.
- [x] **`no-real-component-provider` does not see reads through a child injector**
      (`debugElement.query(By.directive(X)).injector.get(Store)`). Excluded on purpose because syntax
      cannot tell a directive from a service; an opt-in option, or type information.
- [x] **`no-unregistered-inject-spy` false positives at error severity**: a hoisted
      `const providers = [...]`, shorthand `{ providers }`, a quoted `'providers':` key. Treat such files
      as opaque, or resolve the binding.
- [x] **`prefer-native-spy-api` autofix drops comments** (`native-spy-api.ts:117-138`,
      `jasmine-rules.ts:135`). Rename only the member, or fall back to a suggestion.
- [x] **`no-hand-assigned-global` fetch message does not mention `stubResponse`.**
- [x] **A console spy that is installed but never asserted**: a `/console` spy used only for reset or
      restore, and `vi.spyOn(console, …)` that should be `useConsoleSpies`. Consumers keep this as a
      local rule.
- [x] **A `vi.mock` factory that references an outer binding not declared through `vi.hoisted`.**
- [x] **A relative `vi.mock()` under `@angular/build:unit-test`** — the docs say it is blocked
      permanently; nothing reports it.
- [x] **`real-wait-in-test`**: `new Promise((r) => setTimeout(r, N))` in a spec.
- [x] **`testbed-teardown-disabled`**: `destroyAfterEach: false`.
- [x] **Template-free specs, as a policy option** (a consumer is removing template tests): report any DOM
      access in a spec (`nativeElement`, `debugElement`, `By.*`, `querySelector*`, `document`,
      `inject(DOCUMENT)`, `classList`, `getComputedStyle`…), a `@Component` with a template declared in a
      spec, and the `template:` option of `renderShallow` under `templates: 'never'`. `TEMPLATE_READS` in
      `dom-reads.ts` is reusable. It has to be an option, not a rule in `recommended` ("No second rule
      for the strict reading" in `DECISIONS.md`), and it has to keep `createDirectiveHost` legal or
      decide otherwise there. Needs a "testing without the DOM" recipe for its message to link to.
- [x] **`foreign-runner-pragma` says Vitest never reads `@jest-environment`**; Vitest 5 does
      (`foreign-pragma.ts:4`, `:59`). `dom-free.ts:108` ignores the `@jest-` spelling.
- [x] **Two skill trigger strings match no emitted message**: "not on the class prototype" and "strict
      mode is on". Fix both, and a script that checks every trigger is a substring of a literal in
      `src/lib`. The skill description also lacks `adoptMock`, `stubResponse`, `passthrough`.
- [x] **`no-real-component-provider` under `{ childInjectors: true }` has no notion of a class the
      spec declares itself.** Every exemption is a name set — `replaced`, framework imports, and
      `rendered`, which counts any `By.directive(X)` argument (`real-component-provider.ts:213-217`)
      — so a double component declared in the spec and read through a child injector is safe only
      when the identifier at `.injector.get(…)` is also a `By.directive(…)` argument. A consumer
      suite reads its spec-declared footer doubles through one
      `query(By.directive(child)).injector.get(child)` helper; the same read by position —
      `query(By.css(…)).children[0].injector.get(Token)` — finds no `By.directive` name to match and
      reports a class the spec itself declared, a test double rather than the production service the
      rule exists to catch. The report follows from the exemption sets, not a shape seen yet. Collect
      the file's own `ClassDeclaration` names as one more set: name-level like the rest, no type
      information needed (2026-09-29, 5.51.0).
- [x] **`no-inline-test-data` counts every small tuple on its own, so one repeated pair reports
      several times.** A consumer suite of ~85 specs got 37 reports in 9 specs at the defaults; 16 of
      them came from `{ from: [1, 1], to: [1, 5] }`-style ranges: `[1, 1]` ×5, `[1, 5]` ×4,
      `[2, 3]` ×6, `[2, 20]` ×5 — two real repeated pairs. Each tuple is its own group, so one site
      reports twice (`from` and `to`), and while the `{ from, to }` parent has fewer than `repeats`
      copies the tuples inside it keep reporting until the other copies move out. The outermost-first
      pass (`inline-test-data.ts:210-213`) skips a group only when its _first_ copy lies inside a
      reported literal, so a later copy inside one is reported twice as well. `['0', '1']` id lists
      (×5) are the same shape. Group copies by the smallest enclosing literal that repeats and report
      that parent once per site, and/or a size floor: an array of two or three short primitives is a
      coordinate or an id list, not a record `isRecord` (`:117`) should count (2026-09-30, 5.54.0).
- [x] **`no-inline-test-data` reports small option bags.**
      `rmSync(dir, { recursive: true, force: true })` ×3 and
      `configure({ production: false, enableSentry: true })` ×5 in a consumer suite are flags, not
      test data: two booleans pass `minValues: 2` and `isPrimitive` (`:109`). Moving them to
      a `*.mock.ts` makes the spec worse; the consumer fix was a spec-local helper. Exempt a literal
      whose leaves are all booleans with at most three keys, and/or the options argument of well-known
      `node:fs` calls (`rmSync`, `mkdirSync`, `readFileSync`…) (2026-09-30, 5.54.0).
- [x] **`no-inline-test-data` pushes the expected value of a matcher out of the test.**
      `expect(x).toStrictEqual([…22 lines])` and `toMatchObject({…30 lines})` are reported as
      `longLiteral` (`:182`) with the message "so the test shows what it checks rather than the data it
      feeds in" — but that literal _is_ what the test checks. Inside a matcher argument
      (`toEqual`, `toStrictEqual`, `toMatchObject`, `toHaveBeenCalledWith`…) report the largest nested
      literal instead, or reword the message to suggest extracting the biggest nested constant and
      keeping the shape of the expectation inline (2026-09-30, 5.54.0).
- [x] **`no-inline-test-data` suggests a `*.mock.ts` for a literal built from spec-local bindings.**
      `['-a', 'Google Chrome', TARGET]` and `{ ...EMPTY, invalidKeys: […] }` repeated in a consumer
      spec reference a `const` declared in the spec, so following the message means moving that
      `const` too, or repeating the spread base in the mock file. When a repeated literal references a
      binding declared in the same file, or spreads one, suggest a spec-local `const` (a second
      message id); or compare only the literal's own non-spread leaves (2026-09-30, 5.54.0).

- [x] **`no-inline-test-data` still sends a repeated expected value to a `*.mock.ts`.** Seen 2026-09-30 on
      5.57.0. `await expect(p).resolves.toMatchObject({ name: 'HttpErrorResponse', status: 401 })` in three
      `it`s is reported as a repeat with the mock-file advice, while a single long expected value is now told
      to stay inline. When every copy is an equality matcher's expected argument, either skip short objects
      (2-3 primitive keys) or suggest a spec-local `const`, as `repeatedLocalLiteral` does. Evidence: the
      repeat path in `src/lib/eslint/inline-test-data.ts` does not look at the matcher context.
- [x] **`longExpected` names too large a part to move.** Seen 2026-09-30 on 5.57.0. For
      `expect(rules()).toMatchObject({ 'x/rule': ['error', { disallowedWords: [/* 11 strings */], mustNotMatch }] })`
      (30 lines) the message names the whole `['error', {...}]` tuple, which is the config under test;
      moving the 11-string array alone brings it under the limit. Suggest the smallest part that gets under
      `maxLines`, preferring pure data arrays and strings over mixed config shapes.

## CLI: codemod

- [x] **Overlapping edits are dropped silently** (`edits.ts:65-80`), so `fired` / `needs` overstate what
      happened. `applyEdits` returns the dropped edits as warnings.
- [x] **A locally declared name is imported again** (`const asSpy = 1` + a need for `asSpy`).
- [x] **Dropping two names from one import statement removes only one.**
- [x] **Nested template literal text is rewritten**: `` `${`jest.fn()`}` `` becomes `vi.fn`.
- [x] **One bad file aborts the run, and writes are not atomic** (`run.ts:204-223`, bare
      `writeFileSync` in `fs-scan.ts:119`).
- [x] **No note for `jest.useFakeTimers({ doNotFake, legacyFakeTimers, timerLimit, advanceTimers })`**,
      whose option names Vitest does not accept.
- [x] **No note when `vi` is written bare and `globals` is off**: the migrated suite hits
      `ReferenceError`. `profile.ts` already reads `globals`.
- [x] **No `--format json` on `codemod`.**
- [x] **Masking leftovers**: `{ a: 1 } / 2; jest.fn(); 3 / 4` is blanked; a comment before the first
      import specifier produces an unparseable import; `dropOne` leaves a bare `\n` in a CRLF file.
- [x] **Speed**: `residueOf` builds a `RegExp` per file × transform, `referencedOutsideImports` re-masks
      per call, `buildEntryMap` does not memo `exportedNames`, `stripJsonComments` is O(n²), `lineOf` is
      O(file) per note.

## CLI: init, doctor

- [x] **`init` is not transactional**: one failed write leaves a half-initialised repo and a raw stack
      trace. Temp file and rename, a per-plan `failed` status.
- [x] **Managed-block markers are handled loosely** (`init-block.ts:90-136`): an end marker before the
      begin duplicates text, only the first of two blocks is updated, and the `sha=` digest is written but
      never read.
- [x] **`parseJsonc` strips `,]` and `,}` inside string values** (`fs-scan.ts:372`).
- [x] **`doctor` keeps every file's text for the whole run** (`checks/graph.ts:34`): ~295 MB at 15k files.
- [x] **The import graph reads specifiers out of comments and strings**, so `spec-imported-by-non-spec`
      errors on a commented-out import. It also does not resolve tsconfig `paths` / `extends`.
- [x] **`tsconfig-glob-matches-nothing` false errors** on `../` entries, on `files` without the `.d.ts`
      exemption, on `.vue` / `.svelte` directories, and on a scan truncated by the cap.
- [x] **Installed-Vitest lookup does not walk up in a monorepo** (`vitest-5-facts.ts:18-23`), so four
      checks skip silently.
- [x] **`--fail-on <error|warning|info>` for `doctor` and `perf`.** A note never fails the run, so CI
      wrappers compute `errors + warnings + notes > 0` themselves. `no-agent-instructions` could also stay
      quiet under `CI` when every instruction file is gitignored.
- [x] **Vitest 5 migration traps `doctor` does not know**: importing `@vitest/expect` (where
      `expect.extend` registers nothing on 5) or `@vitest/runner`; a `Matchers<T = any>` /
      `jest.Matchers` augmentation that loses its types; an inline project with `plugins` / `resolve` /
      `alias` losing `sharedViteServer`; `extends: true` restating the default; `--reporter=json|junit`
      without `--outputFile` and `.vitest-reports` paths in CI; `yarn.lock` without a direct `vite`;
      nested `vi.mock` / `vi.hoisted`; arithmetic on the now 1-based `VITEST_POOL_ID`;
      `.not.toThrow('')`; `pruneMockRegistry: true`, a no-op on 5 — whose `trackMockRegistry()` still
      installs its hooks when the capture fails.
- [x] **Angular builder cache off in CI**: `cli.cache.environment` defaults to `local`, +2.91 s (+33 %)
      per CI run on 700 files.
- [x] **`isolate: false` + Angular without the restore options.**
- [x] **A named error when a Vitest entry is used without `vitest` installed.**
- [x] **`init` does not say when the files it updated are invisible to git** (2026-09-29, 5.49.0). In a
      consumer where `AGENTS.md` / `GEMINI.md` sit in `.git/info/exclude` and `.claude/` in a global
      excludes file, a stamp refresh leaves `git diff` empty and reads as "nothing changed". Mark such
      rows `updated (not tracked by git)` via `git check-ignore`; `src/cli` has no ignore lookup for `init`.
- [x] **`shared-env-without-restore` judges the raw text of each `setupAutoSpy(…)` call.** The check
      slices the characters between the parentheses (`shared-env-restore.ts:53-72`) and regexes them
      for the literals (`turnsOn`, `:74-79`), so a setup module that exports its options —
      `setupAutoSpy(OPTIONS)` — or spreads them (`setupAutoSpy({ ...OPTIONS, blockNetwork: false })`)
      is told every restore switch is off though the exported object turns them on. A consumer suite
      duplicates the four literals at its call site only to keep this check quiet, and a trailing
      spread the runtime lets override them makes the duplicated literal a value the check reads but
      the suite never runs. The verdict is also a union over every call in the repository (`:107`):
      one call anywhere with the literals silences the finding for all setup files, a second setup
      file that genuinely leaves a switch off is masked, and the finding names only the first call's
      file. Resolve at least an identifier declared in the same file — the pass visits every file's
      text already — follow the import graph the scan builds to the exporting module, and judge each
      setup file on its own calls (2026-09-29, 5.51.0).
- [x] **A `*.mock.ts` next to a spec can ship in a published library.** `no-inline-test-data` sends
      data to `<name>.mock.ts` beside the spec, under `src/`. A library built by `tsc` whose
      `tsconfig.lib.json` excludes only `src/**/*.spec.ts` / `*.test.ts` — the usual generator
      output, and the shape of every tsc-built package in a consumer monorepo — compiles those files
      into its output. Neither the rule docs (`docs-site/utilities/eslint-rules.md`, "How to fix") nor
      `doctor` mention it; no check in `src/cli/checks` reads mock files against a build tsconfig. Add
      one docs line (exclude `**/*.mock.ts` from the build config), and/or a `doctor` finding for a
      `*.mock.ts` that a non-spec tsconfig's `include` matches and its `exclude` does not
      (2026-09-30, 5.54.0).

- [x] **`shared-env-without-restore` passes silently on options it cannot read.** Seen 2026-09-30 on
      5.57.0. `export const OPTS = Object.freeze({ restoreMocks: false, ... }); setupAutoSpy(OPTS)` (or
      `{ ...OPTS }`) gives no note; the same object without `Object.freeze` gives one. Unwrap
      `Object.freeze(...)`, `as const` and `satisfies X`, and when a value stays unreadable, say so in a note
      ("options not statically readable") instead of passing. Evidence: no `freeze` handling in
      `src/cli/checks/shared-env-restore.ts`. A consumer setup file with a frozen shared options object.
- [x] **`tsconfig-ships-mock-file` is silent when the build tsconfig has no `exclude`.** Seen 2026-09-30 on
      5.57.0. A `tsc`-built library (`@nx/js:tsc`, `tsConfig: tsconfig.lib.json`) with only
      `"include": ["src/**/*.ts"]` and a `src/lib/x.mock.ts` beside `x.spec.ts` gives no warning, though both
      ship; adding `"exclude": ["src/**/*.spec.ts"]` makes it warn. Report shipped specs and mocks when there
      is no `exclude` at all. The suggested glob could also follow the style of the existing ones
      (`src/**/*.mock.ts` beside `src/**/*.spec.ts`) rather than always `**/*.mock.ts`.

## CLI: perf

- [x] **Per-test heap**: `perf` runs with `--logHeapUsage` but keeps only per-file heap, so `perf-heap`
      cannot name the leaking test. `heap?` on `PerfTestDiagnostic`, a `heapStep` when growth survives the
      next test.
- [x] **Setup-file imports and `selfTime`**: `slowestImports` drops the setup-file chain and reads only
      `totalTime`.
- [x] **Coverage time outside `wall`**: `onCoverage` / `onFinishedReportCoverage`, a `perf-coverage`
      signal.
- [x] **Interrupted and hung runs**: store the `onTestRunEnd` reason, mark `partial` / `hung`, a
      `perf-hung` signal from `onProcessTimeout`, so an interrupted run is not compared with a baseline.
- [x] **Suggest `pool: 'vmThreads'` on Vitest 5** when `pool` is unset: 1.4–1.85 s → 0.83–0.88 s on 30
      jsdom files.
- [x] **Time outside Vitest under `ng test`**: `perf` reports ~5.2 s of ~8.7 s. Measure the full wall of
      `--command` and print the difference.
- [x] **`setupAutoSpy` reports its own cost into `task.meta`** so the reporter can separate library hooks
      from test time.
- [x] **`perf --out <directory>` crashes with EISDIR**, and a relative `--out` resolves against two cwds.
- [x] **`perf-isolation` cannot predict the win** (measured 0 %): `--ab-isolate`, or reword.
- [x] **`summariseProfile` speed and memory** (`relative()` per frame, a stack walk per node, every
      profile held in memory), and a `--profile-dir` to keep the `.cpuprofile` files.
- [x] **Count the specs that would become DOM-free** once the DOM half of the shared setup file is split
      off; today `perf` names the file but not the size of the win.
- [x] **The perf example in `docs-site/utilities/cli.md` predates Vitest 5** (a `prepare` row, no lanes
      line). Re-take it, EN and RU.

## Docs

- [x] **The bundle-size table in `docs-site/core/performance.md` has drifted from `size-entries.json`**
      (`/angular/matchers` 1.8 → 2.9 kB, `/setup` 27.4 → 28.8 kB, `/dom-stubs` 8.9 → 9.1 kB), and no gate
      check compares them. Refresh EN and RU, then make the gate read it.
- [x] **`BLOCKED_FETCH_MESSAGE` / `BLOCKED_XHR_MESSAGE` are exported but documented nowhere.**
- [x] **Plain-Vitest CI sharding recipe**: `--shard` + `--reporter=blob` + `--merge-reports`, thresholds
      only in the merge job.
- [x] **The README is cut mid-paragraph at npmjs.com's 64 kB** (around `README.md:952`), and nothing in
      the gate protects the part before it.
- [x] **Decisions that live only in the gitignored `tasks/`** — the perf-research "no" list (native perf
      analysis, speedscope/d3, SARIF by default, heap snapshot by default…) and the permanent
      `TestBed.createComponent` wrapper — belong in `DECISIONS.md` before they are asked again.

## The repository's own suite and gate

- [x] **The library does not run its own ESLint plugin on its own specs.** The flat config removed the old
      blocker; register the recommended config, built from `src`, for `*.spec.ts`.
- [x] **The shared-env lane does not prove what it claims**: Analog forces `vmThreads` so
      `isolate: false` does nothing, no config calls `setupAutoSpy()`, `--pool=threads` fails in 21–33
      files, and it runs one worker in one order. Give it a real shared global (threads, `setupAutoSpy`,
      several workers, a shuffle seed) and fix the leaks, or reword the promise.
- [x] **Own specs hand-roll what the library ships**: ~80 `vi.spyOn(console, 'warn')` across 23 files
      instead of `/console`, and fake-timer pairs in `expect-emission.spec.ts` and `event-loop.spec.ts`
      instead of `setupFakeTimers`.
- [x] **`typecheck` on TypeScript 7** (~8–12× faster), ESLint and the Angular language service staying on
      6 through an alias.
- [x] **Re-measure istanbul vs v8 coverage on Vitest 5**: the trigger fired, the `vitest.config.mts`
      comment still gives the old reason.
- [x] **`bench-angular/baseline.json` dates from 2026-09-10**, and `bench.yml` still runs without
      `--strict`. Re-measured 2026-09-30; `--strict` deferred with numbers in `DECISIONS.md`
      ("Benchmark baselines stay report-only").
- [x] **Bump the `vitest` devDependency to 5.0.2** (the lock has 5.0.0).
- [x] **Maintainability**: a shared `MockAdapter` contract spec instead of per-adapter specs; split
      `prototype-members.ts` out of `create-spy-from-class.ts` (470 of 500 lines).
