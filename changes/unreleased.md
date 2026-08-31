# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v3.11.0** (2026-08-30) — the git tag and `package.json` agree._

> ⚠️ **`CHANGELOG.md` is two releases behind the tags.** Its newest released heading is
> `## [3.9.0]`, while the latest tag and `package.json` are both `3.11.0` — so whatever shipped as
> 3.10.0 and 3.11.0 is still sitting under `## [Unreleased]` there, mixed in with work that has not
> shipped at all. This is the one manual step the automation does not do (`CONTRIBUTING.md` →
> "Releasing", step 2): split that section into `## [3.10.0]` and `## [3.11.0]` by reading the
> Conventional Commits between the tags, fix the compare links, and commit it as `docs(changelog):`
> — a `docs` commit does not trigger a release.

## Staged for the next release

- **`createFixture<T>(defaults, overrides?)` / `createFixtureFactory<T>(defaults)`** (core) — the
  model a whole suite shares, written out and checked once instead of copied into eight specs.
  `defaults` is a complete `T`, so a removed field is one compile error rather than eight silent
  lies; overrides are deep-partial-checked and merge leaf by leaf, an overridden array replaces.
  Every call hands back a fresh object, which retires the shared `const FIXTURE` whose mutation in
  one test decides another's outcome.
- **`assertComponentDefIntact(...components)`** (`/angular`) — fails before rendering when a
  half-loaded barrel chunk left `undefined` in a component's own `providers`, `viewProviders` or
  compiled scope, naming the list and the index. Angular otherwise reports it half an hour later as
  `Cannot read properties of undefined (reading 'provide')` from inside its own provider resolution.
  Also answers the related `… (reading 'ɵcmp')` from `imports: [Cmp]`.
- **Fixed — `using` on Node 22.** Node 22 has no `Symbol.dispose` in V8; it patches one in itself
  (`Symbol.for('nodejs.dispose')`) on the main realm only, so under Vitest's `jsdom` environment the
  global is absent, the downlevelled `using` throws `TypeError: Symbol.dispose is not defined.` out
  of `tslib`, and `spy[Symbol.dispose]` becomes a property named `"undefined"`. The package now
  installs the symbol where it is missing, with the same registry key, and compares against the
  resolved key internally (`src/lib/dispose-symbol.ts`). This is what failed the Node 22 leg of CI.
- **README: an "Error → cure" table**, keyed by what the compiler prints rather than by helper name —
  `asSpy` and `asInstance` are unfindable from the messages that call for them.
- **Internal:** the reading shared by the two `prefer-*` provider lint rules moved to
  `src/lib/eslint/hand-rolled-doubles.ts`; `rules.ts` had grown past the 500-line ceiling its own
  config sets and was failing `npm run lint` on 3.11.0. No rule behaviour changed.
- **Fixed — a spied method accepted arguments the real one rejects.** The mock surface came in as
  `Mock` (i.e. `Mock<Procedure>`, `(...args: any[]) => any`), and an intersection accepts a call
  matching either member: `read(1)`, `read('ok', 'extra')` and `read()` all compiled on a double of
  `read(key: string)`. Now `MockInstance`, which carries the same helpers without a call signature.
  Tightens existing suites; `expectTypeOf(spy.m).parameters` resolves as a bonus.
- **Fixed — `nextWithValues` dropped a falsy value.** `{ value: false }`, `{ value: 0 }`, `{ value: '' }`
  and a falsy `{ errorValue }` emitted nothing: a truthiness check sat on top of a presence guard.
- **Fixed — `createWithAutoSpies(...).spies.get(token)` minted a spy for a token nobody injected**,
  so stubbing the wrong token succeeded and configured an object the instance never sees. It now
  throws, naming the token and the ones that were auto-spied.
- **Fixed — `assertMocked(ns, { exports: [] })` could only pass.** An empty list is now an error.
- **Fixed — a `vi.resetAllMocks()` in one file killed a shared double in another.** Registered means
  reachable by `resetAllMocks` too, and `mockReset` drops an implementation that came from a chained
  `.mockReturnValue(…)`; under `isolate: false` a *later* file then dies inside application code on
  a double it never touched. The implementation each long-lived mock carried when classified is
  remembered and put back, in `beforeEach`, only when missing. Exports
  **`restoreLongLivedImplementations()`** for the repair on its own.
- **`copyWindowGlobals` names a forced global the host refused**, with the error underneath, instead
  of failing later as `document is not defined` — which named neither the helper nor the property.

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->
