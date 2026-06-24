# Migrating from jest-auto-spies

The public API is intentionally identical to
[`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies). In most projects the migration
is a **find-and-replace of the import**:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // once, if you use observable spies
```

The only API-shape change is that the Angular helpers and the observable layer live behind the
`/angular` and `/rxjs` subpaths (see [Installation → Entry points](/core/installation)).

## Mapping table

| jest-auto-spies | vitest-auto-spy | Status |
| --- | --- | --- |
| `createSpyFromClass` | `createSpyFromClass` | ✅ identical |
| `provideAutoSpy` | `provideAutoSpy` (from `/angular`) | ✅ identical |
| `calledWith` / `mustBeCalledWith` | same | ✅ identical |
| `resolveWith` / `rejectWith` / `resolveWithPerCall` | same | ✅ identical |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | same | ✅ identical |
| `throwWith` / `complete` / `returnSubject` | same | ✅ identical |
| `accessorSpies.getters/setters` | same | ✅ identical |
| `createObservableWithValues` | same (from `/rxjs`) | ✅ identical |
| underlying mock | `jest.fn()` → `vi.fn()` | 🔁 swapped |

Just make sure your tests run under Vitest (or Bun / `node:test` via the matching entry), and — for
Angular — that `TestBed` is set up.

<!-- TODO: expand — add a step-by-step checklist and notes on per-runner gotchas. -->
