# Unreleased — targeting **v1.12.0**

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v1.11.0** (2026-08-26)._
_Next: **v1.12.0** — minor, because the release adds a new entry point and two new helpers and
breaks nothing._

## Headline

**Angular's `TestBed` now runs under `bun test`.** No other auto-spy library does this, and Bun
cannot do it alone: it ships no DOM, and `@Component({ templateUrl: './x.html' })` is not an import,
so Angular's JIT compiler refuses to build the component. `vitest-auto-spy/bun-angular` closes both
from a single preload.

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular"]
```

## Added

- **`vitest-auto-spy/bun-angular`** (new entry, ESM-only). On load it installs a DOM
  (`@happy-dom/global-registrator`, else `jsdom`, and nothing if one is already present), registers
  a `Bun.plugin` `onLoad` hook that inlines `templateUrl` / `styleUrl` / `styleUrls`, initialises a
  **zoneless** `TestBed` that resets after every test, and registers the Bun mock adapter.
  `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable` / `flushEffects`
  and the whole core behave exactly as on Vitest. `registerSignalMatchers` and the TestBed
  diagnostics stay Vitest-only — they need the runner's `expect.extend` and suite-level hooks.
  Building blocks (`registerDomGlobals`, `createJsdomRegistrar`,
  `createGlobalRegistratorRegistrar`, `copyWindowGlobals`, `inlineAngularResources`) are exported
  for a project that would rather compose its own preload.
- **A real Bun suite** — `src/bun-tests/` runs the published API on the actual `bun:test` (core,
  rxjs layer, DOM registrars, Angular `TestBed`), where the Vitest suite could only drive the Bun
  adapter against a stub. New CI job on **Bun 1.4** (`1.4.0` and `latest`), running it unflagged,
  with `--isolate`, and against the **built** `bun-angular` bundle used as a preload.
- **`createMock<T>(partial?)`** (core) — a plain, spy-free `T` for the doubles the code under test
  only reads: DTOs, route snapshots, config objects. The read-side counterpart to `createAutoMock`,
  and the single place the `as` lives.
- **`setupFakeTimers(config?)` / `advanceTimers(ms?)`** (`/setup`) — paired fake-timer
  install/restore, and an advance that also drains the microtasks a bare `vi.advanceTimersByTime()`
  leaves pending.

## Changed

- **The documentation site was rewritten end to end** — every `<!-- TODO: expand -->` stub is gone,
  the landing page leads with the four runtimes and Angular-on-Bun, and every page carries
  `title` / `description` frontmatter (canonical links and OpenGraph tags were empty before).

## Fixed

- **`mockDeep` was unusable on `bun:test`** — deep nodes handed their spy methods back with `this`
  pointing at the Proxy, and Bun's `mock()` asserts `this instanceof Mock`, so
  `mock.a.b.mockReturnValue(1)` threw. Vitest was unaffected, which is why only a run on the real
  runtime could surface it.

## Release checklist

1. Land the work on `master` with Conventional Commits — the `feat:` entries above make this a
   **minor** bump, so `auto-release.yml` will cut **v1.12.0**, tag it and publish to npm.
2. Right after the auto-release: rename `## [Unreleased]` → `## [1.12.0] - YYYY-MM-DD` in the root
   `CHANGELOG.md`, fix the compare links, commit as `docs(changelog):` (a `docs` commit does not
   trigger another release).
3. Reset this file for the next cycle and set _Last released_ to **v1.12.0**.
4. Verify the four sources match: `npm view vitest-auto-spy version`, `package.json`, the latest
   `v*` git tag, and the top `CHANGELOG.md` heading.
5. The docs site deploys from `docs.yml` on push — check
   <https://asdalexey.github.io/vitest-auto-spy/> renders the new landing page and
   `/runtimes/bun-angular`.

## Verified before release

| Check                                        | Command                                   | Result                    |
| -------------------------------------------- | ----------------------------------------- | ------------------------- |
| Types, lint, format, duplication             | `npm run check`                           | ✅ 0 clones, 0 errors     |
| Vitest suite + coverage gate                 | `npm run test:coverage`                   | ✅ 275 tests, 100%        |
| Shared environment (`isolate: false`)        | `npm run test:shared-env`                 | ✅ 275 tests              |
| Bun core + rxjs, no preload                  | `npm run test:bun`                        | ✅ 17 tests (Bun 1.4.0)   |
| Bun Angular `TestBed`                        | `npm run test:bun:angular`                | ✅ 25 tests (Bun 1.4.0)   |
| Bun fresh-global-per-file                    | `npm run test:bun:isolate`                | ✅ 25 tests (Bun 1.4.0)   |
| Built ESM entry as a preload                 | `bun test --preload ./dist/bun-angular.js ./src/bun-tests` | ✅ 25 tests |
| Docs site builds (dead links fail the build) | `cd docs-site && bun run build`           | ✅                        |
