# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.19.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

The `doctor` and `perf` reports, read against a 2 015-file consumer suite: what they print, how wide,
and the four places where the printed numbers or words did not match what was measured.

And the mocking gaps a survey of other libraries turned up: a real object observed instead of
replaced (`passthrough`), a `vi.mock` factory's `vi.fn()` with typed `calledWith` (`adoptMock`),
arrays and unmocked-call failures in `mockDeep`, a real `Response` for a stubbed `fetch`, and
`blockNetwork` no longer switching MSW off.

### Added

- **`--format json` on `doctor` and `perf`.** One JSON document on stdout and nothing else:
  `schema`, `command`, `version`, `cwd`, `exitCode`, `tally` and every finding (`check`, `severity`,
  `file`, `message`, `fix`, `details` without terminal color). `doctor` adds what it scanned;
  `perf` adds `run` (files, tests, wall and CPU milliseconds, the median test and file, the phases),
  `budgets` and `gate` — `status`, how candidates could be `confirmation`-ed, and one verdict row per
  candidate with both readings and its `outcome`. The output of a suite `perf` runs goes to stderr in
  this mode, so stdout stays parseable. `--min-severity` shapes the text only.
- **`perf` says what it judged, against what.** The header adds the tests run and the run's median
  test and file; a `budgets:` line states the body budget and the three a file is held to, with what
  `--max-file-tests` is worth in this run; the phase table carries a bar per phase.
- **The gate prints its verdict as a table** after the confirmation pass: `kind`, `first`, `again`,
  `budget` and `verdict` (`confirmed`, `not reproduced`, `unconfirmed`, `single reading`,
  `over budget`) per candidate, above the findings.
- **`files over budget` carries `over`, `tests` and, with `--baseline`, `vs base`** — how many times
  its recorded share of the run the file takes now, or `new`. Each table title counts every row over
  budget and says when `--top` left some out.
- **`doctor` reports a scan that stopped at its cap** as a `scan-cap-reached` warning. Past 50 000
  files it used to print "No problems found." for files nothing had read. **Behaviour change**: such a
  repository now exits 1 until `VITEST_AUTO_SPY_SCAN_CAP` is raised or `--cwd` narrows the tree.
- **`createSpyFromInstance(obj, { passthrough: true })`** records every call but runs the real method
  until the test configures it — Vitest's spy mode for one object, on every runtime. Built for
  `createSpyFromInstance(TestBed.inject(Service), { passthrough: true })`: the real DI graph, `signal()`
  fields, `ɵprov` and `ngOnDestroy` keep working, because lifecycle hooks, callables with an API of
  their own and classes are left real. Configuring a method takes the whole method over,
  `resetAutoSpy` hands it back; an explicit `strict: true` / `onUnstubbedCall` on the same call is
  refused, a suite-wide strict yields. New type `InstanceSpyConfiguration<T>`.
- **`adoptMock(mock)` — `calledWith` and `resolveWith` on a mock a `vi.mock` factory built.** The
  factory's `vi.fn()` is taken over in place: same object, the calls it already recorded stay, and it
  comes back typed as a function spy of the export's own signature. Nothing changes until the test
  configures it — an unconfigured call answers what the mock answered before — and the configuration
  survives `vi.resetAllMocks()`, `mockReset: true` and `mockRestore()`; `resetAutoSpy` drops it.
  Works on Vitest, Rstest and Bun; `node:test`'s `mock.fn()` is refused with the reason, because it
  cannot report its implementation and `mock.restoreAll()` would silently put it back.
- **`moduleNamespace(actual, { passthrough: true })`.** Every function export of the real module
  becomes a spy that runs the real function until the test configures it — Vitest's
  `vi.mock(path, { spy: true })` with `calledWith` / `resolveWith` on top, on any runner. Classes and
  values stay real.
- **`stubResponse({ body, status, ok, statusText, headers, url })`** in `vitest-auto-spy/setup` — a
  real `Response` for a stubbed `fetch`, built from the environment's own constructor, so
  `vi.fn(async () => stubResponse({ body: user }))` needs no `as Response`. Plain data is sent as JSON
  with `application/json`; an `ok` that disagrees with `status` throws.
