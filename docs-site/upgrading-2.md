---
title: Upgrading to 2.0
description: What to change when you move from 1.x to 2.0 - usually nothing, one rename at most. methodsToSpyOn now adds spies instead of removing them, and method spies are created lazily.
---

# Upgrading to 2.0

Version 2.0 changes how `methodsToSpyOn` works and creates method spies lazily. Most projects change
nothing. At most you rename one option:

```diff
- createSpyFromClass(ApiService, { methodsToSpyOn: ['get', 'post'] });   // 1.x: only these two
+ createSpyFromClass(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }); // 2.x: only these two
```

**Checklist**

1. Search for `methodsToSpyOn`. If a spec relies on it to spy on **only** the listed methods, rename
   it to `onlyMethodsToSpyOn`. Details: [section 1](#_1-methodstospyon-adds-instead-of-restricting).
2. Search for `Object.getOwnPropertyDescriptor(...).value` on a spy. If a spec reads it before
   calling the method, pass `{ lazySpies: false }`. Details:
   [section 2](#_2-lazy-method-spies-are-the-default).
3. Nothing else changes.

## Why upgrade

The numbers come from real test projects, not from a benchmark.

| What you get                                                                                                                                                | Measured                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`methodsToSpyOn` no longer removes spies.** In 1.x, listing two methods dropped every other one, and the test failed deep inside a component constructor. | One migrated component went from **147 of 147 failing tests to 4**. Two independent projects had worked around the option **739** and **572** times. |
| **Method spies are lazy in every factory.** A method becomes a spy the first time a test touches it.                                                        | 2 000 spies of a 40-method class, the test touches two methods: **257 ms → 27 ms, 425 MB → 35 MB**. Nine times faster, a twelfth of the memory.      |
| **The unknown-method warning fires only where it helps.** It now checks `onlyMethodsToSpyOn`, where a typo loses a spy.                                     | —                                                                                                                                                    |

## What changed

### 1. `methodsToSpyOn` adds instead of restricting

In 1.x, an explicit `methodsToSpyOn` list **replaced** the methods found on the class. In 2.0 the
list **adds** to them. This is what `jest-auto-spies` always did.

If you want only the listed methods to be spies, use `onlyMethodsToSpyOn`:

```diff
- createSpyFromClass(ApiService, { methodsToSpyOn: ['get', 'post'] });   // 1.x: only these two
+ createSpyFromClass(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }); // 2.x: only these two
```

**What to do:**

- You came from `jest-auto-spies` and never thought about this option: nothing. Your specs now
  behave as they did under Jest.
- You relied on the restriction: rename the key.
- The array shorthand `createSpyFromClass(Service, ['a', 'b'])` also adds now. To restrict, write
  `{ onlyMethodsToSpyOn: ['a', 'b'] }`.

If you miss a rename, the spy gets **more** methods than before, not fewer. The spec gets noisier,
but it does not break.

`instanceMethodsToSpyOn` is unchanged and now behaves exactly like `methodsToSpyOn`. The names
differ only in what they tell a reader. Prefer `instanceMethodsToSpyOn` in new code.

### 2. Lazy method spies are the default

A method now becomes a spy on first access, not when the spy object is built.

These behave as before:

- `Object.keys`, spread and snapshots see the same keys. The placeholders are enumerable getters.
- `vi.isMockFunction`, `calledWith`, `resetAutoSpy` and `clearAutoSpy`.

One thing changes: before first access, the property descriptor of a method is a getter, not a
value.

**What to do:** nothing, unless a spec checks `Object.getOwnPropertyDescriptor(...).value` before it
touches the method. Pass `{ lazySpies: false }` to that spy.

A test that calls every method pays about 5 % in time and 1 % in memory for the getter. A test that
touches a few methods saves far more, so lazy is the default.

`provideAutoSpy` no longer turns the flag on by itself. The core does it for every factory.

Before 2.0, only `provideAutoSpy` used lazy spies, so the Angular path was faster than the plain one
for no visible reason.

### 3. The unknown-method warning moved to `onlyMethodsToSpyOn`

With an additive list, naming a method the class does not have is valid. It is how you spy on a
function assigned in the constructor. So the old warning fired on correct code.

With a restricting list, a typo leaves the real method without a spy. So the warning now checks
`onlyMethodsToSpyOn`.

## Then keep going

[Upgrading to 3.0](/upgrading-3) is one line in `package.json`.
[Upgrading to 4.0](/upgrading-4) takes rxjs out of your TypeScript program.
