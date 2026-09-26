# TODO — what is still open

Only work that is still to be taken. Shipped work lives in `CHANGELOG.md` and in git history; the
questions that were asked, measured and closed with a "no" live in [`DECISIONS.md`](./DECISIONS.md),
which is where this file's `[~]` entries went on 2026-09-10 — a decision is not a task.

## Factories

- [ ] **`lazySpies: 'proxy'` has nothing left to offer — deprecate it, or say what it is for.** The
      mode existed for the memory of a wide, barely-touched double, and the shared-placeholder work
      of 2026-09-17 took that argument away: measured after it, a 100-method proxy double retains
      **4 090 B against the default's 215 B** (300 methods: 11 769 B against 284 B), a warm read
      costs **53 ns against 7 ns**, and materialising every method is 54.5 µs against 48.7. The one
      thing it still wins is building the double — 2.0 µs against 12.6 at 100 methods — which
      matters only for a class nobody calls. It is a public option, so the choices are a
      `@deprecated` tag with a message naming the numbers (a minor), removing it (a major), or
      keeping it documented as the build-time-only mode. The measurement is done; what is left is
      the decision and, if it is deprecation, the doc pass on every surface.

- [ ] **The static side of `createSpyClass(Class, config, { statics: true })` is untyped.** The
      runtime carries the statics; `ConstructorSpy<T>` knows nothing about them, so a spec that
      reads one needs `as unknown as typeof Klass`. Typing it means taking the class itself as the
      type parameter instead of `ClassType<T>` — a change to a published signature, and one that
      spends type-instantiation budget on every consumer that touches the factory, so it wants a
      `types:budget` measurement before it is written rather than after.

## Types

- [ ] **Structural types in place of Vitest's `Mock` / `MockInstance` — the breaking half of making
      `vitest` an optional peer.** The non-breaking half shipped:
      `peerDependenciesMeta.vitest.optional` is set, so a `/bun` or `/node` consumer no longer
      installs the runner, and `check-dist` reports a declaration file that names `vitest`. The
      report is a warning because `dist/bun.d.ts` still carries `import { Mock } from 'vitest'`,
      from `src/lib/types.ts`, `src/lib/jasmine-types.ts` and `src/lib/constructor-spy.ts`. Writing
      the call, `mock*` and `calls` surfaces out structurally would let `/bun` and `/node` stop
      naming Vitest at all — and it is breaking for everyone who assigns a spy into a `Mock` or a
      `MockInstance` annotation, which is the ordinary way to hold one in a variable. So it is a
      major, it needs the type tests rewritten on both sides of the boundary, and it has to stay
      inside `types:budget`. The last line of it is already written: flipping
      `reportVitestInTheTypes()` in `scripts/check-dist.mjs` from a warning to a failure.

- [ ] **A typed partial matcher, so a nested `expect.objectContaining` stops leaking `any`.** Vitest
      types `expect.objectContaining()` / `expect.stringContaining()` as returning `any`. As a direct
      argument of `toHaveBeenCalledWith` that passes a strict lint, but nested in an object literal
      it is a `@typescript-eslint/no-unsafe-assignment` report:
      `toHaveBeenCalledWith(Cmp, expect.objectContaining({ data: expect.objectContaining({ withIcon: true }) }))`.
      A consumer on `strict-type-checked` then asserts the exact object instead, listing every field
      including the `undefined` ones, and loses the partial intent. The ask is
      `partial<T>(shape: DeepPartial<T>): T` returning an asymmetric matcher. Four questions decide
      it. **The type is a lie by design:** a matcher typed as `T` is a value that is not a `T`, so
      `partial<User>({ id: 1 }).name.length` compiles and throws; a branded return
      (`Matching<T>`) is honest but is exactly as un-nestable as `any` is unsafe, unless the argument
      types of `toHaveBeenCalledWith` / `calledWith` learn to accept it. **Deep or shallow:**
      `objectContaining` compares each named key with full equality, so a nested plain object is
      matched exactly, not partially — `DeepPartial<T>` in the signature would promise more than the
      matcher does unless it recurses into records itself. **Which runner:** Vitest, Bun and Jest
      recognise any object with an `asymmetricMatch` method, and `calledWith` here already compares
      a hand-rolled `{ asymmetricMatch }` by identity (AGENTS.md section 4), so the object's shape
      and where it lives (core or `/matchers`) need settling for all four adapters. **Whether a doc answer is enough:** `expect(spy.mock.calls[0]?.[1]).toMatchObject({ … })`
      is already partial and recursive, and `captureArg<T>()` hands the argument back typed, so a
      recipe in the strict-lint guide may cover most of the demand without a new export. Reported
      by a consumer's strict-lint pass over five library slices.