- **Arrays in `mockDeep`.** A member read with a numeric index is now a real `Array` of deep mocks:
  `api.page.items[0].title = 'x'` makes `api.page.items` pass `Array.isArray`, with a real `length`,
  working `map` / `filter` / spread / `for…of`, `toEqual` and `toHaveLength`. Nested arrays
  (`m.matrix[0][1]`) work too. The type, `DeepMockProxy<T>`, always said array; the runtime returned
  a function node whose `length` was an arity and whose `map` was a spy that returned `undefined`. A
  seed or an assignment still wins. `resetAutoSpy` / `using` reset the elements. A handle read before
  the first index stays a node.
- **`mockDeep(overrides, { fallbackMockImplementation })`.** Answers a call on any node nobody
  configured, usually by throwing, so an unmocked query fails at its call site. The precedence is
  fixed: the node's configuration, then the fallback, then `selfReturning`, which still chains when
  the fallback returns `undefined`. The options are the **second** argument; the vitest-mock-extended
  spelling `mockDeep({ fallbackMockImplementation })` is a compile error.
- **ESLint rule `no-hand-assigned-global`** (`error` in `recommended`, the thirty-ninth). Reports
  `global.fetch = vi.fn(…)` and any other double assigned straight to a global (`global`,
  `globalThis`, `self`, `window`) that the file never puts back in `afterEach` / `afterAll` /
  `onTestFinished`. None of the runner's cleanups reach a bare assignment, so the fake answers every
  later test of the file, and under `isolate: false` every later file of the worker. The message
  names the repair for the global: `mockValueProp(globalThis, 'fetch', …)` or `vi.stubGlobal` with
  `unstubGlobals` for `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` (plus `blockNetwork()`
  for a spec that only has to stay offline), `stubWebStorage()` for `localStorage` /
  `sessionStorage`, and `mockValueProp` for anything else. A restore written inside the test instead
  of a hook is reported too, because the first red assertion skips it.

### Changed

- **One cause is printed once.** Findings of one check with one fix are a single block — the message
  once when every place says the same, each file's own line otherwise, the fix once. On the consumer
  suite, six identical `tsconfig-glob-matches-nothing` notes went from 23 lines to 11; twelve
  `perf-import-barrel` notes, whose messages differ, from 47 to 40 even with every message wrapped to
  80 columns. A finding with evidence or without a file is never folded.
  The first line of every finding still starts at column 0 with `error`, `warn` or `info`, and every
  other line is indented.
- **Prose is wrapped to the reader.** The terminal's width, else `COLUMNS`, else 80 columns for a pipe
  or a CI log, capped at 120; a path or a URL is never cut.
- **Tables put the numbers first and the path last, whole.** They used to cut a path in the middle to
  fit a 140-column layout, which left a CI log with paths nobody could copy.
- **Color follows the terminal.** Off for a pipe or a file unless `FORCE_COLOR` is set; `NO_COLOR`,
  `FORCE_COLOR=0` and `TERM=dumb` still turn it off. A harness that captures the output and repaints
  it line by line no longer gets escapes nested inside its own.
- **One tally, at the end of the report.** `perf` printed one after the advice and another after the
  gate, and none at all after baseline regressions without `--gate`. `doctor` now ends in the tally
  on a clean run too. When `--min-severity` hid findings the line says how many:
  `0 errors, 0 warnings, 6 notes (6 not shown: --min-severity warning)`. It still starts with
  `N errors, N warnings, N notes`.
- **`createSpyFromInstance(obj, { onlyMethodsToSpyOn })` keeps the rest of the object real, the
  registration included.** 5.19.0 merged the class's `registerAutoSpyDefaults` registration under the
  call, so `registerAutoSpyDefaults(Router, { gettersToSpyOn: ['url'] })` replaced the live `url` of a
  real router the spec had asked to spy one method on, and production code read `undefined` from it.
  With an only-list at the call site the registration now contributes `strict`, `onUnstubbedCall`,
  `onUnstubbedRead` and the `returns` / `selfReturning` entries of the listed methods, and nothing
  else: no accessor, no other method, no `overrides`. `createSpyFromClass` is unchanged — a built double
  has no real members to keep. **Behaviour change**, in the direction the call site already asked for.
- A `mockDeep` member typed as a numeric-keyed dictionary (`Record<number, T>`) becomes an array on
  its first index read. Reads by key keep answering deep mocks; `Array.isArray` and `Object.keys`
  now see an array.

### Fixed

