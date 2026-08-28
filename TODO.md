# TODO — refactoring & analysis

Audit of `vitest-auto-spy` (v1.3.0). The core is already cleanly layered (IoC
`MockAdapter` / `ObservableSupport` registries, one factory reused by the
class-based and type-based paths). Items below are ordered by value. Status
markers: `[x]` done in this pass, `[ ]` backlog, `[~]` considered & intentionally
skipped.

## Correctness / quality gate

- [x] **Restore 100% coverage** — `auto-mock.ts` Proxy traps `has` / `ownKeys` /
      `getOwnPropertyDescriptor` (lines 71–83) had no tests, so `npm run
      test:coverage` (and therefore CI's `Test + coverage` step) was **red**
      at 98.34% on this branch. Added trap-exercising specs. The `set` trap was
      already covered by the "assign a plain property" test.
- [x] **`npm run check` now enforces the coverage gate** — it ran `npm test`
      (no coverage), so the 100% threshold was silently bypassed locally while
      CI ran `test:coverage`. Switched `check` to `test:coverage` so a local
      `check` matches CI.

## Duplication removal (DRY — repo enforces jscpd threshold 0)

- [x] **Vitest-adapter registration was copy-pasted across 6 entries**
      (`index`, `angular`, `nestjs`, `react`, `vue`, `svelte`): each repeated
      `import { registerMockAdapter } … import { vitestMockAdapter } …
      registerMockAdapter(vitestMockAdapter)` plus a near-identical comment.
      Extracted a single side-effect module `lib/use-vitest-adapter.ts`; every
      Vitest entry now does `import './lib/use-vitest-adapter';`. One source of
      truth for "this entry runs on Vitest".
- [x] **`provideAutoSpy` value-provider construction duplicated** between
      `lib/angular.ts` and `lib/nestjs.ts` (identical
      `{ provide, useValue: createSpyFromClass(...) }`). Extracted
      `lib/class-value-provider.ts`; both adapters and their public
      `AngularValueProvider` / `NestValueProvider` types derive from it.

## Considered & intentionally skipped

- [~] **Merge the three `as any` mock casts** (`asVitestMock` / `asBunMock` /
      `asNodeMock`). Each casts to a *different* concrete mock type and carries a
      runtime-specific eslint-disable rationale; a shared generic `castMock<T>`
      would erase that locality for one saved line. jscpd reports 0 clones —
      below threshold. Left as-is.
- [~] **Split `lib/types.ts` per `.claude/rules/ts-files.md`** (one
      `.type.ts` / `.interface.ts` per declaration). That rule targets app code;
      `types.ts` is this library's curated public type barrel and re-exported via
      `export type * from './lib/types'`. Fragmenting it would churn the public
      surface for no consumer benefit. Skipped deliberately.

## Performance pass (Unreleased)

- [x] **CommonJS output cut to the two entries where `require()` works.** Eight of the twelve `.cjs`
      files threw on their own first line (Vitest refuses to be required), and esbuild cannot
      code-split CommonJS, so each surviving bundle carried a private copy of the `MockAdapter` /
      `ObservableSupport` registries — `require('…/rxjs')` next to `require('…/node')` failed with
      "Observable spies require rxjs". Kept: `node` (self-contained, used alone) and `eslint-plugin`
      (no registry). Folded `bun-angular` into the shared ESM pass, which removed its inlined copy
      of the core. `dist/` 625 kB → 241 kB, tarball 187 kB → 108 kB.
- [x] **`bench/auto-spy.bench.ts` compared the lazy path against itself.** Its "eager" case was
      `createSpyFromClass(WideService)` with no config, and `lazySpies` defaults to `true` — so the
      reported "1.79x faster" (±84% rme) measured noise. Rewritten to pass both options explicitly
      and to sweep class width against methods actually called, which is what the default trades on.
- [x] **`vitest.shared-env.config.mts` carried dead configuration.** `test.poolOptions` was removed
      in Vitest 4 — it logged `was removed in Vitest 4` on every run and was ignored. The top-level
      `fileParallelism: false` already covers it.
- [~] **Micro-optimising `createFunctionSpy`.** Measured before deciding: `vi.fn()` alone is 1.3 µs
      (p75) and the full `createFunctionSpy` is 1.9 µs, so *everything* this library adds per method
      — two `ArgsMap`s, the promise helpers, three `defineProperty` brands, the `settledResults`
      probe — is ~0.6 µs, and `new ArgsMap()` twice is 0.04 µs of it. Removing the whole bundle
      would save a spec with 20 services × 10 methods about 0.12 ms. Not worth the loss of the
      reset/clear hooks it buys. The levers that do move a suite are per-file environment cost and
      the child subtree in `TestBed.createComponent` — both measured in
      `docs-site/core/performance.md`.
- [~] **Rewriting a hot path in Rust (napi / WASM).** The hot path is not computation: it is minting
      JS closures the runner itself tracks, which no native module can return. The one pure-compute
      piece, `serialize-args`, runs the whole `calledWith` dispatch in 0.5 µs (p75) — less than a
      napi boundary crossing costs — and its input is arbitrary JS values (`Map`, `Set`, `Date`,
      circular refs) that would have to be walked in JS before they could cross at all. Against that,
      prebuilt binaries for six platform/arch pairs would multiply the package weight this pass just
      halved, break Bun / browser / StackBlitz portability, and hand supply-chain scanners an opaque
      artifact in a package that deliberately ships unminified (see `tsup.config.ts`).

## Release infrastructure — move npm publishing to OIDC (deadline ~Jan 2027)

npm is retiring granular access tokens with **Bypass 2FA** — exactly the kind of
token both publishing workflows use today (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
in `.github/workflows/auto-release.yml` and `.github/workflows/release.yml`).

- **2026-07-31, already in force** — such a token can no longer perform
  account/governance actions: creating or deleting tokens, changing package
  access or maintainers, editing the trusted-publishing config, managing
  org/team membership. Publishing itself still works.
- **~January 2027, announced** — direct publishing is removed. The token drops
  to reading private packages and *staging* a publish; the release then waits
  for a human to approve it with 2FA. At that point auto-release stops being
  automatic.

Not affected: `GITHUB_TOKEN`, GitHub PATs, GitHub App tokens.

The fix is **Trusted Publishing (OIDC)** — GitHub Actions exchanges its own
OIDC token for a short-lived publish credential, so no npm token lives in the
repo at all.

- [ ] **Register the trusted publisher on npmjs.com.** Requires an interactive
      2FA challenge, so it cannot be scripted: package `vitest-auto-spy` →
      Settings → Trusted Publisher → GitHub Actions; owner `ASDAlexey`, repo
      `vitest-auto-spy`, workflow file `auto-release.yml` (with the extension),
      environment left empty, action `npm publish`.
- [ ] **Decide what happens to `release.yml`.** The publisher config names one
      workflow file, so two publishing workflows cannot both authenticate over
      OIDC unless npm accepts a second entry. Either reduce `release.yml` to
      creating the GitHub Release for a pushed tag, or drop it and leave
      `auto-release.yml` as the single publishing path.
- [ ] **Strip the token from the workflows** — remove the
      `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` block from the publish
      step. `permissions: id-token: write` is already set in both files, and
      that is all OIDC needs.
- [ ] **Check the toolchain floor** — trusted publishing needs npm >= 11.5.1 and
      Node >= 22.14. Node is pinned to 24; `npm i -g npm@11` currently resolves
      above 11.5.1, but pin an exact version so a floating 11.x cannot drift
      below the floor.
- [ ] **Drop `--provenance`** — under OIDC, provenance attestations are
      generated automatically for a public package from a public repo. The flag
      is harmless but no longer carries meaning.
- [ ] **Clean up after the first green OIDC release** — delete the `NPM_TOKEN`
      repo secret and revoke the token on npm. Only after a real publish has
      succeeded without it; the "skip if version already exists" guard in both
      workflows makes a retry safe.
- [ ] **Update the workflow header comments** — both files still state
      "Requires an `NPM_TOKEN` repo secret (an npm Automation or granular token
      that bypasses 2FA)".

