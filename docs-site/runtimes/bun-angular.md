---
title: Angular on Bun
description: Set up Angular TestBed for bun test, including components with external templates.
---

# Angular on Bun (`bun:test`)

Use `vitest-auto-spy/bun-angular` to run Angular `TestBed` specs with `bun test`, even when a component
loads its template from a file with `templateUrl`. After [Setup](#setup), you can test the component
much as you would on Vitest. In `profile.component.test.ts`, check that the component renders the
name from `UserService`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/bun-angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

describe('ProfileComponent', () => {
  it('renders the name the service returns', async () => {
    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideAutoSpy(UserService)],
    });
    injectSpy(UserService).currentName.mockReturnValue('Ada');

    const fixture = TestBed.createComponent(ProfileComponent);
    await stable(fixture);

    expect(fixture.nativeElement.textContent).toContain('Hello, Ada!');
  });
});
```

You need [Angular 20 or newer](/core/compatibility#angular-20), `@angular/platform-browser` (included
in Angular CLI apps), and a DOM package.

## Setup

1. Install the library and a DOM package. Bun has no DOM of its own, and Angular's test platform
   needs `document`.

   ```bash
   bun add -d vitest-auto-spy @happy-dom/global-registrator
   ```

   You can install `jsdom` instead of `@happy-dom/global-registrator`. For editor types for `bun:test`,
   install `@types/bun` if you don't already have it. Bun reads decorator settings from `tsconfig.json`,
   so you don't need to change them in an Angular CLI project.

2. Add one **preload** to `bunfig.toml` at the project root. Bun runs it before loading your specs.

   ```toml
   # bunfig.toml
   [test]
   preload = ["vitest-auto-spy/bun-angular"]
   ```

::: warning It has to be a preload
Keep the line in `bunfig.toml` even if your spec imports `vitest-auto-spy/bun-angular`. A spec import
is too late to start inlining templates.
:::

**Common mistake:** The run stops with
`registerDomGlobals: no DOM could be installed, so Angular's TestBed cannot run.` Install one of the
DOM packages from step 1.

The preload:

- sets up `window`, `document`, and other browser globals unless a DOM already exists. It tries
  `@happy-dom/global-registrator` first, then `jsdom`;
- reads files from `templateUrl`, `styleUrl`, and `styleUrls` and inlines them in the component source
  so Angular can compile it at run time;
- sets up a **zoneless** `TestBed`: Angular detects changes from signals without Zone.js;
- calls `TestBed.resetTestingModule()` after each test. You don't need your own `afterEach` for
  `TestBed` or for spies from `provideAutoSpy`;
- creates spies with Bun's `mock()`. Use familiar methods such as `mockReturnValue` and
  `mockResolvedValue`, as with `vi.fn()` in Vitest.

## Writing a spec

When moving a Vitest spec to Bun, import `describe`, `it`, and `expect` from `bun:test`. Import the
Angular helpers from `vitest-auto-spy/bun-angular`, as in the complete spec above.

- Put a standalone component in `imports`. Put a component declared in an NgModule in `declarations`.
- `injectSpy(UserService)` returns the spy `TestBed` injects. Set its return values before
  `createComponent`.
- In the example, `ProfileComponent` has a `templateUrl`. Its template displays `Hello, {{ name }}!`.

Run the specs. Bun finds both `*.test.ts` and `*.spec.ts` files:

```bash
bun test
```

If specs pass alone but fail together, add `--isolate` to give each spec file fresh globals.

