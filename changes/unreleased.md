# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.7.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- `setInputs(fixture, { … })` (`/angular`, `/bun-angular`): one `setInput` per name, checked against the compiled
  definition first, then one wait — the pair every spec writes after `renderShallow({ inputs })`.
- `provideRouterDouble({ url })` / `injectRouterDouble()` / `createRouterDouble()` (`/angular-router`): a `Router`
  derived from one URL — real `serializeUrl` / `parseUrl` / `createUrlTree`, `navigate` spies resolving `true`,
  `setUrl`, `emitNavigation` over a `BehaviorSubject`, and a throw by name for every member it does not carry.
- `provideWindowDouble(TOKEN, overrides?)` / `provideDocumentDouble(overrides?)` (+ the `create*` forms): a
  `window` / `document` merged over the real jsdom object, with the globals never patched.
- `provideMatDialogData(TOKEN, data)` / `provideMatDialogRef(RefClass, init?)` / `injectMatDialogRef` /
  `createMatDialogRef`: the Material dialog trio with the token and the class as arguments, so `@angular/material`
  stays out of the dependencies; `afterClosed()` still answers after the close.
- `trackRecomputations(signal)` / `trackEffectRuns(effectRef)`: `{ count, stop() }` over what the reactive graph
  re-ran, undone by `restoreMockedProps()`.
- `mockResourceProp(obj, prop, initial, { status })` and `double.idle()`: open a resource double in `idle`,
  `loading`, `reloading` or `local` instead of driving it there.

- `registerAutoSpyDefaults(TOKEN, config)` from `vitest-auto-spy/angular`: an `InjectionToken` registers over the
  class registry, and `provideAutoSpyForToken(TOKEN)` merges its arguments over it; `AutoSpyTokenDefaults<T>`,
  token rows in the table form, `clearAutoSpyDefaults(TOKEN)`.
- `selfReturning: ['m']` on every factory's configuration and in a registration: the named methods answer the
  double itself, a default like `returns` that counts as configured under `strict`.
- `no-unknown-use-value-key` (`error`, type-aware): a key of an object `useValue` literal the provided type does
  not have — keys only, never the values.
- `vitest-auto-spy/angular-router`: `provideActivatedRoute`, `injectActivatedRoute`, `createActivatedRoute` —
  Angular's own `ActivatedRoute` over one record, streams and snapshot moved together; `@angular/router`
  is a new optional peer.
- `no-ts-expect-error-on-double` and `no-constant-expect` (both `error`); `no-compile-components`
  (`error`, silent until `{ builder: 'inline-resources' }`, suggestion removes the call). Thirty-six rules.
- `no-sync-testbed-await` (`error`, syntax only): an `await` on a TestBed call that answers the TestBed or a
  fixture — `configureTestingModule`, every `override*`, `resetTestingModule`, `createComponent`,
  `getLastFixture`. The suggestion drops the `await` **and** the `async` of a hook that then awaits nothing
  else; `inject` and `runInInjectionContext` are never reported, since either can hold a promise.
- `prefer-provide-activated-route` (`error`, syntax only): a provider of a hand-built `ActivatedRoute` — any
  `useValue` / `useClass` / `useFactory` / `useExisting`, and `provideAutoSpy(ActivatedRoute)` with a message
  of its own — because the double knows either the streams or the snapshot, never both; every form of
  `provideActivatedRoute()` and `createActivatedRoute()` stays silent by shape.
- `setupAutoSpy({ unconfiguredReads })`: a strict double's getter read, or stream subscribed to, that nothing
  configured is reported after the test; `onUnstubbedRead` (suite-wide or per double) takes the findings instead.
- `createComponentStub(Real, overrides?, { template }?)` (`/angular`): a standalone stand-in for a child component,
  directive or pipe, its selector, inputs, outputs and `exportAs` read from the compiled definition.
- `stubWebStorage(key?, { items, view }?)` (`/dom-stubs`): an in-memory `localStorage` / `sessionStorage` with a
  `snapshot()` handle, undone by `restoreMockedProps()`.

### Changed

- `mockSignalProp` writes through a `signal()` / `model()` / `linkedSignal()` instead of replacing it, so a
  `computed()`, an `effect()` or a template that read it first stays connected; an `input()` and a read-only signal
  with live consumers are refused by name.
- `ResourceDouble` carries `set` / `update` / `asReadonly` / `destroy` / `snapshot`, a write through `value` moves
  the status to `'local'`, and `hasValue()` follows Angular's value-based rule (breaking for a spec asserting it in
  a non-resolved state); `reload()` answers `true`.
- `settleResource` takes an event-loop turn from the third round and refuses a resource still `idle`
  (`{ allowIdle: true }` keeps the old silence where the idle state is the assertion).

- `prefer-provide-auto-spy`'s token message recommends `{ selfReturning: ["channel"] }` for a chained call
  instead of a `vi.fn().mockReturnThis()` seed.

### Fixed

- `runEffect` runs the previous run's cleanup before the body, both under `untracked()`, and refuses an effect
  whose view or `EffectRef` has been destroyed.
- `toHaveSignalValue` recognises a signal instead of calling whatever function it was handed: a spy is refused by
  name, unread, rather than recorded as a call.
- `settleResource({ turns: 0 })` reports the rounds it actually spent.

- `registerAutoSpyDefaults` from `/angular` keeps a generic class's default next to an accessor list and `returns`;
  the token overload was never affected, and the core one still needs the type argument there.
- `provideAutoSpy` / `overrideAutoSpy` / `overrideComponentProvider` keep a generic class's default next to an
  accessor list (or `overrides`) and `returns`; the core `createSpyFromClass` still needs the type argument there.
- The `restoreWebStorage()` stand-in coerces keys and `key()` indexes as the platform does.
- `createAutoMock` leaves a member seeded through `overrides` exactly as seeded: a registered `returns` /
  `selfReturning` naming the same member used to hand that seed to the adapter and throw
  `mockImplementation is not a function`, and a seeded `vi.fn()` used to be overwritten by `returns`.
- `no-compile-components` names the `@defer` / async-class-metadata exception in its message and in its
  suggestion, with the disable comment that keeps such a call; what it reports is unchanged.