- **`vi.spyOn(double, 'method')` on a method nobody had read threw
  `TypeError: Invalid value used as weak map key`.** A regression in 5.19.0: the lazy placeholder is one
  accessor pair shared by every double and reads its double through `this`, and Vitest reads an
  accessor by calling its getter with no receiver. That read now answers a forwarder, which Vitest wraps
  like a real method: a configured `mockReturnValue` answers, an unconfigured call reaches the double's
  own spy — strict guard included — and `mockRestore()` / `vi.restoreAllMocks()` hand that spy back
  with the calls it recorded. A wrapped method called off its double throws a message naming the fix,
  which is to configure `double.method` directly, since it already is a spy.
- **`injectSpy(GenericClass)` inferred `never` for a class whose constructor takes its own type
  parameter** — `constructor(public data: T, …)`, the shape of most modal refs. With the typed
  `accessorSpies` bag of 5.19.0, `Spy<ModalRef<never>>` stopped assigning to `Spy<ModalRef<unknown>>`
  and every getter spy on it rejected every value. Such a class is now read at its constraint
  (`unknown` when it has none); a class whose constructor does not take the parameter still gets its
  declared default. The default of a **constrained** parameter —
  `ConfigService<T extends Config = Defaults>` — is out of reach through a constructor that takes `T`,
  so that case and any particular instantiation still spell the argument out:
  `injectSpy<ConfigService>(ConfigService)`.
- **`createSpyFromInstance` crashed on a `returns` or `selfReturning` name it had left real** —
  `mockImplementation is not a function`, from an only-list that did not include the name, or from a
  registration's `returns`. The call site's own such name is now reported as a misconfiguration and
  skipped; a registration's is dropped as above.
- **`createMock<T>(undefined)` answering `{}` was undocumented.** It is the same call as
  `createMock<T>()`, and a helper forwarding an optional `overrides` parameter relies on it, so it
  stays; the docs now say so, and that a fixture meaning "no value" passes `undefined` itself.
- **`blockNetwork` switched MSW off.** With `server.listen()` in a `beforeAll` and
  `setupAutoSpy({ blockNetwork: true })`, the `fetch` stub went on over MSW's interceptor and every
  handler for a `fetch` request stopped applying — including Angular's `HttpClient`, whose default
  backend is `fetch`. `fetch` is now left to an applied `@mswjs/interceptors` interceptor (MSW
  `setupServer`, nock 14); `XMLHttpRequest` coexisted already and still fails what MSW does not
  handle. MSW's browser `setupWorker` has not been checked.
- **A false misconfiguration report after `mockReset()`.** `spy.m.mockReturnValue(x)`, then
  `spy.m.mockReset()` (or `vi.resetAllMocks()`), then `spy.m.calledWith(1)…` printed "calledWith()
  was configured … after mockReturnValue() had replaced its dispatch", though the reset had put the
  dispatch back and the `calledWith` answered; under `misconfiguration: 'throw'` it failed correct
  code. The reset now clears the flag.
- **`vi.spyOn` on a `mockDeep` member nobody had read** threw "The property is not defined on the
  function". A node now answers `in` the same way it answers a read, and `vi.spyOn` returns the
  node's own spy.
- **The evidence card compared a candidate against the wrong budget.** For a slow test body or a
  baseline regression it showed the file-total budget, so a confirmed regression read
  `first run 3.00s   budget 20.00s   0.1× over` above a finding that had just failed the run. It now
  shows the candidate's own budget and second reading.
- **Budget flags were ignored without `--gate`.** `perf --max-test-ms 300` drew its tables against the
  1 000 ms default; `--max-test-ms`, `--max-file-ms`, `--max-file-tests`, `--factor` and `--gate-only`
  now draw them either way.
- **"Nothing here would fail --gate" on a red suite.** The gate refuses a run that did not pass, so the
  all-clear now says the suite did not pass and that `--gate` would not judge it.
- **Wording:** `1 test files`, and `re-measuring 1 file on their own`.
- **`--help`** said `doctor` exits 1 "when anything is found" (a note never fails it) and named the
  `--top` tables by the names they had before they became "over budget" tables.

### Documentation

