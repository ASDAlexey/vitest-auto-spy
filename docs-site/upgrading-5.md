---
title: Upgrading to 5.0
description: Two breaking changes, both peer ranges. Angular moves to >=20 and gains @angular/platform-browser; rxjs moves to >=7.2 because the deep operator path is gone in rxjs 8. What to change, and what stays.
---

# Upgrading to 5.0

## Why upgrade

This major changes no helper, no option and no runtime behaviour. What it changes is what the
package **claims** to run on — and both old ranges were claims the code could not keep.

| What you get                                                                                                                                          | Verified                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **The Angular range stops being false.** `>=16.0.0` admitted four majors on which an entry point cannot even link                                     | Angular 16–22 downloaded and their real export lists parsed; `ɵSIGNAL` first appears in 18, `provideZonelessChangeDetection` in 20 |
| **`@angular/platform-browser` resolves under pnpm.** It was never a declared peer, though `/angular` imports `By` from it as a value                  | undeclared → declared optional peer on the same `>=20` range as the other two                                                      |
| **The rxjs range stops promising rxjs 8.** The observable layer imported six operators from `rxjs/operators`, a path rxjs 8 removes                   | the six moved to the root `rxjs` entry, where rxjs re-exported them in 7.2 — read out of rxjs 7.2.0's own `dist/types/index.d.ts`  |
| **`flushEffects()` is one line.** The `ApplicationRef.tick()` fallback is gone, and so is the spec that deleted `TestBed.tick` at runtime to reach it | fallback removed, artificial spec removed, coverage still 100 %                                                                    |

And what it costs: for almost everyone, nothing but a number in `package.json`. Every Angular major
still supported by Angular already satisfies the new floor, and every Angular project already
satisfies the rxjs one.

## What changed

**Two breaking changes, both peer ranges. No helper was removed or renamed, no option changed
meaning, no spy behaves differently.** Most suites upgrade by changing the version and running the
suite.

