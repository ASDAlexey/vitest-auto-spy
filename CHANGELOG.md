# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The latest released version here must always match the one published on
[npm](https://www.npmjs.com/package/vitest-auto-spy) and the latest `v*` git tag — see
[CONTRIBUTING.md → Releasing](./CONTRIBUTING.md#releasing) for how that stays in sync.

## [Unreleased]

## [1.8.0] - 2026-07-17

### Added

- **`returnValue()` alias on the `calledWith` / `mustBeCalledWith` chain.** The `jest-auto-spies`
  name `spy.method.calledWith(1).returnValue(x)` now works alongside `mockReturnValue`, so migrating
  from `jest-auto-spies` / `@bugsplat/vitest-auto-spies` is a pure import swap — no test rewrites.

### Changed

- **Performance:** `createSpyFromClass` caches each class's prototype method names in a `WeakMap`,
  so spying the same class in every `beforeEach` no longer re-walks the prototype chain.

### Docs

- Comparison tables (README + docs site) now cover `@bugsplat/vitest-auto-spies`, positioning this
  package as a superset (Bun / `node:test`, `createAutoMock`, framework recipes, console spies, zero
  runtime deps, rxjs 8). Migration guides document the `returnValue` alias, and two README SVG
  diagrams were added (a runtimes hero and an Angular `provideAutoSpy` recipe).

## [1.7.0] - 2026-07-04

### Added

- **Console spies — `vitest-auto-spy/console`.** A new entry point: importing it replaces
  `console.debug` / `error` / `info` / `log` / `time` / `timeEnd` / `trace` / `warn` with
  **silent, fully-typed spies**, each exported ready to assert — no `vi.spyOn(console, 'info')`
  boilerplate, no log output polluting the test run:

  ```ts
  import { consoleInfoSpy, consoleWarnSpy } from 'vitest-auto-spy/console';

  service.doWork();

  expect(consoleInfoSpy).toHaveBeenCalledWith('done');
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  ```

  Housekeeping helpers: `resetConsoleSpies()` clears the recorded calls (Vitest's
  `clearMocks: true` already does this per test), `restoreConsole()` puts the original methods
  back, `installConsoleSpies()` re-installs after a restore (idempotent otherwise). The spies are
  built on the registered `MockAdapter`, so a runtime entry imported first (`…/bun`, `…/node`)
  drives them with that runner's mocks; with none, the default Vitest adapter is registered.
- **`hasMockAdapter()`** (internal seam) — lets non-runtime side-effect entries such as
  `…/console` register the default Vitest adapter only when no runtime entry already installed
  its own, instead of stomping it.

### Docs

- README: a dedicated **Utilities** section — a table of every standalone helper (`injectSpy`,
  `provideAutoSpy`, `createFunctionSpy`, `createAutoMock`, `createObservableWithValues`,
  `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockAccessorsProp`, `errorHandler`, the console
  spies) with entry points and examples.
- Docs site: new **Utilities → Console spies** page; `createAutoMock` and the console spies added
  to the API reference.

## [1.5.1] - 2026-06-29

> README-only release — no code or API changes (the `fix:`-typed README commit cut a patch).

## [1.5.0] - 2026-06-28

> README-only release — no code or API changes. Published as a **minor** because the README commit
> was typed `feat:`; included here for an honest, gap-free history.

## [1.4.0] - 2026-06-28

### Added

- **Framework adapters — NestJS, React, Vue/Pinia, Svelte.** Four new entry points over the same
  core, each importing **nothing** from its framework (helpers are structural, frameworks stay
  optional consumer-side peers):
  - `vitest-auto-spy/nestjs` — `provideAutoSpy` (the `{ provide, useValue }` shape `Test.createTestingModule` consumes) and `injectSpy(moduleRef, token)` typed as `Spy<T>`.
  - `vitest-auto-spy/vue` — `provideAutoSpy(token, Class)` returning `{ [token]: Spy<T> }` for `@vue/test-utils`' `global.provide`, plus class-based Pinia store spying.
  - `vitest-auto-spy/react` and `vitest-auto-spy/svelte` — natural import paths over the core for spying class-based services/stores in those suites.
- **`createAutoMock<T>()` — auto-mock by type/interface (no class).** A `Proxy`-based factory that
  builds a fully-typed `Spy<T>` from a TypeScript type alone, materializing each accessed method as
  a decorated spy lazily (cached by key) with the **same** return-type-aware control helpers as
  `createSpyFromClass`. Optional `overrides` seed concrete property values/implementations.
- **Bun & `node:test` runtimes** — two new entry points that run the exact same core on a
  non-Vitest runner: `vitest-auto-spy/bun` (Bun's `bun:test` mocks) and `vitest-auto-spy/node`
  (`node:test`'s `mock.fn()`). Public API is identical to the Vitest entry; only native mock
  methods differ by runner (the auto-spy helpers are normalised). Built on the `MockAdapter`
  seam below.

### Changed

- **`MockAdapter` seam — the core no longer imports `vitest`.** The single `vi.fn()` /
  `vi.spyOn()` dependency now lives behind a registered `MockAdapter` (the same inversion-of-control
  pattern as the rxjs decouple). `vitest-auto-spy` registers the default Vitest adapter on import,
  so existing usage is unchanged and stays zero-config — verified at the bundle level (only
  `vitest-adapter` references `vitest`; the rest of the core does not). This unblocks future
  non-Vitest entries (`vitest-auto-spy/bun`, `…/node`) over the same core.

### Docs

- README leads with the runtime-agnostic, multi-framework story: runtime-support badges, a
  competitor comparison table, a `createAutoMock` section, and a **Framework adapters** section
  (NestJS/React/Vue/Svelte ahead of Angular). npm keywords lead with `auto-mock` / `class-mock` /
  `typed-mock` instead of `angular`.

## [1.3.0] - 2026-06-24

> Maintenance release — no user-facing or API changes. Published as a **minor** because the
> maintenance commit was typed `feat:`; it ships no new feature, included here for an honest,
> gap-free history.

### Removed

- Internal planning docs (`docs/`) are no longer tracked in the repository; they are now
  local-only working notes (`/docs/` is git-ignored). The published npm package is unaffected
  (`docs/` was never part of the tarball).

## [1.2.0] - 2026-06-24

> ⚠️ **Heads up:** this version carries a breaking import-surface change (subpath entries) but
> was published as a **minor** bump, not a major. Pin to `1.1.x` if you cannot move
> observable/Angular imports to their subpaths yet.

### Added

- **Framework-agnostic core with opt-in subpath entry points** (`vitest-auto-spy`,
  `vitest-auto-spy/rxjs`, `vitest-auto-spy/angular`). The core no longer references rxjs or
  Angular at runtime — verified at the bundle level (`dist/index.*` requires only `vitest`).
  A plain Node / Bun / React / Vue project pulls in neither rxjs nor Angular.
- Inversion-of-control observable registry (`lib/observable-support.ts`): importing
  `vitest-auto-spy/rxjs` registers the observable helpers; using observable spies without it
  throws an actionable hint. `rxjs` and `@angular/core` are now **optional** peer dependencies
  (`peerDependenciesMeta`).
- Dependency-free arg serializer (`lib/serialize-args.ts`) reproducing the
  `javascript-stringify` output the library relied on (single-quoted strings, distinct
  `undefined`/function/symbol/BigInt/Date renderings, circular-ref safety).

### Changed

- **BREAKING:** observable helpers (`createObservableWithValues`, `observablePropsToSpyOn`,
  `nextWith`, …) now live under `vitest-auto-spy/rxjs`, and the Angular helpers
  (`provideAutoSpy`, `injectSpy`, `mock*`) under `vitest-auto-spy/angular`. Update imports
  accordingly (see the README "Entry points" table). The sync/promise/accessor core API is
  unchanged.
- Build: drop shipped sourcemaps (`sourcemap: false`) and minify (`minify: true`); multi-entry
  tsup output. Published tarball ~29.4 kB → ~13.7 kB compressed (131 kB → ~49 kB unpacked).
- Removed the `javascript-stringify` runtime dependency — the package now has **zero runtime
  dependencies**.

### Fixed

- **Coverage gate now measures the real implementation.** Since the `auto-spy` → `lib/*`
  module split, `coverage.include` pointed at the empty re-export barrel, so the "100%"
  threshold was vacuous (0/0). It now covers `src/lib/**` + the barrel and genuinely holds at
  100% lines/branches/functions/statements.
- Observable-property `nextWith` / `complete` after `nextWithValues` keep operating on the
  backing `Subject` (previously a type-lie reassigned the subject to a merged observable).
- `createSpyFromClass(Service, ['a', 'b'])` now **restricts** spying to the listed methods
  (matching `jest-auto-spies`) instead of augmenting the auto-discovered set.
- Per-call delay handling unified: `resolveWithPerCall` delays are now baked into the wrapped
  promise at configuration time (the same way `nextWithPerCall` already bakes observable
  delays), removing a dead Promise-vs-Observable branch in the call path.

## [1.1.0] - 2026-06-23

### Added

- Strict TypeScript config: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noPropertyAccessFromIndexSignature`, `noUncheckedSideEffectImports`, `isolatedModules`,
  `useUnknownInCatchVariables`, `allowUnreachableCode: false`, `allowUnusedLabels: false`.
- ESLint (`.eslintrc.cjs`) + Prettier (`.prettierrc`) toolchain, distilled to the rules
  relevant for a TypeScript library (`@typescript-eslint` strictness, `no-explicit-any`,
  `consistent-type-assertions: never`, `no-non-null-assertion`, rxjs hygiene, eslint-comments
  discipline, regex optimisation).
- `jscpd` duplicate-detection at threshold 0 (`.jscpd.json`).
- npm scripts: `lint`, `lint:fix`, `format`, `format:check`, `jscpd`, `check`.
- Shared `spy-decoration` helper, removing the copy-pasted promise/observable decoration
  blocks (jscpd reports 0 clones).
- Automated releases from Conventional Commits (`.github/workflows/auto-release.yml`) and a
  GitHub Release on tag push (`.github/workflows/release.yml`).

### Changed

- Split the monolithic `auto-spy.ts` into focused `src/lib/**` modules (accessor / function /
  observable / promise spies, arg-map, error handler, types).
- Hardened the entire `src/lib/**` type surface against the strict config: replaced `any`
  with `unknown` + narrowing wherever possible, removed unnecessary `as` casts, and replaced
  non-null assertions with real guards. Remaining `any`/casts are limited to load-bearing
  generic-inference spots, each carrying a justified `eslint-disable` description.

## [1.0.1] - 2026-06-21

### Added

- `engines`, `publishConfig` and expanded npm keywords in `package.json`.
- Issue / pull-request templates, badges, and a `jest-auto-spies` migration guide in the README.
- CI test matrix across Node LTS versions; standalone npm release workflow.

### Fixed

- Synced `package-lock.json` with `package.json` so `npm ci` matches the lockfile.

## [1.0.0] - 2026-06-21

### Added

- Initial public release — a Vitest-powered, drop-in replacement for `jest-auto-spies`.
- `createSpyFromClass` with array and config-object overloads
  (`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`).
- Sync helpers: `mockReturnValue`, `calledWith`, `mustBeCalledWith`.
- Promise helpers: `resolveWith`, `rejectWith`, `resolveWithPerCall`.
- Observable helpers: `nextWith`, `nextOneTimeWith`, `nextWithValues`,
  `nextWithPerCall`, `throwWith`, `complete`, `returnSubject`.
- Getter/setter spies via `accessorSpies`.
- Angular helpers `provideAutoSpy` and `injectSpy` (work with both zoneless and zone.js).
- Standalone `createObservableWithValues` and `createFunctionSpy`.
- Readonly/signal property mockers: `mockReadonlyProp`, `mockReadonlyPropGetter`,
  `mockAccessorsProp`.
- Dual ESM + CJS build with type declarations; 100% test coverage.

[Unreleased]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.5.1...v1.7.0
[1.5.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/releases/tag/v1.0.0