- **Four task recipes, each on its own page.** [Mocking classes](https://asdalexey.github.io/vitest-auto-spy/guides/mocking-classes)
  puts `createSpyFromClass` beside `vi.spyOn(Class.prototype)` and a `vi.mock` factory, with the
  arrow-function-field trap and a class the code under test constructs itself;
  [Mocking localStorage](https://asdalexey.github.io/vitest-auto-spy/guides/mocking-local-storage) is
  `stubWebStorage` against the hand-written double, the package and the `Storage.prototype` spy;
  [Mocking Prisma Client](https://asdalexey.github.io/vitest-auto-spy/guides/mocking-prisma) is a
  typed `mockDeep<PrismaClient>()` with `resolveWith`, `rejectWith`, `resolveWithPerCall`,
  `calledWith`, `fallbackMockImplementation`, `resetAutoSpy` and an interactive `$transaction`, run
  against a generated Prisma 7.10 client; [Storybook stories with auto-spies](https://asdalexey.github.io/vitest-auto-spy/guides/storybook-angular)
  runs Angular stories as Vitest tests with `provideAutoSpy` in `applicationConfig`.
- **React: mocking a custom hook.** `autoMocked<HookResult>()` for the object a hook returns,
  `moduleNamespace` + `assertMocked` on the hooks module, a typed tuple for `[value, loading, error]`
  hooks, and why a factory `vi.fn()`'s return value leaks into the next test.
- **Control helpers: cause and effect.** Why an answer keyed on arguments (`calledWith`) is both a
  stronger and a looser-coupled test than `mockReturnValue` plus a trailing `toHaveBeenCalledWith`.
- **What Vitest's `clearMocks`, `mockReset` and `restoreMocks` do to an auto-spy**, measured on both
  spy engines: the first two reach it exactly as they reach a `vi.fn()`, `mockReset` keeps
  `calledWith` rules, `restoreMocks` never touches it. Next to MSW: `onUnhandledRequest: 'error'` lets
  asset-looking URLs through, and a last `http.all('*', () => HttpResponse.error())` is the hard floor.
- **Bun: nothing is restored between tests** on `bun:test`, and `setupAutoSpy()` is Vitest-only. The
  page now gives the preload that does it (`restoreMockedProps()` + `mock.restore()`), and explains why
  a `mock.module()` belongs in `--preload`. `bun-angular` shows the same preload next to its own.
- **Migrating from jasmine: `mockReset()` brings the call-through back** — on Vitest 5.0.0,
  `vi.spyOn(…).mockImplementation(…)` followed by `mockReset()` runs the real method again.
- **Vitest browser mode:** module namespaces are sealed there, so `vi.spyOn` on an export throws,
  while class and prototype spies (every auto-spy) keep working.
- **Introduction: where an auto-spy sits among stub, spy, mock and fake.**
- **Advice that circulates and is wrong on Vitest**, each line checked on 5.0.0: a `vi.mock` factory
  reading a top-level `const` (hoisting, and no `mock`-prefix exemption), `vi.requireActual`,
  `import { jest } from 'vitest'`, the named `userEvent` import before 14.5, `vi.restoreAllMocks()` to
  undo fake timers, and `global.fetch = vi.fn()` — in `AGENTS.md`, the skill and the agents page.
- **Comparison and Migrating from Suites** re-verified on 2026-09-19: Suites' type-patching
  `postinstall`, the SWC toll a Nest suite pays on Vitest either way, solitary/sociable mapped onto an
  Angular provider list, and `vitest-mock-extended`'s `vitest >=4.0.0` peer range.

### Size

The root entry grows **20.3 → 22.1 kB** min+gzip (+1.79 kB): `mockDeep` arrays and
`fallbackMockImplementation` ~0.43 kB, `createSpyFromInstance` passthrough and the only-list rules
~0.65 kB, `adoptMock` and `moduleNamespace` passthrough ~0.59 kB, the rest ~0.1 kB. `/bun`, `/bun-angular`,
`/node`, `/rstest`, `/react`, `/vue` and `/svelte` carry the same core (+1.74 to +1.79 kB), `/setup` +0.36 kB
for `stubResponse` and the MSW check, `/eslint-plugin` +1.01 kB for the new rule. No entry loads a
module it did not load before.

### Known limitations

- `expect` from `storybook/test` does not recognise this library's method spies
  (`[Function] is not a spy or a call to a spy!`): Storybook's instrumenter wraps any function
  argument without own enumerable keys. Use `expect` from `vitest` in those stories, or
  `setSpyEngine('runner')`. See the Storybook recipe. `@storybook/addon-vitest` 10.6 does not accept
  Vitest 5 yet.
