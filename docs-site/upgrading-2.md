---
title: Upgrading to 2.0
description: Why 2.0 exists — methodsToSpyOn stopped silently removing spies, and lazy method spies cut a wide suite 9x in time and 12x in memory. What to rename, and what to do about nothing else.
---

# Upgrading to 2.0

## Why upgrade

Two of the three changes below are the reason this library stopped losing tests, and the numbers are
from real suites rather than a benchmark.

| What you get                                                                                                                                                                                                                                                         | Measured                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`methodsToSpyOn` stops silently removing spies.** Up to 1.x an explicit list _replaced_ prototype discovery, so naming two methods dropped every other one — and the failure landed inside a component constructor, with nothing in the stack pointing at the spec | one migrated component went from **147 failing tests out of 147 to 4**; two independent projects had worked the option around **739** and **572** times |
| **Lazy method spies, for every factory.** A method becomes a spy on first access instead of all of them up front                                                                                                                                                     | 2 000 spies of a 40-method class where a test touches two: **257 ms → 27 ms, 425 MB → 35 MB** — nine times the speed, a twelfth of the memory           |
| **The unknown-method warning moved where it can be right.** Under an additive list, naming something the prototype lacks is the documented way to reach an instance-assigned callable, so the old warning fired on correct code                                      | —                                                                                                                                                       |

The cost is one rename, and only if you relied on the restriction.

## What changed

### 1. `methodsToSpyOn` adds instead of restricting

This is what `jest-auto-spies` always did, and what this library documented itself as compatible
with. The exhaustive whitelist is still there, under a name that says what it does:

```diff
- createSpyFromClass(ApiService, { methodsToSpyOn: ['get', 'post'] });   // 1.x: only these two
+ createSpyFromClass(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }); // 2.x: only these two
```

**What to do.** If you came from `jest-auto-spies` and never thought about this option, nothing —
your specs now behave the way they did under Jest. If you relied on the restriction, rename the key.
The array shorthand (`createSpyFromClass(Service, ['a', 'b'])`) is additive too and becomes
`{ onlyMethodsToSpyOn: ['a', 'b'] }`. A grep for `methodsToSpyOn` finds every site, and leaving one
un-renamed spies on **more** than before rather than less — noisier, never broken.

`instanceMethodsToSpyOn` is unchanged and now behaves identically; the two differ only in what their
names tell a reader. Prefer it in new code.

### 2. Lazy method spies are the default

Enumeration is unaffected — the placeholders are enumerable accessors, so `Object.keys`, spread and
snapshots see the same keys, and `vi.isMockFunction`, `calledWith`, `resetAutoSpy` / `clearAutoSpy`
all behave as before. What changes is the property **descriptor** of an untouched method: a getter
rather than a value.

**What to do.** Nothing, unless a spec asserts on `Object.getOwnPropertyDescriptor(...).value`
before touching the method — that one needs `{ lazySpies: false }`. The reverse case, a test that
calls every method, pays 5 % in time and 1 % in memory for the accessor indirection, and that
asymmetry is why this is a default rather than a choice.

`provideAutoSpy` no longer forces the flag on, since the core does it.

### 3. The unknown-method warning moved to `onlyMethodsToSpyOn`

Under a restricting list a typo is destructive — it leaves the real method unspied — so that is
where the warning belongs.

## Then keep going

[Upgrading to 3.0](/upgrading-3) is one line of `package.json`, and
[Upgrading to 4.0](/upgrading-4) is where rxjs leaves your TypeScript program.
