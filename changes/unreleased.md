# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.16.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- **`documentPollution` — the attribute a test leaves on `<body>`, named and put back.** Under
  `isolate: false` a worker's spec files share one jsdom document. On a consumer suite a keyboard
  component's `effect` ran `renderer.setAttribute(document.body, 'data-reset-focus', '')` and nothing
  took it off; a navigation service elsewhere returns early whenever
  `document.querySelector('[data-reset-focus]')` matches, so its spec failed 34 of 209 tests — about one
  full run in six, only when the two files shared a worker, never on its own — and the same run showed
  a second spec leaving `data-visited` behind. No guard saw it: nothing reached a prototype or sealed a
  global, and no timer, console call or rejection was left over. `setupAutoSpy({ documentPollution })`
  records the attributes of `<html>`, `<head>` and `<body>` before each test, and after it reports
  every one added, changed or removed with both values, puts the old state back and fails that test
  (`'throw'`), or only reports it on stderr (`'warn'`). A change made in a `beforeAll` and never undone
  fails the file. `{ nodes: true }` watches the child elements of `<head>` and `<body>` as well, with
  `ignoreAttributes` (names or RegExps) and `ignoreNodes` (a CSS selector) for what a project sets on
  purpose. The check runs from `onTestFinished` and from a `beforeAll` cleanup rather than an
  `afterEach`: a setup file's `afterEach` runs **before** the TestBed's own teardown, and measured on a
  zoneless TestBed it would have reported the component style, the root element and an attribute a
  `DestroyRef` removes, every one of which is gone by the time these run. About 4 µs per test, 10 µs
  with `nodes`. `'off'` by default, `'throw'` under `preset: 'strict'` — the precedent
  `swallowedStrictCalls` set in 5.7.0: a new failing grade reaches only suites that asked for every
  guard at its failing grade, while `prototypePollution` could default to `'throw'` because what it
  catches kills collection outright, and a leftover attribute breaks only the code that reads it.
  `guardDocumentPollution(option)` from `/setup` registers the same check on its own. Vitest only, like
  every `/setup` guard. +1.0 kB min+gzip on `/setup`, nothing on any other entry.

### Fixed

- **`documentPollution` failed a test for a `class=""` that nothing can observe.** `classList.add('x')`
  and a later `classList.remove('x')` — or Renderer2's `addClass` / `removeClass`, or a `style.overflow`
  set and then cleared — do not take the attribute back off: `<body>` ends the test with `class=""` or
  `style=""` where it started with no attribute at all. No selector, `classList.contains`, `className`
  truthiness check or computed style tells the two apart, yet the guard reported
  `<body> class="" added` and, under `'throw'`, failed a test that had cleaned up after itself.
  Rolled out on a consumer suite, this was 9 of the 32 failures, across 5 files — an onboarding banner, an overlay, a profile
  page and the player's fullscreen mode, each removing exactly the class it added — and the other 23
  were real leftovers (`data-reset-focus`, a platform class, a scroll lock). An empty `class` or `style`
  now reads as the attribute being absent, in both directions: absent → `""` and `""` → absent are no
  change, and the repair leaves the empty attribute where it is instead of churning the DOM for nothing.
  Only those two: their empty value is defined to mean no classes and no declarations, whereas an empty
  `data-reset-focus=""` is a present flag that `[data-reset-focus]` matches, and it is still reported —
  the case the guard was written for.