## Async and timers

- [ ] **`countStrayTimers()` is blind under fake timers, and cannot cheaply be made to see.**
      `vi.useFakeTimers()` assigns its own `setTimeout` over the tracker's wrapper, so everything the
      fake clock hands out is created past the tracking and the count is vacuum-true: zero, however
      many timers the test left behind. `strayTimers` and `globalFakeTimers` therefore do not
      compose, and the fake clock's own backlog is `vi.getTimerCount()`. What shipped is the
      docblock and the documentation saying so. Seeing them means either installing the wrapper
      after the fakes on every install — a hook into a foreign lifecycle — or reading Vitest's
      internal clock, which is exactly the private-API dependency the Angular canary exists to
      contain.

- [ ] **`trackStrayTimers()` can report a frame nothing in the test scheduled, when a zoneless
      Angular effect requests one before `stubAnimationFrame()` installs.** The tracker wraps the
      native `requestAnimationFrame` once per worker, ahead of any per-test stub, so a frame
      requested during `TestBed.createComponent(...)` — a component's own `effect()` field running
      synchronously inside Angular's zoneless scheduler — is recorded against the real, native
      scheduler rather than the stub a `beforeEach` installs afterwards. If that native call never
      resolves before the file's `afterAll` sweep, it is reported as a stray frame with a stack
      pointing at the component's field initializer, even in a spec that never touches
      `stubAnimationFrame` at all, or one that deliberately installs it after construction so an
      unrelated frame stays native. The two known workarounds — install `stubAnimationFrame({ mode:
'queued' })` before `TestBed.createComponent` and drain explicitly after every input change, or
      keep the frame hand-rolled when it must stay untracked — are project-side, not package
      behaviour; nothing here yet tells a reader which one a given false positive needs, or offers a
      way to mark one native call as intentionally unobserved. `mode: 'immediate'` has the sharper
      failure: run synchronously from inside the same construction call, it re-enters Angular's own
      `ApplicationRef.synchronize` and throws `Schedulers cannot synchronously execute watches while
scheduling` — a frame requested from inside a running frame, except the outer frame is the
      framework's own tick rather than spec code.

- [ ] **`nextWithValues` on an observable property, for subscribers that are already on.** The
      warning shipped; the semantics did not. Reaching a current subscriber means the property target
      has to replay its configured values into the subject it published instead of swapping in a new
      stream — and that changes what a _late_ subscriber sees: today it gets the whole sequence,
      afterwards only what the `ReplaySubject(1)` holds. It is not obviously an improvement in every
      shape, so the likely answer is a second, opt-in path rather than a replacement; whichever way
      it goes, it is a documented behaviour change that needs the observable pages on both language
      sides.

## Guards under `test.concurrent`

- [ ] **The console guard has one slot.** The teardown net keys off `context.task`, and
      `unconfigured-reads` keeps a window per concurrent test, naming every test in flight when a
      read happened during an overlap. `stray-console.ts` still keeps one `guard.test` /
      `guard.inTest` pair, and it cannot be keyed by task at all without an async context: the output
      arrives through the global `console`, carrying nothing that says which test wrote it. The
      document snapshot stays shared whatever happens: there is one document.

## Diagnostics

- [ ] **`explainSpy` cannot see a symbol-keyed method.** Methods behind a symbol key are spied and
      reset now, but the report enumerates string keys, so they are missing from the one place a
      reader goes to ask what a double is configured with. The change is small and local to
      `explain-spy.ts`; what it needs is a decision on how a symbol prints in that report — its
      description is not unique, and two symbols of one description have to stay distinguishable in
      the output — and a test on the format.

## Lint rules

