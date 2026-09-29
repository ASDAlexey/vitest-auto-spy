---
title: Mocking localStorage in Vitest
description: Replace localStorage or sessionStorage for one test with stubWebStorage - fill it, check what was stored, and get it restored automatically; when a spy on setItem or another approach fits better.
---

# Mocking `localStorage` in Vitest

`stubWebStorage` replaces `localStorage` or `sessionStorage` with a fresh in-memory storage for one
test. You can fill it in the same call and check what ended up stored with one `toEqual`.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
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

**Restore after each test.** Call [`setupAutoSpy()`](/utilities/setup) once in your setup file (the
file listed in `setupFiles` of your Vitest config). It puts back the original storage after every
test, so you write no `afterEach`:

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

Without `setupAutoSpy()`, restore it yourself:

```ts
import { afterEach } from 'vitest';
import { restoreMockedProps } from 'vitest-auto-spy';

afterEach(() => restoreMockedProps());
```

## Options and return value

`stubWebStorage(key?, options?)`

| Argument        | Type                                 | Default                | Meaning                                                                       |
| --------------- | ------------------------------------ | ---------------------- | ----------------------------------------------------------------------------- |
| `key`           | `'localStorage' \| 'sessionStorage'` | `'localStorage'`       | which global to replace                                                       |
| `options.items` | `Record<string, string>`             | empty                  | what the storage holds at the start; stored through `setItem`                 |
| `options.view`  | `object \| null`                     | `document.defaultView` | another window object to install on too; `null` installs on `globalThis` only |

You rarely need `view`. By default the stub goes on `globalThis` and also on `document.defaultView`
(the `window` of `jsdom` or `happy-dom`) when that is a different object. `view` replaces that
second target:

- pass another window object when your code reads storage from it, for example a fake `window` you
  inject;
- pass `null` to install on `globalThis` only; `window.localStorage` then keeps the environment's
  storage.

**Preload values with `items`.** `getItem` is a real method, not a spy. To force one answer anyway,
spy on it: `vi.spyOn(local.storage, 'getItem').mockReturnValue('dark')`.

It returns a `WebStorageStub`:

| Member       | What it is                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| `storage`    | the installed `Storage` object, the one the global returns until the test ends |
| `snapshot()` | a plain-object copy of what the storage holds right now                        |

## What the stub behaves like

- **A real `Storage`.** `getItem`, `setItem`, `removeItem`, `clear`, `key` and `length` work like the
  browser's. A number written with `setItem` reads back as a string. A missing key reads `null`, not
  `undefined`. A hand-written fake often gets these wrong and passes tests the browser would fail.
- **Filled like real code fills it.** `items` go in through `setItem`, so values are converted the
  same way.
- **Checked as data.** `snapshot()` returns a copy, so one `toEqual` checks the whole storage.
- **Both names.** In `jsdom` and `happy-dom`, `window` can be a different object from `globalThis`.
  The stub installs on both, so `localStorage` and `window.localStorage` return the same stub.
- **Any environment.** It also works in the `node` test environment, which has no storage of its own.

## Check that a specific call happened

Usually a test should check _what_ was stored, not _how_. Sometimes the call itself is the behaviour:
a cache that must not write twice, or a key that must be removed rather than overwritten. Then spy on
the installed storage, not on `Storage.prototype`:

```ts
it('writes the theme once', () => {
  const setItem = vi.spyOn(local.storage, 'setItem');

  saveTheme('dark');

  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledWith('theme', 'dark');
});
```

The spy sees every call your code makes, and it leaves every other `Storage` object alone.

## Test a "storage is full" error

The stub has no size limit, so `setItem` never throws on its own. Make it throw:

```ts
vi.spyOn(local.storage, 'setItem').mockImplementation(() => {
  throw new DOMException('full', 'QuotaExceededError');
});
```

## Compared with other approaches

| Approach                                        | Downside                                                                                                          | Use it when                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A hand-written `Map` fake + `vi.stubGlobal`     | About twenty lines per project; you must remember the restore and copy the conversion rules                       | Rarely: `stubWebStorage` already is this fake, with the restore built in |
| A `…-localstorage-mock` package in `setupFiles` | One storage for the whole file: what one test writes, the next one reads, unless you clear it                     | Your tests only need storage to exist and never check its contents       |
| `vi.spyOn(Storage.prototype, 'setItem')`        | Patches every `Storage` object; depends on the environment's storage (from `jsdom` or `happy-dom`) working at all | You must check calls on the environment's own storage                    |
| **`stubWebStorage`**                            | One import from `vitest-auto-spy/dom-stubs`                                                                       | A spec fills storage, reads it back, or must start empty                 |

## Troubleshooting: `localStorage` is broken on Node 25 and later

Under Vitest's `jsdom` or `happy-dom` environment on Node 25+, `localStorage` can be broken before
any spec runs:

- Node 25: `setItem is not a function`;
- Node 26: `localStorage` is `undefined`.

The cause: Node 25 added its own global `localStorage`. Vitest copies the DOM environment's globals
onto the test's global object, but it skips names that already exist. So the Node version stays,
and the working one from `jsdom` or `happy-dom` never arrives. `setupAutoSpy()` fixes this by
default. The details are in
[Web Storage the runner never handed over](/utilities/setup#_14-web-storage-the-runner-never-handed-over).
`stubWebStorage` works either way, because it replaces whatever is there.

## Limits

- **No property access to items.** `localStorage.token` and `Object.keys(localStorage)` do not see
  the items. Use `getItem` and `snapshot()`.
- **No `storage` event.** Nothing is sent to other windows; a test has none.
- **No size limit.** See [Test a "storage is full" error](#test-a-storage-is-full-error).

## Related

- [`stubWebStorage` in the setup reference](/utilities/setup#stub-web-storage): the API next to the
  Node 25 fix.
- [Observer stubs](/utilities/observer-stubs): the same install-and-restore pattern for
  `IntersectionObserver`, `ResizeObserver` and `MutationObserver`.