Sources: <https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/>,
<https://docs.npmjs.com/trusted-publishers>

## Claude Code plugin directory — submission (future)

The repo is already its own marketplace: `.claude-plugin/marketplace.json` +
`.claude-plugin/plugin.json` + `skills/vitest-auto-spy/SKILL.md`, all on `master`,
public, installable by anyone with

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

Getting into the **official directory** (`anthropics/claude-plugins-official`,
installed as `claude-plugin-directory`) is a separate, optional step — it only
buys discoverability via `/plugin > Discover`.

- **Not a PR.** `.github/workflows/close-external-prs.yml` auto-closes any pull
      request from an author without write access and replies with the
      submission link. The only channel is the form:
      <https://clau.de/plugin-directory-submission>.
- **Entry shape.** The directory stores third-party plugins under
      `external_plugins/<name>/` with just `.claude-plugin/plugin.json` (plus
      `.mcp.json` where relevant), and lists them in the root `marketplace.json`
      with `source: "./external_plugins/<name>"`, a `category`, and sometimes a
      `tags: ["community-managed"]` marker. Content is copied in by Anthropic —
      our repo is not referenced as a git source, so a directory entry would
      have to be re-synced on every release.
- **Known risk.** All 13 current external entries are MCP-server wrappers; none
      is a skill-only plugin. A skills-only submission may simply not fit what
      they curate today. Re-check the directory before spending time on the form.
