/**
 * `vitest-auto-spy/bun-angular` — run Angular's `TestBed` under `bun test`.
 *
 * ```toml
 * # bunfig.toml
 * [test]
 * preload = ["vitest-auto-spy/bun-angular"]
 * ```
 *
 * ```ts
 * import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/bun-angular';
 * ```
 *
 * Angular has no `bun test` integration of its own: Bun ships no DOM, and a component declared with
 * `templateUrl` cannot be compiled just-in-time because nothing in the module graph points at the
 * HTML file. This entry closes both gaps, in the order a preload must do them:
 *
 * 1. installs a DOM (`@happy-dom/global-registrator`, else `jsdom`) unless one is already there;
 * 2. registers a `Bun.plugin` `onLoad` hook that inlines `templateUrl` / `styleUrl` / `styleUrls`
 *    into the component source, the job `@analogjs/vite-plugin-angular` does under Vitest;
 * 3. initialises a **zoneless** `TestBed` environment and resets it after every test;
 * 4. registers the Bun mock adapter (via `vitest-auto-spy/bun`) and re-exports the Angular helpers.
 *
 * It must be a **preload**: a `Bun.plugin` hook only sees modules loaded after it is registered, so
 * importing this from inside a spec is too late for the component under test. Importing it from a
 * spec as well is harmless — the module is cached, and both halves of it are guarded.
 *
 * Two Vitest-only helpers are deliberately absent, because they need the runner's `expect` and
 * suite-level hooks: `registerSignalMatchers` and the `testbed-diagnostics` family. Everything else
 * — `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`,
 * `flushEffects` — behaves exactly as it does on Vitest.
 */
import '@angular/compiler';
import { NgModule, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { type BunOnLoadArgs, type BunOnLoadResult, type BunPluginBuilder, plugin } from 'bun';
import { afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';

import { inlineAngularResources } from './lib/angular-resource-inliner';
import { createGlobalRegistratorRegistrar, createJsdomRegistrar, registerDomGlobals } from './lib/dom-globals';

/** Guards the once-per-global work when a file is re-preloaded (`bun test --isolate`) or re-imported. */
const BUN_ANGULAR_SETUP = Symbol.for('vitest-auto-spy:bun-angular');

// 1. A DOM first: `@angular/*` modules import fine without one, but everything from
//    `platformBrowserTesting()` onwards reads `document`. Bun awaits a preload's top-level `await`
//    before it loads the first test file, so this is finished by the time any spec runs.
await registerDomGlobals({
  registrars: [
    createGlobalRegistratorRegistrar({ name: '@happy-dom/global-registrator', load: () => import('@happy-dom/global-registrator') }),
    createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis }),
  ],
});

if (Reflect.get(globalThis, BUN_ANGULAR_SETUP) !== true) {
  Reflect.set(globalThis, BUN_ANGULAR_SETUP, true);

  // 2. Inline external component resources. `node_modules` is skipped: published Angular libraries
  //    are already compiled, so they skip the rewrite.
  plugin({
    name: 'vitest-auto-spy:angular-resources',
    setup(build: BunPluginBuilder): void {
      build.onLoad({ filter: /\.ts$/ }, ({ path }: BunOnLoadArgs): BunOnLoadResult => {
        const source = readFileSync(path, 'utf8');
        // Bun requires a hook to return contents — there is no "fall through to the default loader",
        // so a file with nothing to inline is handed straight back.
        const inlined = path.includes('node_modules') ? undefined : inlineAngularResources(source, path);

        return { contents: inlined ?? source, loader: 'ts' };
      });
    },
  });

  // 3. A zoneless TestBed environment. The decorator is applied as a plain call so the published
  //    bundle carries no `__decorate` helper and no dependency on the consumer's decorator setting.
  const ZonelessTestModule = NgModule({ providers: [provideZonelessChangeDetection()] })(class ZonelessTestModule {});

  getTestBed().initTestEnvironment([BrowserTestingModule, ZonelessTestModule], platformBrowserTesting());

  // Vitest resets the module between files; `bun test` shares one global unless `--isolate` is on,
  // so the reset has to be explicit — otherwise the second `configureTestingModule` of the run
  // fails with "the test module has already been instantiated".
  afterEach((): void => {
    TestBed.resetTestingModule();
  });
}

// 4. The core API on Bun's mocks — importing `./bun` is what registers the Bun adapter.
export * from './bun';

export { injectSpy, provideAutoSpy, type AngularValueProvider } from './lib/angular';
export { renderShallow, type ComponentInputs, type RenderShallowOptions, type ShallowRender } from './lib/render-shallow';
export {
  createWithAutoSpies,
  type AutoSpiedInstance,
  type CreateWithAutoSpiesOptions,
  type SpyRegistry,
} from './lib/create-with-auto-spies';
export { flushEffects, stable } from './lib/zoneless';

// The pieces a project with its own preload can reuse instead of this entry's defaults.
export { inlineAngularResources, type AngularResourceInlinerOptions } from './lib/angular-resource-inliner';
export {
  copyWindowGlobals,
  createGlobalRegistratorRegistrar,
  createJsdomRegistrar,
  registerDomGlobals,
  type DomRegistrar,
  type GlobalRegistratorOptions,
  type JsdomModule,
  type JsdomRegistrarOptions,
  type RegisterDomGlobalsOptions,
} from './lib/dom-globals';