**Common mistake:** Bun specs can't set inputs declared with signal `input()`. See
[Limits worth knowing](#limits-worth-knowing).

## What you get

| Helper                                                                               | Works on Bun | Notes                                                                 |
| ------------------------------------------------------------------------------------ | :----------: | --------------------------------------------------------------------- |
| `provideAutoSpy` / `injectSpy`                                                       |      ✅      | Same as on Vitest.                                                    |
| `renderShallow` / `prepareShallow`                                                   |      ✅      | A real `ComponentFixture` without child components.                   |
| `createWithAutoSpies`                                                                |      ✅      | Creates an instance through Angular DI and spies on all dependencies. |
| `hostElement` / `queryElement`                                                       |      ✅      | Typed fixture elements, checked with `instanceof`.                    |
| `findDirective`                                                                      |      ✅      | Returns the only instance of a directive in the fixture.              |
| `stable`                                                                             |      ✅      | Waits for the component to render.                                    |
| `flushEffects`                                                                       |      ✅      | Runs pending signal effects.                                          |
| `runEffect`, `setInputs`, `settleResource`, `trackEffectRuns`, `trackRecomputations` |      ✅      | Same as on Vitest, except `setInputs` can't set a signal `input()`.   |
| The main library API (`createSpyFromClass`, `createAutoMock`, …)                     |      ✅      | Import it from `vitest-auto-spy/bun-angular` too.                     |
| `registerSignalMatchers`                                                             |      ❌      | Needs Vitest's `expect.extend`.                                       |
| `registerDirectiveMatchers`                                                          |      ❌      | Needs Vitest's `expect.extend`.                                       |
| `registerResourceMatchers`                                                           |      ❌      | Needs Vitest's `expect.extend`.                                       |
| TestBed diagnostics (`instrumentTestBed`)                                            |      ❌      | Needs Vitest's per-file hooks.                                        |
| The rest of `/angular`                                                               |      ❌      | Vitest only. See below.                                               |

Use `findDirective` to read a directive's state on Bun without registering `toHaveDirectiveApplied`.
If your component renders exactly one `HighlightDirective`, look it up after `await stable(fixture)`:

```ts
import { findDirective, stable } from 'vitest-auto-spy/bun-angular';

import { HighlightDirective } from './highlight.directive';

await stable(fixture);
const highlight = findDirective(fixture, HighlightDirective);
```

The lookup includes the fixture's host and its descendants. It throws if it finds no match or more
than one. See the [directive testing guide](/adapters/angular#a-host-for-a-directive-under-test).

Helpers from `vitest-auto-spy/angular`, `vitest-auto-spy/angular/diagnostics`, and
`vitest-auto-spy/angular/doubles` that aren't in the table stay on Vitest. This includes:

- override and diagnostics assertions;
- `extendWithAutoSpies`;
- `provideAutoSpyForToken` and its per-token defaults;
- `trackInjections` and `setupAngularTestEnv`;
- stub factories;
- stand-ins for resources, signal props, the platform, and dialogs.

## Stylesheets

The preload inlines `.css` as-is and replaces `.scss`, `.less`, and `.styl` with **empty** stylesheets.
Bun doesn't preprocess CSS, and the component can still compile and render for tests that don't
check styles.

If you need other stylesheets as text, [build your own preload](#building-your-own-preload). In the
`onLoad` hook of your `Bun.plugin`, pass the file's source text, path, and the extensions to inline:

```ts
inlineAngularResources(source, path, { inlineStyleExtensions: ['.css', '.scss'] });
```

| Option                  | Type                | Default    | Meaning                                                         |
| ----------------------- | ------------------- | ---------- | --------------------------------------------------------------- |
| `inlineStyleExtensions` | `readonly string[]` | `['.css']` | Inline these extensions as text. Leave other stylesheets empty. |

### A template or stylesheet that cannot be read

Resolve `templateUrl` and `styleUrl` relative to the component file, not the project root. If the
preload can't read the file, it reports the URL, component, full path, and file system error code
(such as `ENOENT` or `EACCES`):

```text
[vitest-auto-spy] cannot read "./profile.component.html" referenced by src/app/profile.component.ts: ENOENT at /project/src/app/profile.component.html.
The path resolves relative to the component file, not the project root; fix the templateUrl or styleUrl.
```

## What the preload resets, and what it leaves to you

The preload resets the testing module after each test. `TestBed` drops the `provideAutoSpy` spies
with the module and creates new ones for the next test.

Neither the preload nor `bun:test` restores changes from Bun's `spyOn` or the library's
`mockValueProp`. The latter replaces a property value; `restoreMockedProps()` puts it back.

On Vitest, `setupAutoSpy()` restores both after each test. It doesn't work on Bun. Instead, add a
second preload with an `afterEach` hook (see
[Bun → Nothing is restored between tests](/runtimes/bun#nothing-is-restored-between-tests)):

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular", "./bun-test-setup.ts"]
```

Put any `mock.module()` calls in the second preload too, before the code under test is imported.
Paths in `mock.module()` are relative to `bun-test-setup.ts`, just like import paths.

```ts
// bun-test-setup.ts
import { afterEach, mock } from 'bun:test';
import { restoreMockedProps } from 'vitest-auto-spy/bun-angular';

mock.module('./src/app/analytics', () => ({ track: () => undefined }));

afterEach(() => {
  restoreMockedProps();
  mock.restore();
});
```

## Building your own preload

If you already have a preload, you can reuse the helpers below to set up a DOM or inline resources.
This example shows just the DOM helper call. Importing `vitest-auto-spy/bun-angular` also runs the
standard setup, so the call returns without changing an existing DOM.

```ts
// bun-preload.ts
import { createJsdomRegistrar, registerDomGlobals } from 'vitest-auto-spy/bun-angular';

await registerDomGlobals({
  registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
});
```

| Export                                             | What it does                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `registerDomGlobals({ registrars, hasDom })`       | Tries the registrars in order and returns the name of the first that works.          |
| `createJsdomRegistrar({ load, target, url })`      | Creates a registrar for `jsdom`. `url` defaults to `http://localhost/`.              |
| `createGlobalRegistratorRegistrar({ name, load })` | Creates a registrar for `@happy-dom/global-registrator`.                             |
| `copyWindowGlobals(source, target)`                | Copies a window's globals to `target`.                                               |
| `inlineAngularResources(source, path, options)`    | Inlines `templateUrl`, `styleUrl`, and `styleUrls`. See [Stylesheets](#stylesheets). |

`registerDomGlobals` returns `undefined` if `hasDom` finds a DOM. By default, `hasDom` checks for
`globalThis.document`. If every registrar fails, the error lists all attempts.

::: details Only for a preload you build yourself: what copyWindowGlobals does
`copyWindowGlobals` always tries to overwrite `window`, `document`, `navigator`, `location`, and
`history`. It copies other globals only if they're missing from `target`.

If the runtime won't overwrite one of those five, the warning names it and shows the original
error. Without the warning, the first sign of trouble could be `document is not defined`. Move the
preload that sets up the DOM to the front of the `preload` list. If the runtime rejects any other
global, the helper keeps the runtime's value without warning.
:::

## Limits worth knowing

- **A signal `input()` does not bind.** Under Bun, Angular compiles components at run time (JIT) and
  registers only `@Input()` fields. For `input()` and `model()` fields, `componentRef.setInput('step', 5)`
  and `renderShallow`'s `inputs` log `NG0303` (Angular's "can't bind" error) and set nothing. `setInputs()`
  throws an error naming the input instead. Use `@Input()` or keep the spec on Vitest, where the Angular
  build plugin compiles the component ahead of time.
- **The inlining is a text rewrite, not a parser.** It leaves `templateUrl` alone inside comments or
  strings. If a template doesn't load, look near `@Component` for `${…}` interpolation or a regular
  expression literal. Either can confuse the rewrite.
- **Line numbers stay the same.** Inlined values fit on one line, so stack traces still point to the
  right line in the component.
- **`node_modules` is skipped.** Published Angular libraries are already compiled.
- **The entry is ESM-only.** It uses top-level `await` to wait for the DOM, which CommonJS doesn't
  support. Bun runs ESM natively.

## In depth

### Why Bun needs a preload for Angular

Angular has no `bun test` integration. Two things can stop a component spec:

1. **No DOM.** Bun doesn't provide one, and Angular needs `document` from
   `platformBrowserTesting()` onward.
2. **No template loading.** `@Component({ templateUrl: './x.html' })` names a file without importing it.
   Without its contents, Angular's run-time compiler reports `Component X is not resolved`.
   On Vitest, `@analogjs/vite-plugin-angular` inlines the template when it transforms the component
   file. On Bun, the preload does that work.