|                                                                                                               | What to do                                                                             |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [1. Angular is `>=20`, and there are now three Angular peers](#_1-angular-is-20-and-there-are-now-three-angular-peers) | upgrade Angular if you are below 20; add `@angular/platform-browser` if pnpm complains |
| [2. rxjs is `>=7.2`](#_2-rxjs-is-7-2-because-the-deep-import-path-is-gone)                                    | nothing, unless you pin `rxjs@7.0` or `7.1` on purpose                                 |

## 1. Angular is `>=20`, and there are now three Angular peers

```jsonc
"peerDependencies": {
  "@angular/common": ">=20.0.0",
  "@angular/core": ">=20.0.0",
  "@angular/platform-browser": ">=20.0.0", // new — was never declared
  // …
}
```

All three stay **optional**: a project that never imports an Angular entry point installs none of
them, exactly as before.

### Why 20 and not something lower

Two symbols the shipped code imports **as values** decide it, and they do not decide the same thing:
one rules out 16 and 17, the other rules out everything below 20. A missing value import is a link
error, so the failure below either line is never one unavailable helper — it is an entry that does
not load at all.

- **`ɵSIGNAL` exists from Angular 18.** `runEffect()` reads it, and that import sits on the first
  line of the `/angular` bundle, evaluated eagerly. On Angular 16 or 17 the entry fails to link and
  takes `provideAutoSpy`, `injectSpy` and everything else with it — not just `runEffect`.
- **`provideZonelessChangeDetection` exists from Angular 20.** In 18 and 19 the same function was
  named `provideExperimentalZonelessChangeDetection`; in 16 and 17 there was nothing to name.
  `vitest-auto-spy/bun-angular` imports it by name, so below 20 `bun test` dies while loading the
  preload, before any spec file is read. **This is the symbol that sets the floor at 20**: on 18 and
  19 the `/angular` entry links perfectly well, and only `/bun-angular` does not.

The matrix behind those two sentences was produced by downloading `@angular/core`, `@angular/common`
and `@angular/platform-browser` at 16.2.12, 17.3.12, 18.2.14, 19.2.25, 20.3.30, 21.2.22 and 22.1.5
and parsing the real `export { … }` lists out of `fesm2022/*.mjs`, rather than reading release notes:

```
                                 16 17 18 19 20 21 22
ɵSIGNAL                           .  .  y  y  y  y  y
provideZonelessChangeDetection    .  .  .  .  y  y  y
provideExperimentalZonelessCD     .  .  y  y  .  .  .
TestBed.tick()                    .  .  .  .  y  y  y
InputSignal / ModelSignal         .  y  y  y  y  y  y
the other 29 symbols this code imports
                                  y  y  y  y  y  y  y
```

### Nothing that was still supported is cut off

Angular ships six months of active support plus twelve of LTS. On the day this floor was set,
**Angular 19's LTS had ended on 2026-05-19**, and 18, 17 and 16 before it. Angular 20 is the oldest
major Angular itself still supports — and it is exactly this package's technical floor. The two
numbers coinciding is the reason this change gives up nothing that was still receiving fixes.

| major | released   | LTS ends   | status                  |
| ----: | ---------- | ---------- | ----------------------- |
|    16 | 2023-05-03 | 2024-11-03 | EOL                     |
|    17 | 2023-11-08 | 2025-05-08 | EOL                     |
|    18 | 2024-05-22 | 2025-11-22 | EOL                     |
|    19 | 2024-11-19 | 2026-05-19 | EOL                     |
|    20 | 2025-05-28 | 2026-11-28 | LTS — **the new floor** |
|    21 | 2025-11-19 | 2027-05-19 | LTS                     |
|    22 | 2026-06-03 | 2027-12-03 | active                  |

### `@angular/platform-browser` is a peer for the first time

`vitest-auto-spy/angular` has always imported `By` from it as a value — the directive matchers are
built on it — and the Bun preload boots through `platformBrowserTesting()`. Neither was ever
declared. Under npm's hoisted `node_modules` that resolved by accident, because every Angular
workspace has the package somewhere; under **pnpm's isolated layout it did not resolve at all**, and
`npm ls` could not tell you why. Declaring it turns the accident into a contract.

If your install already works, this row changes nothing for you. If you are on pnpm and `/angular`
failed to resolve `@angular/platform-browser`, this is the release that fixes it.

::: tip Not an Angular 20 thing
`platformBrowserTesting()` and `BrowserTestingModule` from `@angular/platform-browser/testing` are
sometimes described as Angular 20+. They are not — their export list is identical in every major
from 16. What changed in 20 is that `@angular/platform-browser-dynamic/testing` stopped being the
recommended path. The `bun-angular` floor rests on `provideZonelessChangeDetection` alone.
:::

### There is deliberately no upper bound

`>=20.0.0 <23.0.0` is the tempting shape, because `ɵSIGNAL` is a private symbol Angular owes nobody
compatibility on. It is the wrong fix twice over: a bound forces a release of this package for every
Angular major, and it hands `ERESOLVE` to anyone who upgraded Angular first. Worse, it does not
actually protect the thing it looks like it protects — a private symbol can be dropped in a *minor*.
The real insurance is structural: read the symbol off the module instead of naming it in the import
list, so a future Angular without `ɵSIGNAL` breaks one helper rather than the whole entry. That
pattern is already in this codebase (`zoneless.ts`, `proxy-zone.ts`), and it is where `runEffect()`
is headed.

## 2. rxjs is `>=7.2`, because the deep import path is gone

```jsonc
"peerDependencies": {
  "rxjs": ">=7.2.0" // was >=7.0.0
}
```

The observable layer builds its subjects out of six operators — `concatMap`, `delay`, `switchMap`,
`take`, `takeUntil`, `takeWhile` — and it imported them from `rxjs/operators`, the legacy deep path.
**rxjs 8 removes that path entirely.** So the open-ended `>=7.0.0` was promising a major the code
could not have served: the specifier itself would have failed to resolve.

The import moved to the root `rxjs` entry, which is where rxjs re-exported all six in **7.2** —
checked against rxjs 7.2.0's own `dist/types/index.d.ts` rather than against its changelog. The
floor moved with the specifier. `firstValueFrom`, the symbol that justified the old 7.0 number, is
untouched; 7.2 is simply the first version where every symbol this package imports exists at the
specifier it imports it from.

**Who has to act:** only a project that pins `rxjs@7.0` or `7.1` deliberately. Every Angular major
from 16 to 22 declares its own rxjs peer as `^6.5.3 || ^7.4.0`, which is already well above this —
so an Angular consumer has nothing to do. There is no upper bound here either; the point of the
change is that the rxjs 8 line becomes reachable rather than merely promised.

## What `flushEffects()` looks like now

Not a breaking change — a simplification the floor pays for, listed because it is the one piece of
runtime code the new range let us delete:

```ts
export function flushEffects(): void {
  TestBed.tick();
}
```

`TestBed.tick()` arrived in Angular 20 and refreshes fixture views that were never attached to the
`ApplicationRef`, which is why it was always preferred. The `ApplicationRef.tick()` fallback behind
it existed only for versions the package no longer admits — and with it goes the spec that deleted
`TestBed.tick` at runtime to force that branch to execute. No supported Angular ever took it.

## What did _not_ change

- **No helper was removed, renamed or deprecated.** `provideAutoSpy`, `injectSpy`, `renderShallow`,
  `createWithAutoSpies`, `stable`, `flushEffects`, the signal and resource matchers and the
  `mock*Prop` family all behave exactly as they did.
- **No import specifier moved** — inside this package one did, but nothing a spec writes changes.
- **Angular stays optional.** A React, Vue, Svelte, NestJS or plain-Node project installs no Angular
  package and pulls none into its TypeScript program.
- **The `vitest` peer still starts at 2.1**, and one install still spans Vitest 2.1 through 5.x.
- **Zoneless and zone.js are both still supported**, `fakeAsync` still behind
  [`vitest-auto-spy/zone`](/utilities/zone).

## Coming from further back

[Upgrading to 4.0](/upgrading-4) is the one with work in it — rxjs left the published declarations
and two groups of helpers moved to their own subpaths, which is a real change of import specifier in
your specs. [Upgrading to 3.0](/upgrading-3) is one line of `package.json`. [Upgrading to
2.0](/upgrading-2) matters only if you are still on 1.x.
