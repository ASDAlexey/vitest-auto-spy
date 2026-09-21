# Decisions — considered, measured, and deliberately not done

The record `TODO.md` used to carry alongside its backlog, split out on 2026-09-10 so the backlog is
only what is still open. Nothing here is work waiting to be picked up: every entry is a question that
was asked, answered and closed, kept because the answer cost a measurement, a probe or a rebuild to
get and would otherwise be re-derived. `[~]` means considered and intentionally not done, with the
reason.

Shipped work is not here either — it is in `CHANGELOG.md` and in git history.

## `no-reflect-member-access` and `no-self-called-spy`, 2026-09-21

- **The reflect rule is syntactic on purpose, where its twin is type-aware.**
  `no-private-member-access` says nothing without a program, and that is right for it: `obj['x']` is
  also how an index signature is read, so only the checker can tell a finding from
  `process.env['KEY']`. `Reflect.get(obj, 'x')` has no such ambiguity — nobody reaches for it to read
  an index signature — and asking the checker here would make the rule blind in exactly the place it
  is needed, since this is the spelling a suite reaches for _because_ the checker objected to the
  others. So the two rules are deliberately not one rule with two arms: they decide on different
  evidence and one of them has to keep working with `parserOptions.project` unset.
- **The subject is decided by the binding, not by a list of global names.** A deny-list of `window`,
  `globalThis`, `self`, `document` would have been shorter and would have been wrong twice over: it
  reports a spec-local `const win = …` alias, and it stays silent on every other ambient name a
  project declares. Asking whether the identifier resolves to a declaration of the linted file that
  no `import` made answers both, and it comes with a third answer for free — a module namespace
  object is an import binding, so patching one is left to `vi.mock` without an exception list.
- [~] **A namespace a spec assigns to its own `let` through `await import(…)` is reported**, although
  a statically imported one is not. That reads as an inconsistency and is the binding talking: a
  `let` the file declares is a value the file holds, and `Reflect.set` on it has the same dead-property
  failure as on anything else. Four sites of exactly that shape are in the measured consumer. Spelling
  an exception for it would have meant reading what the initialiser resolves to, which is the type
  checker again.
- [~] **`Reflect.apply`, `Reflect.has`, `Reflect.deleteProperty` and `Reflect.construct` are not
  reported.** Only `get` and `set` are the bracket escape in another spelling; `deleteProperty` is the
  closest of the rest and, on the measured consumer, its twenty sites are almost entirely on globals,
  where the rule would be advice about the one idiom it is built to permit. A rule earns its arms from
  findings.
- **A write onto a double is a message of its own, and the only one with an edit.** The other two
  reports are repaired by testing through the public surface, which is a judgement; this one has a
  mechanical replacement that keeps the write and adds the undo, so it carries a suggestion for
  `mockValueProp`. A suggestion rather than a `--fix`, matching `no-object-define-property`:
  registering an undo changes what happens between tests, which is the point of the repair and still
  a change. The edit was first built by handing `propHelperSuggestion` a synthetic `{ value }`
  descriptor so the two rules would share one implementation of "which helper, and is the name free";
  that was dropped — a fabricated node to satisfy a reader's shape is a trap for whoever changes
  either side — in favour of the eight lines the replacement actually needs.
- **`error`, at 214 findings in 50 files, and the count is not the argument.** The argument is that
  grading it below `no-private-member-access` would make `Reflect.get` the sanctioned way to silence
  that rule: the plugin would be shipping the incentive it exists to remove. `prefer-render-shallow`
  and `prefer-set-inputs` are graded down because adoption is a migration; this repair is the same
  one its twin already demands at `error`, so there is no second migration to gate.
- **`no-self-called-spy` reports the call, not the assertion.** The assertion is the claim, but the
  call is the line to delete, and pointing at it is what makes the report readable without the other
  two lines in view. It also gives the right count on a test with two self-made calls under one
  assertion: two lines to remove, two reports.
- **Order was in the design from the start, and the measurement immediately paid for it.** Matching
  the three shapes without their order reports `service.updateShelfState(…)` written _above_ its own
  `vi.spyOn(service, 'updateShelfState')`, which is arrangement and correct. Two further
  discriminations were bought by the same measurement rather than by reasoning: a `mockClear` between
  the call and the assertion (five sites in one file), and a matcher whose arguments the call did not
  pass (two sites). Both are the spec stating in its own text that the assertion is not about that
  line.
- [~] **The argument comparison is on source text, and therefore errs quiet.** `emit(payload)` under
  `toHaveBeenCalledWith(payload)` matches; the same value spelled two ways does not, and that finding
  is let through. The alternative is a structural comparison that still cannot know whether two
  expressions evaluate alike, so it would buy noise rather than certainty.
- [~] **A spy installed in a hook is out of scope.** The ordering across a `beforeEach` and a body is
  decidable — the hook always runs first — so this is not a limit of the syntax. It is a limit of what
  the shape means: such a spy is shared by every test of the block and most of them drive the
  production path, so the rule would be deciding intent from position. Left at one test body, and said
  so on the rule's page.
- **Shipped at `error` on 5 findings in 3 files, with the count named rather than hidden.** A rule
  that reports little is usually a rule that has not found its shape; this one has, and what it costs
  a suite driving the production path is nothing. The honest statement is that it is quiet, not that
  it is frequent, and the documentation says so in both languages.
- **`max-lines` on `src/lib/eslint/rules.ts` needed nothing from these two.** Four lines — two
  imports and two map entries — and the file is under its 500-line ceiling either way once
  `prefer-as-spy` has moved out of it (see `prefer-create-mock`). The alternative recorded against
  the first raise — a second map in the shape of `jasmineRules` — was not reached for: it remains
  the right move at the next ceiling, and these two rules are not a family that would justify a map
  of their own.

## `no-redundant-mock-reset`, 2026-09-21

- **The rule reads the runner's configuration, and reports nothing without it.** This is the first
  rule here that needs a fact from outside the file and outside the type checker. The alternative —
  report every reset written in a hook and let the project turn the rule off — is the shape that
  makes a lint rule untrustworthy: in a project that sets none of the three flags, the hook is the
  only reset there is, and the "fix" deletes the isolation between its tests. So the options come
  first and the disk second, and with neither the rule is silent. A silent default is also what
  makes `error` defensible: the rule cannot be wrong about a suite that has told it nothing.
- **The flag matches the call, never the family.** `restoreMocks` is not a stronger `clearMocks`:
  `vi.restoreAllMocks()` walks the spies `vi.spyOn` installed and never touches a plain `vi.fn()`,
  read off `@vitest/spy`'s own `MOCK_RESTORE` set rather than off the documentation. So under
  `clearMocks: true` alone a `vi.restoreAllMocks()` in a hook is **not** dead, and under
  `restoreMocks: true` alone a `vi.clearAllMocks()` is not either. The two subsumptions used are the
  provable ones — `resetAllMocks` resets every registered mock, which includes clearing it, and
  `restoreMocks` covers a per-mock reset whose receiver the file shows to be a `vi.spyOn` spy. A
  receiver that is a plain `vi.fn()`, or a name written more than once, is not reported at all.
- **`--fix` is narrower than "the first statement of the hook", which is where the brief for this
  rule stopped.** That reading is right about the runner — `clearModuleMocks` runs in
  `onBeforeTryTask`, immediately in front of the `beforeEach` chain, verified in the installed
  `vitest` rather than assumed — and wrong about the file: hooks of enclosing `describe`s run between
  the runner's reset and a nested hook's first line, and they are exactly the lines that seed the
  doubles the reset then wipes. An enclosing hook can also be written **after** the nested
  `describe` in source order, so "no hook above this one" is not a position check. The edit is
  therefore applied only where the file holds no other `beforeEach` and no `beforeAll` at all; on the
  consumer that is 19 of 202 findings, and the other 183 are suggestions. The alternative of fixing
  every first-statement reset was rejected on that reasoning, not on a count.
- [~] **`afterEach` and `afterAll` are reported but never fixed**, even for a first statement. The
  runner's reset does not immediately precede them — it follows them — so what a deletion changes is
  what the _rest_ of the teardown sees: a later `afterEach` of an enclosing suite, an `afterAll`, an
  `onTestFinished` callback. The next test starts on the same registry either way, which is why the
  report stands; the deletion is a human's call, which is why it is a suggestion.
- [~] **A reset in the middle of a test body is not reported, and not even read.** The rule looks at
  the innermost function around the call and requires it to be the hook's own callback. That is one
  check rather than a list of exemptions, and it settles the whole class at once: a reset inside an
  `onTestFinished(…)` the hook registers, inside an `if`, inside a helper the hook calls, and the 445
  mid-test resets the consumer carries in 132 files. Verified afterwards rather than asserted — every
  one of the 202 reported locations was re-parsed and matched against the innermost enclosing
  `it`/hook, and none of them landed in a test.
- [~] **The config is read as text, not evaluated.** `vitest.config.ts` is a TypeScript module that
  can import, call `defineConfig`, branch on `process.env` and merge presets; executing it during a
  lint run would be a rule with side effects. Three regexes over the file's source answer the three
  questions, and a project whose flags are computed rather than written passes them as options. The
  cost is stated in the docs rather than hidden: the workspace this was measured on keeps its runner
  config at `tools/unit-test-bench/vitest-runner.config.ts`, which the search does not find.
- **`scripts/check-dist.mjs` gained `eslint-plugin.cjs` in `FILESYSTEM_ALLOWED`.** The invariant that
  list defends is about the _library_: a spec must not behave differently because of a file nobody
  wrote down. A lint rule is the other thing — it exists to read the project — and what it reads is
  two config names, with `existsSync` and `readFileSync`, nothing evaluated. Left out of the list,
  the whole plugin bundle would fail the check; the reason is written beside the entry so the next
  reader does not take it for an erosion of the rule.
- **No raise of `max-lines` on `src/lib/eslint/rules.ts` for these two either.** Four more lines on
  a file that ends the release at 483 of 500. The alternative that was pre-approved — a second rule
  map beside `jasmineRules` — stays unbuilt for the same reason it was rejected then: it is worth
  doing for a family, not for a file that is still under its ceiling.

## `no-unasserted-argument`, 2026-09-21

- **The blunt rule exists and is not worth shipping again.** `vitest/prefer-called-with` reports
  every bare `toHaveBeenCalled`: 1 941 sites in 360 files on the 2 032-file consumer, which is why it
  is not in its own plugin's `recommended` and is off there. A rule of this shape earns its place
  only by being _narrower_, and the narrowing has to be evidence rather than taste. The two readings
  shipped are the file contradicting itself — a subject some other test pins with
  `toHaveBeenCalledWith`, a title promising an argument list over a body that checks only that
  something ran — which come to 175 in 90 files, 151 and 24.
- **Subjects are matched by source text.** `expect(api.load)` and `expect(loadSpy)` are two subjects
  even where they are one spy. Following a name to its binding was considered and dropped: it buys
  findings in exchange for the risk of pairing two subjects that are not the same, and this rule's
  whole licence to exist is that it does not invent findings. The direction of the error is stated on
  the rule's page.
- [~] **The `with` reading does not fire beside any other assertion.** An equality on a result, a
  count, a chain the rule cannot read to the end (`resolves`, `rejects`) — each of those may be where
  the arguments are actually checked, and none of them is worth a guess. A bare
  `not.toHaveBeenCalled()` is the one thing that does not silence it, because it is a claim about the
  call rather than about its arguments. Titles are matched on `\bwith\b`, so `without` and
  `withdraws` are not matches; that was the first false positive found while writing the tests.
- [~] **`toHaveBeenCalledTimes`, `toHaveBeenCalledOnce` and `not.toHaveBeenCalled()` are never
  reported.** The counting matchers assert something the bare one does not, and a negative has no
  arguments to name. Widening to them is what `vitest/prefer-called-with` already does, at the count
  quoted above.
- [~] **The first reading fires even where the test asserts a result as well.** A test that checks a
  returned page and asserts the call bare is still the test that does not read arguments the file has
  already declared significant. Silencing it would fold the first reading into the second and take
  the count from 151 to a handful — the two readings are deliberately independent, one about the
  file, the other about the test.
- **`warn`, and graded on what the repair needs rather than on the evidence.** Both readings are
  facts out of the file, which is how every `error` here decides. What is missing is the repair: the
  argument list the test should have named is the one thing the rule cannot supply, so unlike every
  `error` in this plugin it carries neither an edit nor the name of a helper that replaces the line —
  it carries a question for the author. That is what the existing `warn`s have in common in spirit
  (`prefer-set-inputs` is graded on what adoption costs, `no-stub-class-double` on the evidence), and
  it makes six graded rules rather than five.

## `no-vacuous-absence-assertion`, 2026-09-21

- **The unit reported is the test, not the assertion.** An absence assertion is a perfectly good
  line — "nothing yet" before the trigger is how half the consumer's stream tests are written, 58
  assertions in 21 files — and what makes it worthless is the _absence of a sibling that could
  fail_. So the rule weighs every `expect()` in the test and reports once, on the first vacuous one,
  or not at all. Reporting per assertion was tried on paper and dropped: it turns the same 39
  findings into a page of messages about lines that are individually correct.
- **What silence satisfies is decided on the initialiser's source text, not on the matcher's
  family.** `toBeNull()` reads like an absence matcher and is one only where the declaration holds
  `null`; on a `let` with no initialiser it fails on silence, and reporting it would have been a
  false positive on the very file the rule was measured against. The text comparison is whitespace-
  insensitive and nothing more — `[]` and `[ ]` are the same initialiser, a `[...seed]` is not — so
  every case it cannot decide makes the rule quieter rather than louder.
- [~] **No `--fix` and no suggestion**, unlike `prefer-settle-dynamic-import`, which was the model
  for everything else here. The repair is not an edit at the reported node: it deletes the capture's
  declaration, replaces the `subscribe` statement with `await expectNoEmission(source$)`, drops the
  assertion, makes the callback `async` and writes an import — five coordinated edits whose
  equivalence depends on the vacuous assertion being the variable's only reader. And the helper
  asserts something _stronger_ than the line it replaces, so a wrongly accepted suggestion does not
  fail to compile (the bar the four `--fix` rules meet); it turns a green test red with a message
  about `expectNoEmission` rather than about the code. `prefer-stub-response` declines for the same
  reason and carries the repair in the message, which is what this one does.
- [~] **`expectNoEmission` was not written for this rule.** The brief called for it as a new
  counterpart to `expectEmission` so the suggestion would have somewhere to point; it has shipped
  since 5.3.0, with the quiet-window timer, the `timeout` default of `0` and the teardown that stops
  a stray window outliving the test. Nothing about it needed changing — what was missing was
  anything pointing at it, which is the rule and the two documentation cross-links beside it.
- [~] **Assertions inside the `subscribe` callback are not weighed.** They neither carry a finding
  nor silence one, and they are `no-expect-in-subscribe`'s to report. Counting them as positive
  would let a test hide behind an assertion that a silent stream never reaches, which is the same
  defect wearing the other mask.
- [~] **A test that asserts through a helper of its own is skipped entirely**, rather than having
  the helper's assertions counted the way `no-expect-in-subscribe` counts them. One step through a
  local name would cover most of it, and "most" is the wrong side of the trade here: a missed
  positive assertion is a false report on a test that does check something.
- **`error`, although it does not arrive at zero.** 39 findings on the consumer, each an independent
  one-test repair with the evidence in the declaration and the matchers, is the position
  `prefer-settle-dynamic-import` shipped in. The two rules graded down are graded on what adoption
  costs — each is a migration a suite takes file by file — and this is not one.
- **`max-lines` on `src/lib/eslint/rules.ts` was raised to 520 here and put back to 500 before the
  release.** The file is a registration file that grows by exactly two lines per rule, an import and
  a map entry, and rule 42 took it over the old ceiling; raising the ceiling was the smallest change
  in front of one rule. It did not survive contact with the other seven: `prefer-as-spy` moved to
  `injected-spy.ts` instead (see `prefer-create-mock` below), which freed more than the eight rules
  cost, so the limit is the 500 it always was and the registration file is at 483 of it.

## `prefer-create-mock` and `no-mock-cast`, 2026-09-21

- **Two rules, not one, although the defect is the same.** A cast over an object literal and a cast
  over a member of a double are the same move — `as T` asks whether the types overlap rather than
  whether the value is one of them — but they have different repairs (`createMock<T>` against
  `injectSpy(S).m`), different populations on the consumer they were measured on (1 200 against 24)
  and, because of that, different severities. One rule with two messages would have forced the
  larger population's grade onto the smaller one, and the small one is the one a suite can clear in
  a sitting.
- **`prefer-create-mock` is `warn`, and it is the repair that is graded, not the evidence.** The
  finding is exact: the literal and the type it claims are on the line. What is graded is that
  accepting the suggestion hands the literal to the compiler, so every fixture that has drifted goes
  red the same day — 1 200 sites in 327 of 2 032 files. That redness _is_ the finding, which is the
  argument for shipping the rule; it is also a migration nobody lands in one branch, which is the
  argument against `error`. The same reading `prefer-set-inputs` gets, and deliberately not the
  reading `no-structural-double` gets, which is graded on a heuristic rather than on a cost.
- [~] **No `--fix` on either.** `prefer-create-mock` is the case above. `no-mock-cast` fails the
  standard for a different reason: `injectSpy` answers the double the container was _given_, so on a
  hand-rolled `{ provide: X, useValue: { m: vi.fn() } }` the rewrite is a run-time throw rather than
  a compile error — the one failure mode the four `--fix` rules here are chosen for not having.
  `no-unregistered-inject-spy` already reports an accepted suggestion that landed on such a double,
  which is what makes offering it safe.
