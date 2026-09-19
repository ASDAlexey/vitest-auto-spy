---
title: Mocking localStorage in Vitest
description: Replace localStorage and sessionStorage per test with stubWebStorage — seeded, asserted as a plain record, restored between tests — and when a hand-written double, a package or a Storage.prototype spy is still the right call.
---

# Mocking `localStorage` in Vitest

Most guides answer this question with a ritual: a twenty-line `Map`-backed class, a
`vi.stubGlobal('localStorage', …)`, an `afterEach` that clears it and restores the global, and a
`vi.spyOn(Storage.prototype, 'setItem')` on top for the assertions. Every project ends up with its own
copy, and every copy forgets one of the four steps.

`stubWebStorage` is those steps as one call:

```ts
import { type WebStorageStub, stubWebStorage } from 'vitest-auto-spy/dom-stubs';

import { forgetUser, loadTheme, saveTheme } from './preferences';

describe('preferences', () => {
  let local: WebStorageStub;

  beforeEach(() => {
    local = stubWebStorage('localStorage', { items: { theme: 'dark', token: 'abc' } });
  });

  it('reads the saved theme', () => {
    expect(loadTheme()).toBe('dark');
  });

  it('writes the theme back', () => {
    saveTheme('light');

    expect(local.snapshot()).toEqual({ theme: 'light', token: 'abc' });
  });

  it('forgets the user in both storages', () => {
    const session = stubWebStorage('sessionStorage', { items: { draft: '{}' } });

    forgetUser();

    expect(local.snapshot()).toEqual({ theme: 'dark' });
    expect(session.snapshot()).toEqual({});
  });
});
```

With [`setupAutoSpy()`](/utilities/setup) in the setup file there is no `afterEach` to write: the stub
goes on through `mockValueProp`, so the `restoreMockedProps()` it runs after every test puts back
whatever the global held before — the environment's own storage, or another stub.

## What you get

- **A real `Storage`, not a bag of mocks.** `getItem`, `setItem`, `removeItem`, `clear`, `key` and
  `length` behave as the platform's do: a number written through `setItem` reads back as a string, a missing
  key reads `null`, `key()` converts its index the way an `unsigned long` does. A hand-written double that
  returns `undefined` for a missing key passes tests that the browser fails.
- **Seeded in the same call.** `items` goes in through `setItem`, so it is coerced exactly as the
  code under test would store it.
- **Asserted as data.** `snapshot()` returns a plain record — a copy, not a view — so the assertion is
  one `toEqual` on what ended up stored, which is the thing a storage test is almost always about.
- **Both globals.** It installs on `globalThis` and, when that is a separate object, on
  `document.defaultView`, because code reads `window.localStorage` as often as the bare name.
- **Any environment.** It installs in a `node` environment too: the spec asked for it.

## When the call itself is the contract

A storage test should usually assert what was stored, not how. When the write _is_ the behaviour — a
cache that must not write twice, a key that must be removed rather than overwritten — spy on the
installed storage, not on `Storage.prototype`:

```ts
it('records the write when the call itself is the contract', () => {
  const setItem = vi.spyOn(local.storage, 'setItem');

  saveTheme('dark');

  expect(setItem).toHaveBeenCalledWith('theme', 'dark');
});
```

`local.storage` is the object the global answers until the test ends, so the spy sees every call and
leaves every other `Storage` in the realm alone.

## The decision tree the other guides give you

| Approach                                        | What it costs                                                                                                                                       | Reach for it when                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A hand-written `Map` double + `stubGlobal`      | Twenty lines per project, a restore you must remember, and the coercion rules you must remember to copy                                             | Never, once `stubWebStorage` is available — it is that class, with the restore wired        |
| A `…-localstorage-mock` package in `setupFiles` | One storage for the whole file, so what one test wrote the next one reads unless an `afterEach` clears it                                           | A suite that only needs storage to _exist_ and never asserts on it                          |
| `vi.spyOn(Storage.prototype, 'setItem')`        | Patches every `Storage` in the realm, depends on the environment's storage working at all, and reads back nothing a `snapshot()` would not tell you | Asserting a call against the environment's own storage, where replacing it is not an option |
| **`stubWebStorage`**                            | One import from `vitest-auto-spy/dom-stubs`                                                                                                         | A spec that seeds storage, reads it back, or must not see what an earlier test wrote        |

## Storage that is simply missing

A different failure with the same symptoms: on Node 25 and later, `localStorage` under Vitest's
`jsdom` or `happy-dom` environment is broken before any spec touches it — `setItem is not a function`
on Node 25, `undefined` on Node 26 — because the runner's global copy skips it once Node defines its
own. That is not a spec's problem to stub around; `setupAutoSpy()` repairs it by default, and
[Web Storage the runner never handed over](/utilities/setup#_14-web-storage-the-runner-never-handed-over)
explains the mechanism. `stubWebStorage` works either way, because it replaces whatever is there.

## What it deliberately does not do

- **Named-property access.** `localStorage.token` and `Object.keys(localStorage)` do not see the items;
  go through `getItem` and `snapshot()`.
- **The `storage` event.** Nothing is dispatched to other windows, because in a test there are none.
- **A quota.** `setItem` never throws `QuotaExceededError`. To test that branch, make the call fail:
  `vi.spyOn(local.storage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); })`.

## Related

- [`stubWebStorage` in the hygiene reference](/utilities/setup#stub-web-storage) — the API and the
  repair it sits next to.
- [Observer stubs](/utilities/observer-stubs) — the same install-and-restore pattern for
  `IntersectionObserver`, `ResizeObserver` and `MutationObserver`.