- **Before submitting** — what a reviewer would look at:
      - `plugin.json` / `marketplace.json` version in lockstep with
        `package.json` (already automated by `scripts/sync-plugin-version.mjs`
        on `npm version`).
      - `SKILL.md` frontmatter passes their
        `.github/scripts/validate-frontmatter.ts` (`name` + `description`;
        values containing YAML special chars must be quoted).
      - a `README.md` in the plugin root — their documented plugin layout
        expects one; ours currently lives only at repo root.
      - LICENSE (MIT) and `SECURITY.md` — both already present.

## Migration wishlist — what remains, and the mechanism that stops it

Everything asked for by the 1688-spec migration is now implemented except the items below. Each one
names the thing that actually prevents it — a version, an API, a check — rather than a judgement.

- [~] **`mockModule('x', factory)` — one call doing `vi.hoisted` + `vi.mock`.** Re-checked against
      Vitest 4.1.9 rather than from memory. The mechanism: `vi.mock` is not a function call at
      runtime, it is a **transform**. `@vitest/mocker`'s `hoistMocks` walks the module's AST and
      moves *literal* `vi.mock(...)` / `vi.hoisted(...)` calls above every import; the matcher keys
      on the callee being the `vi` (or `vitest`) identifier with the property `mock`. A call to any
      other function — including one this package exports — is not matched, is not hoisted, and runs
      after the imports it was supposed to intercept. There is no runtime API to register a mock
      factory for a specifier, so a wrapper cannot fall back to one either. What *is* possible, and
      is shipped: `moduleNamespace(exports)` for the factory's return shape, `assertMocked(ns, …)`
      to prove the mock applied, and the `vi.hoisted` recipe in the docs. Revisit if Vitest ever
      exposes `mocker.register(specifier, factory)` at runtime.
- [ ] **`prefer-as-instance` as a lint rule with an autofix.** `Spy<T>` in a position that expects
      `T` cannot be seen in the AST: it is a *type* relationship, so the rule needs
      `parserServices.program` — type-aware linting, which requires the consumer to set
      `parserOptions.project` and pays a full type-check per lint run. This plugin is deliberately
      type-free (`rule-types.ts` declares the ESTree slice it uses and imports no `eslint` or
      `typescript` types), so adding one type-aware rule would change what the plugin needs from
      every consumer that loads `configs.recommended`. If it is added, it belongs in a second,
      opt-in config (`configs.typeChecked`) and needs its own test setup: `RuleTester` with a real
      `tsconfig` and files on disk. Until then `asInstances(...)` is the answer to the cost of the
      repair, if not to finding it.
- [ ] **`NO_ERRORS_SCHEMA` next to a standalone component is a dead entry.** Schemas apply to a
      testing module's `declarations`; a standalone component carries its own. Detecting it needs a
      wrapper around `TestBed.configureTestingModule` that inspects the config — the mechanism
      already exists here (`instrumentTestBed` wraps exactly that method), but the natural home is an
      opt-in `enableAngularDiagnostics()` grouping it with `assertNgModuleScopes`, and that grouping
      is the design decision, not the code. The `toHaveDirectiveApplied` failure already says it in
      the one place people meet the problem.