- [ ] **`prefer-set-inputs` reports a fixture the file never renders.** `setInputs` **renders** where
      `componentRef.setInput` only writes, so a file with no `detectChanges()`, `whenStable()`,
      `stable()` or `autoDetect` anywhere is a file whose author wrote the raw call _because_ it does
      not render — and the suggestion there meets a required input nobody set (`NG0950`), a provider
      nobody registered (`NG0201`), a pipe the testing module never declared (`NG0302`) or a strict
      double's unconfigured method. On the 1771-file suite the rule was measured on, that shape is 42
      of the 122 rewritten files and carries **13 of the 20** residual failures, so staying silent
      there removes two thirds of them at the price of declining 29 findings that happen to be fine.
      It is a whole-file scan rather than a scope walk, which is a different shape from every other
      guard this rule has; it wants its own measurement before it ships.
- [ ] **A rule for `mockReturnValue` written over a `calledWith`.** The runtime now reports both
      orders, and the report is engine-bound: Bun, `node:test` and `setSpyEngine('runner')` install
      their implementation inside the runtime and never reach it. A rule would cover all of them and
      cost nothing at run time — it has to follow one member of one double across statements, which
      is the reaching `no-structural-double` already declines to do through a factory, so the shape
      to settle first is how far it tracks before it goes quiet. `DECISIONS.md` carries why the
      runtime half shipped alone.
- [ ] **Two forms `no-private-member-access` cannot see.** A member reached through a variable
      holding a **union** of classes, and a `#private` field — the second is unreachable by bracket
      access, by a cast and by `Object.getPrototypeOf` alike, so there is nothing to report for it.
      The union case is the one worth building, and it is worth building when a suite produces it.
- [ ] **A rule for an overrides bag hoisted without its type.** `provideAutoSpy(X, { overrides })`
      checks the bag at the call, so hoisting it into an un-annotated `const` loses nothing at
      compile time and the shape looks harmless — until the bag drifts from `X` and the error lands
      on the call site rather than on the literal, or until a type-aware rule reads the _inferred_
      type of the const and reports its keys (`rxjs-x/finnish` does exactly that, per §18). The
      repair is one annotation, `const overrides: DeepPartial<X> = { … }`, which also moves the check
      to where the bag is written. It is the same reach `no-structural-double` declines through a
      factory — the bag travels to the call as a variable — so the shape to settle first is whether
      the rule follows only a `const` used once in the same scope, which is the case worth having and
      the one that cannot go wrong. Measured demand: 4 of 7 findings on the 1771-file suite.

- [ ] **Ship the helper lists `@vitest/eslint-plugin` needs, so a consumer stops copying them.** A
      suite on `vitest/require-hook` hand-lists every helper it calls at file or `describe` scope in
      `allowedFunctionCalls`, and hand-written lists drift both ways: a 5.31.0 consumer lists
      `blockNetwork` and `stub*Observer`, per-test patches `restoreMockedProps()` undoes, so allowing
      them at file scope silences what `propsOutsideHooks` reports at run time. Three questions decide
      the shape. **Where:** `dist/eslint-plugin.cjs` ends in `module.exports = plugin`, so named
      exports never reach `require` — the lists go on the plugin object (`fileScopeHelpers`,
      `assertionHelpers`, typed on `AutoSpyEslintPlugin` and restated by
      `scripts/eslint-plugin-cts.mjs`), as lists rather than a ready `vitest/*` rule entry, since the
      consumer's severity, prefix and own names compose with them. **How it is derived:** an export
      whose body reaches Vitest's `beforeAll` / `beforeEach` / `afterEach` / `afterAll` or
      `expect.extend` through the checker (`onTestFinished` excluded — it is called inside a test) is a
      fact, not a judgement; a prototype over `src/` answers 19 names in about a second —
      `setupAutoSpy`, `setupFakeTimers`, `setupAngularTestEnv`, `enableAngularDiagnostics`,
      `enableTestBedDiagnostics`, the four `guard*`, `installPerTest`, `mockNow`, `useCountingClock`,
      `trackMockRegistry` and the six `register*Matchers` — and belongs in
      `scripts/generate-export-map.mjs` beside `AWAITABLE_HELPERS`, so `export-map:check` fails on
      drift. The install-once helpers it cannot see (`trackStrayTimers`, `trackStrayListeners`,
      `trackStrayRejections`, `enableJasmineCompat`, `registerAutoSpyDefaults`) want a spelled-out
      list with a test that none is installed through `mockValueProp`. **Whether the assertion half
      earns its place:** `expect-expect` matches globs, so `'expect*'` already covers every `expect*`
      helper; a list adds `assertNoPendingRequests`, `verifyNoPendingRequests`, the other `assert*`
      helpers and exactness.

