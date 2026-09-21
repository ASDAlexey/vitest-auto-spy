# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.22.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

Eight lint rules, which take the plugin to forty-eight: six of them report a test that is green and
should not be, and two report a line that is read wrong. All eight were measured on the same
2 032-file Angular consumer before shipping.

### Added

- **`no-reflect-member-access`, in `recommended` at `error`.** Reports `Reflect.get(subject,
'member')` / `Reflect.set(subject, 'member', value)` on a value the spec holds — the second door
  out of `no-private-member-access`, and the one no compiler stands in: the key is an ordinary
  string argument typed `any`. `Reflect.set` installs an **own** property over the prototype, so a
  rename in production leaves the spec writing a dead property while the assertions under it pass
  forever. A write onto a double this library built is reported apart and suggests
  `mockValueProp(double, 'prop', value)`, which records the undo. Silent on `window` / `globalThis`
  and any name the file does not declare, on an imported name, on a computed key and on
  `Reflect.apply` / `has` / `deleteProperty` / `construct`. Measured on a 2 030-file consumer: 214
  sites in 50 files, 4 of them the double form.

- **`no-self-called-spy`, in `recommended` at `error`.** Reports `vi.spyOn(obj, 'm')`, then
  `obj.m(…)` written by the test body after it, then a positive `toHaveBeenCalled*` — a test that
  proves `emit` calls `emit` and survives the deletion of the binding its title names. Order decides
  it, so a call written before the spy is arrangement; a `mockClear` between the call and the
  assertion, a negated matcher, arguments the call did not pass, a spy installed in a hook and a call
  made inside a callback all silence it. No fix and no suggestion. Measured: 5 sites in 3 files —
  quiet, and said so.
- **`no-redundant-mock-reset`, in `recommended` at `error`.** Reports a mock reset inside a
  `beforeEach` / `afterEach` / `beforeAll` / `afterAll` — `vi.clearAllMocks()`, `vi.resetAllMocks()`,
  `vi.restoreAllMocks()`, `mockClear()`, `mockReset()`, `mockRestore()` — that the runner already
  performs between tests. **Silent until it knows the configuration**: options first
  (`{ clearMocks, restoreMocks, mockReset }`), then a `vitest.config.*` / `vite.config.*` searched
  upwards from the file and read as text; with neither, nothing is reported. The flag matches the
  call and not the family — `restoreMocks` reaches only the spies `vi.spyOn` installed, so it does
  not make a `vi.clearAllMocks()` dead. `--fix` only where nothing can have run in between (the
  first statement of the file's only `beforeEach`), a suggestion everywhere else, and never inside a
  test body. On a 2 032-file consumer: 202 reports in 167 files, 19 with the edit, and zero of the
  445 mid-test resets.

- **`no-unasserted-argument`, in `recommended` at `warn`.** Reports a bare
  `expect(spy).toHaveBeenCalled()` where the file itself says the arguments matter — the same
  subject pinned with `toHaveBeenCalledWith(…)` in another test, or a title containing `with` over a
  body whose every assertion is a bare call. Narrower than `vitest/prefer-called-with` on purpose:
  175 findings in 90 files against its 1 941 in 360 on the same suite. `not.toHaveBeenCalled()` and
  the counting matchers are never reported. `warn`, because the repair is the argument list the test
  should have named, which the rule cannot write.

- **`no-vacuous-absence-assertion`, in `recommended` at `error`.** Reports a test **every** assertion
  of which is satisfied by the stream under it never emitting — a `const` / `let` only a `subscribe`
  callback writes, or a `vi.fn()` handed to `subscribe`, under a matcher that repeats the
  declaration (`let chips = []` … `expect(chips).toEqual([])`) or asserts absence (`toBeUndefined`,
  `toBeNull`, `toBeFalsy`, `not.toHaveBeenCalled`, `toHaveBeenCalledTimes(0)`). Such a test cannot
  tell "the result is empty" from "there is no result"; `await expectNoEmission(source$)` makes the
  first claim and `expect(await expectEmission(source$))` the second. Proved by mutation twice on a
  2 030-file consumer, where the rule reports 39 times across 33 files. One assertion a silent
  source could fail silences it, which leaves the "nothing yet, trigger, now the value" shape alone.
  No `--fix` and no suggestion: the repair spans the declaration, the subscription and the
  assertion, and the helper asserts something stronger than the line it replaces.
- **`prefer-create-mock`, in `recommended` at `warn`, and `no-mock-cast`, at `error`** — two casts
  that keep a fixture compiling while taking it out of the compiler's reach, shipped together
  because they are one defect written in two places. `prefer-create-mock` reports an object literal
  under a cast to a named type (`{ id: '1', isOffline: false } as Device`, `<Device>{ … }`) and names
  `createMock<Device>({ … })`: a cast asks whether the two types overlap, so the excess-property
  check is skipped and a key the type does not declare goes through, along with a required field the
  fixture never sets — both type gates stay silent, and the fixture then pins a key the contract does
  not have. `no-mock-cast` reports a cast to `Mock` / `MockInstance` over a member access
  (`TestBed.inject(S).m as Mock`) and names `injectSpy(S).m`; `Mock` with no parameters is
  `Mock<any>`, so `toHaveBeenCalledWith` stops comparing arguments, and the worse form
  (`(spy.m.mockReturnValue as Mock)(…)`) gets a message of its own. Suggestions rather than `--fix`
  in both cases. Measured on a 2 032-file consumer: 1 200 reports in 327 files and 24 in 21 — none of
  the 1 200 literals holds a `vi.fn()`, so neither rule collides with the hand-rolled-double rules,
  and 529 of them sit in a slot that already has a type, where deleting the cast is the first repair.
  `prefer-create-mock` is a `warn` because accepting its suggestion turns every drifted fixture red
  the same day, which is the finding and also a migration taken file by file.

- **`prefer-settle-dynamic-import`, in `recommended` at `error`.** Reports a dynamic `import()` the
  spec waits for inside a test body or a hook — `await import('./thing')`, the destructured form and
  `import('./thing').then(…)` — and names `await settleDynamicImport(() => import('./thing'))`. The
  bare `await` waits for the **module** and not for the continuation of the code that was loading
  it, so the assertion reads the state one turn early. Syntax only; reported only where the
  innermost enclosing function is the runner's own callback, which exempts a `vi.mock` factory, a
  lazy route's `loadComponent`, a callback handed to production code and the helper's own
  `() => import(…)`. Suggestion rather than `--fix`: the rewrite adds an event-loop turn. Measured on
  a 2 030-file consumer: 81 reports in 32 files, four of them with a hand-written
  `await Promise.resolve()` underneath and eleven more sites already lifted into spec-local helpers.

### Size

`/eslint-plugin` 37.69 → 47.24 kB min+gzip (+9.55 kB), all of it the eight rules; a lint-time entry
no test run imports. Every runtime entry is byte-identical to 5.22.0.
