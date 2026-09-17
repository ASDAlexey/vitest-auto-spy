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