## Mocking follow-ups, 2026-09-19

- [ ] **The passthrough family and an unmatched `calledWith`.** `createSpyFromInstance(obj, { passthrough: true })`,
      `adoptMock` and `moduleNamespace(actual, { passthrough: true })` all hand a configured method
      over whole, so an argument list no `calledWith` matches answers `undefined`, not the real or
      previous implementation. jasmine's `withArgs` + `callThrough` falls back instead, and "one
      special case, real otherwise" reads better that way. It is one seam in `function-spy.ts` (a
      fallback distinct from the strict guard) and has to change for all three together, or none.
- [ ] **Passthrough, on demand only:** a named getter passed through to the real read (needs the
      accessor spy to take the original getter as its scaffold, so a reset returns to it), and
      lifecycle hooks recorded while still running for real (let a guard opt into `FRAMEWORK_HOOKS`,
      which would also dedupe the third copy of that list in `create-spy-from-instance.ts`).
- [ ] **Storybook's instrumented `expect` rejects an own-engine spy** with
      `[Function] is not a spy or a call to a spy!`: it wraps any function argument without own
      enumerable keys, and a fast spy keeps its `mock*` members on a shared prototype. One own
      enumerable key per spy would fix it at a per-spy memory cost and a change to `Object.keys` /
      spread / snapshot shape; documented workaround until decided. Revisit the recipe when
      `@storybook/addon-vitest` accepts Vitest 5.
