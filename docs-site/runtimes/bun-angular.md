---
title: Angular on Bun
description: Run Angular TestBed specs under bun test with one preload line - a DOM, inlined templates and a zoneless TestBed.
---

# Angular on Bun (`bun:test`)

`vitest-auto-spy/bun-angular` lets you run Angular `TestBed` specs with `bun test`. Use it when Bun is
your test runner and your components have a `templateUrl`. You add one preload line, and a component
spec works the same way it does on Vitest.

```ts
// profile.component.test.ts (ProfileComponent has a templateUrl; its template shows "Hello, {{ name }}!")
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
    await stable(fixture); // waits until the component has rendered

    expect(fixture.nativeElement.textContent).toContain('Hello, Ada!');
  });
});
```

You need Angular 20 or newer with `@angular/platform-browser` (every Angular CLI app has it) and a
DOM package ([why Angular 20](/core/compatibility#angular-20)). The setup takes two steps.

## Setup

1. Install the library and a DOM. Bun has no DOM, and Angular's test platform needs `document`.

   ```bash
   bun add -d vitest-auto-spy @happy-dom/global-registrator   # or jsdom instead of happy-dom
   ```

   For editor types of `bun:test`, add `@types/bun` if the project does not have it yet. Bun reads the decorator settings from your `tsconfig.json`, so an Angular CLI project needs no config change.

2. Add the entry as a **preload** in `bunfig.toml` at the project root. A preload is a file Bun runs
   before any spec file.

   ```toml
   # bunfig.toml
   [test]
   preload = ["vitest-auto-spy/bun-angular"]
   ```

That is the whole configuration. When the preload runs, it:

1. sets up a DOM (`window`, `document` and the other browser globals) with
   `@happy-dom/global-registrator`, or with `jsdom` if happy-dom is missing. If a DOM is already there,
   it skips this step;
2. inlines each component's `templateUrl`, `styleUrl` and `styleUrls` into the component source, so
   Angular can compile the component at run time;
3. sets up a **zoneless** `TestBed` (Angular without zone.js; change detection runs on signals);
4. calls `TestBed.resetTestingModule()` after each test. You need no `afterEach` of your own for
   `TestBed` or for spies from `provideAutoSpy`;
5. makes every spy a Bun `mock()` function, so you configure it with Bun's methods such as
   `mockReturnValue`.

::: warning It has to be a preload
Do not replace the `bunfig.toml` line with an import in a spec. Template inlining must start before
Bun loads any spec file, and only a preload runs that early.
:::

**Common mistake:** no DOM package installed. The run stops with
`registerDomGlobals: no DOM could be installed, so Angular's TestBed cannot run.` Install one of the
two packages from step 1.

## Writing a spec

A spec looks exactly like its Vitest version, with `describe`, `it` and `expect` from `bun:test`. The
example at the top of the page is a complete spec:

- a standalone component goes in `imports`; a component declared in an NgModule goes in
  `declarations`;
- `injectSpy(UserService)` returns the spy that `TestBed` injects. Set its answers before
  `createComponent`;
- `bun test` finds `*.test.ts` and `*.spec.ts` files.

Run it with `bun test`. If specs pass one by one but fail together, add `--isolate`: each spec file
then gets fresh globals.

```bash
bun test
```

**Common mistake:** if your component declares its inputs with signal `input()`, a spec cannot set
them under Bun. See [Limits worth knowing](#limits-worth-knowing).

## What you get

| Helper                                                                               | Works on Bun | Notes                                                                    |
| ------------------------------------------------------------------------------------ | :----------: | ------------------------------------------------------------------------ |
| `provideAutoSpy` / `injectSpy`                                                       |      ✅      | same as on Vitest                                                        |
| `renderShallow` / `prepareShallow`                                                   |      ✅      | a real `ComponentFixture` without child components                       |
| `createWithAutoSpies`                                                                |      ✅      | builds a class through Angular DI with every dependency spied            |
| `hostElement` / `queryElement`                                                       |      ✅      | typed elements from the fixture, checked with `instanceof`               |
| `stable`                                                                             |      ✅      | waits until the component has rendered                                   |
| `flushEffects`                                                                       |      ✅      | runs pending signal effects                                              |
| `runEffect`, `setInputs`, `settleResource`, `trackEffectRuns`, `trackRecomputations` |      ✅      | same as on Vitest (`setInputs` cannot set a signal `input()`, see below) |
| the library's main API (`createSpyFromClass`, `createAutoMock`, …)                   |      ✅      | exported from this entry too                                             |
| `registerSignalMatchers`                                                             |      ❌      | needs Vitest's `expect.extend`                                           |
| `registerDirectiveMatchers`                                                          |      ❌      | needs Vitest's `expect.extend`                                           |
| `registerResourceMatchers`                                                           |      ❌      | needs Vitest's `expect.extend`                                           |
| TestBed diagnostics (`instrumentTestBed`)                                            |      ❌      | needs Vitest's per-file hooks                                            |
| the rest of `/angular`                                                               |      ❌      | Vitest only, listed below                                                |

"The rest of `/angular`" means everything from `vitest-auto-spy/angular`,
`vitest-auto-spy/angular/diagnostics` and `vitest-auto-spy/angular/doubles` that is not in the table.
This entry does not export any of it:

- the override and diagnostics assertions;
- `extendWithAutoSpies`;
- `provideAutoSpyForToken` and its per-token defaults;
- `trackInjections` and `setupAngularTestEnv`;
- the stub factories;
- the stand-ins for resources, signal props, the platform and dialogs.

## Stylesheets

Tests do not check styles, and Bun has no CSS pre-processor. So the preload inlines `.css` files as
they are, and turns `.scss`, `.less` and `.styl` into an **empty** stylesheet. The component still
compiles and renders.

If you need the text of other stylesheets, build your own preload (see
[Building your own preload](#building-your-own-preload)). In its `Bun.plugin` `onLoad` hook, call
`inlineAngularResources` with the file's source text and path, and list the extensions in
`inlineStyleExtensions`:

```ts
inlineAngularResources(source, path, { inlineStyleExtensions: ['.css', '.scss'] });
```

| Option                  | Type                | Default    | Meaning                                   |
| ----------------------- | ------------------- | ---------- | ----------------------------------------- |
| `inlineStyleExtensions` | `readonly string[]` | `['.css']` | stylesheets inlined as text; others empty |

### A template or stylesheet that cannot be read

A `templateUrl` or `styleUrl` path is relative to the component file. If the file cannot be read, the
preload names the URL, the component, the file system error code (`ENOENT`, `EACCES`) and the full
path it tried:

```text
[vitest-auto-spy] cannot read "./profile.component.html" referenced by src/app/profile.component.ts: ENOENT at /project/src/app/profile.component.html.
The path resolves relative to the component file, not the project root; fix the templateUrl or styleUrl.
```

## What the preload resets, and what it leaves to you

Spies from `provideAutoSpy` need nothing extra. Each `TestBed` builds new ones, and the reset after
each test drops them.

The preload resets the testing module after each test, and nothing else. `bun:test` does not restore
anything either. This matters if your specs use:

- Bun's `spyOn`;
- the library's `mockValueProp`, which replaces a property value. `restoreMockedProps()` undoes it.

On Vitest, the library's `setupAutoSpy()` restores these after each test. `setupAutoSpy()` does not work on Bun
(see [Bun → Nothing is restored between tests](/runtimes/bun#nothing-is-restored-between-tests)), so
add a second preload file with an `afterEach`. Put any `mock.module()` there too: a module mock has to
apply before the code under test is imported. The path you pass to `mock.module()` is relative to
`bun-test-setup.ts`, as in a normal import.

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular", "./bun-test-setup.ts"]
```

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

If your project already has a preload, you can build the setup from the exported pieces instead of
using the entry. This example installs only the DOM:

```ts
// bun-preload.ts
import { createJsdomRegistrar, inlineAngularResources, registerDomGlobals } from 'vitest-auto-spy/bun-angular';

await registerDomGlobals({
  registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
});
```

| Export                                             | What it does                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `registerDomGlobals({ registrars, hasDom })`       | tries each registrar in order and returns the name of the one that worked (details below) |
| `createJsdomRegistrar({ load, target, url })`      | a registrar backed by `jsdom`; `url` defaults to `http://localhost/`                      |
| `createGlobalRegistratorRegistrar({ name, load })` | a registrar backed by `@happy-dom/global-registrator`                                     |
| `copyWindowGlobals(source, target)`                | copies a window's globals onto `target`                                                   |
| `inlineAngularResources(source, path, options)`    | inlines `templateUrl` / `styleUrl` / `styleUrls`; see [Stylesheets](#stylesheets)         |

`registerDomGlobals` returns `undefined` if a DOM is already there. `hasDom` decides that; by default it
checks for `globalThis.document`. If no registrar works, it throws and lists every attempt.

::: details Only for a preload you build yourself: what copyWindowGlobals does
`copyWindowGlobals` always overwrites five globals: `window`, `document`, `navigator`, `location` and
`history`. Other globals are copied only where the target has none. If the runtime refuses to
redefine one of the five, you get a warning that names it, with the runtime's error. Without the
warning, the run would fail later with `document is not defined`. If you see this warning, put the preload that sets up the DOM first in the `preload` list. If the runtime refuses any other global, the copy skips it quietly and
keeps the runtime's own version.
:::

## Limits worth knowing

- **A signal `input()` does not bind.** Under Bun, Angular compiles components at run time (JIT), and
  that compiler only registers `@Input()` fields. So `componentRef.setInput('step', 5)` and the
  `inputs` of `renderShallow` log `NG0303` (Angular's "can't bind" error) and set nothing on an `input()` or `model()` field. Declare
  such an input with `@Input()`, or keep that spec on Vitest, where the Angular build plugin compiles
  the component ahead of time. The library's `setInputs()` helper hits the same limit, but it throws an error that names the input instead of doing nothing.
- **The inlining is a text rewrite, not a parser.** A `templateUrl` that appears inside a comment or inside another string is left as it is. A `${…}` interpolation or a regular expression literal can confuse it. If a template does not load, look for one near the `@Component` decorator.
- **Line numbers stay the same.** Every inlined value is a one-line literal, so a stack trace still
  points at the right line of the component.
- **`node_modules` is skipped.** Published Angular libraries are already compiled.
- **The entry is ESM-only.** It waits for its DOM with a top-level `await`, which CommonJS cannot do.
  Bun runs ESM natively, so this costs nothing.

## In depth

### Why Bun needs a preload for Angular

Angular has no `bun test` integration. Two things are missing, and either one stops every component
spec:

1. **No DOM.** Bun does not include one, and everything from `platformBrowserTesting()` onwards reads
   `document`.
2. **No template loading.** `@Component({ templateUrl: './x.html' })` is not an import, so nothing
   loads the HTML file. Angular's run-time compiler then refuses to build the component
   (_"Component X is not resolved"_). On Vitest, `@analogjs/vite-plugin-angular` inlines the template
   while it transforms the file. Bun has no such step, so the preload does it.
