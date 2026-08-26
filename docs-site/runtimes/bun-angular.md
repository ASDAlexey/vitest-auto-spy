---
title: Angular on Bun
description: Run Angular's TestBed under bun test — DOM, JIT templates and zoneless change detection from one preload.
---

# Angular on Bun (`bun:test`)

Angular has no `bun test` integration of its own. Two things are missing, and both are fatal on
their own:

1. **No DOM.** Bun ships none, and everything from `platformBrowserTesting()` onwards reads
   `document`.
2. **No template resolution.** `@Component({ templateUrl: './x.html' })` is not an import — nothing
   in the module graph points at the HTML file — so Angular's JIT compiler refuses to build the
   component (_"Component X is not resolved"_). Under Vitest, `@analogjs/vite-plugin-angular` inlines
   it during transform. Bun has no such transform.

`vitest-auto-spy/bun-angular` closes both, plus the wiring around them, from a single preload.

## Setup

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular"]
```

```bash
bun add -d @happy-dom/global-registrator   # or: bun add -d jsdom
```

That is the whole configuration. On load the entry:

1. installs a DOM — `@happy-dom/global-registrator` if present, otherwise `jsdom`, and nothing at all
   if a DOM is already there;
2. registers a `Bun.plugin` `onLoad` hook that inlines `templateUrl` / `styleUrl` / `styleUrls` into
   the component source;
3. initialises a **zoneless** `TestBed` environment and resets the testing module after each test;
4. registers the Bun mock adapter, so every spy helper is Bun's.

::: warning It has to be a preload
A `Bun.plugin` hook only sees modules loaded **after** it is registered. Importing this entry from
inside a spec is too late for the component under test — its template will not be inlined. Importing
it from a spec **as well** is fine: the module is cached and every step is guarded.
:::

## Writing a spec

From here a spec reads exactly like its Vitest counterpart.

```ts
// greeting.test.ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';

import { GreetingComponent } from './greeting.component'; // declared with templateUrl
import { GreetingService } from './greeting.service';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/bun-angular';

describe('GreetingComponent', () => {
  it('renders the name the service returns', async () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(GreetingService)] });

    injectSpy(GreetingService).currentName.mockReturnValue('external user');

    const fixture = TestBed.createComponent(GreetingComponent);

    await stable(fixture);

    expect(fixture.nativeElement.textContent).toContain('Hello, external user!');
  });
});
```

```bash
bun test              # add --isolate for a fresh global per file
```

## What you get

| Helper                                    | Works on Bun | Notes                                                   |
| ----------------------------------------- | :----------: | ------------------------------------------------------- |
| `provideAutoSpy` / `injectSpy`            |      ✅      | identical to the Vitest entry, lazy spies by default    |
| `renderShallow`                           |      ✅      | real `ComponentFixture`, child subtree dropped          |
| `createWithAutoSpies`                     |      ✅      | builds a class through Angular DI with every dep spied  |
| `stable` / `flushEffects`                 |      ✅      | zoneless waiting                                        |
| the whole core (`createSpyFromClass`, …)  |      ✅      | re-exported from this entry                             |
| `registerSignalMatchers`                  |      ❌      | needs the runner's `expect.extend` — Vitest only        |
| TestBed diagnostics (`instrumentTestBed`) |      ❌      | needs suite-level runner hooks — Vitest only            |

## Stylesheets

A test runner has no CSS pre-processor, and no spec asserts on styles. So `.css` is inlined verbatim
and everything else (`.scss`, `.less`, `.styl`) becomes an **empty** stylesheet — the component still
compiles and renders. Override it if you genuinely need the text:

```ts
inlineAngularResources(source, path, { inlineStyleExtensions: ['.css', '.scss'] });
```

## Building your own preload

Every piece is exported, so a project with its own preload can compose them instead of taking the
defaults:

```ts
// bun-preload.ts
import { createJsdomRegistrar, inlineAngularResources, registerDomGlobals } from 'vitest-auto-spy/bun-angular';

await registerDomGlobals({
  registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
});
```

`registerDomGlobals` returns the name of the registrar that installed the DOM, or `undefined` when
one was already present, and throws with every attempt listed when none worked.

## Limits worth knowing

- **The rewrite is textual, not a parse.** It skips comments and string literals — a `templateUrl`
  written in prose is left alone — but it does not track `${…}` interpolation or regex literals.
- **Line numbers are preserved.** Every inlined value is a single-line literal, so a failing spec's
  stack trace still points at the component's own line.
- **`node_modules` is skipped.** Published Angular libraries are already compiled.
- **This entry is ESM-only.** It awaits its DOM registrar at the top level, which has no CommonJS
  form. Bun runs ESM natively, so nothing is lost.