- [ ] **A `toEqualRecords` matcher on top of `diffByField`.** Unchanged from the previous pass:
      `diffByField` is a plain function because it is reached for *after* a failure, and a matcher
      would carry its own deep equality and compete with `toEqual` at every call site.
- [ ] **`overrideComponentProvider` could verify that the override applied.** It queues the component
      with the TestBed compiler, which removes the usual cause of a silent no-op, but does not assert
      afterwards that the injector resolved the spy.

### Two aliases that are deliberately absent

Checked against the request rather than assumed, and both turned out to be the same thing under
another name. Documented as such (docs → "looking for X?") instead of shipped, because a second name
for one wait is a real cost: the reader has to decide between them.

- **`settled(fixture)`** is `stable(fixture)` — flush the effects, then await the fixture. The
  request added "and it should complain if it returned while tasks were pending", which is a
  behaviour change to a released API rather than a new name; if it is wanted, it belongs behind an
  option on `stable`.
- **`ensureModuleInitialized(specifier)`** is `settleDynamicImport(() => import(specifier))`, whose
  documentation already covers the second reason to call it (a barrel symbol reads as `undefined`
  until its chunk has been evaluated).

## `doctor` — a repository-level check for defects that never fail

A CLI (`npx vitest-auto-spy doctor`, non-zero exit) grouping the checks below. What they have in
common is that **nothing consumes them**: the run is green, and the only reader of a
`tsconfig.spec.json` after Jest is gone is somebody's editor. Each check is independent and can be
built and enabled on its own; the shared part is a small CLI entry (`bin` in `package.json`, a new
published surface — which is the reason this is a plan rather than a patch).

- [ ] **A spec that no tsconfig covers.** Found by a person opening a file and seeing
      `Cannot find name 'vi'` while `tsc --noEmit` reported zero errors: a migration codemod editing
      `include` had eaten `/**/*`, turning `src/**/*.spec.ts` into `src*.spec.ts` — a syntactically
      valid glob that matches nothing. Nine of 152 spec tsconfigs still covered their specs. The
      check: for every `tsconfig*.json`, expand `include` and report a pattern that matches no file.
- [ ] **A non-spec file that imports a spec.** Under a shared environment that is a cycle, and the
      spec loses its own suite.
- [ ] **A spec that exports a fixture somebody imports.** The same defect from the other side.
- [ ] **A foreign runner's pragma left in a spec** (`@jest-environment`, `@jest-config`). Vitest does
      not read them; the environment comes from the config, so the comment looks operative and is
      not.
- [ ] **Orphan files referenced only by a removed runner config** — `setupFiles`, `moduleNameMapper`,
      `snapshotSerializers`. One of the three found this way had been empty since before the
      migration: a year as a setting that configured nothing.

Two of these (the import-cycle pair) overlap with the `no-shared-module-level-mock` lint rule, and
the overlap is not complete: the rule sees one file at a time, so it catches the *export* but not
"and three files import it", and it cannot see a non-spec file importing a spec at all. That part
genuinely needs a repository-level pass.

## Invariants

- **`zone.js` is a devDependency and only a devDependency.** Never a dependency, never a peer, not
  even an optional one. Everything about zones lives behind `vitest-auto-spy/zone`; no other entry
  reaches that module, even transitively, and the module imports no zone.js of its own — it reads
  `globalThis.Zone`, which the consumer loaded. Verified after each change to the entry list:
  `npm run build` then `grep -rl proxy-zone dist/` must name `dist/zone.js` (and its `.d.ts`) and
  nothing else, `npm run size:badge` must not move for `dist/index.js`, and `package.json` must
  still declare no `dependencies`. A convenient re-export from the root would hand zone.js to every
  zoneless consumer, silently.

## Backlog (not in this pass)

- [ ] **`node:test` adapter ignores the `name` argument** of
      `createMockFn(impl, name)` — `node:test`'s `mock.fn()` has no `mockName`,
      so spy names are absent in `node:test` diagnostics (Vitest/Bun set them).
      Acceptable, but documenting the gap (or attaching a `displayName`) would
      make cross-runtime diagnostics uniform.
- [ ] **Expand `docs-site/comparison.md`** — the file already carries a TODO to
      link each competitor row and add a per-feature breakdown (see analysis
      below).