- [~] **`{ … } as unknown as T` is not reported.** It is the worst-looking form, and it is the one
  form `createMock<T>` cannot repair: the hop through `unknown` is there precisely because the
  compiler refused the single cast, so the suggestion would not compile. Consumers ban it with a
  `no-restricted-syntax` rule of their own (the library's own config does), and that is the right
  place for it. Same reasoning as `prefer-as-spy`'s `assertedValue`, which declines the double cast
  except where the value is provably a `TestBed.inject`.
- [~] **A cast to a utility type — `Partial<T>`, `Pick<T, …>`, `Record<…>` — is reported like any
  other**, 25 of the 1 200. Excluding them was considered: `createMock<Partial<T>>({ … })` reads
  oddly. It still checks the keys, and the shape those 25 are actually in is a literal cast to
  `Partial<T>` while sitting in a slot that is already `Partial<T>` — a cast that is simply
  redundant, whose repair is deletion. The message names deletion as the first repair, so an
  exclusion would have removed the report without removing the defect.
- **529 of the 1 200 sit in a slot that already has a type** — a call argument, a `nextWith`, a
  `mockReturnValue` — and that changed the message rather than the rule. There the cast is not
  load-bearing: it is switching off the check the slot would have performed, so the first repair is
  to delete it and let the slot read the literal, with `createMock<T>` for whatever partial is left.
  A rule that only ever said "wrap it in `createMock`" would have been right about the defect and
  wrong about half the repairs.
- **Measured before the carve-out was written: none of the 1 200 literals contains a `vi.fn()`.**
  The worry was that `prefer-create-mock` would report the same line as
  `prefer-create-spy-from-class` or `no-structural-double` on a `useValue` double cast to its
  service type. On that consumer it never happens — 11 of the reports are inside a `useValue` and
  every one of them is data (`{ subscriberID: 'sub-1' } as AccountToken`) — so no exemption for
  `useValue` was added. The carve-out that _is_ there is `insideFactorySeed`, the same one the
  double rules read, plus the type names another rule owns (`Response`, `Spy`, `Mock*`).
- [~] **`no-mock-cast` does not report a plain `fn as Mock`.** A local `vi.fn()` retyped is nobody's
  double, and the advice — read the member off the double — has no member to name. The operand has
  to be a member access for the repair to exist at all.
- **`Mock` has to come from the runner, where `prefer-stub-response`'s `Response` has to be the
  global.** The same question answered in opposite directions, and both are right: `stubResponse`
  builds the platform's `Response`, so a `Response` with any declaration is somebody else's; a
  Vitest `Mock` can only arrive by import, so an import from `vitest` / `@rstest/core` / `bun:test`
  / `jest` — or no binding at all, for a project with ambient runner types — is the evidence, and a
  `Mock` imported from anywhere else is a domain type.
- **`prefer-as-spy` moved out of `rules.ts` into `injected-spy.ts`, and that is what kept
  `max-lines` at 500.** Not a decision about the new rules, a consequence: `rules.ts` was two lines
  under its 500-line ceiling and registering two more rules crossed it. The rule's whole helper set
  (`assertedValue`, `asSpyFixes`, `EsSpyCast`) already lived in `injected-spy.ts`, whose own doc
  comment already described it, so the move is where the file split was heading anyway — the same
  reason the jasmine rules are in a module of their own. Two other rules in this release reached for
  the other repair and raised the ceiling to 520 instead; the move is the one that was kept, and
  with all eight rules registered the file counts 483 lines against the unchanged 500.

## `prefer-settle-dynamic-import`, 2026-09-20

- **The report is anchored on the innermost enclosing function, not on "is this inside a test".**
  Reading ancestry — is there an `it()` anywhere above — would have caught more, and every extra
  finding would have been wrong: a `vi.mock` factory, a lazy route's `loadComponent`, a callback the
  spec hands to production code and `settleDynamicImport`'s own `() => import(…)` are all inside a
  test by ancestry, and for none of them is the helper the repair. Asking which function actually
  runs the `import()` settles all four with one check and no list of exempt property names to keep
  in step.
- [~] **A spec-local `const load = async () => { await import('…'); }` is not reported**, although
  it is the shape the consumer had written eleven times, with names like `flushPinCodeChunk` and
  `settleProfileSelectImport`. Reporting it needs the file to say who calls the function, and the
  file does not: a named function whose body awaits an import is written identically whether the
  spec calls it itself or hands it to the code under test as a loader, and for the second the advice
  would be wrong. Heuristics were considered — the name, whether the function is ever passed as an
  argument — and both fail on the same file. Documented as a limit on the rule's page instead.
- [~] **No `--fix`.** The rewrite adds an event-loop turn, so it changes what the test does at run
  time, and it has to write an import. The four rules here that fix on their own share one property
  this does not have: a wrong edit can only fail to compile. Offered as a suggestion, which is where
  `prefer-inject-spy` and `no-sync-testbed-await` sit for the same reason.
- [~] **`await Promise.all([import('./a'), import('./b')])` is not reported.** The `await` is on the
  `Promise.all`, not on the `import()`, and wrapping each loader is not the same edit — a spec
  loading two modules at once wants one settle after both, which is a rewrite rather than a wrap.
  Reading through the combinators (`all`, `allSettled`, `race`) was tried on paper and dropped: the
  shape does not occur in the 2 030-file consumer, and a rule earns its exceptions from findings.
- [~] **A callback something other than the runner invokes stays out of scope**, including
  `it('x', waitForAsync(async () => …))`. The wrapper decides when and how the callback runs, and a
  file that shows only the wrapper's name cannot say whether an extra turn is even reachable — under
  `fakeAsync` a dynamic `import()` does not resolve at all, which is the note this package already
  carries about the loader being outside the zone.

## `stubResponse({ body: null })` and the rule beside it, 2026-09-20

- **`null` serialises; `undefined` and an omitted `body` are the only way to say "no body".** The
  alternative considered was a third state — an explicit `noBody: true`, or a sentinel — which would
  have kept `body: null` meaning what it meant. It was rejected because it adds a field to say what
  the field already says: there is one spelling of "no body" and every caller already writes it, so
  the literal `null` is free without a new name. The change is a reversal of a released contract and
  is written up as such in `CHANGELOG.md`; what makes it worth the reversal is that `null` was the
  one JSON literal that did not round-trip, which is a trap rather than a preference.
- **`{ body: null, status: 204 }` throws instead of quietly sending no body.** Keeping the old
  behaviour for exactly the statuses that carry no body was the other option, and it is the worse
  one: it would leave a single corner of the API where `null` still means the opposite of what it
  means everywhere else, and nothing in the spec would say so. Letting the platform throw was not
  enough either — its "Response with null body status cannot have body" names a body where the
  caller thinks it asked for none. So the message is the library's own and names the migration.
- [~] **No `--fix` and no suggestion on `prefer-stub-response`.** The mapping is not mechanical.
  `json: async () => data` is `body: data` only when the arrow is exactly that shape; `ok: true` is
  not a field to copy but a value `stubResponse` derives from `status`, and copying it produces the
  `ok`/`status` disagreement the helper throws on; a member with no counterpart in
  `StubResponseInit` — `body` as a stream the spec built, a `clone` the author wrote — has nowhere
  to go, and dropping it silently is worse than not offering the edit. The message carries the whole
  repair instead, which is what the rules that report a shape rather than a spelling do.
- [~] **The rule does not read types, and will not.** A type-aware version could recognise a
  `Response` behind an alias or a factory, which is the limit it ships with. It would also make the
  rule wait for `parserOptions.project`, and the two shapes that matter — a cast and a type argument
  — are written on the line either way. The same trade `no-sync-testbed-await` made.

## Mocking gaps from a survey of other libraries, 2026-09-19

- **`mockDeep` arrays are on by default, not behind a flag.** The types have always promised it:
  `DeepMockProxy<T>` is a homomorphic mapped type, so `Item[]` maps to an array of deep mocks and
  `mock.items.map` is typed as `Array.prototype.map`; nobody could have relied on the runtime
  disagreeing without also fighting the types. The one behaviour that changes for a reasonable type
  is a numeric-keyed dictionary (`Record<number, T>`), where reads by key keep answering deep nodes
  and only `Array.isArray` / `Object.keys` change. The view fills skipped indices lazily (a `has`
  trap, not eager filling), so a dictionary read at id 123456 costs one node. Symbol keys stay
  `undefined` on nodes that are not arrays: iterating a node remains a `TypeError` and `from(node)`
  still refuses it.
- **`fallbackMockImplementation` is per node, with a fixed precedence.** Wired through the strict-mode
  seam, because its question is "did anything configure this node". So a `calledWith` miss answers
  `undefined`, not the fallback (vitest-mock-extended falls back per call); `mustBeCalledWith` is the
  per-call contract. Precedence: configuration > fallback > `selfReturning`. The suite-wide
  `setupAutoSpy({ strict })` stays out of deep trees, so no option is silently overridden by a suite
  default. Angular lifecycle names are not exempted: a deep node is named by its path, and Angular
  does not call `ngOnDestroy` on a `useValue`. The options object is the second argument; the migrated
  first-argument form is a compile error.
- [~] **No option for a callback passthrough (`$transaction`).** A documented one-liner,
  `method.mockImplementation((run) => run(asInstance(mock)))`. An option on a deep tree applies to
  every node, and a node cannot know which argument is the callback, whether to await it or what to
  pass it; it would also fire on `on('event', handler)`, invoking handlers the code only registers.
- [~] **A deep node's diff label stays `[Function undefined]`.** Snapshots print
  `[MockFunction mockDeep.repo.find]`; the assertion diff labels a function by its `name`, and on a
  node `name` / `toString` are members of the mocked type. The only lever, `Symbol.toPrimitive` on
  nodes, would change what code under test renders for an unseeded member (`${user.name}`) and outrank
  a spec's own `node.toString.mockReturnValue(…)`.
- **`vi.spyOn` on a deep node goes through `has`, not the descriptor.** Answering through the
  descriptor would change `mock*Prop`, which records it to choose between restore and delete. The
  same repair was **not** taken for `createAutoMock` (the consumer-bump entry below), and there is a
  second reason besides lifecycle hooks: Vitest's `isAsymmetric` tests
  `typeof obj === 'object' && 'asymmetricMatch' in obj`, so an auto-mock answering `in` like `get`
  would be taken for an asymmetric matcher by `toEqual` and `toHaveBeenCalledWith`. A deep node is a
  function, so the check never reaches it.
- **`passthrough` lives on `createSpyFromInstance` only** — a class factory has no real method to
  run. Named `passthrough`, not `spy: true` (everything here is a spy) nor `callThrough` (already the
  jasmine per-spy strategy, which a passthrough spy honours). Any configuration takes the whole
  method; `resetAutoSpy` returns it to the real one. An explicit `strict: true` / `onUnstubbedCall`
  beside it throws; a suite-wide or registered strict yields for members with a real method.
  Lifecycle hooks, callables with their own API (Angular signals) and classes stay real, because a
  spy there breaks the real object. Accessors are not passed through: doing it right needs the
  accessor spy to take the original getter as its scaffold, so a reset returns to the real read.
- **`adoptMock`, not `mockFn`.** vitest-mock-extended's `mockFn` creates a mock; this one takes over
  an existing one. It refuses `node:test`'s `mock.fn()`: there is no `getMockImplementation`, and
  `mock.restoreAll()` / `mock.reset()` put the original implementation back over the dispatch
  silently, which under the standard `afterEach(() => mock.restoreAll())` fails every test quietly.
  A call-through mock (`vi.spyOn` without an implementation, `vi.mock(path, { spy: true })`) reports
  `getMockImplementation() === undefined`, and the original is unreachable through public API, so an
  adopted one answers `undefined` when unconfigured; call-through is built from the start instead.
- **Module passthrough is an option on `moduleNamespace`**, the same guard seam and rules as the
  instance one. The `createSpyFromInstance({ ...await importOriginal() }, { passthrough: true })`
  spelling works too and is not documented separately: one way is enough.
- **`blockNetwork` detects an applied `@mswjs/interceptors` fetch interceptor** by
  `Symbol.for('fetch-interceptor')` and leaves `fetch` to it. Chosen over an `allowMsw` option: nobody
  who calls `server.listen()` wants its handlers silently disabled, so an opt-in would be a trap with
  a switch. Not chosen: subscribing to the interceptor to reject unhandled requests ourselves, which
  couples to its listener order and controller state and outlives `restoreMockedProps()`.
- **`stubResponse` takes one `body` decided by shape** (plain data → JSON, anything else → `BodyInit`),
  not separate `json` / `text` fields; a string is always sent as text.
- **"The Vitest config flags do not touch auto-spies since 4.1" was false.** The sweep sentinel routes
  `clearMocks` / `mockReset` to every auto-spy; `restoreMocks` reaches none. The measured table is
  documented, and `setupAutoSpy()` deliberately adds no clearing of its own.
- **`no-hand-assigned-global` is its own rule**, not an extension of the hand-rolled-doubles module,
  which reads object literals and their DI carve-outs; an assignment into a global is a different
  shape whose carve-outs are restores. It reuses `prefer-observer-stub`'s receiver and double reading,
  a teardown-hook restore silences it, and it ships at `error` because the finding is syntactic.
- **"`setupAutoSpy` covers Bun" was false.** `/setup` registers Vitest hooks. Bun hygiene is documented
  as a preload `afterEach`, verified on Bun 1.4.0; a `/bun` setup entry would be new runtime surface.
- [~] **Browser-mode `vi.spyOn(namespace, …)` gets no diagnostic of ours.** `@vitest/spy` already
  throws `Cannot spy on export …`; a docs line is enough.
- **Task recipes live under `docs-site/guides/`** as their own search-entry pages (classes,
  `localStorage`, Prisma, Storybook with Angular) rather than sections of `recipes.md`, which stays the
  Angular-at-scale page. Hook tuples are documented as literals: a Proxy double is not iterable, and a
  tuple is data. [~] No `/storybook` adapter; Storybook's `fn()` is not wired into the engine.

## Four findings from a consumer's 5.19.0 bump, 2026-09-19

- **`vi.spyOn` on an unread lazy method: a forwarder, not per-double getters and not an error.** Vitest
  reads an accessor by calling its getter bare, so the shared pair cannot know its double. Going back
  to one pair per double would buy it back at 25 kB an untouched 100-method double, the regression
  5.19.0 removed. Throwing a named error was the cheaper repair, and it would have kept failing the
  specs that worked through 5.18. The forwarder keeps them working; what it gives up is `calledWith`
  on the wrapper `vi.spyOn` returns — `vi.spyOn` never typed one, so no spec could be using it.
- [~] `vi.spyOn` on a `createAutoMock` member nobody read fails as it always did, with Vitest's
  `The property "load" is not defined on the object`. The proxy's `has` answers false for a member
  it has not minted, and it has to: answering true would make Angular and RxJS see lifecycle hooks
  and protocol members on every auto-mock.
- **`injectSpy(GenericClass)` falls back to the constraint.** A constructor that takes `T` hands
  TypeScript a `never[]` inference, and nothing a signature can say reaches the declared default
  instead: `unknown[]` rejects a constructor with a typed parameter, `any[]` answers `X<any>`, which is
  the failure the explicit-argument advice exists for, and a conditional `infer` reads constraints,
  never defaults. So the class-token overload now refuses an instantiation with a member inferred as
  `never`, and the next overload reads the class at its constraint. A member that is `never` on
  purpose lands on the same overload and comes out the same, since the class is not generic. A class
  whose `T` reaches only a method parameter still infers `never` there, as it did.
- **`createSpyFromInstance` with an only-list takes the registration's behaviour, not its members.**
  The alternative was to keep the merge and report it under `misconfiguration`; that would have made
  the spec that asked for one method pay for a registration it cannot opt out of, where the call
  site's only-list already says which members may change. The class factory keeps the full merge: its
  double is built, so a registered getter completes it rather than replacing something real.
- [~] **`createMock(undefined)` stays `{}`, with no report and no overload.** At run time the literal
  and a forwarded optional `overrides` parameter are the same call, so a report would fire on every
  fixture helper written that way; an overload without the optional parameter rejects the same
  helpers at compile time. Documented instead, with the one-line repair: pass `undefined` itself.

## The type-instantiation budget now measures the opt-in surfaces, 2026-09-19

`npm run types:budget` (`scripts/check-type-budget.mjs`) budgets the delta between two generated
programs: a fixture declaring 30 `createSpyFromClass` spies over an 80-member class with 600
member touches, and a control with the same class and imports but no spies. Until today that
delta was the cost of `Spy<T>` and nothing else, through two blind spots the 5.19 release made
expensive. Both programs import the root entry, so a type that merely rides the barrel —
`captureArg`/`ArgCaptor`, `ConstructorSpy`/`SpyClassOptions`, `moduleNamespace`, the prop-mock
and emission helpers — is declared in each program and instantiated in neither: its cost cancels
out of the delta, and a heavy conditional there could never fail the gate. And the opt-in entries
were in no program at all: `/signal-forms`, whose `createForm` returns Angular's `FieldTree`, and
the jasmine entry's `JasmineSpy<T>` with `.and`/`.calls`/`.withArgs`, paid by every migrating
suite, were measured nowhere.

The treatment program now carries a second fixture, `surfaces.ts`, which the control does not
include; it instantiates each of those types once against the same fixture class. Measured
2026-09-19, TypeScript 6.0.3, on a tree carrying that day's edits to `lib/types.ts`: total
43 143, control 14 226, delta 28 917, budget raised 12 500 → 34 700 — the same ~20 % headroom the
previous baselines kept. The surfaces carry 17 400 of the delta: ~2 100 the 5.19 root-barrel
types, ~4 850 the jasmine surface, ~10 500 `/signal-forms`, the largest because `FieldTree` is
Angular's. On the pre-widening scope the same day measured delta 11 517, so the figures quoted in
"Undersold moats" below — delta 9 126 against a budget of 11 000, from 2026-09-02 — are
superseded twice over: first by the 2026-09-12 re-baseline (10 410 / 12 500), now by this one.
The gate's own cost barely moved: 1.0 → 1.1 s wall for the whole check.

- [~] Per-member granularity is not attempted. The fixture makes one real use of each type, not
  of every member of every type, and the per-surface split above came from dropping one surface
  at a time from a scratch copy of the script. The budget is a tripwire against degeneration, not
  an accounting system; a member heavy enough to matter drags its declaring type's instantiation
  count up with it.

## Three trades the audit round settled, 2026-09-17

Two of them reverse an entry further down this file, which is why they are written here rather than
left in the changelog: the old reasoning is still worth reading, and the reason it expired is not
guessable from the code.

- **De-chunking is reversed for five more entries — `/setup`, `/node`, `/react`, `/vue` and
  `/svelte` now build as one file each.** This supersedes **"Full de-chunking of all 14 entries"** in
  the performance pass below, which refused the move on two grounds. The second one — that it breaks
  the single-registry invariant — expired when the stateful modules moved into
  `dist/shared-state.js`: `useSharedState()` now runs over the solo pass as well as the chunked one,
  so a solo entry imports the one copy of `mock-adapter`, `observable-support`, `jasmine-support`,
  `package-identity` and `emission-timeout` rather than inlining its own. That is asserted, not
  assumed: `smoke:dist` gained a case where a double built by `/react` is understood by the root
  entry and `/setup` sees a strict throw raised by a spy from `/svelte`, in one process, alongside
  the existing `index`+`setup`, `index`+`angular`+`setup` and `index`+`vue` pairs. The first ground,
  the bytes, was measured rather than re-derived, as that entry demands: a fresh process per sample
  with the peers loaded before the timer, 25 runs, median, Node 24 on darwin arm64 — `/setup`
  **5.57 → 3.05 ms**, root + `/setup` **7.03 → 4.93 ms**, `/react` 5.46 → 3.09, `/node`
  3.37 → 1.65, root + `/angular` + `/setup` **7.74 → 5.85 ms**, against `dist` **+442 kB** and a
  tarball of **642.7 → 751.2 kB (+16.9 %)**. The pair that decides it is the second one: a setup file
  is evaluated beside the root entry in _every_ spec file, so before this a Vitest project paid for a
  solo core **and** a twelve-module chunked `/setup` on each of them. The old item's own +429 kB
  figure is not the same quantity and must not be quoted next to this one — it was for all fourteen
  entries, against a baseline that has moved four times since.
  - [~] `bun` and `bun-angular` stay chunked. Nobody loads them per spec file, and their shared
    adapter chunk is the one the `sideEffects` fix is about.
  - [~] The remaining opt-in subpaths stay chunked for the same reason. The rule this pass leaves
    behind is not "solo is better" but "solo for what a spec file loads every time".

- **Structural matching replaces the serialized key wherever a string cannot carry the question, and
  +10 % on the key of an object argument is accepted for it.** The exact map keyed by a serialized
  string is still the fast path and still flat; what changed is which configs are allowed into it.
  A config holding an asymmetric matcher or a function at any depth now goes to the predicate path
  and is compared structurally — matchers apply wherever they sit, `Map` and `Set` compare without
  order, `Date` by time, `Error` by name and message, functions by identity, symbol keys count, and
  the prototype is deliberately **not** compared, which is what the runner's own `equals` does. The
  alternative was to keep serializing and make the key finer, and it is not available: a matcher
  serialized as data matches nothing while `mustBeCalledWith` throws on the correct call, and the
  key's collisions — two functions of one name, two `Error`s, an object key forged to look like a
  key list, symbol-keyed fields, a `Set` built in another order, `expect.any(A)` against
  `expect.any(B)` for two same-named classes — are silent wrong answers, the expensive kind. The
  price is on the hot path and was measured before it was accepted: a single primitive argument is
  unchanged, a config holding a matcher costs +20 ns, and the key of an object argument costs
  **+10 %**, roughly six of those ten points being the `getOwnPropertySymbols` that symbol keys
  require and the rest the repeat budget and key quoting. Taken, because the same pass turns a
  depth-18 graph with back edges from **276 ms into 0.29 ms** per call and an eight-config lookup
  against a 200-field record from **636 µs into 0.4 µs** — the tenth is paid on the one shape that
  was never the problem — and `bench:vs:fast` still leads every row (`calledWith dispatch` 0.17 µs,
  3.01× ahead).
  - A memoised subtree that emitted a back edge is no longer un-memoised for the rest of the walk,
    which is what made the render exponential. The spec that pinned the old behaviour was rewritten
    deliberately: the key has to be deterministic **for the structure**, not describe the path taken
    to reach it, and traversal order is fixed by sorting keys, so two isomorphic graphs render
    identically. Repeats — subtrees taken from the cache — are charged against a 50 000-character
    budget and print as `ClassName{…N}` past it.
  - [~] A huge argument that is shared with nothing is still rendered whole, and its key is still
    linear in its size. Truncating it would risk a false match, and a false match is the failure
    mode this whole item exists to remove.
  - [~] Two symbols of one description are still one key — the same behaviour a top-level symbol
    argument has had since the 2026-09-06 audit; and two opaque instances with no own enumerable
    fields (`URL`, `ArrayBuffer`) still match each other, though no longer a different class's.
    Separating either needs special cases on `toString`.

- **One lazy placeholder per method name, shared across every double of the class, with a
  dictionary-mode probe at the first materialisation.** This re-opens **"Cheaper lazy-spy creation by
  sharing the accessor descriptors across spies"** in _Tried and rejected_ below, and that entry was
  right about the mechanism: plain sharing reproduced exactly the regression it records —
  materialising every method went **45 → 223 µs** at 100 methods and **195 → 1 733 µs** at 300,
  because V8 keeps doubles whose accessors came from one descriptor pair on a shared fast-mode map
  and turning an accessor into a data property there rewrites it. What the old entry measured as the
  cure and rejected — forcing dictionary mode with a probe property and a `delete` — is taken here
  with one change that makes the arithmetic work: the probe is installed at the **first
  materialisation**, not when the double is built, so an untouched double, which is the case the
  whole item exists for, never leaves the shared map. With it, materialising every method is 48.7 µs
  at 100 and **144 µs at 300, below the 195 µs baseline**, while an untouched 100-method double
  retains **215 B instead of 25 593 B**. Building a 300-method double costs 28 % more (33.3 → 42.7 µs)
  and is inside the noise up to 100.
  - JSC has no such pathology, so there the probe cures nothing and costs about 50 ns per
    materialised method (Bun 1.4, shapes measured without the library: an untouched 100-method double
    15.8 → 4.5 kB, materialising three methods 0.3 → 1.0 µs, all hundred 6.2 → 11.0 µs). Taken as it
    is: the memory win is real on both engines, and "a hundred-method double nobody touched" is a V8
    problem, under `isolate: false`, where the doubles of a worker accumulate.
  - [~] Accessors on a shared prototype — still no, for the reason the old entry gives: it changes
    what `Object.keys` and `{ ...spy }` report, which is observable.
  - The strict-mode guard moved off the closure it shared with the placeholder into a
    `WeakMap<double, …>` rather than a symbol on the double, on the same grounds: a symbol key would
    show up in every spread and every snapshot.

## `documentPollution` — what the shared-document guard does not do, 2026-09-17

Asked for after a consumer suite lost 34 tests, one full run in six, to a `data-reset-focus` attribute
another spec file left on `<body>`. What shipped is in `CHANGELOG.md`; what was weighed and left out is
here.

- [~] **Checking in the shared `afterEach`**, as `prototypePollution` does. Not done, and measured
  rather than assumed: the builder's `init-testbed.js` and Analog's `setupTestBed` register the TestBed
  cleanup before the project's setup file runs, `afterEach` hooks run in reverse, so the check would
  come before the fixtures are destroyed. On a zoneless TestBed that point still had the component's
  `<style>`, its root element and an attribute its `DestroyRef` removes. `onTestFinished` and a
  `beforeAll` cleanup both run after every such hook whatever `sequence.hooks` says.
- [~] **`'throw'` by default.** Not done. `prototypePollution` could default to failing in 5.5.0
  because one key kills collection for the rest of the worker; a leftover attribute breaks only code
  that reads it, and a suite that has lived with a few harmless ones must not go red on a minor
  upgrade. The strict preset carries it at `'throw'`, as it took `swallowedStrictCalls` in 5.7.0.
- [~] **Nodes by default.** Off: a library that injects a stylesheet on first import does so once per
  worker, and the check would charge it to whichever test imported it first. Angular's own teardown
  leaves nothing in `<head>` or `<body>` when `destroyAfterEach` is on, so an Angular-only suite can turn
  it on.
- [~] **The whole tree, through a `MutationObserver`.** Not done. Records arrive in a microtask, so
  attribution to a test needs a flush the runner does not give, and everything under a fixture's root
  belongs to the TestBed, which removes it. The three elements every file shares are where a leftover
  outlives its file.
- [~] **`document.title`, focus, cookies, `adoptedStyleSheets`, `customElements`.** Not watched. None
  is an attribute; a custom element definition cannot be undone, so the guard could name it but never
  repair it, and an unrepaired report repeats in every later file.
- [~] **A write made while the spec file is imported.** Unreachable from any hook of that file, like
  the import-time case of `prototypePollution`. Taking the baseline when `setupAutoSpy()` runs instead
  of in `beforeAll` would see it, and would also report every attribute a later setup file sets, once
  per file.
- [~] **`bun:test`, `node:test`, Rstest.** No `/setup` entry exists on them to host a guard; the
  `/bun-angular` preload resets the TestBed but carries no guards.
- [~] **Recognising module-scope registrations at collection** — `A metric with the name … has already
been registered` from `prom-client`, `customElements.define` twice. Under `@angular/build:unit-test`
  with `isolate: false` a workspace module can run its module scope once per spec file while an
  external registry lives once per worker. The error is thrown while the file is imported, before any
  hook, so there is no seam to add a hint from; it is documented as a row of the error table instead.

## `mockReturnValue` over a `calledWith`: reported, not repaired, 2026-09-13

Reported from a consumer suite as "the branch is not being called": `spy.m.calledWith(1).mockReturnValue(a)`
followed by `spy.m.mockReturnValue(b)` answers `b` for every argument list, silently. Three shapes of
answer were on the table, and only the third shipped:

- [~] **Make `mockReturnValue` write the container instead of the implementation** on a spy this
  library built, so a `calledWith` would keep winning. It is the fix that makes the reported spec
  work, and it re-defines a host API from under its users: `mockReturnValue` would then stop winning
  over a `mockImplementation` written after it, the `Once` queue would sit on a different layer than
  the value it falls back to, and a spec reading `getMockImplementation()` would see something the
  runner never installed. The library's rule is that the host's surface behaves as the host's — the
  double is the thing that is ours.
- [~] **An ESLint rule.** It would catch both orders statically, cost nothing at run time, and reach
  Bun and `node:test`, which the runtime report does not. It is also a cross-statement question about
  one member of one double — `no-structural-double` already cannot see through a factory — so the
  honest version needs the same reaching the runtime does for free. Left open in `TODO.md`; the
  runtime report is the half that is exact.
- The report itself is placed where the replacement happens, in this package's own spy engine, rather
  than in an `afterEach` sweep over a registry of configured spies: the sweep would need a registry
  this library deliberately does not keep (see `mock-registry.ts` for what a run-wide `Set` of mocks
  costs), and it would name the test rather than the line.

What it does not cover, deliberately: the `Once` family (its queue drains back onto the dispatch, so
it suspends a chain for one call rather than erasing it), `setSpyEngine('runner')`, Bun and
`node:test` — those install an implementation inside the runtime, with no seam to observe it from.

## `prefer-set-inputs`, and the `--fix` it does not ship, 2026-09-13

The rule reports a run of `fixture.componentRef.setInput('name', value)` and offers `setInputs` in its
place — 504 findings across 140 files of a 1771-file suite. What it deliberately does not do:

- [~] **Apply the edit.** It was written as a `--fix` first and measured that way in a copy of that
  consumer's tree: 451 edits, 122 files rewritten, every one still parsing, 101 of them still
  type-checking — and **57 of those 101 went from green to red**, all on
  `NG0101: ApplicationRef.tick is called recursively`. **Half of that was ours and is now fixed**:
  `stable()` started with a bare `TestBed.tick()`, which under zone.js re-enters itself the moment a
  dirty view effect makes Angular hop into the `NgZone` to run it. The tick runs inside the zone now,
  the same 451 edits produce **zero** `NG0101`, and the count is **57 → 20**. The first explanation
  recorded here was wrong in a way worth keeping: it blamed the project's change-detection mode and
  claimed `componentRef.setInput(…)` plus a bare `TestBed.tick()` reproduces it on two lines. It does
  not — that pair is green in a zone-based TestBed until a **dirty `effect()`** is in the view, which
  is why the first repro attempt in this repository came out green and why 83 pre-existing `setInputs`
  call sites in the same suite never saw it.

  The remaining 20 are why the edit is still a suggestion at `warn`, and they are not about zones.
  `setInputs` **renders** where `componentRef.setInput` only writes: 13 of the 20 files never drove
  change detection at all — they set an input and read a computed off the instance — and the render
  they now get reports the required input nobody set (`NG0950`, 6 files), the provider nobody
  registered (`NG0201`), the pipe the testing module never declared (`NG0302`), a strict double's
  unconfigured method, or a timer the file now leaves scheduled. The other 7 are a run the rule ends
  early — at a repeated input — rendering between the two halves of one setup.

- [~] **Reading the receiver's type.** The infrastructure exists — `checkerServices` is what the two
  `useValue` rules use — and it would settle "is this a `ComponentFixture`" exactly. It is not used,
  because the shape already settles it: a bare `ComponentRef`, which is the one thing that would be
  mistaken for a fixture and where `setInputs` does not apply, has no `componentRef` of its own. The
  name, or the single value the file gives it, carries the rest, and a rule that needs no program
  reports in a project that has wired none.
- [~] **Merging two writes of the same input.** Adjacent writes of one input are how a spec says "and
  now it changes" — `setInput('url', first)` then `setInput('url', second)`, asserting the second —
  and one literal carrying both keys is `TS1117`. Two of them exist in that suite, and the first
  version of the rule produced exactly that error there; the run now ends at the repeat instead, so
  the two calls stay two calls.
- [~] **Reporting a computed name.** `setInput(key, value)` has the same defect — nothing checks
  `key` — but no rewrite can spell a key it cannot read, and a report whose repair is "work out what
  this variable holds" is the kind that gets switched off. None of the 777 calls measured spell it
  that way.
- [~] **Writing the `async` into a helper.** 53 of the 504 findings sit in a function the spec
  declares or in a `waitForAsync(…)` wrapper. Making one of those `async` changes a signature whose
  callers this file cannot see: a caller that does not await it would keep running past the point it
  used to finish at, and nothing reports that. Those get the report and no edit.

## `prefer-provide-auto-spy` and the long form of its own factory, 2026-09-13

Arming the rule on `{ provide: X, useValue: createSpyFromClass(X, config) }` — the body
`provideAutoSpy` returns — found 91 providers in 49 files of a 1771-file suite that is otherwise
clean against `recommended`. What the arm deliberately leaves out:

- [~] **Reporting the provider that reads a _different_ class.**
  `{ provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) }` is 51 sites in 41 files
  on the same suite, and every one is working code: the token is an abstract class, the spy is built
  from an implementation of it, and an abstract prototype carries none of the methods the double
  needs — `provideAutoSpy(LocalStorage)` would spy nothing at all. There is no shorter spelling to
  recommend, so a report there would only teach the suite to write an `eslint-disable` over correct
  code, which is the failure mode 5.10.1 had just finished removing from two other rules. The two
  names are compared rather than resolved: resolving them would still not say whether two imported
  names are the same class.
- [~] **Following a call parked in a name** — `const cart = createSpyFromClass(Cart)` with
  `useValue: cart` below it, which the object arm of this rule does follow. Not done: the double is
  configured through that name afterwards, so the honest repair is `provideAutoSpy(Cart)` **plus**
  an `injectSpy(Cart)` at every use, i.e. a rewrite of the file rather than of the provider. A
  report with a fix that small would be pointing at the wrong line.
- [~] **Fixing a call that carries explicit type arguments.** Reported, never rewritten.
  `createSpyFromClass<T, Options>` takes two type parameters and `provideAutoSpy<T>` one, so a fixer
  dropping the second would change what the spy's type is. None of the 91 sites spells one — the
  guard is for the suites that do.
- **Merging the import instead of adding a line.** `insertImport` puts a new `import` at the top of
  the file and lets the formatter place it, which is what every other fixer here does. That would
  have left a second `import … from 'vitest-auto-spy/angular'` in **20 of the 49 files**, reported by
  `import/no-duplicates` on the line the fixer had just written, so the fix takes the specifier into
  the import the file already has and only writes its own when there is none (or two).
- **Extracting the rule into `provide-auto-spy.ts`.** `rules.ts` sat at exactly the 500-line cap, so
  the arm had nowhere to go; the rule, its four older messages and the long-form reading now live
  together, and `rules.ts` is back to 450.

## `no-sync-testbed-await` — which members, which grade, and the stock rules next to it, 2026-09-12

The second half of the `no-compile-components` cleanup. Removing 448 `compileComponents()` calls from
410 files of a 1862-file Angular suite left 18 `await`s on a value that was never a promise and 33
hooks `async` with nothing to wait for, so the rule reports the `await` itself. Over that consumer's
last commit (1759 spec files) it reports 14 times in 10 files, and over the same tree with the calls
removed and their awaits fixed, not once. The judgement calls:

- [~] **Reporting `inject` and `runInInjectionContext`.** Not done, and this is the line that decided
  the member list. `TestBed.inject(TOKEN)` answers whatever the token holds and
  `runInInjectionContext(fn)` whatever the callback returns — either can be a promise, and in the
  measured suite four `await TestBed.inject(VPN_DETECT_RESULT)` calls await a real one. Nothing in
  the syntax tells those from the ordinary case, so a syntactic rule reporting them would be wrong
  about working code. `execute` and the deprecated `get` are out for the same reason. What is in
  is exactly what Angular types as returning `TestBed` or a `ComponentFixture`:
  `configureTestingModule`, `overrideComponent`, `overrideDirective`, `overrideModule`,
  `overridePipe`, `overrideProvider`, `overrideTemplate`, `overrideTemplateUsingTestingModule`,
  `resetTestingModule`, `createComponent`, `getLastFixture`.
- [~] **Reporting the members that return `void`** — `configureCompiler`, `initTestEnvironment`,
  `resetTestEnvironment`, `flushEffects`, `tick`, and a fixture's `detectChanges`. Not done.
  Awaiting one of them is equally a no-op, but the rule's message states one fact — _this call
  hands the TestBed back, which is why it chains_ — and that fact is false about a `void` member;
  a second message for a second fact is two rules wearing one name. `configureCompiler` sits
  among eight members that do return `TestBed` and is the likeliest to be added back by mistake,
  so the member list says out loud that it returns `void`. None of the six appears under an
  `await` anywhere in the consumer suites this was measured on.
- [~] **Requiring `TestBed` to be the identifier imported from `@angular/core/testing`.** Not done.
  The name is read as written, which is what `no-inject-before-override`,
  `prefer-provide-activated-route` and the token rules already do: a project barrel re-exporting
  the testing entry is ordinary, and a rule keyed on the import would go silent on exactly those
  files. The chain carries the precision instead — only members Angular declares as returning
  `TestBed` count as links, so `TestBed.inject(Api).createComponent(x)` is not one.
- [~] **A `--fix` rather than a suggestion.** Not done, for the reason `no-compile-components` gives
  for the same edit: dropping the `await` moves the next statement one microtask earlier, and
  dropping the `async` changes what the hook hands the runner. The second half also cannot see a
  callback's explicit `: Promise<void>` return annotation, which stops compiling once the `async`
  is gone — acceptable for an edit a human accepts one at a time, not for one `--fix` applies in
  bulk.
- **`error` in `recommended`, despite the overlap with `@typescript-eslint/await-thenable`.** Probed
  rather than assumed: with both rules on and a program wired, the shape draws **two reports at the
  same line and the same column**, each with a suggestion and neither with a fix. That is the whole
  cost, and it exists only in a project that has `parserOptions.project` — the case this rule exists
  to cover the absence of. What is not duplicated is the rest. `await-thenable` names "a non-Promise
  (non-Thenable) value" and its suggestion removes the `await` alone, leaving the hook `async`;
  `@typescript-eslint/require-await` reports **nothing** on the original shape, because the `async`
  function does contain an `await` expression, and finds the leftover only after the other rule's
  suggestion has been applied. Measured on the probe: our suggestion leaves `require-await` silent,
  `await-thenable`'s leaves it reporting `Async arrow function has no 'await' expression`.

## A seeded member against `returns`, and `@defer` against `no-compile-components`, 2026-09-12

Two defects from the same consumer suite adopting 5.8.0. Both had more than one defensible answer, so
what was **not** chosen is the part worth keeping.

- [~] **Telling a host mock from a plain function, so `returns` could still configure the first one.**
  Not done. The crash was `createAutoMock` handing a seeded arrow function to
  `adapter.restoreImplementation`, and the obvious repair is an `isMockFn` on `MockAdapter`: seed
  the library's own container for a spy it built, drive a `vi.fn()` through the adapter, leave a
  plain function alone. It would have kept the one existing behaviour that used that fallback — a
  seeded `vi.fn()` overwritten by `returns` — and cost four adapters, the `RedefineAdapterParts`
  list and three stub adapters in specs. Rejected for producing two rules where one will do: a
  seed would win when it is a plain function and lose when it is a `vi.fn()`, which nobody could
  predict from the documentation. One rule instead — a member named in `overrides` is left exactly
  as seeded — is the merge rule the package already states (the call site outranks a registration;
  a seed is returned verbatim), and it makes the fallback unreachable rather than safe, which is
  why it was deleted instead of guarded.
- [~] **Narrowing `no-compile-components` by the shape of the call.** Not done. The files that broke
  when the call was removed write `await TestBed.compileComponents();` on its own rather than
  chained onto `configureTestingModule(…)`, and that shape is easy to select on. It is not
  evidence: the two spellings are a style difference, the correlation is one class of file in one
  suite, and a rule that skipped the standalone form would stop reporting the ordinary redundant
  call while still reporting `@defer` specs written the chained way — worse on both sides. Whether
  the call is load-bearing is a fact about **another file's template**, which no spec shows and
  this rule reads no types to reach, so it stays reported and the exception is named in the
  message and in the suggestion's own text.
- [~] **Dropping `no-compile-components` from `configs.recommended`, or lowering it to `warn`.** Not
  done. It is inert until a project passes `{ builder: 'inline-resources' }`, its findings are
  suggestions rather than fixes, and on the measured suite the exception was one class of file out
  of 410 — a scoped disable per call is a smaller price than losing the other 409.

## `NoInfer` on `registerAutoSpyDefaults`, 2026-09-11

A consumer reported that the token overload collapses `T` to `{ activeRow$: any } & …` when a
registration names `observablePropsToSpyOn` next to `returns`, and wrote the type argument out. Probed
with `tsc` 5.4.5, 5.8.3, 5.9.3 and 6.0.3, in this repository and in the consumer's own program: the
call compiles on every one of them. Only the class overload was changed.

- [~] **`NoInfer` on the token overload.** Not done, because there is nothing for it to fix.
  `InjectionToken<T>` never uses `T` in a member, but inference does not go through members for
  two references to the same generic class — it infers from the type arguments directly, at the
  highest priority, while a list such as `observablePropsToSpyOn` contributes only a `keyof`
  candidate, which ranks below it. A type test (`angular-spy-defaults.test-d.ts`) pins the
  consumer's shape, with a wrong `returns` value beside it so an `any` cannot pass it.
- [~] **`NoInfer` on the core `registerAutoSpyDefaults`.** Not done, for the reason the core
  factories keep the trap (below): the TypeScript floor. `spy.test-d.ts` holds the rejection and
  the explicit form, next to `createSpyFromClass`'s pair.

## Token registrations, `selfReturning` and `no-unknown-use-value-key`, 2026-09-11

Asked for from the same consumer suite (~1 760 spec files): the registry should reach doubles behind
an `InjectionToken`, a chained call should be expressible where the double is declared, and an
object `useValue` should have at least its keys checked. What shipped is in `CHANGELOG.md`; what was
weighed and left out is here.

- [~] **An option on `no-mistyped-use-value` instead of a rule of its own.** Not done. The two report
  different findings — a primitive value of the wrong type, and an object key the type does not
  have — and a project that accepts one reading has to be able to switch the other off without
  losing it, the argument that made `no-stub-class-double` and `no-structural-double` rules of
  their own rather than arms of `prefer-create-spy-from-class`. An option would also share one
  severity between them. Every rule here but one is option-less, and the ones with options tune a
  threshold or name a file; none switches a second finding on.

- [~] **Checking the values of an object `useValue`, not only its keys.** Not done, and not reopened:
  5.7.0 left object tokens out of `no-mistyped-use-value` because a `useValue` is usually a
  partial fixture and assignability would be hundreds of findings nobody should rewrite. A key the
  type does not have is never a partial fixture — it is a member nothing reads — so the narrow
  form is the one that holds at the expected rate (two keys in a hand count over 434 class
  literals).

- [~] **Following the literal behind a name, an `as`, or a `TestBed.overrideProvider` descriptor.**
  Not done. A literal behind a name is already typed at its declaration more often than not, an
  `as` is the spec saying it knows better, and following either costs the one-file guarantee
  every rule here keeps. A spread is read as contributing no keys: its type may be anything, and
  the literal keys beside it are still checked.

- [~] **A key missing from one member of a union.** Not reported: a key is known when any
  non-primitive member of the union has it. `getPropertyOfType` on the union itself answers only
  for keys every member carries, which would report the discriminating keys of every
  `Config | Legacy` fixture — correct code.

- [~] **Typing `selfReturning` as "methods whose return type accepts the double".** Not done, on a
  measured case: the consumer's logger interface declares `channel(name): ChannelLogger`, and the
  root interface does not satisfy `ChannelLogger` (it lacks `name`, `enabled`, `log`, `trace`,
  `time`). A return-type filter would reject exactly the call the option exists for, while at run
  time a type-driven double answers every key `ChannelLogger` has. The list is
  `OnlyMethodKeysOf<T>`, like every other method list, and costs nothing new to instantiate.

- [~] **A way to remove a registered `selfReturning` entry at the call site.** None beyond `returns`:
  lists union by design, and a method named in both answers its `returns` value, which is how one
  link is taken out. A subtraction syntax would make the merge order-dependent for the first time.

- [~] **A token overload on the core `registerAutoSpyDefaults`, through a structural stand-in for
  `InjectionToken`.** Not done. `InjectionToken<T>` never uses `T` in a member, so no structural
  shape the core could declare carries `T`: the keys of `returns` and `selfReturning` would go
  unchecked, which is the whole value of the typed form. The core may not import Angular's types,
  so the token overload lives on the `/angular` export of the same name, over the same registry.
  `/bun-angular` does not export `provideAutoSpyForToken`, so it does not get the overload either.

- [~] **A token row type beside `AutoSpyDefaultEntry<T>`.** Not exported:
  `[InjectionToken<T>, AutoSpyTokenDefaults<T>]` says it, and one more exported name is one more
  to keep in step with the table's constraint.

## `vitest-auto-spy/angular-router` — what the route double leaves out, 2026-09-11

Asked for by a consumer suite with 99 hand-built `ActivatedRoute` doubles. What shipped is in
`CHANGELOG.md`; what was weighed and left out is here.

- [~] **A look-alike object instead of Angular's class.** Not done. A plain object with the same
  keys passes a key comparison and fails `instanceof`, `relativeTo` (the router walks
  `snapshot.root` and `children`) and every getter Angular adds later. The double is built with
  the router's own internal constructors instead — positional, unchanged from 20 through 22 —
  and `assertRouteWiring` reads every member back as it builds, so a major that reorders them
  fails loudly on the first `provideActivatedRoute()` rather than yielding a route that reads
  the wrong field. The CI Angular range job builds the double on every supported major.

- [~] **Parent and child routes.** Not done. A tree means a second record per node and a rule for
  which parts a child inherits (`paramsInheritanceStrategy`), and the evidence did not ask for
  it: `firstChild` was patched in a handful of specs, never a whole tree. The route is a one-node
  tree so the tree getters answer instead of throwing; `mockReadonlyProp` or
  `RouterTestingHarness` covers the rest.

- [~] **`title`.** Not done. The router keeps the resolved title in `data` under a private
  `Symbol('RouteTitle')` that no public API exposes. Reaching it would take a probe through a
  proxy handed to the snapshot's getter — clever, fragile, and for a member no spec in the
  evidence read. It emits `undefined`, as for a route nobody gave a title.

- [~] **Merging setters.** Not done. `setQueryParams({ page: '2' })` replaces the whole set, because
  the params after a navigation are the whole set and a merging setter would let a spec reach a
  state the router never produces. Spreading the old ones is one expression.

- [~] **Always emitting on a setter.** Not done. The router emits a stream only when its value
  changed by its own shallow equality; a double that emitted anyway would pass a spec whose
  component re-fetches on a no-op navigation the application never makes.

- [~] **A lint rule for the hand-written `useValue`.** Not in this change. `prefer-provide-auto-spy`
  still recommends `provideAutoSpy(ActivatedRoute)` for `{ provide: ActivatedRoute, useValue }`,
  which is the weaker double for this one token; pointing that message at
  `provideActivatedRoute()` is a follow-up.

## Three syntactic rules — a suppressed stub, a constant assertion, a dead `compileComponents()`, 2026-09-11

`no-ts-expect-error-on-double`, `no-constant-expect` and `no-compile-components`, measured against the
same 1759-file consumer before they shipped (34, 4 and 449 reports). What shipped is in `CHANGELOG.md`;
what was weighed and left out is here.

- [~] **Skipping a `@ts-expect-error` that carries a reason.** Every one of the 34 directives the rule
  found carried a reason — the consumer's lint requires one, as `@typescript-eslint/ban-ts-comment`
  does by default — and the wrong diagnoses were written in exactly that place ("the collapsed
  generic"). The escape for the four deliberate ones is a per-line `eslint-disable-next-line` with
  its own reason; the report sits on the directive's line so that comment reaches it.

- [~] **`rejectWith`, `failWith`, `throwWith` and `mockRejectedValue` in the helper list.** Their
  parameter is `unknown`, so no stub shape can be wrong there, and a directive above one silences
  something else — the message would be false.

- [~] **A type-aware form of the same rule**, asking the checker whether the suppressed error is about
  the stub. The syntactic reading already lands on the right lines, and a program would make the
  rule silent in every suite that lints without one.

- [~] **`no-compile-components` as the plugin's first `off` in `recommended`.** The contract is that
  every rule ships switched on. The rule ships at `error` and says nothing until
  `{ builder: 'inline-resources' }` states a fact no spec holds — the pattern the three type-aware
  rules already follow for a program. Reading the builder from `angular.json`, or `templateUrl`
  from the component, needs another file, which no rule here reads.

- [~] **A `--fix` for `no-compile-components`.** A suggestion only: dropping the `await` moves the next
  statement one microtask earlier, and removing `async` changes what a hook returns. The edit is
  offered only for a statement of its own; a `.then()` chain, a returned or stored promise and a
  concise arrow body use the promise and are reported bare — returning `TestBed` from a concise
  hook would hand Vitest a function it calls as teardown.

- [~] **`no-constant-expect` following a name** (`const ok = true; expect(ok).toBe(true)`) or evaluating
  arithmetic (`expect(1 + 1).toBe(2)`). All four findings were literals, and every step past the
  spelling is a step towards a rule that has to be right about the program. `expect.soft` and chai's
  `expect(x).to.be.true` are not read either.

- [~] **Leaving `no-constant-expect` to `@vitest/eslint-plugin`.** Checked against 1.6.27: nothing there
  reads the value handed to `expect` — `valid-expect` checks the call's shape, the `prefer-to-be-*`
  family rewrites matchers. The plugin already carries runner-level hygiene of this kind
  (`no-done-callback`, `no-floating-assertion`); if the upstream plugin gains the rule, this one
  should point at it and go.

## The read side of strict — `unconfiguredReads`, 2026-09-11

Asked for because strict mode stopped at the call: a spied getter nobody configured answered
`undefined` and an observable property spy nobody fed never emitted, on doubles that threw for every
unconfigured method. What shipped is in `CHANGELOG.md`; what was weighed and left out is here.

- [~] **Throwing on the read.** Not done. A double that lands in a failure diff is read by the
  formatter, and a throw there replaces the assertion message with the library's — the test fails
  either way, but on the wrong sentence. The report after the test is the whole design.

- [~] **In `preset: 'strict'`.** Not included, for the reason `strict` itself is not: it is a decision
  about how a suite writes its doubles — every getter and stream a test touches has to be
  configured, `undefined` included — rather than a grade for a report of something already
  broken. `swallowedStrictCalls` is in the preset because every finding there is a test that ran
  on without the answer it asked for; here an unconfigured read may be the answer the test meant,
  and only the spec can say. An existing suite starts with `onUnstubbedRead`, not a red run.

- [~] **On by default under `strict: true`**, as `swallowedStrictCalls` is. Not done, for the same
  reason: the default stays `'off'`, and turning it on is one option.

- [~] **Counting only the literal test body.** Not done. The window runs from `setupAutoSpy`'s own
  `beforeEach`, which precedes every hook of the spec file, to its `afterEach`, which follows them.
  A spec's `beforeEach` is where most suites run the code under test (`fixture.detectChanges()`),
  so a body-only count would miss the case it exists for. Collection, `beforeAll` and `afterAll`
  stay outside, and so does anything after the report ran.

- [~] **Judging a subscription when it happens.** Not done. Subscribing in `beforeEach` and calling
  `nextWith` in the test is the ordinary way to drive a stream, and the subscriber does receive the
  value — the stream is judged at the end of the test instead. A getter read is judged when it
  happens: it has already answered `undefined`, and configuring the getter later does not change
  what the code under test did with that answer.

- [~] **The handler's return value as the read's answer**, as `onUnstubbedCall` does for a call. Not
  done: the handler runs after the test, with the report's verdict — a stream cannot be judged any
  earlier, and a survey that disagreed with the report would not predict what turning it on fails.
  The same timing is why both handlers need `setupAutoSpy`: a test is what it marks out.

- [~] **A `takeUnconfiguredReads()` for a test that reads on purpose.** Not shipped beside
  `takeStrictViolations()`. A throw provoked on purpose needs taking; an `undefined` meant on
  purpose is configured — `accessorSpies.getters.x.mockReturnValue(undefined)`, the read-side twin
  of `returns: { save: undefined }`.

- [~] **Setters, `mockAccessorsProp`, `mockDeep` nodes.** Not covered. A write answers nothing the
  code under test depends on. `mockAccessorsProp` patches any object, not a double, and has no
  strict configuration to consult. `mockDeep` keeps the decision recorded below for calls: every
  hop of a chain is a read, so a suite-wide strict would report every existing deep tree.

## Component stubs, a spec's own Web Storage and a generic class's default, 2026-09-11

Three items from a consumer's list after a suite-wide strict pass. What shipped is in `CHANGELOG.md`;
what was weighed and left out is here.

- [~] **`NoInfer` on the core factories.** `createSpyFromClass(GenericClass, { gettersToSpyOn: […],
returns: {…} })` still fails; only the `/angular` providers were changed — the `provideAutoSpy`
  of `/jasmine`, `/nestjs` and `/vue` keep the core signature. The mechanism, probed
  with `tsc` 6.0.3: a generic class argument is deferred to overload resolution's second pass, the
  first pass infers `T` from the configuration alone (`{ remoteConfig: any }` through
  `keyof T`, or a partial through `overrides`), and the candidate is rejected before the second
  pass reads the class. The fix needs both halves — `NoInfer` so the configuration contributes
  nothing, and a `T = any` default so the first pass accepts the configuration; `NoInfer` alone
  gives `T = unknown` and rejects every list. Measured and not enough: `[X] extends [infer U] ? U :
never` and `[T][T extends any ? 0 : never]` let the `keyof` inference through, and a
  type-parameter rest in the constructor type changes nothing. `NoInfer` is TypeScript 5.4, above the floor the core documents; every Angular `/angular`
  supports is past it. The one visible cost: a call that is an error anyway reports `Spy<any>`.
- [~] **What `createComponentStub` does not copy.** Host bindings, host directives, providers,
  lifecycle hooks and queries — a stub that ran any of them would be the child again. A signal
  input's transform lives inside the real `input()` and cannot be read without constructing the
  child, so a stub's signal input holds the raw value; a decorator input's transform is in the
  definition and is copied. Every output is an `EventEmitter`, whatever the child used — both
  have `emit` and `subscribe`, which is all a parent and a spec touch. `required` is not
  enforced.
- [~] **Two private pieces of Angular, both pinned by the spec.** The selector goes through a port
  of Angular's `stringifyCSSSelector`, which is not exported, rather than a patch of the stub's
  `ɵcmp.selectors` after compilation; the spec asserts the compiled selector lists are equal. A
  signal input is declared with `Input({ isSignal: true })`, which is what Angular's own JIT
  transform emits and not public API; the spec reading `chart.series()` fails if it moves. And each
  stub's prototype carries a non-enumerable `ɵstub<n>`: Angular hashes a component's prototype names
  into its ID and warns `NG0912` on a shared one, which a stub of a template-only child — or the
  same child stubbed in every test — produced, and which a strict console guard fails the test on.
- [~] **`createComponentStub` on `/bun-angular`.** Not re-exported there, like `createDirectiveHost`:
  it reads Angular structurally and could move to `angular-portable.ts` the day a Bun suite asks.
- [~] **What `stubWebStorage` does not do.** No named-property access — `localStorage.token` and
  `Object.keys(localStorage)` do not see the items; that needs a `Proxy` on every read, for a
  shape the platform itself discourages. No `storage` event, no quota, `instanceof Storage` is
  false, and `vi.spyOn(Storage.prototype, 'setItem')` does not see its calls — spy on the
  instance. Unlike `restoreWebStorage()` it installs in a `node` environment: the repair guesses
  what the environment should have been, the stub is what the spec asked for.

## Failing on everything — the stray-console guard and `preset: 'strict'`, 2026-09-11

Asked for as "any console output in a test is an error, every warning an error, as strict as it
goes". What shipped is in `CHANGELOG.md`; what was weighed and left out is here.

- [~] **Auto-installing the `/console` spies per test under the guard.** Not done. The only signal
  that a file wants the spies is its import, and under `isolate: false` the entry is evaluated
  once per worker: every file after the first imports a cached module and runs no code, so there
  is nothing at run time to scope an install to. Installing for every test once the entry has
  loaded would silence every later file — the failure the guard exists to catch. Counting a call
  as absorbed when the test later _reads_ the spy was also rejected: it hangs correctness on
  intercepting `mock` reads, which every matcher, `vi.clearAllMocks()` and the registry pruner
  also perform. So under the guard the import installs nothing, and `installConsoleSpies()` in a
  `beforeEach` (or at the top of the file) is the one explicit, deterministic place.

- [~] **Buffering stray output and replaying it at teardown.** Not done. The guard forwards every
  call as it happens, so Vitest's `stdout | file > test` attribution, `onConsoleLog` and the
  output of a failing test stay exactly what they were; the failure message quotes what matters.

- [~] **`strict: true` as the preset's name.** Taken: `strict` already means strict doubles, which
  change what an unconfigured call _returns_. That is a decision about how a suite writes its
  doubles, not a report grade, so it is not in the preset either — `preset: 'strict'` is.

- [~] **`blockNetwork` and `restoreMocks` in the preset.** The first changes what the code under
  test sees; the second also drops `vi.spyOn` stubs a suite installed in `beforeAll`. Neither is
  a grade.

- [~] **Failing a file on stray timers under the preset.** The sweep runs in `afterAll`, so the
  failure lands on a file rather than a test, and a callback scheduled after the previous file's
  sweep is charged to the next one — the count can fail a file that scheduled nothing. Each stray
  now carries its scheduling file and frames, at the price of a stack per scheduled timer (about
  1.6 µs, see `docs-site/core/performance.md`), so the failure is actionable but still not the
  preset's to impose. One line opts in: `onStrayTimers: ({ timers }) => expect(timers).toEqual([])`.

- [~] **`enableAngularDiagnostics()` inside the preset.** `/setup` imports no Angular, and the group
  needs the TestBed environment initialised first. Documented as the Angular half of strict, to
  call in the same setup file — on a 1759-file Angular consumer it found real defects in 25 files
  and 324 tests at no measurable cost (12.5 s against 13.4 s).

- [~] **Grading `process.stdout` / `process.stderr` writes and jsdom's virtual console.** Not
  watched: neither goes through the console Vitest intercepts, so neither is attributed to a test
  the guard could fail. A suite that wants jsdom's errors graded routes `jsdomError` to
  `console.error`.

## Field findings — repository reconnaissance, 2026-09-10

A static pass over the same consumer's 1759 spec files, asking "what is written here and does
nothing" rather than chasing a failure. Numbers are that pass's; the rules reproduced them
independently, which is the check worth having. What shipped is in `CHANGELOG.md`; what was
deliberately left out is here.

- [~] **An autofix for `no-dead-schemas`, and per-call reporting.** Neither, on purpose. The repair
  is "delete the line and the import", and dropping an import is the one edit that turns a lint
  pass into a compile error when something else still uses the name. Not per-call either —
  Angular merges successive `configureTestingModule` calls, so the file decides. The rule found
  230 entries in 204 files.

- [~] **A lint rule for shadowed providers**, pairing `x.component.spec.ts` with `x.component.ts` and
  reading the decorator statically. Not shipped beside
  `enableAngularDiagnostics({ shadowedProviders })` / `assertNoShadowedProviders`: it would have
  to resolve an import to a sibling file, which no rule in this plugin does — and the runtime
  check answers the same question from evidence rather than from a naming convention. Worth
  revisiting only if a project reports the diagnostic being too late to be useful.

- [~] **Inheritance and merging for `registerAutoSpyDefaults`.** Not shipped: a subclass inheriting
  its base's registration, because it would let one setup line change doubles in files nobody was
  looking at. Not shipped: merging two registrations of the same class — the second replaces, so
  the drift the API removes cannot reappear inside it.

- [~] **Two simpler typings for the table form of `registerAutoSpyDefaults`.** Both compile every
  table, which is the one thing the form must not do. `Array<[ClassType<unknown>,
ClassSpyConfiguration<unknown>]>` checks nothing — a configuration names keys _of its class_,
  and no two instantiations unify, so widening the row to a common type gives up the checking the
  form exists for. Putting the row check on the **parameter**
  (`entries: Entries & AutoSpyDefaultEntries<Entries>`) fails for a subtler reason: the relation
  TS uses to _choose_ an overload defers the conditional and accepts a wrong key, though a
  single-signature function catches the same call. The check therefore lives in the **constraint**,
  where it is instantiated after the overload has been chosen. Both were written and both silently
  accepted a key the row class does not have; `src/type-tests/spy-defaults.test-d.ts` is what
  keeps a third one from landing.

- [~] **Warning when a registration names a member no prototype carries.** Nothing does, for the same
  reason the call-site lists do not: the option exists to name instance fields, and telling a typo
  from one is not decidable.

- [~] **A provider that replaced nothing** (`{ provide: 'LOCALE_ID', useValue: 'ru-RU' }` against the
  real `LOCALE_ID` from `@angular/core`). Checked and **not folded** into `shadowedProviders`:
  that check compares a registered _double_ with what the component resolved, and this provider
  is not a double, so there is nothing to compare. The general form — "declared, and nothing ever
  asked for it" — needs to know whether a token was injected, which Angular does not report. No
  dedicated rule either: one occurrence in the repository, already removed, and a rule on one
  finding is a rule that gets switched off. Revisit if a second shape of it turns up.

## Field findings — consumer suite hardening, 2026-09-09

Reported from the same consumer while a batch of specs was being moved onto `provideAutoSpy` /
`injectSpy` and its type suppressions removed. Everything was reproduced in this repository before
it was changed; what shipped out of it is in `CHANGELOG.md`, what was deliberately left out is here.

- [~] **Re-applying a `mock*Prop` patch on every test.** It is the fix that "a patch made outside a
  per-test hook expired after one test" looks like it wants, and it would defeat what
  `restoreMockedProps()` exists for — a patch that puts itself back per test outlives its file
  under `isolate: false`, and "the file this patch belongs to" is not something the journal can
  see. The report graded by `propsOutsideHooks` is what shipped instead.

- [~] **Detecting that same shape without `setupAutoSpy`.** Nothing does: without its `beforeEach`
  there is no epoch to compare against — and without the sweep the patch stays put, so there is
  nothing to report either.

  Both entries above are still the decision, but one clause each has been overtaken and should not be
  re-derived from. 5.21.0 stamps every journal entry with the spec file that recorded it, so "the file
  this patch belongs to" **is** now something the journal can see; and the patch staying put is what
  the cross-file report reads, so there is something to report after all — just not the outside-hook
  shape, which still needs the epoch. What neither buys is re-applying a patch per test, which remains
  declined for the reason given: it defeats `restoreMockedProps()`.

- [~] **A diagnostic that recognises `restoreMocks: true`** and fails with a message. It was the
  other candidate against accessor spies not surviving that flag, and it is the wrong one: it
  would report a breakage where there is no longer one to report, now that the Vitest and Rstest
  adapters install accessor spies by redefining the property instead of through the runner's
  `spyOn`. The diagnostic that stays is the one for the failure nothing can repair — a
  non-configurable property.

- [~] **`no-inject-before-override` following a helper of the consumer's own** that wraps
  `TestBed.inject`. Not shipped: that needs cross-file resolution, and the rule's whole guarantee
  is that it decides from one file. `injectSpy()`, `renderShallow()` and
  `TestBed.runInInjectionContext` it does read.

- [~] **A paired helper for reaching a private member.** Not shipped beside
  `no-private-member-access`: it would legitimise exactly what the rule reports, and the repair
  is a design question rather than a mechanical one. Also not shipped: a syntactic fallback when
  no program is configured — measured at 37 % false positives on the consumer's corpus, which is
  the level at which a rule gets switched off and takes the real findings with it. And
  deliberately not relying on the neighbouring props that happen to exist in that consumer
  (`as any` banned by its lint config, `as unknown as` being weeded out separately): the next
  repository has neither and the escape survives.

      three literals in one `providers` array give three reports, twenty give twenty, and the
      before/after of converting one differs by exactly the one converted. What is real is the
      opposite shape — four forms the rule is silent on *by construction* (a double a helper call
      built, one imported from another file, `vi.fn()`s behind a function boundary, `multi: true`),
      so a zero is a statement about forms rather than about the repository. **Measured** on the
      consumer's 1759 spec files: the rule reports 0, and behind that zero sit **56 providers in 40
      files** it cannot classify — 27 whose `useValue` comes from an unknown call, 29 from an import.
      A further 94 come from one of this library's own factories, which is the shape the rule asks
      for. The other two blind forms do not occur there at all: `vi.fn()` behind a function boundary
      and `multi: true` are both **0**. Worth an option that reports an unresolvable `useValue`
      identifier as "cannot see this one"? Probably not: it would fire on every
      `useValue: someImportedConstant`, and the sample shows most of those are data fixtures
      (`ENVIRONMENT_MOCK`, `MockAccount`) rather than service doubles.

- [~] **"`provideAutoSpyForToken`'s second argument silently yields a non-spy."** Checked and **not
  reproduced** as a silent failure. A data value where the type declares a method does not
  compile — `DeepPartial<T>` narrows a function member to `T[K] | ((...args) => ReturnType<T[K]>)`
  — and a plain arrow seeded there fails loudly at the assertion with the runner's own "received
  value must be a mock or spy function". No change made; a warning on a seeded non-mock function
  was considered and rejected as noise on a legitimate use.

## Field findings — consumer monorepo merge, 2026-08-29

Reported from a consumer, not from this repo: merging four months of `master` into an Angular
monorepo whose suite (1 725 spec files, 12 152 tests) had already moved to Vitest. Thirty-one specs
arrived in Jest style and had to be converted by hand, which is what surfaced these. Each one below
was hit and reproduced there; none is reproduced in this repo's own tests yet, so treat the
file:line references as pointing at _this_ library's code and the error text as evidence from the
consumer. Docs for the migration half of this list have landed in
`docs-site/migrating.md` ("Reading a spy back out of the container", "The type names", and three
new rows in the no-twin table).

- [~] **The `Cannot redefine property` guard covers this library's own seam only.**
  `lib/mock-adapter.ts:107` catches the `TypeError` out of `spyOnGetter` / `spyOnSetter` and
  re-throws it naming the target, the reason the property is locked and `DOCS_LINKS.realSeam`,
  which is the whole of the fix that shipped. It sits on one path. A consumer's own
  `vi.spyOn(barrel, 'export')` never enters this library and still throws the bare
  `TypeError: Cannot redefine property: injectDomainMetrics`; and `mockReadonlyProp` /
  `mockValueProp` call `Object.defineProperty` directly (`lib/prop-mock.ts:190`, `:238`) with no
  guard of their own, so the library's _own_ prop helpers hand back the unhelpful text the
  adapters no longer do. Wrapping those two is a few lines and closes the inconsistency; the
  hand-written `vi.spyOn` case needs a different channel entirely, since nothing of ours runs.

      **The prop-helper half shipped 2026-08-30.** `CANNOT_REDEFINE`, `describeSpyTarget` and the
      explanation itself moved to `lib/redefine-failure.ts`, and all four `mock*Prop` helpers now go
      through one `applyPatch` that uses it — so the library's own helpers no longer hand back the
      text its adapters stopped handing back. The fix turned out to have a second half nobody had
      noticed: `rememberProp` recorded the patch **before** applying it, so a refused define left an
      entry in the undo journal for a patch that never happened, and the next `restoreMockedProps()`
      reported a teardown failure for it — one confusing message becoming two. The journal is now
      written after the define succeeds. Compensating instead (calling the undo on failure) is the
      shape to avoid: it writes the original descriptor back to the property that has just refused a
      write, so it throws in turn and replaces the diagnosis with its own error.

      **Still open, and unchanged:** a `vi.spyOn(barrel, 'export')` written by hand in a spec never
      enters this library, so nothing here can improve that message.

- [~] **Making the _silent_ `vi.mock` half loud.** Investigated and declined, rather than left
  pending. A `vi.mock` factory is lazy by design, so "the factory has not run" is
  indistinguishable from "the module has not been imported yet" — any check would fire on every
  correct-but-not-yet-exercised mock in the file, which is most of them at the moment a spec
  starts. `assertMocked(ns, …)` already produces better evidence, at the one point where the
  answer is knowable: after the import the caller cares about.
- [~] **A lint rule for `mockImplementation()` with no argument.** Shipped instead as the codemod's
  `mock-implementation-arity` transform (`src/cli/codemod/transforms-jest.ts:222`), which is the
  right shape for it: a rule fires only in suites whose compiler already reports `TS2554` for the
  same call, and is absent from exactly the suites with no type gate, which are the ones that
  need it.
- [~] **`stubConstructor` was not found by the two people who needed it.** Not a defect — the helper
  exists, its docstring covers the `isolate: false` restore that a hand-assigned global gets
  wrong, and `migrating.md` has the row. It was still hand-rolled twice from
  `TypeError: () => { … } is not a constructor`, because that text appears in neither. Cheapest
  close: quote the error verbatim in the constructor-doubles page, and name `Image`, `Worker`
  and `WebSocket` beside the observers in the `stub*` family listing. The same trick would help
  `no-done-callback`, whose first symptom under a type gate is `TS2349: This expression is not
callable. Type 'TestContext' has no call signatures.` — text the rule's own description shares
  no words with.

- [~] **Nothing in this repository tests the types it exports, and that is what shipped the
  `expectEmission` regression.** `npm run typecheck` is `tsc --noEmit` over the sources: it proves
  the library compiles, never what it _infers_ for a caller. The single-signature
  `expectEmission<T>(source$: SubscribableLike<T>)` paired with rxjs 7's trailing positional
  overload and inferred `unknown`; every internal test passed, because `resolves.toBe(1)` passes on
  a `Promise<unknown>` too. The consumer found it — 48 `TS2339`/`TS2488` errors that failed a CI
  job — and the fix (a leading callback-shaped overload) is already in. What is still missing is the
  thing that would have caught it here: `expectTypeOf` / `assertType` cases under Vitest's
  `typecheck` mode. A grep for either across `src/` returns **zero** hits today. The set worth
  pinning is small and mechanical — `expectTypeOf(expectEmission(of(1))).resolves.toBeNumber()`,
  the same for `expectEmissions`, `expectError`, `expectCompletion`, plus `Spy<T>` assignability
  and the `Mock<(a: A) => R>` argument order — and it belongs in `npm run check`, next to the
  coverage gate.

  **Done, partly.** `src/type-tests/{emission,spy}.test-d.ts` now pin the emission helpers (both
  shapes the regression took: reading a field off the awaited value, and destructuring it) and
  `createSpyFromClass` / `asInstance` / `createAutoMock`; `vitest.types.config.mts` and
  `tsconfig.types.json` run them, `npm run test:types` is in `npm run check`, and
  `CONTRIBUTING.md` says a helper whose value is its type needs one. 14 cases, no type errors.
  They live outside `src/lib/**` on purpose — inside it they would land in `coverage.include`
  and fail the 100% threshold with files that are never executed.

  **Still open:** the rest of the surface has none — `mockDeep` / `DeepMockProxy` assignability,
  `provideAutoSpy` and `injectSpy` on the Angular entries, `calledWith`, `Mutable<T>`, and the
  `Spy<T>`-in-argument-position case `no-mocked-for-spy` exists to rescue. Worth adding one case
  per helper as each is touched, rather than in one sweep.

## Field findings — 122 specs off `jest-auto-spies`, 2026-09-09

Eight items reported from a consumer, by eight agents converting 122 Angular specs off
`jest-auto-spies` against 5.0.1. Every one was reproduced **here** before anything was changed, with
this repository's own fixtures, and three of the eight did not survive that — recorded because a
finding that evaporates is worth as much as one that lands, and the same three will otherwise be
reported again.

Did **not** reproduce, and why:

- **"`provideAutoSpy` cannot seed a data property."** `ClassSpyConfiguration.overrides` has taken
  property seeds since 3.5.0 and `provideAutoSpy` forwards the whole configuration. Proved with a
  runtime test. What was true is that nothing said so where a reader would look: the parameter is
  named `methodsToSpyOnOrConfig`, its JSDoc example showed only `methodsToSpyOn`, and the lint rule
  that reports the `useValue` literal described the class factory as spying methods and stopped.
  All three now name `overrides`.
- **"`prefer-create-spy-from-class` recommends the one constructor that cannot work on a
  declaration-only abstract class."** `createSpyFromClass(LocalStorage)` on
  `abstract class LocalStorage extends AbstractStorage {}` produces a working double — the
  empty-prototype fallback covers exactly that shape. The **partially** abstract class is the real
  case, it is documented, and `fillMissing` is the answer. Both probed.
- **"`provideAutoSpy` / `injectSpy` are not on the root entry"** as a gap. They are not, deliberately,
  and the split is the first diff on `docs-site/migrating.md`; `doctor`'s `helper-from-wrong-entry`
  finds every miss in a suite at once. The migration page now says so where the diff is.

- **`invocationCallOrder` across the two spy families gives a wrong verdict** — reproduced, pinned,
  **not** made comparable. `lib/fast-spy.ts` keeps `invocationCallCounter`; `@vitest/spy` keeps its
  own at `dist/index.js:311`, a module-private `let` that is neither exported nor advanced by
  anything outside it. So `toHaveBeenCalledBefore` across one of each answers from two sequences that
  never met — and answers, rather than failing. Under `jest-auto-spies` the question did not arise:
  both halves were `jest.fn()`. Measured in the converted suite as `[164, 165, 167, 168, 169]` beside
  `[28]` for a call in the same test; reproduced here with three warm-up calls, which is all it takes
  to invert the verdict.

  Four ways to make them comparable were considered and all four are worse than the switch that
  already exists:
  - **Read the runner's counter.** It is not reachable. Nothing in `@vitest/spy`'s export list
    touches it.
  - **Sample it by calling a throwaway `vi.fn()` on every auto-spy call.** That is a runner-mock
    invocation per call on the hot path the fast spy exists to avoid, plus an unbounded `calls` array
    on the sampler. It is `setSpyEngine('runner')` with extra steps and worse memory.
  - **Anchor the two scales once, at startup.** They diverge again on the next call of either family;
    an anchored pair produces ties, not orderings.
  - **Wrap `vi.fn` so both families feed one counter.** Patching a runner global for every consumer,
    to change the meaning of a field two matchers read. Not this library's business.

  What is left is where it was made loud: `AGENTS.md` now says "wrong" rather than "meaningless" and
  carries the measured numbers, `docs-site/migrating.md` has a row and a section (it had nothing, and
  it is the page a reader is on when the assertion silently changes meaning), and two tests pin the
  divergence. A fifth option — overriding `toHaveBeenCalledBefore` / `toHaveBeenCalledAfter` through
  `expect.extend` so a cross-family comparison **throws** — is the only one that would catch it
  without a doc, and it is a real option: the library already installs matchers from five modules. It
  is not taken here because it replaces a runner built-in for every consumer of `setupAutoSpy`, which
  is the maintainer's call and not a doc-shaped one. Recorded so the trade is not re-derived.

- [~] **`injectSpy(Service)` inferring `Service<{}>` instead of the generic's declared default.** Not
  this library's to fix, and measured rather than argued: TypeScript instantiates a generic
  class's own type parameters to their **constraints**, not their **defaults**, in every
  inference position. On tsc 5.9 both `f<T>(token: new (…) => T): T` and
  `g<C extends abstract new (…) => unknown>(token: C): InstanceType<C>` yield `Service<{}>` for a
  class declared `Service<T = Defaults>`. No signature this package could write changes that; an
  explicit type argument is the only fix, which is what `injectSpy`'s docstring already says.

Left as proposals, deliberately:

- [~] **Narrowing `prefer-provide-auto-spy` to skip a literal whose `vi.fn()`s all sit below the
  first level** (`{ headers: { get: vi.fn() } }` behind a request token). The premise checks out
  — `createAutoMock<T>()` makes every accessed key a function spy, so `req.headers` is a spy and
  `req.headers.get(…)` reads a property off one — but the conclusion does not follow: the second
  argument expresses it exactly (`provideAutoSpyForToken(REQUEST, { headers: { get: vi.fn() } })`,
  seeded verbatim), and `mockDeep` is the other answer. So the message gained the nested case
  instead. Weakening a rule on one report, when the recommendation it makes is reachable, buys a
  false negative for every genuinely nested service double.
- [~] **A lint rule for `helper-from-wrong-entry`.** Still the `doctor` check only. The reason on
  record — resolving a name to an entry needs the installed version's own export map, which a
  per-file linter has none of — is unchanged by this report, and the table is generated
  (`src/cli/checks/export-map.generated.ts`), so a rule _could_ carry it. What would decide it is
  evidence that the miss survives a type gate; every instance in this report was found by `tsc`.
- [~] **A `writableProps` option on `createAutoMock`.** The narrower form of the `readonly` fix — keep
  the modifier, drop it for the seeded keys — cannot be written in TypeScript for the call shape
  that needs it. It would take inferring the seed's type into a second type parameter, and
  supplying **any** explicit type argument turns inference off for all of them: the ubiquitous
  call is `createAutoMock<AuthorizationService>({ … })`, which would fall back to the default and
  seed nothing. That fact is measured and still holds. What no longer follows from it is the
  wholesale form: stripping `readonly` from `Spy<T>` and `DeepMockProxy<T>` shipped briefly and
  was reverted, because an assignment to a _spied accessor_ is silently inert — the write lands
  on the setter spy while the getter keeps answering `undefined`, so a loud `TS2540` fixable in
  one line became a green test asserting nothing. `mockValueProp` is the answer instead, and it
  needs no new option and no new type: `readonly` does not take a key out of `keyof T`, so the
  checked overload already accepts the member, and `defineProperty` makes the value readable
  where `[[Set]]` — plain assignment, `Reflect.set` and `Mutable<T>` alike — does not.

## Timeout budgets — closed 2026-08-30, and the one part that stays out of reach

Reported from the same consumer monorepo. Jest resolves **one** budget for a hook and for a test body
(`hook.timeout || getState().testTimeout` and `test.timeout || getState().testTimeout`, both in
`jest-circus/build/index.js`); Vitest resolves `hookTimeout` separately and defaults it to 10 000 ms.
A migration that carried the preset's single `testTimeout: 30000` into the runner config and stopped
there gave every hook a third of the budget its tests got — and Vitest files a `beforeEach` timeout
against the **test**, with the test's duration pinned at the limit, so the log reads
`× should create 10045ms`: a slow test whose body never ran.

Shipped as `setupAutoSpy({ hookTimeoutHint })` (on by default), plus `frozenClockHint` for the other
half of the same seam. What was established by probe rather than assumed, and is worth not
re-deriving:

- The error is on `context.task.result.errors` by the time `afterEach` runs, and appending to its
  `message` shows up in the reporter's output. A `beforeEach(fn, 300)` probe produced
  `× first test 303ms` and `Hook timed out in 300ms.`
- **`beforeAll` is out of reach and always will be.** Its timeout is reported as a failed _suite_,
  every test is marked skipped, and no `afterEach` runs at all — there is nothing to annotate from
  inside the runner. A reporter could, and the builder overrides `reporters` in the one configuration
  that needs it most.
- There is **no public read** of the resolved config. `vi.setConfig` writes `hookTimeout` at runtime
  and nothing reads it back; the exports of the installed `vitest` were enumerated rather than
  assumed. `globalThis.__vitest_worker__.config` is the only source, so `readRunnerTimeouts` reads it
  defensively and returns `undefined` on any shape it does not recognise.
- A spec whose own `afterEach` calls `vi.useRealTimers()` defeats `frozenClockHint`: hooks run in
  reverse registration order, so the clock is real again by the time the hint reads it.

- [~] **One more Jest/Vitest budget difference, reporting-only and not acted on.**
  `slowTestThreshold` is `5` in Jest (**seconds**, `jest-config`) and `300` in Vitest
  (**milliseconds**), so a migrated suite starts marking most of its files slow. Nothing fails, so
  there is nothing to annotate; it is documented in `docs-site/migrating.md` and that is probably
  the whole of the answer. `teardownTimeout` has no Jest counterpart at all and is not on the
  serialized worker config, so it cannot be read from a setup file either way.

## Coverage under a bundling builder — closed 2026-08-30, and what stays out of reach

Reported from the same consumer monorepo, where the suite runs over a bundle built by
`@angular/build:unit-test`. Three findings arrived; two became `doctor` checks and the third was
written off as a Vitest internal nobody outside Vitest could fix — which turned out to be false,
and the correction is the largest number in this section.

Shipped: `coverage-all-removed` and `coverage-include-misses-bundle`
(`src/cli/checks/coverage-config.ts`), the `Coverage under the unit-test builder` section on the
Angular page, and one row plus a paragraph on the migration page. What was established by probe or
by reading the installed sources, and is worth not re-deriving:

- **`coverage.all` is gone in Vitest 4.** Not in `coverageConfigDefaults` (enumerated on 4.1.9), and
  the pass over untested files is driven by the presence of `coverage.include`. Probed both ways on
  a three-file fixture: with `all: true` and no `include` the unimported module is absent from the
  report; with `include` and no `all` it is there. No error either way.
- **Coverage is matched twice.** `@vitest/coverage-v8` 4.1.9 calls `isIncluded` on the executed
  script's URL (`dist/provider.js:247`) before any remap, and again on the remapped source path when
  `excludeAfterRemap` is on (`:61`). `@angular/build` 22.1.3 forces that flag on
  (`src/builders/unit-test/runners/vitest/plugins.js:415`) and prepends `spec-*.js`, `chunk-*.js` to
  the target's `coverageInclude` (`:421`) — which is why a list written in the **runner config**
  instead loses every counter on the first pass and reports nothing.
- **Order in the list is irrelevant**, presence is not. `isIncluded` calls
  `pm.isMatch(filename, glob, { contains: true, dot: true, ignore })` with the array, so any pattern
  matching wins. The builder writing its two globs first is a convention, not a requirement.
- **`coverage` inside a `projects[]` entry is ignored silently** — probed on 4.1.9, no warning. It
  is not the mechanism behind the finding above (the builder passes the runner config to Vitest as
  the root config as well), but it is the next place a reader looks.

- **istanbul is incompatible with `coverage.include` under this builder.** The untested-files pass
  resolves through Vite rather than through the aliases the builder supplies, so the first aliased
  import ends the run (`Failed to resolve import "@workspace/…" from "…?vitest-uncovered-coverage=true"`,
  and the package named changes between runs). `v8` drops what it cannot parse with a warning
  instead — 184 files of 4969 — and stays green. Reported with one clean series of four runs:
  istanbul 113 s and `v8` 81 s without `include`, `v8` 250 s with it, istanbul `exit 1` with it.
  The 169 s that `include` adds there is not the untested-files pass, which is what it looks like
  from the outside; see the `isIncluded` bullets below, where the same surcharge is measured
  operation by operation and then removed.
- **Narrowing the scope is not only about speed.** In that series the cobertura report is 10.78 MB
  (istanbul) / 10.79 MB (`v8`) without `include` and 8.89 MB with it, against GitLab's 10 MB parse
  limit — over which the report is dropped silently: green job, percentages in the log, no line
  highlighting in the merge request.

- **`isIncluded` is where a narrowed scope actually spends its time, and it is replaceable from
  outside Vitest.** Profiled with `DEBUG=vitest:coverage` on shard 1/4 of the 1725-file suite, scope
  of 124 include globs plus 304 negations already glued into brace expressions:
  `Generate coverage total time 224.2 s`, split as 2.6 s to read the 432 workers' coverage files,
  54.3 s before the first conversion, 50.5 s to remap the 1958 covered files, **0.35 s** for the
  pass over the 458 untested ones — and **114.1 s in the final `coverageMap.filter`**, a loop whose
  whole body is one `isIncluded` call per file. Timers around the map operations on shard 1/16 name
  the cost directly: 8000 `isIncluded` calls take **167 853 ms** against 1 808 ms with a compiled
  matcher, `coverageMap.filter` 81 393 ms against 713 ms, the untested pass over 1816 files
  69 779 ms against 9 439 ms. None of that is coverage work. It is `picomatch` compiling 428
  patterns again for every filename, because `globCache` memoises the _verdict_, keyed by filename,
  and never the matcher.
- **The fix is a coverage-provider wrapper in the consumer's config — no Vitest patch, no glued
  globs.** `coverage.provider: 'custom'` plus a `customProviderModule` that re-exports
  `@vitest/coverage-v8` and, in `getProvider()`, overwrites the returned provider's `isIncluded`
  with one that builds `pm(include, { contains: true, dot: true, ignore: exclude })` once and
  reuses it. On the same real shard 1/4 with the same reporters the Vitest phase drops
  **229.59 s → 22.88 s**, 432/432 files both ways, cobertura 8.0 MB both ways, and the report does
  not move: `Statements 41.77 %`, 27 292/65 325 before and 27 289/65 325 after — same denominator,
  three statements of the shared environment's ordinary drift. On the same globs over 200 distinct
  paths the stock `pm.isMatch` costs 1.13 ms per file and the compiled matcher 0.018 ms, with
  identical verdicts on every path.
- **The trap that makes a correct wrapper measure as zero.** The first version delegated
  `allowExternal: false` back to the original method "to be safe" — and `@angular/build:unit-test`
  turns that option on, so every call took the slow path and the run came out at 227.6 s against a
  229.6 s baseline, which reads as "the idea does not work" rather than "the fast path was never
  entered". Do the `allowExternal` test inline instead: two `startsWith` against the workspace and
  project roots. Delegate only the two cases the wrapper genuinely cannot answer — a `--changed`
  run, which selects by its own file list, and a config with no `include`, where there is nothing
  to compile. Two more mechanics worth not rediscovering: `getProvider()` runs before Vitest calls
  `initialize()`, so `provider.options` does not exist yet at swap time and the matcher has to be
  built lazily on the first question; and the filename must be normalised exactly as the original
  does it, `slash(cleanUrl(filename))` with both helpers from `@vitest/utils/helpers`, or the
  verdicts diverge on the paths the two forms disagree about. The provider's own `globCache` stays
  a cache and keeps working.

- [~] **A runtime notice from `setupAutoSpy` when coverage is on and the include list cannot
  match** — not implementable, and the reason is worth recording. The serialized worker config
  carries only `{ reportsDirectory, provider, enabled, htmlDir }` under `coverage`; `include`
  and `exclude` are not sent to workers at all (probed on 4.1.9 by dumping
  `globalThis.__vitest_worker__.config.coverage` from a spec). There is no public read either,
  so a setup file cannot see the list, and the report it would be wrong about is assembled in
  the main process after the run. The static check is the only honest place for this.
- [~] **Shipping the cached-matcher wrapper as library surface.** Still not shipped, but for a
  different reason than the one that stood here until 2026-08-30, and the old reason is
  recorded rather than quietly deleted because it is the kind of conclusion a reader
  re-derives: this entry used to say the cost lives inside Vitest, that "glue your globs" was
  the only workaround and a footgun at that, and that the item was worth revisiting only if
  Vitest accepted a cached matcher upstream. That verdict is **wrong**. A cost inside Vitest is
  not the same as a cost out of reach — `coverage.provider: 'custom'` is a supported seam, the
  provider object is an ordinary object, and 20 lines of consumer config bought 229.59 s →
  22.88 s on a real shard with a byte-identical report. Nobody has to wait for upstream and
  nobody has to hand-verify a glued glob list against the unglued one. What is still true is
  that this is not _this library's_ surface: it is a coverage provider, it has nothing to do
  with spies, it pins `isIncluded` — a method that is not public API — into a package whose
  users mostly do not run coverage over a bundle at all, and it would fail silently the day
  that method is renamed.

## `prefer-render-shallow` — shipped (Unreleased)

The twentieth lint rule: `TestBed.createComponent` in a file that never reads the template →
`renderShallow(X)`. Numbers from `bench-angular/baseline.json`, not hand-run.

Two defects the first consumer suite found, both fixed (Unreleased), both worth keeping in mind
before the whole-file heuristic is widened again:

- **A `DOCUMENT` stand-in read as a template read.** `{ querySelector: document.querySelector.bind(document), … }`
  put four of the fourteen `TEMPLATE_READS` words into the source, and the one spec in that repo
  rendering a template nobody reads was the one spec the rule never reported. Subtracted shape is
  `name: document.name` with the two names matching — a delegation and nothing else. Deliberately
  **not** an AST pass: property keys and `ObjectPattern` keys are the same node shape, so skipping
  keys would drop `const { nativeElement } = fixture` and turn an under-reporting rule into a
  wrong one.
- **`'never'` reported the `'as-needed'` wording.** A policy that does not ask about reads printed
  "nothing in this file reads either", on a spec with thirty-five `querySelector` calls. Third
  message id, not a data placeholder in the first: the two findings share a rewrite, not a claim.

What it deliberately does **not** do, so the next person does not re-derive it:

- **A suggestion, never a `--fix`.** `renderShallow` calls `configureTestingModule` itself, adds
  `NO_ERRORS_SCHEMA` and runs the first change detection. Applied unattended across a repository that
  changes what the module holds, and throws outright on a spec that had already instantiated it.
- **No second rule for the strict reading.** `no-template-rendering` was built and then folded into
  `{ templates: 'never' }`: the plugin's contract is that every rule ships in `recommended` switched
  on, and a policy nobody in the project agreed to cannot be one — the cost finding itself only earns
  a place there as a `warn`, and `'never'` would aim that warning at every component spec. As an
  option it is a project's choice, which is what it always was.
- **Nothing can hide the coverage it costs.** With `templateUrl` the compiled template already maps
  back to the `.html` and never entered a `*.ts` coverage glob. What `'never'` stops executing is the
  component's own TypeScript — a method whose entry condition is a `viewChild` the template supplies.
  There is no coverage setting that excludes that, and the docs say so rather than implying a knob.
- **It cannot see the component.** `viewChild`, `contentChild`, content projection and a `@defer`
  block all need the template, and the rule reads the spec. The answer is `{ keepTemplate: true }`,
  which still drops the children — 3.8× dearer than a blank template, but well under a full render.

## Considered & intentionally skipped

- [~] **Merge the three `as any` mock casts** (`asVitestMock` / `asBunMock` /
  `asNodeMock`). Each casts to a _different_ concrete mock type and carries a
  runtime-specific eslint-disable rationale; a shared generic `castMock<T>`
  would erase that locality for one saved line. jscpd reports 0 clones —
  below threshold. Left as-is.
- [~] **Split `lib/types.ts` per `.claude/rules/ts-files.md`** (one
  `.type.ts` / `.interface.ts` per declaration). That rule targets app code;
  `types.ts` is this library's curated public type barrel and re-exported via
  `export type * from './lib/types'`. Fragmenting it would churn the public
  surface for no consumer benefit. Skipped deliberately.
- [~] **What `restoreWebStorage()` deliberately leaves out.** No `StorageEvent`: the stand-in is a
  `Map`, and firing events from it would be a behaviour the environment it stands in for does not
  offer in the same way. No per-test reset — the repair runs once, so a broken runtime and a working
  one leak between tests identically, which is the point; a suite that wants a clean storage per
  test clears it in a hook of its own. No quota, no `key()` ordering guarantees beyond insertion
  order. And no repair at all in a `node` environment: inventing a Web Storage there would hand the
  code under test an API the real runtime lacks.

## Performance pass (Unreleased)

- [~] **Micro-optimising `createFunctionSpy`.** Measured before deciding: `vi.fn()` alone is 1.3 µs
  (p75) and the full `createFunctionSpy` is 1.9 µs, so _everything_ this library adds per method
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

### Second pass — measured 2026-08-29

Harness: `src/lib/**` bundled with an adapter identical to `vitest-adapter.ts` except `vi.fn()` is
`@vitest/spy`'s `fn()`, so the core runs under plain `node --expose-gc`; memory-critical claims
re-verified inside real Vitest. Node 24.19.0, Vitest 4.1.9, repo at v3.4.0.

The frame for everything below: on this repo's own 63-file suite, instrumented at build time, both
factories together cost **13.8 ms of a 1.32 s run — 1.0% of wall clock, 0.07% of aggregate work**
(`createSpyFromClass` 4.7 ms / 117 calls, `createFunctionSpy` 9.0 ms / 186 calls). **No item here
may be argued on suite wall time.** The arguments are memory, pathological input, and per-file
import cost.

- [~] **A bundle-size reduction pass — the named lever was taken 2026-09-04; what is left is
  recorded below so it is not re-proposed.** The pass opened against the de-chunking that had just
  landed, which bought **−0.8 to −1.0 ms per spec file for +120 kB of `dist`**, so the first task
  was not a lever at all: put install weight and per-file import cost into comparable terms.

      **The rate exists now — measured 2026-09-03, and it is nothing like linear.** Same harness as
      the subpath split (one process per sample, `vitest` imported first, medians of interleaved
      pairs), three points on the curve:

      | lever | `dist` JS | per spec file | kB per ms | verdict |
      | --- | ---: | ---: | ---: | --- |
      | de-chunking `index` + `angular` | **+120 kB** | −0.8…−1.0 ms | ~130 | shipped |
      | `/dom-stubs` + `/diagnostics` split | −20.3 kB | −0.159 ms | ~128 | shipped in 4.0.0 |
      | `minifyWhitespace` + `minifySyntax` | −162 kB | −0.059 ms | ~2 750 | **reverted, see below** |
      | `minifyWhitespace` alone | −144 kB | −0.016 ms (27/50 pairs — **noise**) | — | reverted |

      So **which** bytes go matters twenty times more than **how many**. Removing a module the entry
      evaluates is worth ~130 kB/ms; squeezing the bytes of modules it still evaluates is worth
      ~2 750 kB/ms, because V8 compiles function bodies lazily and the cost that is left is module
      resolution and top-level execution, neither of which shrinks with formatting. Profiled on the
      root entry at 67 kB: **0.87 ms compiling, 0.29 ms top-level execution, ~1.1 ms** in Node's own
      resolver (`internalModuleStat`, `package_json_reader`, `resolvePackageTargetString`).

      **Minification is not on the menu at all, and the reason is not the supply-chain posture.**
      Built and measured 2026-09-03, then reverted the same day by `/release-audit`:
      `minifyWhitespace` deletes every `/* @__PURE__ */` annotation — **259 of them across 18
      files** — and those are written for the *consumer's* bundler. esbuild consumes them for its own
      tree-shaking and then drops them as comments; downstream, a module-level `new WeakSet()` or
      `Symbol.for(…)` stops being provably side-effect free and is retained. Cost: `dist` −144 kB on
      disk, `/setup` min+gzip **10 585 → 11 816 B, +11.6 % in every consumer's bundle**.
      `minifySyntax` on top is neutral (11 809 B), so the whitespace flag alone carries it. This is
      the **second** time that same 1.2 kB has appeared on `/setup` — the first is recorded in the
      control-helpers entry of `CHANGELOG.md`, where the marks were added to get it back. A size cut
      is therefore not just an install-weight decision: the bytes that come off `dist` are also the
      bytes that tell a bundler what it may remove. Re-propose only with a `/setup` min+gzip number.

      And the speed side of this pass is close to exhausted: the modules still in the root entry are
      `create-spy-from-class` (13%), `expect-emission` (10%), `function-spy` (9%) and `args-map`
      (9%) — the API itself, not passengers. The levers already measured, so the pass does not restart from zero.
      `dist` is **735 535 B of deliberately unminified JS**, and `tsup.config.ts` refuses to
      minify — including whitespace, for the reason measured below. `README.md` + `AGENTS.md` are **187 847 B raw / 57 908 B gzip = 29.3% of every install**,
      of which `AGENTS.md` alone is **−12.6%** — measured, offered and declined below on "ship code
      with all surfaces" grounds; the number is real, the decision is not reopened by default. The
      four entries `rxjs`, `console`, `nestjs` and `setup` each gained **11–14 kB** from the pinned
      shared chunk, which is the cheapest thing here to re-examine. And splitting the API into
      subpaths is already measured and **rejected**: ESM re-export is eager, so the only way to stop
      evaluating a module is to stop exporting it.

      **What shipped: pin the state, not the code.** `expect-emission.ts` was never the stateful
      module — one `let defaultTimeoutMs = 1000` inside it was, and pinning the file dragged 10 002 B
      of pure helper into every entry that imports the shared chunk. Splitting the cell out
      (`src/lib/emission-timeout.ts`, which is now the `SHARED_STATE_MODULES` member) took
      `dist/shared-state.js` from **17 467 → 7 465 B** and **−10.0 kB off the module graph** of
      `/rxjs` (−33.8 %), `/jasmine-compat` (−44.5 %), `/dom-stubs` (−24.3 %), `/console` (−16.9 %),
      `/nestjs` (−11.3 %), `/jasmine` (−10.6 %) and `/setup` (−10.3 %) — none of which export an
      emission helper at all — plus −2.5 kB off each of the eight entries that do, because inlined
      into the entry it tree-shakes better than it did behind a barrel re-export. **No entry gains a
      module.** `dist` on disk +12.6 kB (+1.2 %), a dev-only duplication that never reaches a
      production bundle. `/setup` min+gzip moves 12 092 → 12 072 B — the number the minification
      lesson demands before any byte is touched, and it moves the right way.

      Two things measured and worth not re-deriving. **The ms side is at the harness's noise floor:**
      predicted 0.077 ms from the 130 kB/ms rate, measured medians −0.04…−0.13 ms against an A/A
      control that itself reaches ±0.156 ms. Quote the bytes, which are exact and deterministic; quote
      the time as "≈0.08 ms, at the resolution limit". And **the obvious version of this lever is the
      wrong one**: giving `expect-emission` its own pinned chunk buys the same 10 kB on the seven
      leaf entries but adds **+1 module to the root and to `/angular`**, the two entries every spec
      file loads — exactly the cost the de-chunking pass paid 120 kB to remove. Built, measured, and
      rejected. `serialize-args` (7 104 B, stateless) is now free to code-split as well.

- [~] **The rest of the pinned shared chunk stays as it is.** After the split
  `dist/shared-state.js` is 7 465 B holding `mock-adapter`, `package-identity`, `redefine-failure`,
  `observable-support`, `jasmine-support`, `docs-links` and the 0.3 kB timeout cell. The only
  partly-dead member left is `jasmine-support` — ~1.5 kB emitted, dead for `/rxjs`, `/dom-stubs` and
  `/angular-http`, reachable from every other entry. Pinning it separately would cost +1 module on
  the twelve entries that need it, including the root and `/angular`, for ~1.5 kB off three leaves.
  Re-open only with a lever that removes bytes **without** adding a module.

- [~] **De-chunking `index` and `angular` — shipped in `tsup.config.ts`, and both of its numbers
  were wrong.** Recorded rather than dropped, because the estimate is what the bundle pass above
  would otherwise reuse. **Cost:** the item predicted "≈ +70 kB of `dist`"; measured, it is
  **+120 kB of JS**, with the declaration output unchanged and byte-identical. **Benefit:** the
  claimed **5.9 ms/spec-file could not be reproduced** — under Node's native loader the measured
  win is **−0.8 ms/file** for the root entry and **−1.0 ms** for an Angular consumer. That is a
  lower bound rather than a refutation: the original figure was taken through Vitest, where every
  module additionally goes through Vite's transform. The measuring pass declined to claim the
  larger number, and nothing downstream should either. One design change fell out of it: a
  **fourth** stateful module, `expect-emission`, had to join the shared chunk — it holds a
  process-wide `defaultTimeoutMs`, and inlining it twice would have made `setEmissionTimeout()`
  from the root silently miss `expectEmission()` from `/angular`.

- [~] **Micro-optimising `createFunctionSpy`**, re-confirmed with fresh numbers rather than quoted
  from the previous pass. A materialised spy retains 4 794 B, of which **4 117 B is bare
  `vi.fn()`**: the three `spy-mark` brands are 125 B, the five helper methods 208 B, the
  dispatch closure 56 B. Everything this library adds is **677 B, 14%**. The `settledResults`
  polyfill costs **0 B on Vitest** — `NATIVE_RECORDER` is returned and no array is allocated,
  so there is nothing to remove. The lazily-built `calledWith` / `mustBeCalledWith` chains at
  ~1.2 kB and ~0.9 kB are the biggest items the library owns, which is why building them on
  first use was right.
- [~] **`lazySpies: 'proxy'` as the _default_.** Loses 158 B at width 5 with methods touched and
  taxes every read of every consumer 25 ns, to buy nothing on the narrow classes that are the
  majority.
- [~] **Splitting the API into `/dom-stubs` and `/diagnostics` subpaths** so the root entry stops
  evaluating the observer stubs and the run-diagnostics modules. ESM re-export is eager and
  Vitest does not tree-shake, so the only way to stop evaluating them is to stop exporting them
  — a breaking change. And it is the wrong lever: the `fat` variant proves the cost is per-module
  overhead, so subpath splitting buys ~0.1 ms/file where de-chunking buys more. The move is to
  split **less**, not more. (The ~5.8 ms/file this once quoted for de-chunking is the figure the
  correction above retired; the conclusion does not depend on its size, only on its sign.)
- [~] **Full de-chunking of all 14 entries** (20 since 4.0.0 added `/dom-stubs` and `/diagnostics`;
  both are standalone already, so the count below is the only part that moved)**.** 569 607 B of standalone ESM against the 140 970 B
  shipped at the time (**+429 kB**), undoing the previous pass, and it breaks the single-registry
  invariant. Only `index` and `angular` are worth the trade — and they have since been taken, so
  the baseline this compares against has moved by +120 kB and the remaining gap is that much
  smaller. Do not re-derive the delta from the two figures above without re-measuring both: the
  baseline moved twice again on 2026-09-03 (−20.3 kB from the subpath split, −162 kB from
  `minifyWhitespace` + `minifySyntax`), so `dist` is **572 742 B** now and both figures below predate
  all of it. **Partly superseded on 2026-09-17 — see "Three trades the audit round settled" at the
  top of this file.** `/setup`, `/node`, `/react`, `/vue` and `/svelte` went standalone: the
  single-registry objection expired with `dist/shared-state.js`, and the five entries were measured
  rather than derived from the numbers above. The rest of this item stands — the remaining entries
  stay chunked, and the rule is "solo for what a spec file loads every time".
- [~] **Optimising the `ArgsMap` exact map** — already optimal (flat 186–237 ns from 1 to 100
  configs; the `#arities` guard is the best thing in the file). Still true of the exact map itself;
  what changed on 2026-09-17 is which configs may enter it, and it gained a per-arity shape check
  that answers a miss without serializing at all — see the top of this file.

- [~] **Dropping `AGENTS.md` from `files`.** `README.md` + `AGENTS.md` are 187 847 B raw /
  57 908 B gzip = **29.3% of every install**, and dropping `AGENTS.md` alone is −12.6%. Measured
  and offered, not recommended: it is what an agent in a consumer repo reads with no network,
  and "ship code with all surfaces" makes keeping it a deliberate product decision.

## Migration wishlist — what remains, and the mechanism that stops it

Everything asked for by the 1688-spec migration is now implemented except the items below. Each one
names the thing that actually prevents it — a version, an API, a check — rather than a judgement.

- [~] **`mockModule('x', factory)` — one call doing `vi.hoisted` + `vi.mock`.** Re-checked against
  Vitest 4.1.9 rather than from memory. The mechanism: `vi.mock` is not a function call at
  runtime, it is a **transform**. `@vitest/mocker`'s `hoistMocks` walks the module's AST and
  moves _literal_ `vi.mock(...)` / `vi.hoisted(...)` calls above every import; the matcher keys
  on the callee being the `vi` (or `vitest`) identifier with the property `mock`. A call to any
  other function — including one this package exports — is not matched, is not hoisted, and runs
  after the imports it was supposed to intercept. There is no runtime API to register a mock
  factory for a specifier, so a wrapper cannot fall back to one either. What _is_ possible, and
  is shipped: `moduleNamespace(exports)` for the factory's return shape, `assertMocked(ns, …)`
  to prove the mock applied, and the `vi.hoisted` recipe in the docs. Revisit if Vitest ever
  exposes `mocker.register(specifier, factory)` at runtime.
- [~] **`prefer-as-instance` as a lint rule with an autofix.** Listed twice before — once as a field
  finding about the `TS2345` message that never says `asInstance`, once here as a mechanism note —
  and merged into one entry, because the deferral is now decided rather than pending. Verified
  against the plugin as it stands: `RuleContext` exposes only `sourceCode`, `options` and
  `report`, there is no `parserServices` and no `program` on it, and no rule file imports from
  `eslint` or from `typescript`. `Spy<T>` in a position that expects `T` is a _type_ relationship
  and cannot be seen in the AST, so the rule would need type-aware linting — which forces every
  consumer of `configs.recommended` to set `parserOptions.project` and pay a full type-check per
  lint run. If it is ever built it belongs in an opt-in `configs.typeChecked`, and it needs its
  own harness: `RuleTester` with a real `tsconfig` and files on disk, because the current tests
  lint strings through `Linter`, which has no program. Until then `asInstance` / `asInstances` is
  the answer to the cost of the repair, if not to finding it.
- [~] **A `toEqualRecords` matcher on top of `diffByField`.** Decided rather than pending, on the
  reason that stood here unchanged for two passes: `diffByField` is a plain function because it is
  reached for _after_ a failure, and a matcher would carry its own deep equality and compete with
  `toEqual` at every call site. Re-open only with a call site `toEqual` reads worse on.

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

## Angular performance — four candidate optimisations killed by measurement

Median of 60 reps, component holding a 100-row `@for` of a child component — the shape
`docs-site/core/performance.md` already benchmarks.

| Operation                                                                                     |    ms |
| --------------------------------------------------------------------------------------------- | ----: |
| Full per-test cycle: `resetTestingModule` + `configureTestingModule` + `createComponent` + CD | 1.933 |
| `resetTestingModule()` alone                                                                  | 0.003 |
| `resetTestingModule()` + `configureTestingModule()`                                           | 0.006 |
| `createComponent` + CD on an **already-configured** module                                    | 1.987 |
| `renderShallow`, full cycle                                                                   | 0.469 |
| `renderShallow({ keepTemplate: true })`                                                       | 1.074 |
| `configureTestingModule` + `overrideComponent` + `createComponent` + CD                       | 0.390 |
| `compileComponents()` on a standalone AOT bed                                                 | 0.137 |

- [~] **A `TestBed` configuration cache.** `configureTestingModule` is lazy — it records metadata and
  compiles nothing. Reset + configure together are **0.006 ms, 0.3% of the cycle**.
- [~] **Reusing a compiled TestBed across tests.** Creating the component on an already-configured
  module measured **1.987 ms against 1.933 ms** for the whole reset-and-reconfigure cycle —
  identical within noise. Worth stating publicly, because this is exactly what `ngMocks.faster()`
  sells: it publishes no benchmark numbers, documents that it leaks component state between
  tests by design, and silently disengages when a `beforeEach` creates a spy. On this shape the
  mechanism has nothing to win.
- [~] **Avoiding `resetTestingModule` per test** — 0.003 ms.
- [~] **`renderShallow` avoiding `compileComponents`** — already true (`grep -rn compileComponents
src` never hits `render-shallow.ts`), and on a standalone AOT bed it costs 0.137 ms once.

Where the time actually is: `createComponent` + first change detection, essentially all of it
building the child subtree — already measured in `docs-site/core/performance.md` (0.65 → 8.52 ms as
children go 0 → 400) and already fixed by `renderShallow` (4.1× here, 16.2× at 400 children).

- [~] **Shipping the `disableCodeSplitting` patch itself.** A consumer project solved the OOM by
  patching the installed `@angular/build` (`scripts/patch-angular-build.cjs`, postinstall,
  version-guarded on the schema), and the question is whether this package should ship that.
  **No — ship the diagnosis, not the mutation.** Four reasons. (1) The only way to make it
  automatic is a `postinstall`, which this repo has already rejected on supply-chain grounds —
  and a dev dependency that rewrites another package's files in `node_modules` is the most
  Socket/Snyk-alarming thing a test library could do, undoing the same posture that keeps the
  bundles unminified. (2) It is string surgery against `disableCodeSplitting: true,` at a fixed
  path, so any upstream refactor breaks it silently — the worst failure mode for a package whose
  selling point is that failures name their own cause. (3) Its lifetime is weeks: PR #33961
  lands the `splitting` option with splitting **on** by default, so from 22.1.7 there is nothing
  to patch, while this package would owe the code semver, docs and tests across Angular 21 and
  22 indefinitely. (4) Whether a workspace trades a 596 MB bundle graph for module mocking is
  the app team's call, not a test-double library's.

  **Shipped instead — three read-only pieces, no mutation.** The `doctor` check
  `angular-build-splitting-off` (`src/cli/checks/angular-build.ts:65`); the
  `docs-site/adapters/angular.md` section carrying the patch script verbatim with its
  "delete this from 22.1.7" note; and `angularBuildHint`
  (`src/lib/angular-build-notice.ts`), a one-shot runtime notice that recognises the builder by
  its own `vitest-mock-patch` marker, prints once per worker and is off with
  `{ angularBuildHint: false }`.

## `doctor` — a repository-level check for defects that never fail

`npx vitest-auto-spy doctor` ships. What every check has in common is that **nothing consumes the
result**: the run is green, and the only reader of a `tsconfig.spec.json` after Jest is gone is
somebody's editor. The long tail of the catalogue is in `TODO.md`; the tier below is the part that
was looked at and left alone.

- [~] **The `ts.parseJsonConfigFileContent` tier.** The shipped glob matcher is self-contained and
  zero-dependency; the consumer's own `typescript` via `createRequire` would be the authority on
  `extends` chains and on the extension set an `include` entry expands over. Two patterns are
  exempt today rather than resolved properly: a declaration-only glob and one rooted in a directory
  the scan never enters. Looked at again 2026-09-04 and left alone deliberately: keeping per-pattern
  attribution — the entire value of `tsconfig-glob-matches-nothing` — means invoking the consumer's
  compiler once per `include` entry on repositories with 150+ spec tsconfigs, and both tiers would
  have to be held at 100 % branch coverage with `typescript` unresolvable from a temp fixture. That
  is a redesign of a shipped, gate-covered check, not an addition.

`helper-from-wrong-entry` and `no-unawaited-helper` **shipped 2026-09-04**, and the table they
needed exists: `scripts/generate-export-map.mjs` compiles the barrels with the consumer's own
`typescript` and reads `checker.getExportsOfModule`, which is the only way to see through the
`export *` chains — 311 names over 20 entries, regenerated by `npm run export-map` and gated by
`export-map:check`, the same shape as `llms:check`. `AWAITABLE_HELPERS` comes out of the same
program: exports whose _every_ call signature returns a `Promise`. Version drift is handled at check
time rather than generation time — both checks go quiet when the installed major differs from the
table's, because a helper only moves between entries in a major. Over this repository's own 755
source files the pair reports exactly four findings, all of them fixture strings inside their own
spec. Neither has a fixer; `doctor` still never writes.

## Agent adoption — `init`, and what cannot work

Researched 2026-08-29 against current documentation, not memory. The goal: an agent working in a
project that merely _has_ this package installed writes tests with it, correctly, with no human
configuration.

**The honest finding first: there is no zero-setup path into any agent's instruction context.**
Every tool discovers rules from a fixed set of repo-root or dot-directory paths; none scans
dependencies. Specifically, `node_modules/**/skills/` is **not** one of Claude Code's four skill
discovery locations (enterprise, `~/.claude/skills`, `.claude/skills`, plugin), so the skill this
package ships in its tarball is never auto-discovered. Two channels _do_ work with no setup at all,
and both are already partly built:

- **Errors that name their own fix** — every throw ends with a `Docs:` link. An agent reads a stack
  trace far more often than a README, and this fires at the moment of the mistake in every tool.
  Already the best thing here.
- [~] **A postinstall message.** Ineffective and risky, and the trend is one-way: npm hides
  lifecycle output by default since v7, pnpm 10 blocks dependency scripts, Yarn Berry defaults
  `enableScripts: false` for third-party packages, and npm v12 (targeted July 2026) flips
  `allowScripts` off. npm's terms prohibit install-time advertising; `core-js` is the cautionary
  tale; and after the 2025 Shai-Hulud worms an install script in a dev dependency reads as a
  smell to Socket and Snyk — which would undo the same posture `tsup.config.ts` takes when it
  refuses to minify. Instead: first-run detection _inside_ the CLI ("no agent instructions found
  — run `npx vitest-auto-spy init`"), and `init --check` in the consumer's CI.
- [~] **Shipping an MCP server.** Every connected server costs context in **every** session; three
  servers measure ~55 000 tokens before the first user message. A docs MCP is a network
  round-trip and a permanent context tax to deliver a file that is already on disk, and its
  registration is _more_ setup than `init`, not less (Claude Code prompts on first use, and a
  committed `enableAllProjectMcpServers` is ignored until the folder is trusted). The valuable
  ideas behind it — `explain_error`, `review_spec` — are computations, and **a CLI is an MCP
  server that costs zero tokens and needs no registration**: every agent can run
  `npx vitest-auto-spy review <spec>`. Put that one line in the managed block. Revisit only if
  the MCP registry proves to be a real acquisition channel.
- [~] **Give four lint rules a fixer.** Closed, and recorded rather than deleted because its premise
  was false when it was written and would be believed again. "No rule declares `fixable` or
  `hasSuggestions` today" was already wrong: `no-mocked-for-spy` and `prefer-as-spy` declared
  `fixable: 'code'`, and `prefer-inject-spy`, `no-object-define-property` and
  `no-expect-in-subscribe` declared `hasSuggestions`. The fourth entry on its list — a
  wrong-entry-import rule — **cannot exist as a lint rule at all**, and listing it here
  contradicted this file's own two other mentions of it: resolving a helper to the entry that
  exports it needs a table generated from the installed version's own export map, which is
  precisely why `helper-from-wrong-entry` is scoped to the `doctor` CLI in both of the other places
  it appears in this file. What survives is the part that was always true and is now acted on:
  `eslint --fix` is the
  cheapest lever on adoption, because an agent converges on the library's idioms without reading a
  word of documentation — and `no-done-callback` must never carry one, since the rewrite depends
  on the body and a mechanical one turns a loud bug into a green test that runs even less of it.

### `doctor` — the catalogue, sharpened

The section above scopes five repository-level defects. A full pass produced **52 checks** in five
groups: 15 replaceable patterns, 10 silent-pass bugs, the 10 repository-level ones, 18
configuration/perf hints and 5 deprecation checks against this package's own history. Two are worth
naming because they are the ones a per-file linter can never do:

- **`helper-from-wrong-entry`** — `provideAutoSpy` imported from the root instead of `/angular`, and
  its siblings. A table lookup against the installed version's own export map: zero false positives,
  fully autofixable, and in a real suite it fires in hundreds of files.
- **`no-unawaited-helper`** — an unawaited `expectEmission` / `stable` / `flushEventLoop`. The proof
  that a doctor can beat a type-free linter _without_ a type checker: the callee is resolved through
  the file's own import of our export map. Name resolution, not inference.

Architecture notes that keep the zero-dependency invariant: parse with the **consumer's own**
`typescript` via `createRequire` (near-certain to be installed, and `ts.parseJsonConfigFileContent`
is the only trustworthy way to run the tsconfig-glob check), with `@typescript-eslint/parser` used
when present and a lexical tier as fallback — the parser is always the consumer's, never bundled.
Prove it with two `npm run check` invariants mirroring the zone.js one: `package.json` declares no
`dependencies`, and `node:fs` appears in `dist/bin/` and nowhere else. To drive all nine rules from
one walker, six of them need a mechanical refactor off esquery selectors onto bare node-type
visitors plus predicates — the pattern `rules.ts` already uses three times. **v1 ships read-only,
with no `--fix` at all**: trust before edit rights.

## Invariants

- **`zone.js` is a devDependency and only a devDependency.** Never a dependency, never a peer, not
  even an optional one. Everything about zones lives behind `vitest-auto-spy/zone`; no other entry
  reaches that module, even transitively, and the module imports no zone.js of its own — it reads
  `globalThis.Zone`, which the consumer loaded. Verified after each change to the entry list:
  `npm run build` then `grep -rl proxy-zone dist/` must name `dist/zone.js` and **nothing else** —
  not its `.d.ts`. The earlier wording here said "(and its `.d.ts`)"; verified against a pristine
  build, `dist/zone.d.ts` contains **zero** occurrences of `proxy-zone`, so a grep that comes back
  with two files means something has changed, not that the invariant holds.
  `npm run size:badge` must not move for `dist/index.js`, and `package.json` must
  still declare no `dependencies`. A convenient re-export from the root would hand zone.js to every
  zoneless consumer, silently.

## The `node:test` adapter and the name it prints

- [~] **`node:test` adapter ignores the `name` argument** — closed 2026-09-04, and the shape of the
  fix is worth keeping. `mock.fn()` takes no name argument at all (passing one throws
  `ERR_INVALID_ARG_TYPE`) and has no `mockName`; the returned proxy inherits the _implementation's_
  name, so every spy printed as `[Function: dispatch]`, this library's own dispatcher. The adapter
  now defines the method name on the mock as both `name` and `displayName` — own, configurable,
  non-enumerable properties, which survive `mock.reset()` / `restore()` / `resetCalls()` because all
  three only swap the implementation. That is what `node:assert` diffs, `util.inspect()` and
  `serialize-args` read. Still absent, and documented as such on the node runtime page:
  `getMockName()` does not exist there (read `spy.method.name`), and `node:test`'s own reporter
  never labels a mock.

## Reads of the field

- **Closest direct competitor: `jest-auto-spies`.** Same author lineage of the
  API. Its weakness is Jest lock-in; our entire reason-to-exist is carrying that
  exact ergonomics to Vitest/Bun/`node:test`. Keep the API a 1:1 drop-in (the
  README already pitches this) — that migration story is the moat.
- **Closest type-only competitor: `vitest-mock-extended`.** It mocks from a
  _type_ via a deep Proxy and is popular, but offers no return-type-aware
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
  objects (mock-extended's `mockDeep`). The other half of this line — a documented
  per-feature comparison table — is closed: `comparison.md` has been rewritten
  from 97 to 316 lines with the per-feature breakdown and the per-competitor links.

## Field re-survey — 2026-08-29

Registry data for the window 2026-07-29 → 2026-08-27, typings read from published tarballs.

**Correction — the "four of the seven rows" line was wrong and is retired.** Checked against the
page's actual seven rows: only `ts-auto-mock` and `testdouble` were ever rows there _and_ stale.
Spectator, moq.ts and `@fluffy-spoon/substitute` were never on that table at all, so the count could
not have been four. `comparison.md` now makes the stronger claim that is also true — **five of the
libraries it surveys last published more than a year ago, and a sixth's repository no longer
exists** — and that, not the feature comparison, is the line worth making. Repeat that wording, not
the old one. The per-library findings below stand on their own and are unaffected:

- **`ts-auto-mock`** is feature-frozen _by its author_ and explicitly does not work with esbuild or
  swc — that is, not with Vitest, Vite, Bun or the Angular builder. `comparison.md` says "no ttsc
  transformer to install"; the true statement is that it cannot run on a modern toolchain at all.
- **`@ngneat/spectator`** — 22.1.0, 2025-11-02, no release in ~10 months, and
  `github.com/ngneat/spectator` is **HTTP 404**: the org was wiped around 2026-06-05 with all issues
  and PRs, archived copy at `ngneat-archive/spectator`. Still 771 498 downloads/month. Three runtime
  dependencies, one of them **jQuery**. Its `lib/matchers-types.d.ts` declares `namespace jasmine`,
  so it drags the Jasmine global types into a Vitest project. Open and unmerged since 2026-07-16: it
  imports `BrowserDynamicTestingModule` from a package Angular 20 deprecated and no longer installs,
  so it errors on a fresh Angular 22 workspace. The `@openng/spectator` fork (1.0.1, 2026-07-10) is
  byte-identical plus an Angular 22 build, at 2.3% of the downloads.
- **`@fluffy-spoon/substitute`** last published 2021; **`moq.ts`** dormant since 2023.
- **`@golevelup/nestjs-testing`** is dead (0.1.2, 2019) — do not cite it as current.

Live pressure: `vitest-mock-extended` (5.44M/mo), `jest-mock-extended` (9.40M/mo),
`@golevelup/ts-vitest`, `ng-mocks` (2.50M/mo, healthy — 14.17.3 on 2026-08-24), sinon, and
increasingly Vitest 4 itself. **`@suites/unit` is missing from `comparison.md` entirely** and is the
most serious live competitor for the NestJS recipe (473k/mo, recommended by the NestJS docs). Its
limits are the contrast to draw: backend-only by its own description, `reflect-metadata` +
`emitDecoratorMetadata` mandatory, no Bun adapter, v4 in beta unreleased since 2025-11-04, and its
Proxy answers every property so a typo never fails. Note for the record: issue #931 is **not** an
Angular request — it is the maintainer's own injection-js item — and there is no open Angular
request. Suites structurally cannot do Angular: it discovers collaborators from constructor
`design:paramtypes`, and `readonly #x = inject(X)` is invisible to that.

Two Angular competitors are absent from `comparison.md` and belong there — see the Angular section
for the feature-by-feature tables. In short, **ng-mocks** wins on what this package does not attempt
(mocking a whole declaration graph via `MockBuilder`, `MockInstance` reaching a dependency read in a
field initializer of a nested child, `ngMocks.findInstance`) and loses on typing (`MockService<T>`
returns `T`, not a spy type — their own e2e specs launder it with `vi.mocked(...)`), on
type-only mocking, on **AOT** (it requires `aot: false`), on resources and on zoneless, where it has
nothing. **`@testing-library/angular`** turns out to be a direct competitor rather than a
complementary one — `/vitest-utils` exports `createMock` / `provideMock` with the same eager
prototype walk — and it is _worse_ in two ways (no getter handling at all, and the recursion has no
`Object.prototype` guard, so `hasOwnProperty` and `toString` get mocked). It is the only third party
with zoneless support: a `./zoneless` entry added in 19.2.0 on 2026-03-17.

### Undersold moats

- **Accessor spies on Bun.** `bun:test`'s `spyOn(obj, 'prop', 'get')` throws _"does not support
  accessor properties yet"_; `lib/redefine-accessor-spy.ts` never calls it. Nobody else can do this
  on any runtime **and** none of ng-mocks, spectator, `@testing-library/angular`,
  `vitest-mock-extended`, `jest-mock-extended`, `@golevelup` or Suites has getter/setter spies at
  all.
- **`injectSpy` warns when the injector returned the real thing** (`warnWhenNotASpy`,
  `lib/angular.ts`). Spectator types _every_ token as a spy, mocked or not.
- **Type-check cost.** Measured on one fixture (80-member class, 30 mock declarations, 600 member
  touches, `tsc --extendedDiagnostics`, identical across three runs): `Spy<T>` **2 656
  instantiations** against `@golevelup/ts-vitest` 5 092 and `vitest-mock-extended` 5 614 — roughly
  half the type-checker work of the deep-proxy libraries, while carrying more helpers. Shipped
  2026-09-02: the row was already in `comparison.md`; the CI budget is `npm run types:budget`
  (`scripts/check-type-budget.mjs`, delta 9 126 against a budget of 11 000 on a generated fixture of
  the same shape, part of `npm run check`).

### Tried and rejected — do not re-open

- **Cheaper lazy-spy creation by sharing the accessor descriptors across spies.** Building a
  100-method double is ~15 µs on V8 / ~7 µs on JSC, almost all of it one `defineProperty` per lazy
  accessor; sharing the getter/setter pair per class (via `this`) measured ~30 % faster to build and
  then up to **10× slower to materialise** — V8 keeps an object whose accessors all came from the same
  descriptors on a shared fast-mode map, and reconfiguring accessor → data there rewrites the map
  (`materializeMethodSpy` went from 2.5 % to 25 % of the first-call profile). With fresh closures the
  object drops into dictionary mode and the same step is a hash update. `Object.create(proto,
descriptors)` behaves the same way. Forcing dictionary mode with a probe property + `delete`
  fixes V8 and doubles creation and materialisation on JSC (Bun 1.4: 8.2 → 16.7 µs). Keyed-store
  placeholders before the accessors are deterministic on both engines and land exactly at the
  baseline. The only real cut is accessors on a shared prototype, which changes what `Object.keys`
  and `{ ...spy }` report — observable, so no. Measured 2026-09-02, Node 24.19 / Bun 1.4.0.
  **Re-opened and shipped on 2026-09-17 — see "Three trades the audit round settled" at the top of
  this file.** Everything measured here reproduced; what makes the trade work is installing the
  probe at the first materialisation rather than at build time, so the untouched double the item is
  about never leaves the shared map. The shared prototype is still no, for the reason above.

- **`aroundEach` / `aroundAll` do not replace the proxy-zone patch.** Vitest 4.1 added hooks that
  wrap a test (`aroundEach((runTest) => …)`) and a suite, and on paper they are exactly what
  `lib/proxy-zone.ts` hand-rolls: run every callback inside a forked `ProxyZoneSpec`, without
  replacing the runner globals and therefore without the `globals: true` requirement, the
  `fn.toString()` fixture parsing, the preserved `fn.length` or the `it.each` receiver Proxy.
  **Measured: it does not work.** With `aroundEach((runTest) => proxyZone.run(runTest))` registered
  from a setup file, `Zone.current.name` is `<root>` in `beforeAll`, in `beforeEach` and in the test
  body, and `fakeAsync` fails with `Expected to be running in 'ProxyZone', but it was not found`. The
  hooks fire — that was verified separately — but `zone.run()` only holds for the synchronous part of
  the call, and the runner reaches the test body through native `await`, which zone.js does not
  patch. Angular's own jasmine patch wraps the _test function itself_ for this reason, and so must
  this one. What `aroundEach` does get right, and what is worth knowing if it is ever useful for
  something else: it is collected from parent suites, so a file-level registration covers nested
  `describe`s, and it wraps `beforeEach` + body + `afterEach` together.

### Worth stealing — ranked

- [~] **Anchoring the emission helpers' failures — closed 2026-09-04, and the mechanism is the
  record.** `vi.defineHelper` stays off these three: their errors are built inside a subscribe or
  timer callback, so the `__VITEST_HELPER__` frame lands _last_, `slice(helperIndex + 1)` returns
  nothing and the reporter loses its code frame entirely — worse than the `node_modules` frame it
  replaces. Shipped instead: `lib/error-anchor.ts` captures the caller's stack at helper entry,
  before anything subscribes, brands the errors this module builds, and re-anchors only those. A
  failing `expectEmission` now opens the spec line that called it (`expect-emission.spec.ts:545:41`)
  where it used to open `expect-emission.ts:349:10`. `expectError` hands back the caller's own error
  with its own stack, untouched — rewriting that one would be a lie, and it is a test.

- [~] **`createSpyFromInstance(instance, config)` — shipped 2026-09-04.** The structural gap against
  `vi.mockObject` / `sinon.createStubInstance` / `td.replace` is closed: an object the test already
  holds is patched in place, same identity, so whatever captured it first sees the doubles. Two
  design decisions worth not re-deriving. Discovery is own function-valued fields **plus** the
  prototype chain up to but not including `Object.prototype` — the first half is why an arrow
  property needs no `instanceMethodsToSpyOn` here, the second is the guard `@testing-library/angular`
  is missing (its recursion mocks `hasOwnProperty` and `toString`). And `lazySpies` / `fillMissing`
  are deliberately ignored rather than honoured: the members already exist, and an instance is not
  an erased `abstract` declaration. Restoration reuses the `mock*Prop` journal, so
  `restoreSpiedInstance`, `restoreMockedProps()` and `using` all compose — and `using` **restores**
  rather than resets, the only sense disposal can have for an object the consumer owns.

- [~] **`explainSpy(spy, method?)` — shipped 2026-09-04.** Both gaps the entry named are closed.
  Per-config identity is derived from position rather than stored: `ArgsMap.configuredEntries()`
  reads `Object.keys(#map)` insertion order (every serialized key starts with `[`, so none is
  integer-like and the order is stable) followed by `#matcherConfigs`, which is exactly the
  precedence `get()` applies — so "the first entry whose `matches` holds" _is_ the config `get()`
  would have answered from, at zero cost on the hot match path, which was the constraint. The two
  empty narratives are printed outright: `nothing configured`, and `N calls, …, none matched`. The
  return is a `string` on purpose — a diagnostic to print, not something to assert on — which also
  keeps the type budget flat. **It ships from `/diagnostics`, not the root, and the number is the
  reason:** measured 2026-09-04 by A/B builds of `dist/index.js`, `explainSpy` on the root costs
  **1 226 B min+gzip** against a 14.3 kB entry, where `createSpyFromInstance` costs 322 B and the two
  together 1 149 B — they share the member walk, so adding the second on top of the first is free.
  That is the same argument `/diagnostics` was created for in 4.0.0, and a brand-new export is the
  one moment moving it costs nothing. One structural seam left: `explain-spy.ts` reads the two chains off
  `AUTO_SPY_MARK` duck-typed, guarded by `map instanceof ArgsMap`; a `readSpyChains(mock)` export
  from `lib/function-spy.ts` would make it explicit.

- [~] **`strict: true` / `onUnstubbedCall`.** Shipped, including the suite-wide form. Two decisions
  taken along the way, recorded so they are not re-litigated. (1) A `calledWith` chain configured
  only for _other_ arguments deliberately **does not** trip strict mode: the member was stubbed,
  just not for this call, and failing there is `mustBeCalledWith`'s job — conflating the two would
  make strict mode fire on the ordinary "configure one case, assert the default" shape. (2)
  `mockDeep` nodes are deliberately **not** strict: the guard fires on a _call_, but every hop of
  a deep chain except the last is a property _read_, so it could not repair the "a typo never
  fails" weakness it would be added for — while a suite-wide `strict: true` would then throw on
  every existing deep tree, including the `selfReturning` shape.

Runners-up: an `ignoreExtraArgs` option on `calledWith`, since `ArgsMap#argsMatch` requires exact
arity while testdouble and substitute allow partial; and a documentation note that `bun:test`'s
`mock.module` is **not hoisted**, which silently breaks migrated suites.

### A distribution opening, not a feature gap

Angular ships **no** spy helper — the complete `@angular/core/testing` public API at 22.1.4 contains
no `createSpy`, `createSpyObj`, `createMock` or stub factory, and the official v22 answer at
`angular.dev/guide/testing/services` is a hand-written literal:
`const stub: Mocked<TaxCalculator> = { calculate: vi.fn() }`. The official codemod hardens that
habit: `ng generate @schematics/angular:refactor-jasmine-vitest` (21.0.0, stabilised in 22.0.0)
rewrites `jasmine.createSpyObj()` into exactly that literal and emits a **TODO comment it cannot
resolve** for three cases — a single-argument `createSpyObj`, a method list held in a variable, and a
property map held in a variable. Against `jasmine-core`'s ~23.9M downloads/month, that is a very large
population being handed the boilerplate `createSpyFromClass(Service)` deletes.

- [~] **A `renderShallow` bench — shipped 2026-09-04 as `bench-angular/`, and it retired four of
  the numbers it was built to reproduce.** `npm run bench:angular -- --repeat 5`; its own config
  carries the Angular plugin and stays out of `vitest.bench.config.mts`, so the core spy numbers
  remain free of the Angular transform. Two runs of five passes each, median of 60 reps, Node
  24.19.0, Angular 21. What it found:

  | figure                                            | published |     measured | verdict                                                                                                                                          |
  | ------------------------------------------------- | --------: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `renderShallow` at 0 children                     |      1.2× |    **0.95×** | **sign is wrong** — it is _slower_ on a childless component (0.447 vs 0.471 ms), which is what the prose always said and the number contradicted |
  | at 25 children                                    |      1.8× |        1.73× | reproduces                                                                                                                                       |
  | at 100 children                                   |      5.7× |        4.50× | same order, ~21 % low                                                                                                                            |
  | at 400 children                                   |     16.2× |    **20.8×** | measures _higher_                                                                                                                                |
  | full per-test cycle                               |  1.933 ms | **1.215 ms** | ~30 % low                                                                                                                                        |
  | `createComponent` on an already-configured module |  1.987 ms | **1.049 ms** | absolutes do not reproduce; the _conclusion_ hardens — bed reuse buys ~14 %, not the 1.03× the published pair implied                            |
  | `keepTemplate: true`                              |  1.074 ms |     0.862 ms | closest of the lot; as a ratio the rung is 1.41–1.60×, not 1.80×                                                                                 |
  | `compileComponents()` on a standalone AOT bed     |  0.137 ms | **0.005 ms** | 27× low — it is a no-op there; the conclusion is unaffected                                                                                      |

  The absolutes almost certainly differ because the original used a heavier child than this bench's
  one-element/one-binding one. Making the child heavier would move them toward the published
  figures, which is exactly the wrong move; the child stayed minimal and is documented as such.

- [~] **The Angular plugin does not process `input()` initializers in a `.bench.ts` file.** One of
  the two traps the Angular bench cost a rebuild to find, and the one that stays: `setInput`
  fails with `NG0303`, and the first draft silently reported the JIT warm-up order as a per-size
  curve. Adding `include: ['**/bench-angular/**/*.bench.ts']` to the plugin options does not
  help, so the bench uses four host classes with literal row counts instead — a workaround in
  this repository for a limitation that is not in it. The other trap — `--update` stamping the
  self-benchmark's command over `bench-angular/baseline.json` — is fixed: `--update` now carries
  `generated.command` and `generated.note` forward and `--command "<text>"` sets the line when
  the recipe changes.

- [~] **A `@testing-library/angular` migration note — shipped 2026-09-04** as
  `docs-site/migrating-testing-library-angular.md`, with every claim re-verified by running the
  published module rather than restated. Both defects hold in 19.4.2 at the same two lines: a
  3-method class yields **13 own keys**, `hasOwnProperty` and `toString` come back as spies,
  `String(mock)` is `"undefined"`, and a getter reads `undefined`. Three things the survey did not
  have: `@testing-library/angular/jest-utils` is the same file with `jest.fn()`, so the defects are
  runner-independent; the `./zoneless` entry in 19.2.0 is confirmed by diffing the export maps of
  19.1.1 and 19.2.0; and zoneless `render` is a **reduced** API — no `rerender`, `detectChanges`,
  `navigate`, `autoDetectChanges`, `routes`, `componentProperties`, or the change-detecting
  `fireEvent` wrapper.

  **Correction to the entry above, which was wrong: `@suites/unit` was never "missing from
  `comparison.md` entirely".** It is in the live-field table, in both feature-by-feature tables, has
  its own `## NestJS` section and an entry in the "where another library is better" list; so do
  ng-mocks and `@testing-library/angular`. Do not re-open on that premise. What the page really
  needed, and got: links to the new page, a corrected `vitest-when` row (0.10.2, 2026-09-03,
  repoints its `exports` map at the files it ships — the standing "pin 0.10.0" advice is now wrong;
  take 0.10.2, skip 0.10.1), and a broken markdown table repaired. `format:check` covers only
  `src/**/*.ts`, so a broken table in a docs page is caught by nothing in the gate.

  The "five over a year, and a sixth's repository is gone" line re-verified against the registry on
  2026-09-04 — ts-auto-mock 740 days, testdouble 896, moq.ts 1220, `@fluffy-spoon/substitute` 1945,
  `@golevelup/nestjs-testing` 2486, plus `@ngneat/spectator` at 306 days with the 404 repo. Note for
  the next pass: **`jest-auto-spies` is at 346 days and crosses the year mark in September 2026.**