- [ ] **Should `mockReset: true` drop `calledWith` rules on auto-spies?** Today it drops
      `mockReturnValue` / `mockImplementation` and keeps the rules ("reset the mock", not "reset the
      double"); `resetAutoSpy` drops both. vitest-mock-extended's `mockReset` clears `calledWith`, so a
      migrant may expect that. Documented as behaviour.
- [ ] **A permanent MSW regression spec for `blockNetwork`** needs `msw` as a devDependency. The unit
      spec pins the detection with a staged `Symbol.for('fetch-interceptor')`; the live shape
      (`setupServer` in `beforeAll`, `blockNetwork()` in `beforeEach`, a handled `fetch` resolving, an
      unhandled XHR failing with the blocked marker) is in the research handoff. Under jsdom MSW needs
      the `node:stream/web` globals, under happy-dom `BroadcastChannel`.
- [ ] **`blockNetwork` against MSW's browser `setupWorker`** (Vitest browser mode) is unchecked. The
      worker sets no interceptor symbol, so `blockNetwork: { fetch: false }` is probably needed there.
- [ ] **A deep node's `mockReturnValue(…)` returns the raw spy, not the Proxy node**, so chaining
      `vi.spyOn(node, 'x').mockReturnValue(…)` hands back the raw spy. Same calls, but calling it
      directly bypasses `selfReturning` and child materialisation.
- [ ] **Bun: the `settledResults` polyfill of an adopted mock** starts empty while `mock.calls` already
      holds the pre-adoption calls, so their indices disagree.

## `doctor` — the catalogue is partly built

`npx vitest-auto-spy doctor` ships, and what every check has in common is that **nothing consumes the
result**: the run is green, and the only reader of a `tsconfig.spec.json` after Jest is gone is
somebody's editor. A full pass produced **52 checks** in five groups — 15 replaceable patterns, 10
silent-pass bugs, 10 repository-level ones, 18 configuration/perf hints and 5 deprecation checks
against this package's own history. `doctor` now reports 23 finding ids from the 15 check modules `doctor.ts` imports from
`src/cli/checks/` (plus the `scan-cap-reached` notice; the `perf-*` ids belong to `perf`) — counted
2026-09-26 with `grep -ohE "check: '[a-z0-9-]+'"` over the non-spec files of `src/cli`. Not all of
them map one-to-one onto the catalogue: the Vitest 5, coverage and Angular-builder checks came later.

- [ ] **The rest of the sharpened catalogue.** The two that are worth naming, because they
      are the ones a per-file linter can never do, are already shipped: `helper-from-wrong-entry` and
      `no-unawaited-helper`, both driven by `scripts/generate-export-map.mjs`. The rest is a long tail
      to take a few at a time, read-only like the rest of `doctor` — trust before edit rights.

## Release infrastructure — move npm publishing to OIDC (deadline ~Jan 2027)

npm is retiring granular access tokens with **Bypass 2FA**. The scriptable half of
the move is done for _both_ packages — `auto-release.yml` and `publish-alias.yml`
publish over OIDC with no `NODE_AUTH_TOKEN`, `release.yml` no longer publishes at
all, the npm floor is pinned exactly in both and `--provenance` is gone (the
registry attaches it). No workflow reads `secrets.NPM_TOKEN` any more. What is left
is the part that needs a browser and a person.

- **2026-07-31, already in force** — such a token can no longer perform
  account/governance actions: creating or deleting tokens, changing package
  access or maintainers, editing the trusted-publishing config, managing
  org/team membership. Publishing itself still works.
- **~January 2027, announced** — direct publishing is removed. The token drops
  to reading private packages and _staging_ a publish; the release then waits
  for a human to approve it with 2FA. At that point auto-release stops being
  automatic.

Not affected: `GITHUB_TOKEN`, GitHub PATs, GitHub App tokens.

The fix is **Trusted Publishing (OIDC)** — GitHub Actions exchanges its own
OIDC token for a short-lived publish credential, so no npm token lives in the
repo at all.

The field values, the failure codes and what the January 2027 deadline does (and does
not) mean for this repository are written down for good in
[CONTRIBUTING.md → How the two packages authenticate to npm](./CONTRIBUTING.md#how-the-two-packages-authenticate-to-npm).
The trusted publisher for `vitest-auto-spy` is registered (2026-08-30: `ASDAlexey/vitest-auto-spy`,
`auto-release.yml`, environment empty, permissions `npm publish`; npm did not demand 2FA to save
it). What is left here is the part that is still undone.

- [ ] **Publish `vitest-auto-spies` again, then register its publisher.** The
      package was unpublished in full on **2026-08-29T20:35:25Z**; npm's 24-hour hold
      on a fully unpublished name (_"you may not publish any new versions of that
      package until 24 hours have passed"_) expired on **2026-08-30T20:35:25Z** and
      nothing blocks the publish any more. Re-checked 2026-09-10: `npm view
vitest-auto-spies` is still a 404, so this is waiting on a person, not on npm.
      A trusted publisher is
      configured on a package's settings page, which a non-existent package does not
      have, so the order is: one manual `cd alias && npm publish --access public` (a
      person with `npm login`, not a bypass token), then the publisher row from the
      table in CONTRIBUTING.md. That bootstrap publish is also why the OIDC path
      cannot be proven the same evening: an `Actions → Auto Release → Run workflow`
      with `alias_ref` set to the current tag would find that version already on npm,
      report "nothing to do" and go green without touching the handshake. The first
      real OIDC publish of the alias is the next release. Its old versions 1.6.0 /
      1.9.2 / 1.9.3 can never be reused — _"Once `package@version` has been used, you
      can never use it again."_
- [ ] **Delete the `NPM_TOKEN` repository secret and revoke the token on npm.**
      Nothing reads it any more, but do it only once both packages have gone out
      over OIDC — the "skip if version already exists" guards make a retry safe, a
      missing fallback during a half-finished migration is not.
- [ ] **Tighten _Publishing access_ on both packages** — npmjs.com → package →
      Settings → _Publishing access_ → _"Require two-factor authentication and
      disallow bypass 2fa tokens"_, then **Update Package Settings**. Both packages
      currently sit on the permissive option. Trusted publishers keep working under
      either, so this changes nothing operationally; it removes the bypass-token
      escape hatch, which is only worth removing once it is no longer the fallback.
      Needs 2FA on the account.

## Claude Code plugin directory — submission — DECIDED 2026-09-02: submit

Re-checked against the live catalogues on 2026-09-02. Every assumption the previous note weighed
was out of date, and the cost that made it "future" is gone.

The repo is already its own marketplace: `.claude-plugin/marketplace.json` +
`.claude-plugin/plugin.json` + `skills/vitest-auto-spy/SKILL.md`, all on `master`,
public, installable by anyone with

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

Getting into the **official directory** (`anthropics/claude-plugins-official`, installed as
`claude-plugin-directory`) is the step that is still open — it buys discoverability via
`/plugin > Discover`, and nothing else.

- [ ] **Submit the plugin through the form.** <https://clau.de/plugin-directory-submission> is the
      only channel: `.github/workflows/close-external-prs.yml` auto-closes any pull request from an
      author without write access and replies with that link. The maintainer's to send; everything a
      reviewer looks at is already in place — `plugin.json` / `marketplace.json` versions in lockstep
      with `package.json` (`scripts/sync-plugin-version.mjs` on `npm version`), `SKILL.md`
      frontmatter that passes their `validate-frontmatter.ts` (`name` + `description`, quoted where a
      value carries YAML special characters), LICENSE (MIT) and `SECURITY.md`. The one thing missing
      is a `README.md` in the plugin root — their documented layout expects one and ours lives only
      at repo root.

Two things to know before spending time on it. **The entry is a copy, not a reference:** the
directory stores third-party plugins under `external_plugins/<name>/` with just
`.claude-plugin/plugin.json` (plus `.mcp.json` where relevant) and lists them in the root
`marketplace.json` with `source: "./external_plugins/<name>"`, a `category` and sometimes
`tags: ["community-managed"]`. Content is copied in by Anthropic — our repo is not referenced as a
git source, so a directory entry has to be re-synced on every release. **And the shape may not
fit:** when this was last checked (2026-08-28) all 13 external entries were MCP-server wrappers and
none was a skill-only plugin, so a skills-only submission may not be what they curate. Re-check the
directory before spending time on the form.

## Funding — a way to support the project, and the two traps in it

Nothing in the repository asks for support today: no `funding` field in `package.json`, no
`.github/FUNDING.yml`, no section in the README or on the docs site. The mechanics are a couple of
hours' work; the reason this is a TODO rather than a done thing is that two decisions have to be
made first, and both are the maintainer's, not a coding task.

**Both items below are the maintainer's to decide, not a coding task; asked and deferred
2026-09-04.** Nothing is wired until the payment links exist.

- [ ] **Wire the standard funding surfaces, once payment links exist.** `funding` in `package.json`
      so `npm fund` surfaces the project to everyone who installed it; `.github/FUNDING.yml` for the
      Sponsor button; a short section in `README.md`, the docs site and the landing page; SVG QR
      codes generated offline into `assets/` from the payment URLs. One sentence, stated once, and
      linked from the other surfaces rather than repeated — the same rule the benchmark numbers
      follow, and for the same reason.
- [ ] **Choose the channels.** Recurring payments with a reader-chosen amount are supported
      everywhere, so the choice is not about features. It is about who can actually pay: GitHub
      Sponsors and Ko-fi reach an international audience and integrate with `npm fund`; Boosty and
      CloudTips reach Russian cards. Two blocks may be needed, and that is fine — it is what the
      audience split already looks like.

Two traps, recorded because they are easy to get wrong and expensive to undo:

- **Never publish card numbers.** A PAN in a public repository is indexed and scraped within
  hours, is usable for card-not-present payments, and cannot be revoked without reissuing the
  card; GitHub's secret scanning flags it as well. Payment _links_ are revocable, replaceable and
  measurable. This is settled — do not revisit it, and do not accept a "just for now" version.
- **The wording on the button does not decide the tax treatment.** Labelling support as a gift
  changes nothing by itself: in most jurisdictions recurring payments received in connection with
  one's own work are income whatever the button says, and regularity is precisely the signal that
  gets looked at. What does matter — the recipient's status, the platform's role as payer,
  residency — is a question for an accountant, to be settled _before_ a channel is switched on
  rather than after. Not a coding decision, and not something to design around in the repository.
