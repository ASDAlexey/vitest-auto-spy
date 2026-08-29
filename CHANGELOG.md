# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The latest released version here must always match the one published on
[npm](https://www.npmjs.com/package/vitest-auto-spy) and the latest `v*` git tag — see
[CONTRIBUTING.md → Releasing](./CONTRIBUTING.md#releasing) for how that stays in sync.

## [Unreleased]

## [3.8.0] - 2026-08-29

### Added

- **`npx vitest-auto-spy doctor` — a repository-level check for defects that never fail anything.**
  Every check shares one property: nothing consumes the result. The suite is green, `tsc --noEmit`
  reports zero errors, and the only reader of the stale thing is whoever opens the file. It reports
  a `tsconfig` `include` pattern that matches no file — the one that motivated the tool, where a
  migration codemod had eaten a `/**` and turned `src/**/*.spec.ts` into `src*.spec.ts`, a valid
  glob matching nothing, leaving nine of 152 spec tsconfigs actually covering their specs — a
  `files` entry that is gone, a production module importing a `*.spec.ts` (a cycle under a shared
  environment, and the spec loses its own suite), a spec importing another spec, a
  `@jest-environment` pragma the runner never reads, configuration for a runner that is no longer
  installed together with the setup files only it referenced, and `@angular/build` in
  `[22.1.5, 22.1.7)`, where the unit-test bundle is built with code splitting off and `--coverage`
  grows by hundreds of megabytes with no plateau. Read-only: there is no `--fix`. Exit code 1 when
  anything above a note was found, so it is one line in CI.

- **`npx vitest-auto-spy init` — the pointer every coding agent in the repository actually reads.**
  No agent scans dependencies for instructions, so the `AGENTS.md` and the skill shipped in this
  package's tarball are never discovered on their own. `init` writes a managed block into
  `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, a Claude Code skill stub whose frontmatter is copied
  verbatim from the shipped skill over a body that only points at `node_modules` (so it cannot go
  stale), and a glob-scoped rule file for each tool whose own directory already exists — Cursor,
  Copilot, Windsurf, Devin, Cline, Roo. It never creates `.rules`, `.cursorrules`, `.windsurfrules`
  or `.clinerules`: Zed resolves instructions first-match-wins over a list ending in `AGENTS.md`,
  so creating one silently shadows the whole project's instructions. Unlike the paste-able snippet
  in the README, the block is **specialised** — the subpath that matches this runner, the adapter
  that matches this framework, the real path of the setup file that needs
  `import 'vitest-auto-spy/rxjs'`, and no rxjs bullet at all when rxjs is absent. Everything sits
  between `<!-- vitest-auto-spy:begin … -->` markers and is regenerated in full on each run, with
  text outside them never read or reformatted; `--check` is the CI form, `--dry-run` prints the
  plan, `--uninstall` puts the files back. The block stays under 1.6 kB because Codex caps the
  whole root→cwd `AGENTS.md` chain at 32 768 bytes and truncates past it in silence — `init` warns
  when the file it appended to crosses that line.

- **`mockResourceProp(object, property, initialValue)` on `/angular` — drive an Angular resource
  with no HTTP at all.** `settleResource` is the answer when the request is the point; this is the
  answer when it is not. The property is replaced by a double the spec moves directly —
  `set(value)`, `fail(error)`, `loading()`, plus a spied `reload` — so nothing is ever in flight:
  no tick, no `HttpTestingController`, no budget, and no way to assert against a resource's default
  value by accident. The double is built from real `signal()`s, so a `computed()` reading
  `products.value()` recomputes and an `effect()` watching `products.status()` runs, exactly as
  against a real `httpResource`. Undone by `restoreMockedProps()` like every other property patch.

- **`registerResourceMatchers()` on `/angular` — `toBeLoading` / `toHaveResourceValue` /
  `toHaveResourceError`.** A resource carries a value *and* a status, and the two only mean
  something together: `expect(component.products.value()).toEqual([])` passes just as happily
  against a resource still `loading` with its default value as against one that genuinely resolved
  to nothing. **`toHaveResourceValue` fails an unresolved resource even when the value matches**,
  and says which status it was in and which flush is missing. Duck-typed on `{ status, value,
  error }`, so `httpResource`, `resource`, `rxResource` and a `mockResourceProp` double all work;
  handed something that is not a resource, each matcher says so instead of throwing a `TypeError`.

- **`captureArg<T>()` — take hold of an argument the code under test built, instead of describing
  it.** `expect.any(Function)` answers *what kind of thing* was passed; a captor hands back the
  value, which is the difference between "a callback was passed" and "call the callback that was
  passed and see what it does". Written by hand it is a reach into `mock.calls` by index into a
  tuple position with a cast at the end — four chances to be wrong about a call that already
  happened. It is an asymmetric matcher, so `toHaveBeenCalledWith` and its whole family consult it
  on Vitest, Bun and `node:test` alike with no runner API involved. Assertion-only by design: a
  captor matches every value, so using one in `calledWith` would configure a return for every call
  — the types stop that line from compiling.

### Changed

- **`dist/node.d.cts` is 3.9 kB instead of 94 kB — the published tarball drops over 20 kB.** It was
  the largest file in the package by a wide margin: the CJS build is a second tsup config object, so
  `rollup-dts` ran over it separately and inlined the entire type surface a second time, where
  `dist/node.d.ts` says the same thing in seven lines by sharing the emitted chunks. A post-build
  step (`scripts/thin-node-cts.mjs`) now rewrites it as a re-export of that twin. Measured against
  the published 3.7.0 and *including* everything added in this release, `dist` is 712 → 640 kB and
  the tarball 260 → 238 kB. No type or value changed hands — verified with a CommonJS consumer that
  uses both, under `module`/`moduleResolution` `node16` **and** `nodenext`, with
  `verbatimModuleSyntax` off **and** on, plus a real `require('vitest-auto-spy/node')` round-trip.

## [3.7.0] - 2026-08-29

### Added

- **`settleResource(resource, { turns, label })` on `/angular` and `/bun-angular` — one wait for
  `httpResource()`, `resource()` and `rxResource()`.** Angular's resource primitives need a
  different wait each, and no library in the Angular world had an answer: measured on 21.2.17
  (zoneless TestBed), an `httpResource` settles **one** tick + microtask after its response is
  flushed and a plain `resource()` takes **two**, while a freshly created `httpResource` has issued
  no request at all until something ticks. Getting it wrong does not fail — it asserts the
  resource's *default* value, a green test proving nothing until the day the default changes. This
  is the loop both converge under, with a turn budget and a failure that names the resource and the
  flush it is missing. The wait ends on any settled status, `error` and `idle` included, because
  waiting for either is waiting for something that cannot happen. Duck-typed on
  `{ status(): string }`, so `@angular/core` stays an optional peer and a hand-built double works.

  One thing it deliberately does not absorb: the `flushEffects()` that comes *before* the flush.
  There is nothing for `expectOne` to find until something ticks, so the order is tick → flush →
  wait, and the docs say so at every mention.

- **`stable(fixture, { timeout = 2000, label })` — the wait is bounded now.** A fixture that never
  stabilises used to hang until Vitest reported a 5 s *file-level* timeout naming neither the helper
  nor the fixture, which blames the file for the state of one component. It now throws the cause and
  names both things that produce it. The watchdog runs on a timer captured at import, so
  `vi.useFakeTimers()` cannot freeze it — a watchdog the code under test can stop is not a watchdog.
  `{ timeout: 0 }` restores the unbounded wait.

### Fixed

- **`serializeValue` was exponential on shared (non-circular) substructure.** The cycle guard added
  and *removed* each object as it walked, so a node reachable by two paths was serialised twice —
  correct, and quadratic in the worst case, exponential in the common one. Measured on a diamond:
  depth 16 was 36.97 ms, depth 18 118.72 ms, and depth 20 turned 41 distinct objects into 1 048 576
  serialised nodes, a 12.6 MB key and **1 124 ms**. Cycles were handled; DAGs were not — and a
  normalised store slice, a shared config object or any tree with repeated nodes is a DAG. Now
  memoised by identity beside the existing cycle guard: **0.63 ms / 1.25 ms / 5.01 ms** for the same
  three depths, a 224× improvement at depth 20, with byte-identical output. A rendering that
  contains `[Circular]` depends on the path that produced it, so a subtree that emitted a back-edge
  is deliberately kept out of the cache.

- **`resetAutoSpy` / `clearAutoSpy` now reach into `mockDeep` children.** They walked own keys one
  level, and a `mockDeep` root is a *function* — so they found no mocks at any depth and
  `resetAutoSpy(api)` reset nothing at all, leaving a `calledWith` seeded on `api.repo.user.find`
  alive into the next test. `vitest-mock-extended`'s `mockReset` recurses, and a nested double
  surviving a reset reads as a bug wherever the expectation came from. The children stay invisible
  to a spec: the node publishes them through one internal symbol, not as own keys.

- **`flushEventLoopUntil` no longer claims a use case it cannot serve.** Its docstring, and
  `docs-site/utilities/event-loop.md`, showed an Angular `httpResource()` as *the* example. It never
  worked: the helper takes real event-loop turns and never ticks, so — measured — a resource awaited
  through it finishes the whole budget having issued zero requests, then fails saying the condition
  was never met. Both now point at `settleResource` and say plainly why.

- **`docs-site/core/performance.md` said the accessor walk was uncached.** It has been
  `WeakMap`-memoised per prototype for some time; the page was out of date, and the line read as an
  argument for replacing `autoSpyAccessors: true` with an explicit list on speed grounds. What the
  option actually costs is the accessor indirection, which the same page already measures at 5%.

### Internal

- **`calledWith` config args are serialized once, at `set()` time.** `ArgsMap` re-rendered the
  *config* side of an asymmetric match on every invocation, and a config arg never changes after it
  is registered — so a config holding an `expect.any(...)` beside a large object paid two deep walks
  per call where one is enough. Measured on a 200-key object: **27.32 µs → 14.26 µs per call,
  1.92×**. Positions holding a matcher are never serialized at all. Output and matching behaviour
  are unchanged; the exact-map path, already flat at 186–237 ns from 1 to 100 configs, is untouched.

- **`bench/auto-spy.bench.ts` was measuring the garbage collector.** `@vitest/spy` keeps every mock
  it ever creates in a module-level *strong* `Set` — that set is what `vi.clearAllMocks()` walks —
  so nothing a bench case allocated was ever collectable: 20 000 eager 10-method spies retained
  972 MB, and forcing a GC after dropping every reference released **0.0%**. Each case therefore
  allocated into a heap it inherited from the case before, and `p75` reported whether a major GC
  landed inside the sample. Two consecutive unmodified runs moved `createAutoMock + 4 accesses`
  **569×** (5.0680 ms → 0.0089 ms), and one of them announced "eager 272.67× faster than lazy" for
  the case the docs publish as a 7× *lazy* win. Every case now ends with this package's own
  `pruneMockRegistry()`; two runs after the fix reproduce every case within **1.00–1.16×**, and the
  40-method / 3-called row reports the 7.48× it is supposed to. Timing table in
  `docs-site/core/performance.md` re-taken. (The prune had to go inside the timed body: Vitest runs
  no hooks at all in benchmark mode, and `bench()`'s third argument is tinybench's bench-level
  options, not its per-task hooks. It costs one `Set.delete` per mock created, against ~1.9 µs to
  create one.)

- **`npm run check` enforces the coverage gate again.** It had drifted back to `npm run test`, so
  the 100% threshold was silently bypassed locally while CI ran `test:coverage`. It runs
  `test:coverage` now — and caught two genuinely uncovered branches in the same session.

- **The Angular surface shared by `/angular` and `/bun-angular` is one list.** `lib/angular-portable.ts`
  holds the helpers that are identical on both runners; the two entries re-export it instead of
  repeating it. The second copy was the kind that rots quietly — a helper added to one entry and not
  the other is not a failure anywhere, it is simply missing on Bun.

## [3.6.0] - 2026-08-29

### Added

- **`docs-site/utilities/editor-diagnostics.md` — the lint rules, in the editor.** They are
  worth more while the cursor is still on the line than in CI, because every shape they catch
  *passes*. No editor needs a plugin of this package's own: WebStorm, IntelliJ IDEA Ultimate,
  PhpStorm, PyCharm Professional and RubyMine all run ESLint natively — inline, in the Problems tool
  window and under **Code → Inspect Code** — and VS Code, Cursor and Windsurf need only the ESLint
  extension. The page carries the setup for both, the three things that otherwise read as "the rules
  do not work" (flat config only, scope the block to spec files yourself, `⌥⏎` is where the fixes
  and suggestions live), a table of what gets underlined and why, and the reason a native JetBrains
  plugin is not planned. Summarised in the README as **Editor diagnostics — WebStorm & VS Code**.

### Fixed

- **The docs site builds again.** Two dead links (`/core/factories` in `adapters/angular.md`,
  `/utilities/doubles` in `utilities/setup.md`) pointed at pages that do not exist, and VitePress
  fails the build on a dead link — so the GitHub Pages deploy had been failing, and nothing
  published since had reached the site. They now point at
  `/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep` and `/utilities/constructor-doubles`.

### Discoverability

- **The Open Graph image exists.** The meta tags had referenced `og-image.png` since the site went
  up; the file was never created, so every shared link rendered without a card. It is generated from
  a checked-in SVG, and `meta robots` now carries `max-image-preview:large`, without which neither
  Google nor Yandex will use it.

- **IndexNow, on every docs deploy.** A new job in `docs.yml` reads the freshly published
  `sitemap.xml` and submits every URL to `api.indexnow.org`, which Yandex, Bing, Seznam and Naver
  consume — the closest thing to a "reindex now" button for Yandex, and it needs no account. The key
  file is served from `docs-site/public/`; the job is `continue-on-error`, so a submission failure
  never fails a deploy that already succeeded.

- **A second JSON-LD graph** (`WebSite` + `Person` with `sameAs` + `SoftwareApplication` with its
  runtime requirements and feature list), `robots.txt` naming the sitemap and both llms files, and
  `<link rel="alternate" type="text/plain">` announcing `llms.txt` / `llms-full.txt` the way a feed
  is announced. Keyword metadata widened to the terms this package can win — `vitest mock class`,
  `replace jest-auto-spies`, `webstorm eslint inspections`, `openai codex`, `glm z.ai`.

### Documentation

- **Every mainstream coding agent now gets a named file, not "or equivalent".** The README section
  and `docs-site/agents.md` gained a per-agent table — which instruction file each tool actually
  reads and whether it honours `AGENTS.md` — covering **OpenAI Codex** (the `codex` CLI, the IDE
  extension and Codex cloud) second only to Claude Code, **GLM (z.ai coding plan)** and **Kimi K2**,
  Cursor, GitHub Copilot, OpenCode, Cline, Windsurf/Cascade, Zed, Gemini CLI, Qwen Code, Roo Code,
  Junie and Aider. Codex gets the `~/.codex/config.toml` fallback keys and the 32 768-byte chain
  budget that silently truncates a long `AGENTS.md`; GLM gets the point that matters — it is a
  model, not an agent, and inside Claude Code the whole `CLAUDE.md` / skill / plugin path works
  unchanged. A new **Install it in your agent** subsection gives the two commands that cover the
  field, plus the glob-scoped rule files for Cursor, Copilot and Windsurf. The Zed hazard is called
  out: never create `.rules` / `.cursorrules` / `.windsurfrules` / `.clinerules` just to hold a
  pointer — Zed resolves that list first-match-wins and the new file shadows everything.

- **Angular leads the framework adapters**, in the README section order, the table of contents and
  the package description — it is the framework this library is exercised on hardest.

- **A complete table of contents.** It listed only top-level sections plus Angular's; it now covers
  the `How to mock:` recipes, `Runtimes`, `Spying instance-assigned callables`, `Standalone
  observable builder`, `Which factory, and what it costs`, `Console spies` and the new agent
  subsections.

### Added

- **A twelfth rule: `prefer-as-spy`** (`warn`, and the second that runs under `--fix`) —
  `TestBed.inject(X) as Spy<X>` becomes `asSpy<X>(TestBed.inject(X))`, with the `asSpy` import added
  and a `Spy` import the rewrite orphans taken out. That cast is written once per injected double in
  a `jest-auto-spies` suite and fails here with `TS2352`: `Spy<T>` adds `accessorSpies` and the
  per-method helpers, so neither type sufficiently overlaps the other. It is the most common compile
  error a migrated Angular suite produces, and it arrives in batches — which is what makes it worth a
  fix rather than a suggestion. It qualifies for one because the developer has already asserted
  `Spy<X>` in the file being linted: `asSpy` is a typed identity function, so the rewrite keeps that
  assertion whole, decides nothing the cast had not decided, and cannot reach run time — a wrong fix
  fails to compile. The type arguments are carried across rather than left to inference, which
  answers `Spy<Service<any>>` for a generic class. A `Spy` the file declares itself and a cast that
  hops through `unknown` are left alone — the hop says the value is not a `T`, so the call would not
  compile — except for `TestBed.inject(X) as unknown as Spy<X>`, where the container returns `X` by
  construction and the hop was only silencing `TS2352`.

## [3.5.0] - 2026-08-29

### Added

- **`countMockedProps()`** — how many `mock*Prop` patches are still in place, the counterpart of
  `countStrayTimers()` / `countStrayRejections()`. It answers one question: did the teardown
  actually run? `afterEach(() => expect(countMockedProps()).toBe(0))`.

- **An eleventh rule: `no-inject-before-override`** (`warn`) — the trap this plugin's own advice
  sets. `TestBed.inject()` and `TestBed.createComponent()` **instantiate** the testing module, and
  every `TestBed.override*` afterwards throws `Cannot override provider when the test module has
  already been instantiated`. Migrating to `provideAutoSpy` walks people into it: a hand-rolled
  `useValue` configured its return values inside the literal, the replacement has nowhere to put
  them, so `asSpy(TestBed.inject(X)).m.mockReturnValue(…)` lands in `beforeEach` — and every
  override in the suite stops working, including one written *above* that line inside a
  `createComponent` helper the tests call. Found twice independently after a migration, once for
  sixteen tests at a stroke. The check is deliberately order-free, because lexical order is not run
  order: it asks whether the suite overrides at all, exempting an `override*` that sits in the same
  hook body ahead of the injection (that one really does run first) and any suite that calls
  `TestBed.resetTestingModule()`. The message names both repairs — configure the double after the
  overrides with `injectSpy(X)` inside the test, or keep the access lazy
  (`const api = () => injectSpy(Api)`) so instantiation happens in the first test. `warn` rather
  than `error` because the run does report this one, loudly and with a clear message; the rule's
  value is catching it at edit time instead of in the full run after five hundred files.

- **A tenth rule: `no-overridden-provider`** (`error`). Angular keeps the *last* provider registered
  for a token, so a second one in the same array silently replaces the first. In a testing module
  that is a defect rather than untidiness, and it was found on **eight tokens of one spec file**,
  each registered both ways at once:
  `providers: [provideAutoSpy(X), { provide: X, useValue: mockX }]`. Every one of those
  `provideAutoSpy` calls was dead code. It misleads from both sides — the author believes there is an
  auto-spy and writes assertions against one, while what DI hands out is the hand-rolled object
  drifting from the class; and whoever comes later to replace that object sees `provideAutoSpy`
  beside it and reads the migration as done. Nothing in the other nine rules could see it:
  `prefer-provide-auto-spy` looks at the `useValue`, and there it finds an identifier with a
  perfectly good `provideAutoSpy` next to it. The rule reads both spellings in either order
  (`provideAutoSpy`, `provideAutoSpyForToken`, `{ provide: … }`), reports every provider the last one
  buries, and compares tokens as source text — in a `providers` array a token is written by name,
  once, next to the double it stands for, so there is nothing for a resolver to add. No fix and no
  suggestion: deleting either line is a valid repair and the two mean opposite things.

- **`expectError(source$, options?)` — the error, unwrapped.** The emission helpers wrap a stream
  failure in a new `Error` whose message names the stream, which is right for reporting a failure
  nobody expected and useless when the failure is the subject: `rejects.toBe(originalError)`,
  `rejects.toBeInstanceOf(UdmsStatusError)` and an exact message comparison all fail against the
  wrapper, and three migrated specs lost the assertion they had. `expectError` resolves *with* the
  error as it was thrown, waits for it however late it arrives, and fails — naming the stream — when
  the stream completes or stays quiet instead. The wrapped failures now also carry the original on
  `cause`.

- **`expectEmission` / `expectEmissions` / `expectNoEmission` take `{ skip, until }`.** The dominant
  shape on a replayed stream is not "it emitted" but "it emitted *the* value", and writing that as
  `source$.pipe(filter(…))` or `pipe(skip(1))` moves the interesting condition out of the assertion
  and into the source — in a helper whose whole point is that it needs no rxjs. Non-matching
  emissions are still counted, so a failure reads `4 emission(s) received` rather than `0`, which is
  what tells "the wrong thing fired" from "nothing fired"; a `filter` in front of the helper throws
  that distinction away.

- **`{ advance }` closes the window between subscribing and awaiting.** A stream driven by a
  `debounceTime`, a retry or a poll needs the clock moved *after* something is listening, and `await`
  gives control away before the next statement runs. The shape specs arrive at otherwise — hold the
  promise, advance, then await — is correct and breaks silently the moment somebody adds an `await`
  one line above it. A callback rather than an `advanceTimers: true` flag, because these helpers are
  in the core entry, which has no test runner in it.

- **`observablePropsToSpyOn` on the token path.** The third option the two provider forms did not
  share, and the one where the asymmetry cost the most: a class tells the factory which members are
  methods, a type does not, so every unnamed key of a token-driven double was a *function* spy —
  an `Observable` property included, which the code under test then subscribed to as if it were a
  function, failing far from the double. A token with observable members therefore sent people back
  to a hand-written double, which is what `prefer-provide-auto-spy` and
  `prefer-create-spy-from-class` exist to steer them away from. A member also named in `overrides`
  keeps its seed, the same precedence the class factory uses.

- **`ClassSpyConfiguration.overrides` and `AutoMockConfiguration.returns` — the missing halves.**
  `provideAutoSpyForToken` took property seeds and `provideAutoSpy` took method configuration, so a
  double needing both was provided in one statement and finished in another. Both factories now take
  both: `returns` for what a spied method answers, `overrides` for a member that is not a method
  result. A seeded member is stored verbatim and is no longer a spy — seed data there, name methods
  in `returns`.

- **`Mutable<T>`.** `Spy<T>` is a homomorphic mapped type, so it preserves the `readonly` of an
  abstract getter — and an abstract class whose useful members are getters is exactly the shape
  `createAutoMock` exists for. `Mutable<Spy<PlatformLocation>>` makes the direct assignment the
  Proxy's `set` trap has always handled type-check as well.

- **`prefer-create-spy-from-class` takes `{ minRunnerFns }`.** The threshold of two `vi.fn()`s is
  what makes two doubles on adjacent lines behave differently, and seven migration batches tripped
  over it independently. It stays at two by default — an object holding one `vi.fn()` is
  indistinguishable from an options bag with a callback in it, and this rule fires on every object
  literal in a file — but it is now named in the message and configurable, and the case those
  reports were about is covered from the side that can prove it: `prefer-provide-auto-spy` has a
  `provide:` next to the object, fires at one, and since it learnt to follow a name reaches the same
  doubles.

- **`expectCompletion(source$, options?)` — the assertion for a stream whose value is not the
  point.** A save, a purge, an `Observable<void>`, a `Subject` a teardown closes. `firstValueFrom`
  rejects such a stream with rxjs's `EmptyError`, and the workaround people arrive at
  independently — `lastValueFrom(source$, { defaultValue: undefined })` — reads as though the
  default were the interesting part when the whole assertion is "it finished". It resolves on
  completion, rejects on a stream that is still running when the timeout expires (with a message
  that names `take` / `first` / `takeUntil` / a `Subject` nobody completes) and on one that errors.
  Emissions do not fail it: it asserts termination, and `expectNoEmission` is still the one for
  silence.

- **`mockDeep<T>(overrides?, { selfReturning: true })` — a deep mock that survives a chain of
  calls.** `mockDeep` builds depth on property *access*, so `api.repo.user.find()` chains while
  `logger.channel('app').info('x')` throws: the called node returned `undefined`, and
  `DeepMockProxy<T>` types the whole chain perfectly, so nothing warns. Six spec files in one
  migration were written against the type and reverted to `createAutoMock` + `mockReturnThis`
  before the cause was found. With the option, an *unconfigured* call hands the node back;
  `mockReturnValue`, `calledWith(...)` and `resolveWith` all still win, so the only case it gets
  wrong is a node deliberately configured to return `undefined` — which is why it is opt-in.

- **`setEmissionTimeout(ms)` — one default instead of `{ timeout: 0 }` at every call site.** The
  emission watchdog runs on real time on purpose (see *Changed*), so in a suite under global fake
  timers a failing assertion spends a real second. The reflex that produces is `{ timeout: 0 }`
  everywhere — nine call sites in a single batch — which disables the watchdog and leaves the next
  silent stream hanging to the runner's own timeout with no message worth reading. Set the default
  once in the setup file instead.

- **`blockNetwork` closes `XMLHttpRequest` and `navigator.sendBeacon`, not only `fetch`.** jsdom
  ships no `fetch` but implements XHR in full, and plenty of libraries never left it: `rmp-vast`
  pings every VAST tracker through a hand-rolled `XMLHttpRequest` (`FW.ajax`), so a suite driving an
  ad player with `setupAutoSpy({ blockNetwork: true })` already on kept reaching
  `radiantmediaplayer.com` — one ping per quartile, per ad, per test — and printed jsdom's
  `AggregateError at Object.dispatchError` for every connection that failed. What a green run
  printed therefore depended on whether the machine had a route to the internet. `blockNetwork()`
  now takes `{ fetch?, xhr?, beacon? }` (and `setupAutoSpy({ blockNetwork })` takes the same object
  or `true`); every channel is closed by default, so the bare call is unchanged apart from covering
  more. The two callers want different answers, which is why `xhr` is a mode rather than a boolean:
  `'reject'` (the default) fails the request the way an unreachable host does — `readyState` 4,
  `status` 0, an `error` event, and `BLOCKED_XHR_MESSAGE` on `statusText`, the only string channel a
  failed request has — so the code under test takes the branch a unit test should be asserting on,
  while `'empty'` answers it with a silent 200 and an empty body, for a tracker ping whose response
  nobody reads and whose failure only trades one kind of noise for another. The diversion happens in
  `open`, so the only address the real implementation ever holds is a local one whatever `send` then
  does; the failure itself is synthesised rather than delegated to a URL the environment refuses,
  because there is no URL jsdom and happy-dom agree to fail on. A `data:` URL is let through — the
  scheme a spec serves its own fixtures from, and the only one a DOM answers without a socket —
  while a **relative** URL is not, since the DOM resolves it against the document origin and the
  request then rests on nothing listening on that port. `sendBeacon` is replaced only where the
  environment has one, because introducing it would hand the code under test a capability it does
  not otherwise have. Everything goes in through `mockValueProp`, so `restoreMockedProps()` puts it
  all back. `WebSocket` and `EventSource` are left alone on purpose: their failure is an event on an
  object the code keeps and reconnects, so no blanket answer is free of a behaviour change of its
  own.

- **`no-mocked-for-spy` fixes what it reports** (`eslint --fix`), and it is the only rule here that
  does. It renames `Mocked<T>` / `MockedObject<T>` to `Spy<T>`, adds
  `import type { Spy } from 'vitest-auto-spy'` when the name is free, and drops the orphaned
  `Mocked` import once the last reference to it is gone — with the whole declaration when it was the
  only specifier, out of the braces when it was not. The reason this one may run unattended is that
  it touches nothing but a declaration: a wrong rewrite is a compile error, never a test that
  silently changed meaning. It declines where it cannot prove the rename — a `Mocked` the file
  declares itself, a `Spy` already bound to something else, or a `Mocked<{ a: Mock }>` whose
  argument is not a named type — and reports those without a fix.

- **A suggestion for the shape `no-expect-in-subscribe` fires on most often.** One template
  accounted for 111 of the 133 rule violations in a batch of 22 migrated spec files:
  `it(name, () => new Promise<void>((done) => { src$.subscribe((value) => { expect(…); done(); }); }))`,
  which is what a mechanical migration off Jasmine's `done` produced when `done` stopped being a
  test parameter. The rule now offers the rewrite —
  `it(name, async () => { const value = await firstValueFrom(src$); expect(…); })` — re-indented to
  the depth the test already sits at, with `firstValueFrom` imported when the file has no binding
  for it. It is offered only for that exact frame: one `subscribe` statement in the promise
  executor (anything else there is usually the statement that *triggers* the source, and that has to
  run while something is already listening), one block-bodied callback taking at most a value, and
  `done` mentioned exactly once and standing last. A suggestion rather than a fix, because a wrong
  rewrite here leaves a test that still passes — the failure this rule exists to catch.

- **Suggestions on `prefer-inject-spy` and `no-object-define-property`.** Both change behaviour
  rather than spelling, so an editor offers the edit and a human accepts it:
  `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X).m` (whether that finds a spy depends on a
  `provideAutoSpy(X)` usually written in another file), and
  `Object.defineProperty(o, 'p', { value })` → `mockValueProp(o, 'p', value)` (which leaves the
  property writable and configurable where the original sealed it — the point of the change, and
  still a change). Each brings its own import. Both decline the shapes they would have to invent:
  `TestBed.inject(X, null, flags)`, a computed method name, a descriptor with a getter or an extra
  key, or a name that already means something else in the file.

- **`createSpyFromClass(X, { fillMissing: true })` — a partially abstract class.** The
  empty-prototype fallback covers a *fully* abstract class; one concrete member is enough to leave
  that path, and a DI token with a few `abstract` declarations plus one concrete helper or getter is
  the ordinary Angular shape. `abstract read(): string` is erased before it reaches a prototype, so
  discovery finds only the concrete members, the fallback does not fire, and every abstract member is
  missing while `Spy<T>` types it as present: the read yields `undefined` and the failure lands in
  production code as `… is not a function`, with nothing pointing at the spec. `fillMissing` answers
  a name the prototype never carried with a spy. It has to be opt-in — TypeScript erases `abstract`,
  so at runtime such a class and a concrete one are the same object, and filling every unknown key by
  default would silence a genuine typo on every class in the suite, which is the property that
  separates this library from the mock-everything proxies. A member the record already has is still
  read from the record, so a lazy placeholder materialises exactly as it would without the wrapper;
  and the protocol keys the surrounding machinery probes to decide *what kind of object this is* —
  `then`, `constructor`, `toJSON`, `asymmetricMatch`, `$$typeof`, `nodeType`, and every symbol — are
  never filled: a spy on `asymmetricMatch` turns each `toEqual` against the double into a matcher
  invocation, and one on `toJSON` rewrites every snapshot of it.

### Fixed

- **A failed call could arrive as a successful one carrying the previous test's data** — the
  quietest defect in this library's history. Every observable helper writes into one
  `ReplaySubject(1)` per spied member, and that subject was created once and kept for the life of
  the spy, so its buffer outlived the configuration that filled it. A `nextWith(uri)` in one test
  was replayed to the next one **ahead of** the `throwWith(error)` that test was written for: the
  code under test walked the *success* branch on stale data, and the error branch was reached one
  emission late, if at all. Nothing in the failure pointed at the previous test. It needs a spy that
  outlives a test, which is the ordinary shape when the TestBed is built in `beforeAll`. A second
  failure came from the same place: `error()` and `complete()` close a Subject permanently, so every
  later `nextWith` on that spy pushed into a dead subject and emitted nothing at all — even after
  `resetAutoSpy`, which claims to return a spy to pristine and could not reach this state. The
  subject's lifetime is now the spy's *configuration*: `resetAutoSpy` drops it, and a terminated one
  is replaced by the next configuration. Inside one test nothing changes — `nextWith(a)` then
  `throwWith(e)` still means "emit a, then fail". `vi.clearAllMocks()` and `clearMocks: true` still
  cannot reach it, for the same reason they cannot clear a `calledWith` chain, so a spy shared
  across tests wants `resetAutoSpy(spy)` in `beforeEach`.

- **A proxy double satisfied rxjs's duck-typing, and that silently emptied a stream.**
  `of(autoMocked<AnimationItem>())` never emitted: `of(...)` calls `popScheduler(args)`, which takes
  the last argument for a scheduler when `typeof x.schedule === 'function'`, so a double that
  answers every property was eaten whole as the scheduler, `of()` was left with an empty argument
  list, and the emission was scheduled onto a spy that does nothing. The component under test kept
  its `null` and the assertion that failed was about an unrelated `emit()` — nothing pointed at
  `of`. Four keys are now answered with `undefined` unless a spec seeds them: `schedule`, `lift` and
  `@@observable` and `getReader` (`isObservable` and both `innerFrom` probes), joining `then` and
  every symbol, which always were. `subscribe` is deliberately **not** on that list — it is an
  ordinary method name and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is a real assertion;
  denying `lift` and `@@observable` is enough that `from(double)` now fails with rxjs's own "You
  provided an invalid object where a stream was expected". A type that genuinely has one of the four
  seeds it once and gets it back.

- **`gettersToSpyOn` on a get/set pair spied only the getter.** The double came out poorer than the
  original exactly where the code under test expects symmetry: the assignment landed on the no-op
  setter the spy scaffolding installs, so the write vanished *and* there was nothing to assert on —
  `accessorSpies.setters.x` was `undefined`, and the failure read `Cannot read properties of
  undefined` several steps from the configuration behind it. Naming either half now installs both
  when the **prototype descriptor** declares both; mirroring never adds what the class does not
  have, so a read-only member stays read-only.

- **All four `mock*Prop` helpers were a silent no-op on `createAutoMock` and `mockDeep` doubles.**
  Both are Proxies; the helpers are built on `Object.defineProperty`; neither Proxy trapped it. The
  patch landed on the Proxy's own target, the `get` trap never looked there, nothing threw, and the
  test carried on reading the old value. That broke the composition of two things this library
  recommends in the same breath — `no-object-define-property` sends people to `mock*Prop`, the
  factory decision tree sends them to `createAutoMock` — and specs that hit it ended up building the
  double by hand, real getters plus a `createFunctionSpy` per method. Both Proxies now carry
  `defineProperty`, `deleteProperty` and (on `mockDeep`) `getOwnPropertyDescriptor` traps over the
  same store the `get` trap reads, so every helper works and `restoreMockedProps()` undoes it.
  Accessor descriptors are kept as accessors, so `mockReadonlyProp`'s getter is *called* rather than
  handed back.

- **A `mockDeep` result had nowhere to go.** `DeepMockProxy<T>` is not assignable to `T` (a mapped
  type cannot see private members, and it loses non-public members at depth), and `asInstance` — the
  bridge that exists for exactly this — took only a `Spy<T>`, which a deep mock is not: it has no
  `accessorSpies` bag. So the factory decision tree recommended `mockDeep` whenever the calls chain,
  and the result then fitted nothing that expected `T`. `asInstance` now has a second overload for
  it; the runtime story is identical to `createAutoMock`'s, so the bridge is the same one.

- **`delete mock.optionalMethod` deleted nothing.** On a double that materialises members on demand,
  dropping a key is not deletion — the next read made a fresh spy, the member was truthy again, and
  a test named "the optional method is missing, so we do not crash" exercised the branch where it is
  present. Green, and asserting nothing. A deleted key is now remembered as absent until something
  writes to it again, as it would be on a real object.

- **`expectEmission` inferred `unknown` instead of the emitted type, silently.** Its parameter
  matched rxjs's overloaded `subscribe` in a way that inferred nothing — TypeScript pairs the
  *trailing* signatures, and in rxjs 7 that is the deprecated positional overload — so
  `expectEmission(of(1))` was a `Promise<unknown>`. The call compiled, `resolves.toBe(1)` passed,
  and the loss surfaced only when somebody read a field off the awaited value (`TS2339`) or
  destructured it (`TS2488`). Three agents hit it independently, and the helper was losing to
  `firstValueFrom` — 58 files against 7 in one repository — on nothing but its types. Every helper
  now takes a first overload shaped like the callback form, which pairs correctly with rxjs 7 *and*
  with the single signature rxjs 8 leaves behind; `expectEmissions` was wrong the same way and is
  fixed with it. Hand-rolled observer-only sources still take the second overload unchanged.

- **`expectEmission` hung on an Angular `output()`.** `OutputEmitterRef.subscribe` takes a bare
  callback, and the helpers passed an observer object; `emit()` then called that object, and the
  `TypeError` went into Angular's `ErrorHandler` rather than out to the spec — so
  `await expectEmission(component.selectionChange)` waited for the watchdog with nothing to explain
  it. Both subscription contracts are now accepted: an rxjs source (detected by `pipe`) still gets
  the observer object, because rxjs reads a function argument as `next` and drops `error` and
  `complete`, and everything else gets an observer that is also callable.

- **`provideAutoSpy` / `createSpyFromClass` take an `abstract class`.** `abstract class LocalStorage
  extends AbstractStorage {}`, provided in production with `useClass`, is the standard Angular
  DI-token idiom, and it failed in both directions: the bare call compiled and produced a double
  with no spies on it, while the config form that would fix that did not compile at all
  (`TS2345: Cannot assign an abstract constructor type to a non-abstract constructor type`).
  `ClassType<T>` now carries an **abstract** construct signature — nothing in this library calls
  `new` on the token — and at runtime, when prototype discovery comes back empty (abstract members
  are erased before they reach a prototype), the factory hands back the `createAutoMock` proxy
  instead of an empty object, so every method of the declared type answers. `returns` is applied to
  it too. The hand-written workaround, `{ provide: X, useValue: createAutoMock<X>() }`, is no longer
  needed.

- **`onlyMethodsToSpyOn` was silently discarded on an abstract class.** The empty-prototype fallback
  above fired first and handed back the `createAutoMock` proxy, which answers *every* key — so the
  one thing a restricting list exists for ("spy these and no others, so an unexpected call is loud")
  was switched off without a word. A restricting list now keeps the assembled record whatever the
  prototype named. The typo warning that goes with it is suppressed when the prototype names nothing
  at all: there every entry would be reported and none of it is evidence of a typo, because a
  whitelist is the only way to describe such a class.

- **`overrideProvider(X, provideAutoSpy(X))` is not a silent no-op**, contrary to what `AGENTS.md`
  §13, the Angular page and the site's landing page all claimed. `provideAutoSpy` returns
  `{ provide, useValue }`; `overrideProvider` reads `useValue` off it and ignores the extra key, and
  the spy is installed. `overrideAutoSpy` is still the right call — it says what it does and hands
  the spy back directly — but the documented reason was false. Corrected in all three places.

- **A `mock*Prop` patch no longer survives a teardown that never ran.** `setupAutoSpy()` restored
  properties from an `afterEach`, and Vitest calls `afterEach` hooks in **reverse** registration
  order — so the hook a setup file registers is the *last* one, and any hook the spec file
  registered, which therefore runs first, takes the whole chain down with it when it throws. The
  patches then travelled into the next test and the failure surfaced wherever the leaked value
  happened to matter, which is routinely a different `describe` and an error about something else.
  The chain that exposed it is worth recording: a spec kept a long-standing
  `afterEach(() => vi.restoreAllMocks())`; migrating it to
  `provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })` made the restored getter return
  `undefined`; `ngOnDestroy` called it as a signal and got a `TypeError`; the hook aborted; nothing
  of the library's cleanup ran; and the visible failure was a template error about a null profile in
  another `describe` entirely. Against the hand-rolled `vi.fn()` it replaced, the restored getter was
  still *callable*, so the mine had been armed and invisible for as long as the file existed. The
  restores now also run from an `onTestFinished` hook, which Vitest calls after the `afterEach` chain
  and calls whatever that chain did — measured in both orderings rather than assumed. The net does
  nothing unless the hook was skipped, so the ordinary path costs one boolean, and when it does fire
  it warns with the count and the cause, at the test where it happened instead of two tests later.

- **`flushEventLoopUntil`'s failure names the cause that reads as a flake.** It listed three
  possibilities and none of them covered what actually happened twice: the work *had* started, and a
  **cold** dynamic `import()` needed more turns than the budget. The giveaway is that only the first
  such test in a file fails while every later one passes off the module cache, so it looks
  intermittent and gets retried rather than read. The message now names that case first, with its
  fix — `await settleDynamicImport(() => import('…'))`, which awaits the module instead of counting
  turns.

### Changed

- **Documented the one migration rename that is not equivalent.** `vi.fn(() => x)` reads `x` when
  the double is *called*; `mockReturnValue(x)` freezes the value `x` had when the double was
  *configured*. Nothing distinguishes them until the test reassigns `x`, and the commonest reason to
  do that is a fresh `Subject` after the previous one was `error()`ed — which is exactly what the
  suite is exercising when it reassigns. In one spec the service then received a completed subject
  and silently skipped the modal it was meant to show, with the test green. The repair is
  `mockImplementation(() => x)`; `mockReturnValue` is for a literal. Written up in the migration
  guide and in AGENTS.md §18, because the rename looks like the safest edit in the file and anyone
  writing a codemod will reach for it.

- **`no-expect-in-subscribe` says which of three edits it is looking at.** The rule reported one
  message for three repairs that share a shape and nothing else, and five batches split the work by
  hand — the proportion moves per *file*, not per suite: 110 of 111 places were a mechanical
  inversion in one, 36 of 119 in another. Now: the subscription is the last thing the test does →
  invert it into `await firstValueFrom(...)`; another statement follows it → that statement is
  usually what makes the stream emit (`httpMock.expectOne(...)`, `subject.next(...)`,
  `vi.runAllTimers()`), inverting deadlocks, so hold the promise, fire the trigger and await it;
  the assertion is in the `error` branch, positional or named → `rejects`, which additionally fails
  when the stream succeeds, something an `error` callback nobody calls cannot do. The message also
  names `expectEmissions(source$, N)` for a callback that was asserting on every emission, and spells
  out that `subscribe({ next: () => expect.unreachable(…), error: (e) => expect(e).toBe(err) })`
  collapses to one `rejects` line.

- **…and finds assertions the callback reaches through a helper.**
  `source$.subscribe((data) => assertShape(data))` is the same green-and-empty test as the inline
  form, and the rule saw nothing there at all. It now steps once through a name bound in the same
  file — declared or assigned, either spelling — and counts the `expect`s in its body. A helper
  declared inside the callback is counted once, not twice.

- **The done-callback suggestion covers the observer forms.** `subscribe({ next })` behaves as the
  positional callback, and `subscribe({ complete })` becomes
  `await lastValueFrom(src, { defaultValue: undefined })` — `complete` fires after an empty stream
  too, which `firstValueFrom` rejects on, and seven places in one file were written that way. Two
  handlers are declined outright: a one-off codemod that looked for `done()` as the last line of *a*
  callback found it in `complete`, took `next` for the body, and broke a file.

- **`prefer-provide-auto-spy` reads `useFactory`.** It looked only at `useValue`, so
  `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))` went unreported — with,
  in one file, a structural double unrelated to the class and a double cast to make it fit. The
  factory is read *through* the function, which is the opposite of how a `useValue` is read and right
  for each: a factory's body is what DI ends up holding, while a function inside a `useValue` is a
  lazily-built double, i.e. the shape these rules recommend.

- **`no-mocked-for-spy` sees every type position.** The selector was pinned to a `let` annotation,
  so it missed a factory's return type, a helper's parameter, and `as unknown as Mocked<T>` — which
  in one batch stood on the line after the declaration in all eight reports. Fixing one and leaving
  the other is how a file ends up saying both.

- **…and says what a `Signal<T>` property needs.** Third independent report of one substitution: a
  signal replaced by `vi.fn().mockReturnValue(value)`, which reads identically at the call site and
  stops being a signal the moment anything puts a `computed()` or an `effect()` downstream of it.
  The message now spells the repair out as `mockReadonlyProp(obj, key, signal(value))`, with the
  word **real** on the signal.

- **`no-object-define-property` names the helper each descriptor asks for.** Five batches met four
  descriptor shapes and a message listing two helpers, and for two of those shapes the named helper
  is actively wrong: `{ get }` is `mockReadonlyPropGetter`, and a `{ value }` holding a mock the
  code calls with `new` is `stubConstructor` — spelled with a `function` because an arrow cannot be
  constructed, which is why `mockValueProp` there produces "is not a constructor" three assertions
  before anything looks wrong. The suggestion now declines that shape rather than proposing it, and
  the message adds the case where the property is missing because it is an instance field, whose
  repair belongs where the spy is built (`instanceMethodsToSpyOn`).

- **…and calls out a patch paired with a hand-written restore.** Two `Object.defineProperty` calls
  on the same object and key in the same block are a patch and a manual undo, and the undo runs only
  if every assertion between them passes: the first red one skips it and the global stays patched
  for the rest of the file — and, under `isolate: false`, of the worker.

- **`prefer-create-spy-from-class` stays out of `vi.mock()` factories.** The object a module mock
  returns replaces the module's *exports*, and its `vi.fn()`s stand in for classes used as DI
  tokens; `createSpyFromClass` cannot go there in any form, because a token has to be a constructor.

- **The emission watchdog's real-time clock is now explained rather than merely implemented.** It
  stays on the timers captured at import, for two reasons that are now written down: the helper *is*
  the assertion, so its clock must be the one thing a spec cannot stop; and a virtual watchdog would
  race the timers the spec advances — `{ timeout: 200 }` followed by `vi.advanceTimersByTime(5_000)`
  would fire at 200 virtual ms and reject the stream the spec was about to advance into. The timeout
  message no longer advises `{ timeout: 0 }` under fake timers, which disables the watchdog and
  takes the failure message with it; it points at `setEmissionTimeout` instead.

- **`PropStubValue<V>` accepts `null` and `undefined`.** "This member is absent in this test" is a
  normal thing for a spec to say, and interface declarations routinely omit the `| null` the runtime
  has. Such a call already compiled — by falling through to the untyped escape-hatch overload every
  `mock*Prop` helper carries — so what this changes is which overload answers: the checked one, with
  its property-name check and completions. Worth stating plainly, because it is easy to over-read:
  nothing a `mock*Prop` helper is handed is ever *rejected*, and that is deliberate — the escape
  hatch is a routine tool (a partial fixture of a fat type, a synthetic DOM event, a member the
  double does not have), not a last resort.

- **Documented two failures that are only diagnosable from the docs.** A member Angular moved onto
  the instance (`Router.currentNavigation` since Angular 20) is not on the prototype, so the spy does
  not have it and configuring it throws `TypeError: Cannot read properties of undefined (reading
  'mockReturnValue')`; the fix is `instanceMethodsToSpyOn`, and there is no better runtime message to
  be had — instance fields do not exist until a constructor has run, and this factory never
  constructs. Answering an unknown member with *something* would make that something truthy, which
  is the exact failure mode the protocol deny-list above removes. And a component's own
  `@Component({ providers })` beating a module-level `provideAutoSpy` is now a section of §13 rather
  than a row in the error table — it has surfaced twice in one migration wave, both times as a
  `TypeError` inside whatever the real service touched first.

- **Documented the one thing about `mockDeep` that the types hide:** depth comes from property
  access, not from calls. `AGENTS.md` §2, the decision tree, and the auto-mock page now say so
  before recommending it for chains.

- **`prefer-provide-auto-spy` sees the doubles it was written for.** It read the `useValue` only
  when the object literal was written in place, and only its direct properties. Both misses were
  found on live code: in one spec file eight hand-rolled doubles were declared as `const`s above the
  TestBed and passed by name, and the rule reported none of them; and a platform double written as
  `{ type: 'tizen', application: { init: vi.fn() } }` read as configuration because the spy was one
  level down. It now follows a name to the `const` that initialised it — same file, never
  reassigned, the same one-step resolution `prefer-inject-spy` uses — and looks through the whole
  `useValue` subtree, stopping at every function boundary so that a factory returning spies (the
  shape it steers towards) is still not flagged.

- **A configured `vi.fn()` counts as one.** `vi.fn()` and `vi.fn().mockReturnValue(of([]))` are the
  same double, one of them tuned, but the check both provider rules sit on read the immediate
  callee's object and stopped there — so it recognised the bare form and missed every configured
  one. In one `providers` array the double on one line was reported and the one on the next was
  not; four independent migration batches found it on four different files. Exactly backwards, too:
  the more a hand-rolled double has been tuned, the further it has drifted from the class it stands
  in for. The member chain is now unwound to the call that created the mock, however long it is
  (`vi.fn().mockReturnValue(x).mockName('y')`), which mostly shows up in
  `prefer-create-spy-from-class` — it counts direct property values and never walked the subtree.

- **`prefer-provide-auto-spy` stops recommending a call that does not compile.** It named
  `provideAutoSpy(Token)` for everything, and on an `InjectionToken` that is wrong: `provideAutoSpy`
  reads a class prototype and a token has none, so the right call is `provideAutoSpyForToken` —
  which the message had never heard of. Three batches reported it independently, and it was not a
  rare corner: 6 of 8 reports in one, 3 of 12 and 2 of 5 in the others. The rule now tells the two
  apart, by the declaration where `new InjectionToken(…)` is within the resolver's reach and by the
  `SCREAMING_SNAKE_CASE` spelling otherwise, and the class message names the token form as well —
  the two are never interchangeable, so guessing silently would have been worse than saying both.
  The token message also carries the seed that the first use of it needs:
  `provideAutoSpyForToken(LOGGER, { channel: vi.fn().mockReturnThis() })`, without which a
  constructor doing `inject(LOGGER).channel('auth').debug('…')` dies on `undefined` before the spec
  runs a line.

- **`prefer-create-spy-from-class` no longer flags its own fix.** An object of `vi.fn()`s handed to
  one of this library's factories — `createAutoMock<T>({ send: vi.fn(), abort: vi.fn() })`,
  `mockDeep<T>({ api: { load: vi.fn(), save: vi.fn() } })` — is a *seed*, and there is no other form
  it could take: it was reported all the same, so replacing a hand-rolled double as the rule asks
  produced a fresh violation of the same rule. At `error` level that stops the work, and the only
  way past it is an `eslint-disable` over correct code. Anything inside a call to `autoMocked`,
  `createAutoMock`, `createMock`, `createSpyClass`, `createSpyFromClass`, `mockConstructor`,
  `mockDeep`, `provideAutoSpy` or `provideAutoSpyForToken` is now left alone, at any depth.
  `prefer-provide-auto-spy` was checked for the same trap and does not have it: a `useValue` built
  by a factory is a call rather than an object literal, which it already ignores.

- **`no-expect-in-subscribe` reports once per `subscribe`, with the assertion count.** It counted
  `expect` calls, so one file produced 44 messages for 23 places — which doubles the apparent size
  of the job when a migration is triaged by rule counts, and every one of those messages named the
  same rewrite.

- **`no-object-define-property` names the helper the descriptor asks for.** The message listed
  `mockReadonlyProp` / `mockValueProp` for every shape, including
  `Object.defineProperty(host, 'offsetHeight', { get: () => 1000, configurable: true })` — which is
  literally `mockReadonlyPropGetter`. It now maps the descriptor to the helper (`value` →
  `mockValueProp`, `get` → `mockReadonlyPropGetter`, a `get`/`set` pair → `mockAccessorsProp`, a
  signal-valued property → `mockReadonlyProp`), and the suggestion covers the getter form as well
  as the value one. A `configurable` key alongside is fine — restoring configurability is the point
  of the change — and anything else is reported without a suggestion.

- **`setupAutoSpy({ strayRejections: true })` no longer reports a failure twice.** An `async` test
  that fails an assertion leaves its own `AssertionError` in two places: the runner reports the
  failed test, and under some zone patches the same error also arrives as a rejection nobody
  handled. A red run then printed two messages per failure, and the first thing a reader does with
  the second one is go looking for a defect that is not there. The teardown step now reads the
  errors the runner has already attributed to the test that just finished — `task.result.errors`,
  populated by the time `afterEach` runs — and drops a captured rejection that is the same object,
  or carries the same message and stack. What survives is what the check is for: the rejections that
  fail no test at all.

- **`prefer-inject-spy` reads the two-step form too.** It used to see only
  `vi.spyOn(TestBed.inject(X), 'm')`; the same mistake spelled over two lines —
  `const events = TestBed.inject(EventsService); vi.spyOn(events, 'announce')` — went unreported,
  which was found with both forms on adjacent lines of one file and only the first of them flagged.
  The variable is resolved through the parser's scope manager, so the rule still leaves alone
  anything it cannot pin down: a name bound by an import or a parameter, a `let` declared without an
  initialiser, one initialised from something other than `TestBed.inject`, and one assigned again
  anywhere in the file — by the `spyOn` it holds whatever that assignment put there.

## [3.4.0] - 2026-08-29

### Added

- **`setupAutoSpy({ pruneMockRegistry: true })`** — keeps `@vitest/spy`'s registry of every mock ever
  created down to the mocks that outlive a file. `vi.fn()` and `vi.spyOn()` add what they create to one
  module-level `Set`, because that is what `vi.clearAllMocks()` walks, and no API takes anything out
  of it again. With `isolate: true` the module is re-evaluated per file and the set starts empty; with
  `isolate: false` it is evaluated once per worker and only grows, so `clearMocks: true` walks every
  mock of every file already run **before every single test**, and the worker's heap holds all of them
  at once — with their recorded arguments, and through those whole component trees. The set is not
  exposed, so it is taken from the one thing that iterates it: `Set.forEach` hands its receiver to the
  callback, so `vi.clearAllMocks()` under a briefly patched `Set.prototype.forEach` reveals it, and the
  capture is verified against a probe mock — without a match nothing is pruned, because a slower run
  beats a broken one. The half that is easy to get wrong is what must **not** go: dropping a mock means
  `clearMocks` can no longer see it, which is harmless for one that dies with its file and a bug for the
  module-level `vi.fn()` in a shared `*.mock.ts` that six spec files import — the first file to import
  it creates it, a naive prune drops it when that file ends, and the file that happens to run second
  then fails on calls its predecessor made. Read as flakiness, because which file is first is the
  runner's choice. So the split is drawn where it is observable: what exists when a file's hooks start
  was created while the module graph was being evaluated and is kept, everything added afterwards
  belongs to that file and goes when it ends. `trackMockRegistry()` installs it on its own,
  `keepMockRegistered(mock)` marks the one case the split misses (a module loaded by a dynamic
  `import()` inside a test), and `getMockRegistrySize()` reports what is left. Off by default: it
  reaches into a set the runner does not expose.

## [3.3.0] - 2026-08-29

### Added

- **`setupAutoSpy({ strayRejections: true })`** — turns a promise rejection zone.js swallowed into a
  failed test. zone.js replaces the global `Promise`, and a rejected `ZoneAwarePromise` nobody
  handled is drained into `console.error` and no further: it never reaches
  `process.on('unhandledRejection')`, the channel Vitest listens on, so the runner is never told and
  the file still exits 0. An assertion that dies inside a `.then()` therefore prints to stderr and
  leaves its test green — as does an `async` helper called without `await`, and a `TypeError` thrown
  inside an `import('…').then(…)` in production code. In the migrated Angular monorepo this came
  from — 1688 spec files, 11 587 tests, green, exit 0 — that one shape was hiding **six real
  defects**, two of them assertions that were simply false. The option claims the hook zone.js
  leaves free under Node and jsdom (`Zone[Zone.__symbol__('unhandledPromiseRejectionHandler')]`),
  chaining to whatever was already there rather than replacing it, and fails the test the runner was
  in when the rejection surfaced. Off by default, because it needs zone.js already loaded — this
  package never imports it, so a zoneless project is untouched and the call throws rather than
  pretending to watch. Deliberately **not** a `process.on('unhandledRejection')` listener: Vitest's
  own handler bails out as soon as a second listener exists, so adding one would *silence* the
  native rejections the runner already fails a run for. `trackStrayRejections()`,
  `countStrayRejections()` and `flushStrayRejections()` are exported for a suite that wants the
  check somewhere narrower.

- **`no-floating-assertion`** — a ninth ESLint rule, `error` in `configs.recommended`, and the
  static half of the same failure. It flags an `expect()` inside a `.then()` / `.catch()` /
  `.finally()` callback whose chain is a bare expression statement: nothing awaits it, returns it,
  assigns it or passes it on, so the test ends before the callback runs and the assertion never runs
  at all — the test passes whatever it claimed, including claims that are false. It walks to the top
  of the chain before deciding, so the first callback of `p.then(a).catch(b)` is not cleared by the
  second having a consumer, and it reads only the *immediately* enclosing callback: awaiting the
  chain revives an `expect` sitting directly in the `.then()`, but not one parked in a
  `subscribe()` inside it, and reporting only what the fix repairs keeps the message honest.

## [3.2.0] - 2026-08-28

### Added

- **`setupFakeTimers(config?, { betweenTests })`** — keeps the clock fake in the gaps between tests,
  not only during them, which is what Jest's `fakeTimers.enableGlobally` did. Arming in `beforeEach`
  alone does not reproduce it: a `beforeAll` inside a **nested** `describe` runs after the previous
  test's `afterEach`, so a block that prepares its samples there — driving an animation clock with
  `vi.advanceTimersByTimeAsync`, say — fails with `A function to advance timers was called but the
  timers APIs are not mocked`, in a set whose own tests never touch a timer. Off by default, because
  a scoped call belongs to its `describe`; `setupAutoSpy({ globalFakeTimers })` turns it on, and the
  fakes come off in `afterAll` so they never outlive the file.

### Changed

- **The `vitest-auto-spies` alias is published by CI**, from both release paths, right after the
  canonical package reaches npm (`.github/workflows/publish-alias.yml`). The step re-checks that the
  generated directory matches `package.json`, refuses to publish before the package the alias
  depends on is on npm, and skips a version that is already there — so it is safe to re-run, and it
  can be run on its own to catch up a version released before it existed. Publishing by hand is what
  let the alias sit at 1.9.3, two majors and four entry points behind.

- **CI runs `npm run test:zone` and `npm run alias:sync:check`.** `vitest-auto-spy/zone` is the only
  entry that touches zone.js and no other suite loads any of it, so `fakeAsync` / `waitForAsync` were
  verified locally and nowhere else.

- **`installProxyZonePatch({ scope })`** — `'shared'` (the new default) runs every test and hook body
  of the run through one proxy zone, which is what Angular's own jasmine patch does: a component
  built in `beforeEach` schedules from its constructor, and the `tick()` inside the `fakeAsync` test
  has to see those timers. `'callback'` keeps the previous fork-per-callback behaviour, which is what
  `test.concurrent` needs — two callbacks in flight would otherwise swap the same `ProxyZoneSpec`
  delegate under one another.

- **`DeepPartial<T>` accepts the real value at every level**, not only a partial of it. The type is a
  mapping over host objects as well — `BuiltIn` can only list ECMAScript types, since naming `Node`
  or `NodeList` would put `lib: ["DOM"]` into the published `.d.ts` for `/node`, `/nestjs` and
  `/bun` — and a real `NodeList` had stopped being assignable to the mapping of itself
  (`createMock<MutationRecord>({ addedNodes: nodeList })`). Excess-property checking is unaffected: a
  key `T` does not have is still rejected at any depth.
## [3.1.0] - 2026-08-28

Everything below comes from one source: a 1688-spec Angular monorepo moving from Jest to Vitest
under the native `@angular/build:unit-test` builder. Each item is something that had to be written
by hand there, in more than one place, by more than one person.

### Added

- **`mockConstructor(factory, name?)` and `stubConstructor(target, key, factory)`** — a test double
  the code under test can call with `new`. This is the single most common failure of a Jest → Vitest
  move: `jest.fn().mockImplementation(() => instance)` served `new`, and Vitest only forwards `new`
  to a constructible implementation, so an arrow records the call, skips the body and hands back an
  empty object. What arrives is `TypeError: (cb) => {…} is not a constructor` with a stack in
  production code, or a green test for the wrong reason. `mockConstructor` stays a full runner mock
  (matchers, `mockClear`), collects `instances`, throws by name if it is ever called *without* `new`,
  and refuses a factory that returns a primitive (which `new` would discard). `stubConstructor`
  installs it through `mockValueProp`, so `restoreMockedProps()` puts the real constructor back.
- **`flushEventLoop(turns?)` and `settleDynamicImport(load, turns?)`** — real event-loop turns while
  the timers are faked, without touching the clock. `await Promise.resolve()` never advances a
  dynamic `import()` or a native `async` function inside a dependency, and `setTimeout` is the fake
  one; the working alternative, `vi.advanceTimersByTimeAsync(0)`, reads as "move the timers" in a
  test that has no timers and gets deleted as noise.
- **`stubAbortController()`** — a realm-consistent `AbortController` / `AbortSignal`, so
  `addEventListener(…, { signal })` works under jsdom. The failure it removes,
  `TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget`,
  is raised by jsdom, caused by Node's fetch globals and triggered by zone.js, and names none of
  them.
- **`mutationRecord(target, init?)` and `resizeEntry(target, rect?)`** — the missing counterparts of
  `intersectionEntry`. A `MutationRecord` cannot be written as an object literal at all
  (`addedNodes` is a `NodeList`), and the obvious `DocumentFragment` construction **moves** the
  nodes, tearing them out of the fixture under test; this one moves nothing.
- **`stubIntersectionObserver({ autoEmit: true })`**, `stubObserver(name, { autoEmit })`, and
  `observers.last.options`. `autoEmit` reproduces the Jest-era global mock that reported everything
  as visible synchronously from `observe()` — without it, a whole ported suite silently asserts on
  components that never loaded their data. `options` exposes the init object, so a spec can assert
  "one observer per unique root margin" instead of counting constructions.
- **`autoMocked<T>(overrides?)`** — `createAutoMock` typed as `T & Spy<T>`, for a collaborator that
  is passed as an argument rather than injected (a logger, a reporter, a telemetry client) and has to
  satisfy `T` at the call site and expose spy helpers at the assertion.
- **`setupAutoSpy({ globalFakeTimers })`** — Jest's `fakeTimers.enableGlobally`, which Vitest has no
  setting for, with both ends guarded so a spec that drives the clock itself does not hit a second
  `vi.useRealTimers()`.
- **`mockSystemTime`, `withSystemTime`, `mockNow`, `useCountingClock`** (from `/setup`). Clock
  control that survives fake timers being re-installed around every test: `vi.useFakeTimers()`
  installs a fresh `Date` each call, so a `beforeAll` patch of `Date.now` is left on an object
  nothing reads, and the naive undo re-attaches a dead clock's `now` to the live one.
  `useCountingClock` makes `Date.now()` count, which is the only way to express an expectation about
  *order* or *duration* under a frozen clock.
- **`overrideAutoSpy(Token, config?)` and `overrideComponentProvider(Component, Token, config?)`**
  (from `/angular`) — for a dependency a component declares in its own `providers`, which a
  testing-module provider cannot replace. They also remove two silent no-ops:
  `overrideProvider(X, provideAutoSpy(X))` passes a provider where `{ useValue }` is expected and is
  ignored without a warning, and `overrideProvider` never reaches a component the TestBed compiler
  was not given.
- **`assertNgModuleScopes(...modules)`** (from `/angular`) — names the module when an AOT test bundle
  has stripped `ɵɵsetNgModuleScope`, so `imports: [DirectivesModule]` contributes nothing. It
  otherwise reports as `NG0303`, `NG0301`, `NG0304` or as complete silence, none of which mentions a
  module.
- **`registerFocusMatchers()` / `expect(el).toHaveFocus()`** (from `/setup`) — distinguishes the
  three causes a focus assertion actually has: the expected element does not exist, focus is still on
  `<body>`, or focus is elsewhere. The two idioms it replaces fail with two giant DOM dumps or with
  `expected false to deeply equal true`.
- **`injectSpy` accepts an `InjectionToken`**, not only a class, and **warns when the injector hands
  back a plain instance** rather than an auto-spy — a provider the spec forgot to register is
  otherwise found when `.mockReturnValue(…)` is called on the real method, or, for a class with no
  private members to make the types disagree, never. Once per token.
- **`asInstances(...spies)`** — `asInstance` for a whole argument list. One wrapper per argument is
  not merely longer, it is *discovered* one argument at a time: TypeScript stops checking a call at
  the first argument that does not fit, so a factory taking five spies reports one `TS2345`, and the
  next only after the previous is fixed and `tsc` is run again.
- **`Spy<T, { overload: 'first' }>`, `asSpy<T, Options>`, `Overload<F, N>`.** `Parameters` and
  `ReturnType` read the **last** signature of an overloaded method — on a generated API client
  (`ng-openapi-gen`, `openapi-generator`) that is `observe: 'events'`, the one nobody calls, so
  `nextWith(body)` stops compiling and demands an `HttpEvent<T>` with nothing in the message about
  overload order.
- **`createMock` / `createAutoMock` take a deep partial.** `Partial<T>` is one level, so a fixture
  for a tree the test reads one leaf of — a config object, an account token, a route snapshot — cost
  one call per level and the ability to name each nested type. What matters is preserved: a key `T`
  does not have is rejected **at any depth**, which is the check `as T` throws away and the reason a
  renamed field goes unnoticed.
- **`returns` in the spy configuration** — `provideAutoSpy(X, { returns: { getProducts: of([]) } })`.
  Without it the value needs a second statement in every `beforeEach`, and the shortcut people take
  instead is an exported `const` provider, which under `isolate: false` is one set of spies shared by
  every file that imports it. Installed through the mock adapter, so it works on all three runners.
- **`narrow(value, guard)`, `narrow.byKey(value, key)`, `narrow.observable(value)`** — the branch of a
  union a test knows it got. The two alternatives are an assertion (a lie the compiler then stops
  checking) and a hand-written `if (…) else throw` per site; this one prints the shape the value
  actually had, which is the only thing that makes it cheaper than the assertion.
- **`withOverrides(model, overrides?)`** — a fixture from a model instance whose getters survive.
  `{ ...model, flag: true }` drops every accessor (spread copies own enumerable properties);
  `Object.assign(new Model(), fields)` keeps them live, so each runs against a half-filled instance
  and throws from inside the model. This reads them once, while the model is whole.
- **`compareTestRuns(baseline, current, root?)`** — whether a migration lost a test. Counters cannot
  answer it: a file can lose a whole suite while a flake elsewhere starts passing, and the totals
  match. The answer is the symmetric difference of two sets of `file::full name`, from the JSON
  report both runners write.
- **`createDirectiveHost({ template, scope, props })`** and
  **`registerDirectiveMatchers()` / `toHaveDirectiveApplied`** (from `/angular`) — a host for a
  directive under test that is correct for the compiler *and* for the TestBed. `imports` on a
  `@Component` is resolved by AOT and baked into `ɵcmp`; `imports` on
  `TestBed.configureTestingModule` is resolved at runtime from `ɵmod`, which a test bundle leaves
  empty — so the same line is alive in one place and dead in the other, and a `standalone: false`
  host declared in a spec is compiled outside any scope at all.
- **`setupAngularTestEnv`, `installPerTest`, `guardGlobals`** — see above.
- **Two more lint rules**: `no-mocked-for-spy` (a variable declared as Vitest's `Mocked<T>`, whose
  assignment then fails with a list of private field names) and `no-done-callback` (Vitest passes a
  `TestContext`, so `done()` throws inside a promise nobody awaits and the test **passes** having run
  almost none of its body).
- **`stubMediaElement(options?)`** — a `<video>` / `<audio>` that answers. jsdom implements the media
  elements as a shell (`play()` throws, `duration` is `NaN` behind a setter-less accessor,
  `canPlayType()` says `''` to everything, `readyState` never leaves 0, `error` is not on the
  prototype), so every player, advertising or subtitle suite writes the same forty lines of
  `Object.defineProperty` against the prototype — and leaks them into the next file. Two things the
  hand-written version gets wrong are what this is for: the state is **per element** (one closed-over
  `duration` reports the same length for the ad and for the content, which is the pair the spec exists
  to tell apart), and `set()` **fires the event** the browser would (`durationchange`, `timeupdate`,
  `ended`, `error`, `loadedmetadata`) instead of only moving the field, which leaves the component on
  its initial state while the assertion reads the new value off the element.
- **`assertMocked(namespace, options?)` and `moduleNamespace(exports, options?)`** — the two halves of
  "the module mock did nothing". `vi.mock()` is the one piece of a ported suite that fails *silently*:
  under a bundler a workspace alias or a barrel is already inlined when the mock would be installed,
  and under `isolate: false` a module already in the worker's graph keeps whichever mock got there
  first. `assertMocked` turns both into a failure at the line that assumed the mock, naming the
  specifier. `moduleNamespace` produces the `{ …exports, default, __esModule }` shape that the
  `mod.default ?? mod` interop probe of any CJS-and-ESM dependency looks for — without it the factory
  fails as `No "default" export is defined on the mock`, thrown from inside that dependency.
- **`flushEventLoopUntil(isDone, options?)`** — real event-loop turns until a condition holds, with a
  budget. The shape behind every hand-rolled "settle" helper (a `resource()` leaving `loading`, a
  chunk becoming reachable): written by hand it is a fixed turn count tuned by trial, which always
  waits the maximum and breaks again as soon as a dependency adds a hand-off. A condition that never
  holds fails naming what was waited for, instead of hanging until the runner's timeout blames the
  file.
- **`diffByField(actual, expected)`** — which field of an array of records moved, and in how many
  elements. The runner collapses objects, so nine collected events against nine expected ones report
  as `expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]` — and the
  answer is normally "one field moved in all of them", which the message cannot say. It reports
  `actual 1 everywhere, expected 2, 3, 4, …`, the signature of a frozen clock or a constant id.
- **`setupAutoSpy({ guardGlobals })`** — names the test that redefined a property of `globalThis` /
  `document` / `navigator` as **non-configurable**, which nothing can undo.
  `Object.defineProperty(document, 'cookie', { value })` defaults `configurable` to `false`; under
  per-file isolation that is harmless, and under `isolate: false` it is a mine that fails a *later*
  file, in some library, every other run. Exported as `guardGlobalPatches(reaction)` too.
- **`installPerTest(install)`** (from `/setup`) — re-installs a stub before every test of the block
  and hands back a reader for the current handle. Every stub here is restored away after each test,
  so one installed at `describe` level or in a `beforeAll` is gone from the second test on — and the
  failure is an assertion about the component, with the stub ten lines above it apparently in force.
  The same ordering bites from the other side: a setup file's root `beforeEach` runs *before* a
  file's own hooks, so a `beforeAll` in a spec loses to it silently.
- **`setupAngularTestEnv({ zoneless, initZone, initZoneless })`** (from `/angular`) — zone and
  zoneless spec files in one worker. `initTestEnvironment` may be called once per platform and, under
  `isolate: false`, the platform lives for the whole run, so a repository migrating to zoneless
  gradually fails on the second file in the other mode with `Cannot set base providers because it has
  already been called` — naming neither file. Vitest's `test.projects` does not help: nothing promises
  a worker serves files of one project. The initialisers stay the caller's.
- **A sixth lint rule, `no-shared-module-level-mock`** — an *exported* value holding `vi.fn()`s, which
  under `isolate: false` is one set of spies for the whole worker, registered against whichever file
  imported first and out of reach of every other file's `clearMocks`. The rule stops at every function
  boundary, so the factory form — the fix — is not flagged along with the problem.

### Changed

- **The `vitest-auto-spies` alias package is generated, not hand-written** (`npm run alias:sync`,
  checked by `npm run check`). Hand-writing it had let it drift to a release behind, with no
  `/bun-angular`, `/setup`, `/zone` or `/eslint-plugin`, and with a `require` condition on entries
  that are ESM-only — one that resolves to an ESM file and throws `ERR_REQUIRE_ESM` on every Node
  below 22.12. The alias now mirrors the canonical `exports` map exactly: same subpaths, CJS only
  for `/node` and `/eslint-plugin`, same peer ranges, same version. Publishing it stays a manual
  step after the canonical release — see `CONTRIBUTING.md` → Releasing.

### Fixed

- **`Spy<T>` collapsed to `never` for a method whose return type could not be read.** A generic
  method with a conditional return type — `get<K extends keyof this>(k: K): this[K] extends
  Stringified<infer R> ? R : never`, which is the shape of every typed configuration service — does
  not match `(...args: any[]) => infer ReturnType`, so the helper bundle took its false branch and
  `Method & Mock & never` annihilated the member. What the user saw was `Property 'mockReturnValue'
  does not exist on type 'never'`, with nothing anywhere naming the method or the return type. The
  fallback is now the synchronous helper bundle, and every return-type comparison is made on tuples
  (`[X] extends [Y]`) so that a return type that *does* resolve to `never` cannot distribute into one
  either.
- **`gettersToSpyOn` / `settersToSpyOn` could not name a signal-valued getter — which is most of
  them.** The element type was "keys whose value is not callable", and `Signal<T>` is
  `(() => T) & { … }`: callable. For a service whose readonly state is all signals (`get isCompactMode():
  Signal<boolean>`) the list had *no* valid member, and the failure read `Type 'string' is not
  assignable to type 'never'` — 34 of one shard's 51 type errors. Whether a member is an accessor is
  a fact about its descriptor, not about the type of the value, so any string key may now be named.
  What is checked instead, at runtime, is the case that is unambiguously a mistake: naming a
  **method**, which installs a spied accessor over it and takes the method away.
- **The `mock*Prop` helpers rejected a real value when handed the `Spy<T>` they are meant for.**
  `injectSpy` / `asSpy` is the documented way to reach a service, and on that object a signal-valued
  member is typed `Signal<T> & Mock & …` — so `mockReadonlyProp(spy, 'state', signal(x))` could not
  type-check, and the spec had to keep the instance under a second name purely to patch it. The value
  is now checked against the member's own type.

### Documentation

- `AGENTS.md` gains two sections — "Waiting: four queues, and which tool drives each" and "Doubles
  for what the code builds itself" — and thirteen new rows in the error → fix table, including the
  `Spy<T>` ↔ `T` compiler errors by code (`TS2352` → `asSpy`, `TS2739`/`TS2740`/`TS2345` →
  `asInstance`), `Mocked<T>` vs `Spy<T>`, and the generic-class `any` that surfaces as an
  `AddPromiseSpyMethods` mismatch eight levels deep.
- New guidance on patching **DOM object** properties with `mockValueProp` (the three ways the
  hand-written `Object.defineProperty` goes wrong, including the accessor-on-the-prototype case),
  on shared fixtures having to be **factories** under `isolate: false`, on Vitest's `afterEach`
  ordering differing from Jest's, and on installing observer stubs in `beforeEach` rather than
  `beforeAll`.
- The migration guide now states plainly which `jest.*` calls have **no** Vitest equivalent
  (`jest.requireMock`, `jest.replaceProperty`, `fakeTimers.enableGlobally`, `jest.spyOn(global,
  'Date')`, a `jest.fn()` used with `new`) and that `vi.mock()` of a bundled barrel is a silent
  no-op.
- New pages: "Constructor doubles", "Waiting and the clock", "Media element stub" and "Module
  mocks"; the "Patterns that hold up" page gains "An array assertion that says nothing".

### Added — `vitest-auto-spy/zone`

- **`fakeAsync` and `waitForAsync` work on Vitest.** `zone.js/testing` patches jasmine, mocha and
  jest; Vitest is not among them, so in an Angular project on Vitest *every* `fakeAsync` fails with
  `Expected to be running in 'ProxyZone', but it was not found`. One package does something about it
  today (`@analogjs/vitest-angular`), which a project moving to the native `@angular/build:unit-test`
  builder loses along with Analog. Importing `vitest-auto-spy/zone` runs every test and hook body
  inside a forked proxy zone. It needs `test: { globals: true }` — the patch replaces the runner
  globals, and an imported `it` is a module binding nothing can reach.
- **zone.js is a `devDependency` of this package and nothing else** — not a dependency, not an
  optional peer. The entry imports none of it (it reads `globalThis.Zone`, which the consumer has
  loaded, and says so plainly when it has not), no other entry reaches the module even transitively,
  and `dist/zone.js` is self-contained. A zoneless project gets no zone code and no zone install.
  This is recorded as an invariant in `AGENTS.md`, because a convenient re-export from the root would
  quietly break every zoneless consumer.
- Three details are what make the patch not break the runner, and each was a failure in *other
  people's files* when it was written by hand: the wrapper declares **no parameters** (Vitest reads
  `fn.toString()` to find fixtures), it carries the original `length` and `toString`, and `it` is
  **proxied** rather than replaced, so `it.each(table)(…)` keeps the receiver its implementation
  reads.

## [3.0.0] - 2026-08-26

### BREAKING CHANGES

- **The `vitest` peer range is now `>=2.1.0`** (was `>=1.0.0`). The typed
  `spy.method.mock.settledResults` surface comes from Vitest's own `Mock` type, and `@vitest/spy`
  only grew `settledResults` in 2.0 — on Vitest 1 that documented surface never type-checked, so the
  old range claimed a version the types could not serve. 2.1 rather than 2.0 because the 2.x line
  effectively *is* 2.1 (2.0.x is ~0.3% of Vitest installs against 2.1.x's ~10%). Nothing in the
  shipped code changes: there are no version branches to delete, so `dist/` size, runtime and memory
  are untouched — this is the supported range catching up with what the types actually require.
  Vitest 1 users: upgrade Vitest, or stay on `vitest-auto-spy@2.0.x`.

## [2.0.3] - 2026-08-26

### Changed

- **A spy no longer allocates its `calledWith` machinery until something configures it.** Every
  function spy used to be born with two `calledWith` chains — an object plus an argument map each —
  and the overwhelming majority of spies never configure either. They are now built on first use, so
  a materialised spy sheds ~560 B: 2000 spies over a 40-method class drop from 417.3 MB to 372.7 MB
  of heap, about 11%. Nothing changes when a spec does use `calledWith`; the chain is then built
  exactly as before. `resetAutoSpy()` now drops the chains instead of replacing them with empty maps,
  so a reset spy is back to a fresh spy's footprint. On the dispatch path the same change removed a
  `{ found, value }` object that was allocated on every call of a configured spy purely to carry a
  boolean — an object argument matches in 2.64 µs instead of 2.82 µs.

### Fixed

- **`require('vitest-auto-spy/node')` was handed ESM type declarations.** The two subpaths that ship
  CommonJS listed a single `types` key for both conditions, pointing at the `.d.ts`. In a
  `"type": "module"` package that makes TypeScript's `node16` resolution read an ESM declaration file
  for a CommonJS import and report the types as masquerading — while the emitted `.d.cts` files were
  published and referenced by nothing. Both subpaths now carry per-condition `types`.

## [2.0.2] - 2026-08-26

### Fixed

- **The release workflow tagged a version it never published.** `npm version` was called inside a
  command substitution to read the new number back, but this package defines a `version` lifecycle
  script, so npm printed that script's banner (`> vitest-auto-spy@x.y.z version`) before the tag
  name. The multi-line `key=value` that produced was rejected by `$GITHUB_OUTPUT` with
  `Invalid format '> version'` — and the step failed *after* `git push --follow-tags` had already
  run. v1.13.0, v2.0.0 and v2.0.1 were therefore tagged on GitHub while the publish and release steps
  never ran, leaving npm on 1.12.0. The version is now read back from `package.json`, the way the
  publish step already did.

## [2.0.1] - 2026-08-26

### Changed

- **The published package is roughly half the size** — `dist/` 625 kB → 241 kB, tarball 187 kB →
  108 kB, 74 files → 54. CommonJS now ships only for `vitest-auto-spy/node` and
  `vitest-auto-spy/eslint-plugin`; every other subpath is ESM-only. Nothing that worked stopped
  working, because the removed output could not be loaded in the first place: Vitest refuses to be
  required (`Vitest cannot be imported in a CommonJS module using require()`), so eight of the twelve
  `.cjs` files threw on their own first line. The four that did load were not usable together
  either — esbuild cannot code-split CommonJS, so each `.cjs` carried a private copy of the
  `MockAdapter` / `ObservableSupport` registries and `require('vitest-auto-spy/rxjs')` alongside
  `require('vitest-auto-spy/node')` still failed with "Observable spies require rxjs". The two
  survivors are the two that are self-contained and genuinely reachable: a `node --test` suite
  written in CJS, and a CommonJS `eslint.config.cjs`. Separately, `bun-angular` moved into the same
  ESM pass as every other entry, so it shares the emitted chunks instead of inlining its own copy of
  the core (45 kB → 8 kB of JS, 43 kB → 7 kB of types). Subpaths that lost their `require` condition
  resolve through `default`, so a bundler asking for `require` still finds the ESM file rather than
  failing resolution.

### Fixed

- **`vitest.shared-env.config.mts` carried configuration Vitest 4 ignores.** It set
  `poolOptions: { threads: { singleThread: true } }`; `test.poolOptions` was removed in Vitest 4,
  which logged `was removed in Vitest 4` on every run and dropped it. The top-level
  `fileParallelism: false` already forces `maxWorkers` to 1, so the shared-environment run was
  correct — it just also printed a deprecation on every invocation.

- **The benchmark compared the lazy spy path against itself.** `bench/auto-spy.bench.ts` wrote its
  "eager" case as `createSpyFromClass(WideService)` with no configuration, and `lazySpies` defaults
  to `true` — so both branches were lazy and the reported "1.79x faster than lazy" was noise
  (±84% rme) guarding nothing. It now passes `lazySpies` explicitly on both sides and sweeps class
  width against how many methods a test actually calls, which is the trade the default is making.
  Measured that way, lazy wins from 1.8× (10 methods, 2 called) to 7× (40 methods, 3 called) and
  gives back ~10% only when a single test calls every method.

## [2.0.0] - 2026-08-26

### BREAKING CHANGES

- **`methodsToSpyOn` now adds instead of restricting**, which is what `jest-auto-spies` always did
  and what this library documented itself as being compatible with. Up to v1 an explicit list
  replaced prototype discovery, so a spec that named two methods silently lost every other one. The
  failure surfaced far from the cause — `TypeError: this.flags.readJsonFlag is not a function` inside
  a component constructor, with no line of the stack pointing at the spy configuration in the spec.
  In one migrated codebase a single component went from 147 failing tests out of 147 to 4 once the
  option was reinterpreted; across two independent projects the same option had been worked around
  739 and 572 times respectively.

  The exhaustive whitelist is still available, under a name that says what it does:

  ```diff
  - createSpyFromClass(ApiService, { methodsToSpyOn: ['get', 'post'] });   // v1: only these two
  + createSpyFromClass(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }); // v2: only these two
  ```

  **What to do.** If you migrated from `jest-auto-spies` and never thought about this option, do
  nothing — your specs now behave the way they did under Jest. If you relied on the restriction,
  rename the key to `onlyMethodsToSpyOn`; the array shorthand
  (`createSpyFromClass(Service, ['a', 'b'])`) is additive too and becomes
  `{ onlyMethodsToSpyOn: ['a', 'b'] }`. A grep for `methodsToSpyOn` finds every site, and leaving
  one un-renamed spies on more than before rather than less — noisier, never broken.

  `instanceMethodsToSpyOn` is unchanged and now behaves identically to `methodsToSpyOn`; the two
  differ only in what their names tell a reader. Prefer it in new code.

- **Lazy method spies are now the default for every factory**, not just for `provideAutoSpy`. A
  method becomes a spy on first access instead of all of them being built up front. On a forty-method
  class where a test touches two, holding two thousand spies costs **27 ms and 35 MB** instead of
  **257 ms and 425 MB** — nine times the speed, a twelfth of the memory. The reverse case, a test
  that calls every method, pays 5% in time and 1% in memory for the accessor indirection, and that
  asymmetry is why it is a default rather than a choice.

  Enumeration is unaffected — the placeholders are enumerable accessors, so `Object.keys`, spread and
  snapshots see the same keys, and `vi.isMockFunction`, `calledWith`, `resetAutoSpy` / `clearAutoSpy`
  all behave as before. What changes is the property *descriptor* of an untouched method: a getter
  rather than a value. A spec asserting on `Object.getOwnPropertyDescriptor(...).value` before
  touching the method needs `{ lazySpies: false }`.

  `provideAutoSpy` no longer forces the flag on, since the core does it — the Angular entry lost a
  wrapper function and the two paths are now the same speed.

- **The unknown-method warning moved to `onlyMethodsToSpyOn`.** An additive list naming something the
  prototype does not have is the documented way to reach an instance-assigned callable, so warning
  about it would fire on correct code. Under a restricting list the same typo is destructive — it
  leaves the real method unspied — so that is where the warning belongs.

## [1.13.0] - 2026-08-26

### Added

- **`setupAutoSpy({ strayTimers: true })`** _(`/setup`)_ — cancel timeouts, intervals and animation
  frames that outlive the file that scheduled them. Under `isolate: false` a `setTimeout` a component
  never clears fires while a **later** file is mid-test, so the runner blames innocent code; the
  zoneless half is worse, because Angular's scheduler races a timeout against a frame callback and
  what surfaces is `Schedulers cannot synchronously execute watches while scheduling` or `signal read
  during notification phase`, again against the wrong file. The option wraps the four schedulers once
  per worker and sweeps in `afterAll`. `trackStrayTimers()` (idempotent, returns the undo),
  `cancelStrayTimers()` (returns how many it cancelled) and `countStrayTimers()` are exported for a
  suite that would rather fail on a leak than tidy it away; each takes an optional host, so a test can
  contain a stand-in instead of the real globals.
- **`runEffect(effectRef)`** _(`/angular`, `/bun-angular`)_ — run one `effect()` body on demand, with
  the signal values as they stand and without marking the effect clean. The alternative a project
  reaches for is replacing `effect()` via `vi.mock('@angular/core')`, which cannot work under the
  Angular unit-test builder: specs are bundled, `@angular/core` lands in a shared chunk, and
  substituting it re-enters that chunk mid-initialisation (`Cannot access '__vi_import_N__' before
  initialization`). Complements `flushEffects()`, which runs everything currently dirty — `runEffect`
  is for the effect whose trigger a spec replaced with a static signal, so it never becomes dirty. It
  reads Angular's reactive node, so it throws with "assert the result instead" if a future version
  moves the effect body.

- **Documentation written for AI agents**, because most tests are now written with one in the loop and
  a library an agent has to infer costs tokens on every task and produces the same mistakes each time:
  - **`AGENTS.md`, shipped inside the npm tarball** — readable at
    `node_modules/vitest-auto-spy/AGENTS.md` with no network, in the version actually installed. It is
    the compressed form of the docs, not a second copy of the README: entry-point table, the
    factory decision tree, the helper-per-return-type table, the configuration semantics (that
    `methodsToSpyOn` restricts while `instanceMethodsToSpyOn` adds), an **error→fix table**, and a
    do-not-write-this list covering the mistakes agents actually make — `let s: T = createSpyFromClass(T)`,
    `expect()` inside `subscribe()`, `Object.defineProperty` in a spec, `toBeTruthy()` on a signal.
  - **`llms.txt` and `llms-full.txt`** on the docs site
    ([`/llms.txt`](https://asdalexey.github.io/vitest-auto-spy/llms.txt),
    [`/llms-full.txt`](https://asdalexey.github.io/vitest-auto-spy/llms-full.txt)) — the
    [llmstxt.org](https://llmstxt.org) convention a crawler looks for at a docs root, so an agent
    fetches one page instead of scraping ten. Generated from the VitePress sidebar by
    `scripts/generate-llms-txt.mjs`, so a page missing from the sidebar is a **build error** rather
    than a silent omission, and checked in CI so the committed pair cannot go stale.
  - **A Claude Code skill and plugin** — `skills/vitest-auto-spy/SKILL.md` ships in the tarball, and
    the repository doubles as a plugin marketplace (`/plugin marketplace add ASDAlexey/vitest-auto-spy`).
    The manifests are version-synced to `package.json` by the `version` lifecycle script, so a bump
    cannot leave the skill advertising a release it does not describe.
  - **A "For AI agents" docs page** and a README section covering all of the above.
- **A "Spec patterns" page** _(docs site)_ — what a large Angular 22 zoneless suite (~370 spec files,
  on this library since early versions) actually converged on, with the frequencies, because the
  distribution is nothing like the API reference implies: `provideAutoSpy` in 371 files, `injectSpy`
  in 308, `mockReadonlyProp` in 127, `instanceMethodsToSpyOn` in 103, `observablePropsToSpyOn` in 79
  — and bare `createSpyFromClass` in only 41. It documents the canonical service spec, which signal
  helper to use for a dependency versus the class under test, the property-vs-method distinction for
  observables, and four traps that only appear at scale: reaching a **component-level** provider that
  `injectSpy` cannot see, why `vi.mock('@angular/core')` cannot work under the Angular unit-test
  builder, what an ngrx `rxMethod` needs beyond a bare mock, and timers that outlive their file under
  `isolate: false` and are then reported against an innocent one.
- **`@example` blocks on 38 public exports**, so the surface an agent reads most — `dist/*.d.ts`, on
  hover or on disk — teaches the call rather than only naming it.
- **`AGENTS.md` and the skill were reordered around that same measurement.** They led with
  `createSpyFromClass`, which is the least-used entry point in an Angular app; they now lead with the
  DI shape, promote `instanceMethodsToSpyOn` from a footnote to a top-5 option, and carry six more
  error→fix rows for the failures above — including the two that are reported against the wrong file
  (`Schedulers cannot synchronously execute watches while scheduling`, `signal read during
  notification phase`).

- **Observer stubs** _(core)_ — `stubIntersectionObserver()`, `stubResizeObserver()`,
  `stubMutationObserver()` and the generic `stubObserver(name)`, plus `intersectionEntry()` for the
  entry itself. A component constructs its observer internally and keeps it private, so the only
  handle a spec has is the global constructor; the version projects hand-roll goes wrong in two ways
  that this one does not. The stub is installed through `mockValueProp`, so `restoreMockedProps()`
  takes it off — a directly assigned `globalThis.IntersectionObserver` is inherited by the next file
  under `isolate: false` and fails it on something unrelated. And the instances live on the returned
  handle rather than a `static last`, which is shared mutable state that outlives the spec just like
  the stub does. `emit()` takes a batch, because a fast scroll delivers several entries in one call
  and code assuming one entry per call is a real bug worth reaching. Asking for `last` before the
  code under test constructed anything throws and says which of the two mistakes it is.
- **`mockSignalProp(object, prop, initial)`** _(`/angular`)_ — replace a signal-valued property with
  a real `WritableSignal` and get the handle back. Prototype discovery cannot see a `signal()` field
  (it is assigned on the instance) and `methodsToSpyOn` turns it into a function spy that answers
  `undefined`, so suites write the `signal()` + `mockReadonlyProp` pair by hand — measured at 46
  occurrences across three projects. The signal is Angular's own, so a `computed()` downstream
  recomputes and an `effect()` runs; a stand-in with a `set` method would satisfy `service.count()`
  and notify nothing, which is the failure the helper exists to prevent rather than cause.
- **`setupAutoSpy({ blockNetwork: true })`** _(`/setup`)_ — reject every `fetch`, naming what was
  requested. jsdom ships no `fetch`, so a component reaching for a remote asset is inert under it;
  happy-dom implements it and the same component issues real requests. Nothing asserts on them, so
  every test passes — and the runner aborts what is still in flight at teardown, those aborts arrive
  as unhandled rejections, and a run with 2257 green tests exits 1 with no test named. `blockNetwork()`
  is exported for suites that want it somewhere narrower.
- **`restoreTimerGlobals()` / `getWatchedTimerGlobals()`** _(`/setup`)_, wired into `setupAutoSpy()`
  by default and into `setupFakeTimers()` unconditionally.

### Changed

- **Every error and warning now ends with `Docs: <url>`** — a stack trace is read far more often than
  a README, by a person at 2am and by an agent on every failed run, and a message that names its own
  fix is the difference between repairing the test and guessing at it. Covers the missing mock
  adapter, the missing rxjs layer, a method not found on the prototype, `advanceTimers()` without
  fake timers, a `bun-angular` preload with no DOM package, an unresolvable `templateUrl`, a
  `mustBeCalledWith` violation and the duplicate-install report. The unknown-method warning also now
  points at `instanceMethodsToSpyOn`, which is what it usually means. Costs ~0.4 kB minzipped on a
  dev-only dependency.

- **A "How it works" page** _(docs site)_ — the two ideas the library rests on, spelled out for
  someone deciding whether to trust it with their suite. The runtime half: the prototype-chain walk
  that discovers method names, why it stops before `Object.prototype`, why names come from property
  descriptors rather than from reading them (a getter would execute), and why the class is never
  constructed — which is what makes a service with five constructor dependencies mockable without
  mocking any of them. The type half: the conditional type that reads a method's return type to
  decide whether it gets `resolveWith`, `nextWith` or `mockReturnValue`. It also names the single
  `as` in the core and explains why it cannot be removed. Sits in Core between `Installation` and
  `createSpyFromClass`; the README's short "How it works (and what it won't spy)" links to it.

### Fixed

- **`calledWith` no longer depends on the order an object literal was written in.** Argument matching
  builds a serialized key, and object keys went into it in insertion order — so
  `calledWith({ id: 1, name: 'a' })` did not match a call made with `{ name: 'a', id: 1 }`. The spy
  answered `undefined` and nothing in the failure pointed at the cause. Keys are now sorted at every
  depth, which also makes `mustBeCalledWith` mismatch messages stable rather than dependent on
  construction order. Array order is untouched — there the order is the value.

- **`setupFakeTimers()` no longer breaks a later file.** Two bugs in one helper. Its hooks were
  unguarded, so a suite that drives the clock itself — or a nested `describe` calling the helper
  again — reached a second `vi.useRealTimers()`, which leaves the environment without `clearInterval`
  and explodes during teardown of whichever file runs next. And uninstalling does not restore a
  global that was not an own property of the global object: under happy-dom `Date` is inherited from
  the realm, so `vi.useRealTimers()` **deletes** it, and with `isolate: false` the next file dies
  inside Vitest's own `useFakeTimers` with `Cannot read properties of undefined (reading 'now')`,
  naming a file that never touched a timer. Both hooks are now guarded, and the real globals —
  captured at import time, before any spec can fake them — are put back after each test. Only what
  went missing is restored, so a replacement a spec installed on purpose is left alone.

## [1.12.0] - 2026-08-26

### Added

- **`vitest-auto-spy/bun-angular`** _(new entry)_ — Angular's `TestBed` under `bun test`. Angular has
  no Bun integration of its own: Bun ships no DOM, and `@Component({ templateUrl: './x.html' })` is
  not an import, so the JIT compiler refuses to build the component ("Component X is not resolved").
  One preload closes both — it installs a DOM (`@happy-dom/global-registrator`, else `jsdom`, and
  nothing if one is already present), registers a `Bun.plugin` `onLoad` hook that inlines
  `templateUrl` / `styleUrl` / `styleUrls`, initialises a **zoneless** `TestBed` environment that
  resets after each test, and registers the Bun mock adapter:

  ```toml
  # bunfig.toml
  [test]
  preload = ["vitest-auto-spy/bun-angular"]
  ```

  `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable` / `flushEffects`
  and the whole core behave exactly as on Vitest. `registerSignalMatchers` and the TestBed
  diagnostics family stay Vitest-only — they need the runner's `expect.extend` and suite-level hooks.
  The entry is ESM-only (it awaits its DOM registrar at the top level, which has no CommonJS form);
  Bun runs ESM natively, so nothing is lost. The building blocks — `registerDomGlobals`,
  `createJsdomRegistrar`, `createGlobalRegistratorRegistrar`, `copyWindowGlobals`,
  `inlineAngularResources` — are exported for a project that would rather compose its own preload.

- **A real Bun test suite** — `src/bun-tests/` runs the published API on the actual `bun:test`
  (core, rxjs layer, DOM registrars and Angular `TestBed`), where the Vitest suite could only drive
  the Bun adapter against a stub. CI gained a **Bun 1.4** job that runs it three ways — unflagged
  (one shared global), `--isolate` (Bun 1.4's fresh-global-per-file mode) and against the **built**
  `bun-angular` bundle used as a preload — on both `1.4.0` and `latest`.

- **`createMock<T>(partial?)`** _(core)_ — a plain, spy-free `T` built from the fields a test seeds,
  for the doubles the code under test only **reads**: DTOs, route snapshots, config objects. The
  counterpart to `createAutoMock`, which stays the answer for a collaborator you call and assert on
  (where an un-seeded property read returning a spy is the point, not a hazard). It is also the one
  place the `as` lives, so a suite under a `no-type-assertion` lint rule stops sprinkling
  `eslint-disable` over its fixtures; `Partial<T>` keeps the seeded fields type-checked.
- **`setupFakeTimers(config?)` / `advanceTimers(ms?)`** _(`/setup`)_ — the fake-timer boilerplate, and
  the bug inside it. `setupFakeTimers` pairs `vi.useFakeTimers()` with the `afterEach` restore a
  suite forgets — a clock left installed leaks into every later file in the same worker, surfacing as
  an unrelated test hanging on a `setTimeout` that never fires; `config` is forwarded verbatim to
  `vi.useFakeTimers()`. `advanceTimers` advances the clock **and** awaits the microtasks the timer
  callbacks queued (a resolved promise, an `await` continuation, an RxJS `delay()` handing control
  back), which a bare `vi.advanceTimersByTime()` leaves pending — the assertion then reads state from
  before the callback finished and fails like a race in the code under test. On real timers it throws
  a message naming the fix instead of failing deeper in with "timers are not mocked".

### Changed

- **The documentation site was rewritten end to end** — every `<!-- TODO: expand -->` stub is gone.
  The landing page leads with the four runtimes and Angular-on-Bun; `Installation` gained per-runner
  wiring (Vitest setup file, `bunfig.toml` preload, `node --test`) and a TypeScript section;
  `node:test` gained a runnable example and a table of where its native mock surface differs (most
  usefully: `spy.method.mockReturnValue` does **not** exist there, while
  `calledWith(...).mockReturnValue(...)` works everywhere); `createSpyFromClass` documents the
  `Spy<T>` shape, `accessorSpies`, `instanceMethodsToSpyOn` and the edge cases (inherited methods,
  abstract classes, constructors never running); the RxJS page documents marble-equivalent sequences
  and delay/timing semantics; and the React / Vue / Svelte / NestJS recipes and the migration guide
  are full walkthroughs rather than sketches. `comparison.md` gained a feature-by-feature matrix, a
  "where another library is the better answer" section, and dependency counts checked against npm.
  Every page now carries `title` / `description` frontmatter, so canonical links and OpenGraph tags
  are no longer empty.

### Fixed

- **`mockDeep` was unusable on `bun:test`** — every node handed its spy methods back with `this`
  still pointing at the Proxy, and Bun's `mock()` asserts `this instanceof Mock` inside
  `mockReturnValue` and friends, so `mock.a.b.mockReturnValue(1)` threw
  `Expected this to be instanceof Mock`. Methods are now bound to the underlying spy. Vitest was
  unaffected, which is why only a run on the real runtime could surface it.

## [1.11.0] - 2026-08-26

### Added

- **`renderShallow(Component, options?)`** _(`/angular`)_ — the `TestBed` sequence a component-heavy
  suite copy-pastes (`configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` with emptied
  `imports`, a blank template and no styles), as one call that returns a real `ComponentFixture`.
  Options: `providers` (incl. `EnvironmentProviders`), `imports`, `inputs` (signal inputs take the
  value), `keepTemplate`, `keepChildren`, `template`, `beforeCreate`, `detectChanges`.
  Measured on a private Angular 22 zoneless suite: converting three of its most expensive component specs took them from
  291 ms to 174 ms (1.7× overall; 2.1× and 1.8× on the two with a real child tree, 0.8× — slower —
  on a leaf component, where the per-test `overrideComponent` costs more than the subtree it removes).
- **`createWithAutoSpies(Class, options?)`** _(`/angular`)_ — build a service, store or pipe through
  real Angular DI with every unprovided token answered by a spy instead of a `NullInjectorError`.
  Constructor parameters and `inject()` fields both resolve; explicit `providers` win;
  `spies.get(token)` reads back what the instance actually used.
- **`stable(fixture)` / `flushEffects()`** _(`/angular`)_ — zoneless waiting. `detectChanges()` runs
  one pass and never flushes effects, so an assertion after it reads state that has not finished
  computing. `flushEffects` prefers `TestBed.tick()` (Angular ≥ 20) and falls back to
  `ApplicationRef.tick()`.
- **`expectEmission` / `expectEmissions` / `expectNoEmission`** — assert an Observable without a
  `subscribe` callback that may never run. The source is duck-typed, so these live in the core entry
  and pull in no rxjs, and the watchdog uses the timer functions captured at import time, so
  `vi.useFakeTimers()` cannot silence it.
- **`setupAutoSpy(options?)`** _(new `vitest-auto-spy/setup` entry)_ — one call for a project's test-run
  hygiene: `restoreMockedProps()` in a global `afterEach`, detection of a second copy of the library
  in the process (a duplicate install, or one install loaded as both ESM and CJS) with a report that
  says what to do, and opt-in `vi.restoreAllMocks()` for runs with `isolate: false`.
- **`enableTestBedDiagnostics(options?)`** _(`/angular`)_ — one line per spec file saying how much of
  its wall clock went into `TestBed` versus plain logic, and how many components it created. Also
  `instrumentTestBed`, `disableTestBedDiagnostics`, `getTestBedTiming`, `formatSpecTiming`,
  `reportSpecTiming`.
- **`vitest-auto-spy/eslint-plugin`** (new entry) — five flat-config rules that steer a suite onto
  these helpers: `prefer-provide-auto-spy`, `prefer-create-spy-from-class`, `prefer-inject-spy`,
  `no-object-define-property`, `no-expect-in-subscribe`. Every message links to the matching README
  recipe.
- **`registerSignalMatchers()`** _(`/angular`)_ — adds `expect(sig).toHaveSignalValue(value)`, which
  reads the signal and refuses anything that is not a zero-argument getter (unlike
  `expect(sig).toBeTruthy()`, which passes for every signal ever created).
- **`asInstance(spy)` / `asSpy(instance)`** — the two named views between `Spy<T>` and `T`, replacing
  the `as any` a mapped type forces at those boundaries. **`createSpyClass(Class, config?)`** — a spy
  that can be called with `new` (a `vi.fn()` refuses once it carries a `mockReturnValue`), recording
  `calls` and `instances`.
- **`countMockedProps()`** — how many `mock*Prop` patches are still applied.
- The property helpers (`mockReadonlyProp`, `mockReadonlyPropGetter`, `mockValueProp`,
  `mockAccessorsProp`, `restoreMockedProps`) are now exported from the **core** entry too. Nothing
  about them is Angular-specific; `vitest-auto-spy/angular` keeps exporting them unchanged.
- README gained a **"How to mock"** section: one recipe per thing a spec stands in for — a service
  behind DI, a service without DI, reading a spy back from DI, a whole class's dependencies, a
  readonly property or signal, an Observable, a component's children, a `new`-ed class, a pipe.
- The documentation site gained pages for everything above: **Observable assertions** and
  **Bridging `Spy<T>` and `T`** under Core, **Test-run hygiene** and **ESLint plugin** under
  Utilities, and an Angular page that now covers `renderShallow` (with the measured numbers),
  `createWithAutoSpies`, zoneless waiting, the signal matcher and the `TestBed` diagnostics.

### Fixed

- **`TestBed` diagnostics measured on a fake clock.** `vi.useFakeTimers()` replaces
  `performance.now`, so an instrumented spec reported "0 ms for 155 components". The clock is now
  captured at import time.
- **The diagnostics report was swallowed by the library's own console spies.** It went through
  `console.info`, which `vitest-auto-spy/console` replaces with a silent mock; it now writes to
  `process.stdout` and falls back to the console only where there is none.
- **Two specs could only pass with per-file isolation.** `core-standalone.spec.ts` and
  `mock-adapter.spec.ts` exercise an *empty* IoC registry, and relied on their file being the first
  to touch a process-wide one — so they failed under `isolate: false`, and `mock-adapter.spec.ts`
  additionally left a fake adapter installed for whatever ran next. Both now empty and restore the
  registry themselves (via internal `resetMockAdapter()` / `resetObservableSupport()`), and
  `npm run test:shared-env` runs the whole suite with `isolate: false` in a single worker — in CI
  too, so the mode `setupAutoSpy()` exists for stays proven rather than asserted.
- `src/lib/observable-spy.ts` was committed unformatted. Nothing caught it: CI ran type-check,
  coverage and build only, so `npm run lint` and `npm run format:check` never ran there. Both are
  now CI steps, alongside the shared-environment run.
- **`renderShallow` rejected `EnvironmentProviders`** — the shape every Angular `provide*()` helper
  returns (`provideHttpClient()`, `provideRouter()`, …). `TestBed` accepts them; the option type
  now does too.

## [1.10.0] - 2026-08-18

### Added

- **`instanceMethodsToSpyOn`** — spy callables that live on the *instance* instead of the prototype:
  arrow-function properties, Angular `signal()` / `computed()` fields, ngrx `signalStore()` methods.
  Prototype discovery cannot see them, and naming them in `methodsToSpyOn` was the wrong tool — that
  option *restricts* what is spied and reports the name as a probable typo. Names listed here are
  **added** on top of whatever the method resolution produced, and never warn.
- **`mockValueProp(obj, prop, value)`** — the writable counterpart of `mockReadonlyProp`, for members
  the code under test assigns to (and for stubbing a method on a real, non-spy instance).
- **`restoreMockedProps()`** — undoes every patch the `mock*Prop` helpers applied, newest first,
  restoring the original descriptor (or deleting the property when there was none). Needed whenever
  the patched object outlives the spec file — a global, a class prototype, a singleton — which is
  always the case under Vitest's `isolate: false`.
- The `mock*Prop` helpers now also accept a `PropertyKey` overload, so members the public type does
  not describe (`#private` fields, ad-hoc keys) no longer need an `as never` cast at the call site.
- Every `mock*Prop` helper **returns its own undo** (`RestoreProp`), for a stub that has to come off
  inside a single test rather than at the end of the file; calling it twice is a no-op.
- `mockAccessorsProp(obj, prop, { get, set })` takes real implementations behind the spied
  accessors — what a DOM property backed by an attribute (`input.valueAsNumber`, …) needs.

### Fixed

- **Lazy method spies are assignable again.** `provideAutoSpy` builds spies lazily, and the
  placeholder was a getter-only property, so the common `spy.method = vi.fn()` threw
  `TypeError: Cannot set property … which has only a getter` under ES-module strict mode. The
  placeholder now carries a setter that materializes the assigned value.

## [1.9.3] - 2026-08-01

### Changed

- **Published bundles are no longer minified.** `tsup` ran with `minify: true`, so every file in
  `dist/` shipped as a single unreadable line — which supply-chain scanners flag as unauditable
  code (Socket raised a `Minified code` alert on 1.9.2). The published output is now plain,
  readable JavaScript: the tarball grows from ~30 kB to ~47 kB and the unpacked size from ~190 kB
  to ~325 kB, which costs nothing at runtime — this is a dev-only dependency that never reaches a
  production bundle. No API or behaviour change.

## [1.9.2] - 2026-07-18

### Docs

- Redesigned the README hero (`assets/one-api-three-runtimes.svg`): the `Spy<UserService>` card now
  shows real typed methods mapped to their `resolveWith` / `nextWith` / `calledWith` helpers, the
  `createSpyFromClass(UserService)` call sits on a single line, and the runtime chips carry the
  Vitest / Bun / node:test brand marks and colors. Fixed a dark-mode grey halo (removed the blurred
  glow and the light drop-shadow), a badge that overflowed the card, and raw `<>` in `aria-label`
  that broke SVG parsing.
- Expanded the intro copy and search metadata for discoverability: the README and docs now name the
  full helper set (`resolveWith` / `rejectWith`, `nextWith` / `throwWith`, `calledWith` /
  `mustBeCalledWith`) plus `createAutoMock<T>()` and `mockDeep<T>()`, and added matching `package.json`
  keywords and docs-site meta keywords.

## [1.9.1] - 2026-07-18

### Docs

- Recolored the npm version and downloads badges from npm red to `brightgreen`, matching the
  coverage / Vitest / Bun / runtime-deps badges for a consistent badge row.

## [1.9.0] - 2026-07-18

### Added

- **`mockDeep<T>()` — recursive, class-free auto-mock.** The deep counterpart of `createAutoMock`:
  nested access auto-creates chainable spies, so `mock.repo.user.find()` works with no manual
  seeding — every hop is itself a callable spy carrying the full `calledWith` / `resolveWith` /
  `nextWith` surface. Seed concrete values via `overrides` or assignment.
- **`mock.settledResults` across every runtime.** Vitest tracks each mock call's eventual promise
  outcome natively; a built-in polyfill now provides the same `{ type, value }` array on Bun
  (`bun:test`) and `node:test`, so `spy.method.mock.settledResults` reads identically on all three.
- **Asymmetric matchers in `calledWith` / `mustBeCalledWith`.** A config may now include
  `expect.any(...)`, `expect.objectContaining({...})`, `expect.stringMatching(...)`, …; a config
  that contains a matcher is stored as a predicate and evaluated against the actual args on lookup.
- **`resetAutoSpy(spy)` / `clearAutoSpy(spy)`.** Reset every spy inside an assembled auto-spy in one
  call — `clearAutoSpy` drops recorded calls only, `resetAutoSpy` also reverts all configuration.
  Works on both `createSpyFromClass` spies and `createAutoMock` proxies, covering method and
  accessor spies alike (found by brand, never by triggering live accessors).
- **`lazySpies` / `autoSpyAccessors` config and friendlier diagnostics.** `lazySpies` materializes
  each method spy on first access (cheaper for wide classes); `autoSpyAccessors` auto-discovers
  every getter/setter on the prototype chain; `createSpyFromClass` now warns (without throwing) when
  a requested method name is absent from the class prototype.

### Changed

- **Performance — Angular spies are lazy by default.** `provideAutoSpy` now defaults to
  `lazySpies: true`: on a wide service where a test calls only a couple of methods, spy assembly is
  roughly **4× faster** (≈8× on a 20-method service). Behaviour is unchanged; pass
  `{ lazySpies: false }` to build every spy eagerly.
- **Performance — deferred observable subjects.** Observable spies no longer allocate their backing
  `ReplaySubject` until an observable helper is first used, so a sync/promise method spy created
  with the rxjs layer loaded skips that allocation.

### Fixed

- **`resetAutoSpy` reverts a bare `mockReturnValue`.** A return value set directly on a spy
  (`spy.method.mockReturnValue(x)`), not just library `calledWith` config, is now reverted on reset
  — via a new `MockAdapter` primitive that re-installs the library dispatch across Vitest, Bun and
  `node:test` (a plain `mockClear` could not, and a full `mockReset` would wipe the dispatch itself).

### Docs

- New **VitePress documentation site** deployed to GitHub Pages (with sitemap, canonical / Open Graph
  tags and JSON-LD for SEO), plus reference pages for `mockDeep`, `settledResults`, asymmetric
  matchers, `lazySpies` and the reset helpers. README updated to match.

## [1.8.2] - 2026-07-17

> README-only release — no code or API changes (a `fix:`-typed README commit cut a patch).

## [1.8.1] - 2026-07-17

> README-only release — no code or API changes (a `fix:`-typed README commit cut a patch).

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

[Unreleased]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.8.0...HEAD
[3.8.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.7.0...v3.8.0
[3.7.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.3...v3.0.0
[2.0.3]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.13.0...v2.0.0
[1.13.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.3...v1.10.0
[1.9.3]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.2...v1.9.3
[1.9.2]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.2...v1.9.0
[1.8.2]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.0...v1.8.1
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
