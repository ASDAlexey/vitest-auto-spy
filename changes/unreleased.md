# Unreleased — release notes (paste into the GitHub Release body)

## Highlights

Tooling & type-safety hardening release. The library now builds under a very strict TypeScript
config and a distilled ESLint/Prettier ruleset, runs `jscpd` at zero-tolerance for duplication,
and ships internal documentation (code review, decoupling feasibility, size analysis, roadmap).

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

## Changed

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

- Bundle-size wins (drop sourcemaps, minify; ~77% smaller tarball) and the Angular/rxjs
  decoupling are planned but **not** in this release — see `docs/03` and `docs/02`.
