---
title: Test-run hygiene
description: setupAutoSpy() — property restore, mock-registry reset and duplicate-copy detection in one call.
---

# Test-run hygiene

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

One call for three pieces of hygiene that every project otherwise assembles by hand, and that are
expensive to diagnose when they are missing.

## 1. Restoring patched properties

`vi.restoreAllMocks()` knows about spies, not about properties
[`mockReadonlyProp` / `mockValueProp`](../adapters/angular#signal-readonly-property-mocking)
redefined. Under `isolate: false` an un-restored patch on a global, a prototype or a singleton
leaks straight into the next file. `setupAutoSpy()` registers `restoreMockedProps()` in a global
`afterEach`.

## 2. One copy of the library in the process

Two copies keep two sets of console spies and two registries, so an assertion runs against a spy
that never replaced the console the code under test called — and the symptom reads as "tests fail
depending on file order". The check fails the run with a report naming both copies and what to do
about each cause: a second install, or one install loaded in both its ESM and CommonJS form.

```ts
import { describeDuplicateCopies, getPackageCopies } from 'vitest-auto-spy/setup';

getPackageCopies(); // the registered copies, for your own reporting
describeDuplicateCopies(); // the human-readable report, or undefined when there is only one
```

Both are exported from the core entry as well.

## 3. Draining the runner's restore registry

Every `vi.spyOn` adds an entry that only `vi.restoreAllMocks()` removes; with a shared environment
that list grows for the whole run. `restoreMocks: true` drains it after each test.

## Options

| Option            | Default   | Notes                                                                         |
| ----------------- | --------- | ----------------------------------------------------------------------------- |
| `duplicateCopies` | `'throw'` | `'warn'` to report without failing, `'off'` to skip the check                 |
| `restoreProps`    | `true`    | `restoreMockedProps()` in a global `afterEach`                                |
| `restoreMocks`    | `false`   | `vi.restoreAllMocks()` in a global `afterEach` — turn on for `isolate: false` |

`restoreMocks` is off by default because it also drops `vi.spyOn` stubs a suite installed in
`beforeAll`; it is the knob to reach for when the run shares one environment across files.

```ts
setupAutoSpy({ restoreMocks: true, duplicateCopies: 'warn' });
```
