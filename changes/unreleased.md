# Unreleased — release notes (paste into the GitHub Release body)

## Highlights

Framework-agnostic + leaner release (with the earlier tooling & type-safety hardening). The
core is now decoupled from rxjs and Angular behind opt-in subpath entries, the package has zero
runtime dependencies, and the tarball is ~53% smaller. It still builds under a very strict
TypeScript config + distilled ESLint/Prettier ruleset and runs `jscpd` at zero tolerance.

> ⚠️ **Breaking:** observable spies now import from `vitest-auto-spy/rxjs` and Angular helpers
> from `vitest-auto-spy/angular`. See the README "Entry points" table.

## Added

- **Strict TypeScript** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noPropertyAccessFromIndexSignature`, `noUncheckedSideEffectImports`, `isolatedModules`,
  `useUnknownInCatchVariables`, `allowUnreachableCode: false`, `allowUnusedLabels: false`.
- **ESLint + Prettier** — distilled from the meta-pdm-admin-frontend ruleset to the rules that
  apply to a TypeScript library: `no-explicit-any`, `consistent-type-assertions: 'never'`,
  `no-non-null-assertion`, explicit return types, member ordering, rxjs hygiene,
  eslint-comments discipline, import de-duplication, regex optimisation.
- **jscpd** copy-paste detection at threshold 0.
- npm scripts: `lint`, `lint:fix`, `format`, `format:check`, `jscpd`, `check`.
- `docs/` — `01-CODE-REVIEW.md`, `02-DECOUPLE-ANGULAR-RXJS.md`, `03-SIZE-OPTIMIZATION.md`,
  `04-ROADMAP.md`.

- **Framework-agnostic core + opt-in subpath entries** — `vitest-auto-spy` (core),
  `vitest-auto-spy/rxjs`, `vitest-auto-spy/angular`. An inversion-of-control registry keeps the
  core free of any runtime rxjs/Angular import; `rxjs`/`@angular/core` are now optional peers.
- **Dependency-free arg serializer** replacing `javascript-stringify` — same observable output,
  one fewer dependency.

## Changed

- **BREAKING:** observable helpers (`createObservableWithValues`, `observablePropsToSpyOn`,
  `nextWith`, …) move to `vitest-auto-spy/rxjs`; Angular helpers (`provideAutoSpy`, `injectSpy`,
  `mock*`) move to `vitest-auto-spy/angular`. The sync/promise/accessor core API is unchanged.
- **Smaller package** — sourcemaps dropped + minify + `javascript-stringify` removed. Tarball
  29.4 kB → 13.7 kB compressed (131 kB → 48.6 kB unpacked); **zero runtime dependencies**.
- Hardened the `src/lib/**` type surface: `any` → `unknown` + narrowing where possible,
  unnecessary `as` casts removed, non-null assertions replaced with guards. Remaining `any`
  is limited to load-bearing generic-inference spots, each with a justified disable.

## Fixed

- **Coverage gate now measures the real implementation** (`src/lib/**`), not the empty
  re-export barrel it pointed at since the module split — and genuinely holds at 100%.
- Observable-property `nextWith`/`complete` after `nextWithValues` keep operating on the
  backing `Subject` (removed a type-lie subject reassignment).
- `createSpyFromClass(Service, ['a','b'])` now **restricts** to the listed methods (matching
  `jest-auto-spies`) instead of augmenting the auto-discovered set.
- Per-call delays unified: `resolveWithPerCall` delays are baked into the promise at config
  time (like `nextWithPerCall`), removing a dead call-path branch.

## Notes for maintainers

- This release contains a **breaking** import-surface change (subpath entries), so it warrants a
  **major** version bump. The conventional-commit body should include a `BREAKING CHANGE:` footer
  so semantic-release cuts a major.