- [ ] **`using spy = createSpyFromClass(X)` via `Symbol.dispose`** — the one thing a newer runtime
      actually unlocks for this library. Attaching a `[Symbol.dispose]()` that calls `resetAutoSpy`
      is free on every supported version (Node defines the symbol since 18.18) and the `using`
      *syntax* is the consumer's toolchain problem — esbuild/tsc downlevel it, and Node runs it
      natively from 24 (verified: 22 throws `SyntaxError`). Would remove the `afterEach` from specs
      that only exist to reset one spy. Not a performance item — a benchmark pass found no hot-path
      win from any newer built-in (see `docs-site/core/performance.md#which-node-version`).
- [ ] **`node:test` retains every mock forever** — `MockTracker` holds each `mock.fn()` for the life
      of the process: 20 000 spies of a 10-method class held 435.6 MB after being dropped and
      GC'd; `mock.reset()` released all of it. Documented in `docs-site/runtimes/node.md`, but worth
      deciding whether the `/node` entry should do something about it (a `resetAutoSpy` hook cannot
      — the tracker is global, and resetting it would clobber mocks the spec created by hand).

---

# Competitor analysis

The defensible niche: **the only auto-spy library that reads a real _class_ and
returns a _fully-typed_ spy of every method with _return-type-aware_ control
helpers (`resolveWith` / `nextWith` / `calledWith` / `mustBeCalledWith`),
portable across every Vitest-compatible runtime (Vitest / Bun / `node:test`) and
framework (Angular / NestJS / React / Vue / Svelte).**

| Library | Reads a class? | Return-type-aware helpers? | Runtime | Typed | Where we win |
| --- | --- | --- | --- | --- | --- |
| **jest-auto-spies** (`@hirez_io`) | ✅ | ✅ (rxjs/promise) | Jest only | ✅ | Same API on Vitest/Bun/`node:test`; the maintained successor — direct migration path. |
| **vitest-mock-extended** | ❌ (type Proxy) | ❌ | Vitest | ✅ | We read a real class **and** add promise/observable ergonomics. Our `createAutoMock<T>()` matches its type-only mode while keeping the helpers. Complementary. |
| **@golevelup/ts-vitest** (`createMock`) | partial | ❌ | Vitest/Nest | ✅ | Explicit class→spy, typed Promise/Observable helpers, `mustBeCalledWith`. |
| **ts-auto-mock** | ❌ (compiler transform) | ❌ | Jest/ts | ✅ | No ttsc/transformer build step; runtime-only, zero toolchain coupling. |
| **sinon** | ❌ (manual stubs) | ❌ | Any | ❌ | Auto-generated + fully typed vs. hand-written + loosely typed. |
| **testdouble.js** | partial (`td.object`) | ❌ | Any | weak | Stronger typing, return-type-aware helpers, framework recipes. |
| **vitest `vi.fn` / `vi.spyOn`** (built-in) | ❌ | ❌ | Vitest | partial | Zero boilerplate: a whole class → spy in one call, no per-method wiring. |

## Reads of the field

- **Closest direct competitor: `jest-auto-spies`.** Same author lineage of the
  API. Its weakness is Jest lock-in; our entire reason-to-exist is carrying that
  exact ergonomics to Vitest/Bun/`node:test`. Keep the API a 1:1 drop-in (the
  README already pitches this) — that migration story is the moat.
- **Closest type-only competitor: `vitest-mock-extended`.** It mocks from a
  *type* via a deep Proxy and is popular, but offers no return-type-aware
  helpers. Our new `createAutoMock<T>()` covers the same "no class at runtime"
  case **while** keeping `resolveWith` / `nextWith` / `calledWith`. Position it
  explicitly as "mock-extended ergonomics + helpers" in `comparison.md`.
- **Differentiators to keep sharp:** (1) one call spies a whole class, (2)
  return-type-driven helper bundles, (3) runtime-agnostic core behind
  `MockAdapter` so the same spies run on 3 runners, (4) framework recipes that
  pull in **zero** framework runtime deps (Angular/Nest/React/Vue/Svelte are
  optional peers), (5) rxjs kept behind an opt-in `/rxjs` entry so non-rxjs
  consumers ship no rxjs.
- **Gaps vs. the field worth closing later:** partial-deep mocking of nested
  objects (mock-extended's `mockDeep`), and a documented per-feature comparison
  table (the `comparison.md` TODO).
