---
title: Upgrading to 3.0
description: One line — the vitest peer range catches up with what the types already required. No shipped code changed; dist size, runtime and memory are byte-identical.
---

# Upgrading to 3.0

## Why upgrade

The smallest major this package has cut, and the only thing it fixes is a promise it could not keep.

| What you get                                                                                                                                                                                                                                                                                                    | Measured                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **The supported range stops claiming a version the types cannot serve.** `spy.method.mock.settledResults` is documented surface and comes from Vitest's own `Mock` type — and `@vitest/spy` only grew `settledResults` in 2.0. On Vitest 1 that surface never type-checked, while `package.json` said `>=1.0.0` | `dist/` size, runtime and memory **untouched** — there are no version branches to delete |

## What changed

**The `vitest` peer range is now `>=2.1.0`** (was `>=1.0.0`).

2.1 rather than 2.0 because the 2.x line effectively _is_ 2.1: 2.0.x is ~0.3 % of Vitest installs
against 2.1.x's ~10 %.

**What to do.** Upgrade Vitest, or stay on `vitest-auto-spy@2.0.x`. Nothing in your specs changes
either way — this is the supported range catching up with what the types already required.

## Then keep going

[Upgrading to 4.0](/upgrading-4) is the one with numbers in it: rxjs out of your TypeScript program,
and 0.159 ms back on every spec file. Coming from 1.x, start at [Upgrading to 2.0](/upgrading-2) —
that is the release that stopped `methodsToSpyOn` silently removing spies.
