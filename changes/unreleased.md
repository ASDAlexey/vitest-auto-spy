# Unreleased — targeting **v3.1.0**

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v3.0.0** (2026-08-26)._
_Next: **v3.1.0** — minor, because the release adds one new entry point and a batch of helpers, and
breaks nothing._

## Headline

**One 1688-spec Angular monorepo moving from Jest to Vitest, turned into API.** Every item below is
something that had to be written by hand there, in more than one place, by more than one person —
the constructor a `vi.fn()` cannot serve, the queue no clock advances, the `vi.mock()` a bundler
silently ignored, the `fakeAsync` that does not exist on Vitest at all.

```ts
const Client = stubConstructor(sdk, 'Client', () => client); // `new` works, and is asserted on
await settleDynamicImport(() => import('./heavy'));          // a real turn, timers still faked
assertMocked(ns, { specifier: '@app/api' });                 // the mock applied, or the test fails
```

## Added

- **`mockConstructor` / `stubConstructor`** — a double the code under test can call with `new`.
  The single most common failure of a Jest → Vitest move: Vitest only forwards `new` to a
  constructible implementation, so `vi.fn(() => instance)` records the call, skips the body and
  hands back an empty object.
- **`flushEventLoop`, `flushEventLoopUntil`, `settleDynamicImport`** — real event-loop turns while
  the timers stay faked, for a dynamic `import()` or native `async` inside a dependency.
- **`mockSystemTime`, `withSystemTime`, `mockNow`, `useCountingClock`** (`/setup`) — clock control
  that survives fake timers being re-installed around every test, and a `Date.now` that counts when
  a spec has to assert on order or duration.
- **`stubMediaElement`, `stubAbortController`, `mutationRecord`, `resizeEntry`,
  `stubIntersectionObserver({ autoEmit })`** — the DOM the runner does not ship.
- **`assertMocked`, `moduleNamespace`** — proof that a `vi.mock()` applied under a bundler, and a
  factory result an interop probe recognises.
- **`narrow`, `withOverrides`, `asInstances`, deep-partial `createMock` / `createAutoMock`,
  `autoMocked<T>()`, `Spy<T, { overload: 'first' }>`** — fixtures and bridges without a cast.
- **`compareTestRuns` / `formatTestRunComparison` / `summarizeTestRun`, `diffByField`** — whether
  the migration lost a test, and which field of an array of records actually differs.
- **Angular:** `overrideAutoSpy`, `overrideComponentProvider`, `provideAutoSpyForToken`,
  `assertNgModuleScopes`, `createDirectiveHost`, `registerDirectiveMatchers`, `setupAngularTestEnv`,
  and `injectSpy` accepting an `InjectionToken`.
- **Setup:** `installPerTest`, `guardGlobalPatches` / `setupAutoSpy({ guardGlobals })`,
  `setupAutoSpy({ globalFakeTimers })`, `registerFocusMatchers()` → `expect(el).toHaveFocus()`.
- **Three more lint rules** — `no-shared-module-level-mock`, `no-mocked-for-spy`, `no-done-callback`
  (eight in total, all in `recommended`).

## Added — `vitest-auto-spy/zone`

- **`fakeAsync` and `waitForAsync` work on Vitest.** `zone.js/testing` patches jasmine, mocha and
  jest; Vitest is not among them. Importing this entry runs every test and hook body inside a forked
  proxy zone (needs `test: { globals: true }`).
- **zone.js stays a `devDependency` of this package and nothing else** — no other entry reaches the
  module even transitively, so a zoneless project gets no zone code and no zone install. Recorded as
  an invariant in `AGENTS.md`.

## Changed

- **The `vitest-auto-spies` alias package is generated from `package.json`** (`npm run alias:sync`,
  enforced by `npm run check`). It had drifted to 1.9.3 with no `/bun-angular`, `/setup`, `/zone`
  or `/eslint-plugin`, and advertised `require` for ESM-only entries. Publishing it stays manual,
  after the canonical release.

## Fixed

- `Spy<T>` collapsing to `never` for a method whose return type could not be read (a generic method
  with a conditional return type).
- `gettersToSpyOn` / `settersToSpyOn` rejecting a signal-valued getter — which is most of them.
- The `mock*Prop` helpers rejecting a real value when handed the `Spy<T>` they are meant for.

## Documentation

- New pages: "Constructor doubles", "Waiting and the clock", "Media element stub", "Module mocks",
  "Fixtures without casts", "fakeAsync on Vitest".
- The landing page, the comparison page and the "For AI agents" page carry the new surface;
  `AGENTS.md` gains the waiting/constructor/zone sections and thirteen error → fix rows; the skill's
  description lists the new exports so it loads on the tasks that need it.

## Release checklist

1. Land the work on `master` with Conventional Commits — the `feat:` entries above make this a
   **minor** bump, so `auto-release.yml` cuts **v3.1.0**, tags it and publishes to npm.
2. Right after the auto-release: rename `## [Unreleased]` → `## [3.1.0] - YYYY-MM-DD` in the root
   `CHANGELOG.md`, fix the compare links, commit as `docs(changelog):` (a `docs` commit does not
   trigger another release).
3. Reset this file for the next cycle and set _Last released_ to **v3.1.0**.
4. Verify the four sources match: `npm view vitest-auto-spy version`, `package.json`, the latest
   `v*` git tag, and the top `CHANGELOG.md` heading.
5. The docs site deploys from `docs.yml` on push — check
   <https://asdalexey.github.io/vitest-auto-spy/> renders the new landing page and
   `/utilities/zone`.

## To verify before release

| Check                                        | Command                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| Types, lint, format, duplication, llms, tests | `npm run check`                                            |
| Coverage gate                                | `npm run test:coverage`                                    |
| Shared environment (`isolate: false`)        | `npm run test:shared-env`                                  |
| `fakeAsync` under zone.js                    | `npm run test:zone`                                        |
| Bun core + rxjs, no preload                  | `npm run test:bun`                                         |
| Bun Angular `TestBed`                        | `npm run test:bun:angular`                                 |
| Bun fresh-global-per-file                    | `npm run test:bun:isolate`                                 |
| Built ESM entry as a preload                 | `bun test --preload ./dist/bun-angular.js ./src/bun-tests` |
| Docs site builds (dead links fail the build) | `cd docs-site && bun run build`                            |
