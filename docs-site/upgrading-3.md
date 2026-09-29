---
title: Upgrading to 3.0
description: One change - the vitest peer range is now >=2.1.0. No shipped code changed; dist size, runtime and memory are the same as 2.0.
---

# Upgrading to 3.0

Version 3.0 raises the minimum Vitest version to 2.1. Your specs do not change.

```bash
npm install -D vitest@latest vitest-auto-spy@3
```

**Checklist**

1. If you are on Vitest 1.x or 2.0.x, upgrade Vitest to 2.1 or newer.
2. If you cannot upgrade Vitest yet, stay on `vitest-auto-spy@2.0.x`.

## Why upgrade

| What you get                                                                                                                                                                                                        | Measured                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **The supported range matches what the types need.** `spy.method.mock.settledResults` comes from Vitest's own `Mock` type, which gained it in 2.0. On Vitest 1 it never type-checked, yet the range said `>=1.0.0`. | `dist/` size, runtime and memory are **unchanged**. No code was removed. |

## What changed

**The `vitest` peer range is now `>=2.1.0`** (it was `>=1.0.0`).

Why 2.1 and not 2.0: almost nobody runs 2.0.x. It had about 0.3 % of Vitest installs, against about
10 % for 2.1.x.

**What to do:** upgrade Vitest, or stay on `vitest-auto-spy@2.0.x`. Your specs stay the same either
way.

## Then keep going

[Upgrading to 4.0](/upgrading-4) takes rxjs out of your TypeScript program and saves 0.159 ms on
every spec file. Coming from 1.x? Start at [Upgrading to 2.0](/upgrading-2), where `methodsToSpyOn`
stopped removing spies.
