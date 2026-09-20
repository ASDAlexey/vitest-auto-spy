---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: vitest-auto-spy
description: The only auto-spy library that reads a real class and returns a fully-typed spy of every method, with control helpers that follow each return type — identical on Vitest, Bun, node:test and Rstest. Drop-in replacement for jest-auto-spies and jasmine-auto-spies, with a codemod that finishes the move.

hero:
  name: 'vitest-auto-spy'
  text: 'A typed spy of every method, read off the class'
  tagline: 'Point it at a class and every method comes back spied, typed, and carrying the helpers its own return type earns. One API on Vitest, bun:test, node:test and Rstest.'
  actions:
    - theme: brand
      text: Get started
      link: /core/introduction
    - theme: alt
      text: Why not the one you have
      link: /comparison
    - theme: alt
      text: View on GitHub
      link: https://github.com/ASDAlexey/vitest-auto-spy

features:
  - title: Every method, from the real class
    details: 'createSpyFromClass reads the prototype, so the double carries the class own methods, overloads and signatures — and a call the real method rejects will not compile on the double either.'
    link: /core/create-spy-from-class
  - title: Helpers that follow the return type
    details: 'A method returning a Promise gets resolveWith and rejectWith, one returning an Observable gets nextWith and throwWith, and every method gets calledWith, mustBeCalledWith and failWith. Reading a value back, narrow.defined returns it with null and undefined stripped inside the expression that needs it; toBeDefined() in Vitest 5.0 narrows nothing, and assert.exists narrows but returns nothing, so every optional read costs a statement and a local. adoptMock hands the same helpers to a vi.fn() that a vi.mock factory already built, with the calls it recorded kept.'
    link: /core/control-helpers
  - title: Spy defaults that live with the class
    details: 'registerAutoSpyDefaults(Router, config) once in a setup file and every provideAutoSpy or createSpyFromClass starts from it — merged with what the call site adds, not replaced. One Angular suite carried 23 different configurations of the same class across 109 spec files; a dozen classes go in as one table, each row checked against its own class, and an InjectionToken registers the same way from vitest-auto-spy/angular, clearAutoSpyDefaults taking one row back.'
    link: /core/create-spy-from-class
  - title: Vitest 5 on the same install
    details: 'One package spans Vitest 2.1 through 5.x — no second major, no version-split types, no edit to a spec. The same suite runs 7.7 % faster on Vitest 5, and the bundled spy engine adds another 8.1 % over vi.fn().'
    link: /runtimes/vitest#vitest-5
  - title: One core, four runtimes
    details: 'vi.fn() and its equivalents sit behind an adapter that each entry point registers on import, so the same spec file runs on Vitest, bun:test, node:test and Rstest.'
    link: /runtimes/vitest
  - title: Angular, NestJS, React, Vue, Svelte
    details: 'Every framework has its own entry point — DI providers, a shallow TestBed that skips the child subtree, child stubs that createComponentStub reads off the real definition so the selector and the inputs cannot drift, signals and resources a spec can drive by hand, plus matchers no runner ships — registerSignalMatchers adds toHaveSignalValue, which reads the signal and deep-compares its value, where expect(signal).toBeTruthy() passes for every signal ever created because a signal is a function; registerResourceMatchers and registerDirectiveMatchers assert the status of a resource and the directives a fixture applied. provideActivatedRoute gives Angular its own ActivatedRoute over one record, createActivatedRoute the same without a TestBed; a setter on injectActivatedRoute() replaces the snapshot first and emits only the streams that moved, where the setRouteParam of Spectator 22.1 re-emits all five. stubWebStorage swaps localStorage for one test, and restoreMockedProps puts the old one back. createSpyFromInstance with passthrough spies a real TestBed service in place, calls recorded and the real methods kept.'
    link: /adapters/angular
  - title: The providers every suite hand-rolls
    details: 'provideRouterDouble derives url, routerState and events from one URL instead of the four a hand-built Router guesses at, and navigate answers true; setCurrentNavigation puts a navigation in flight, so currentNavigation() answers the extras.state or the trigger a component reads without the instanceMethodsToSpyOn a hand-rolled double needs for a field Angular 20.2 moved off the prototype, and a NavigationStart pushed through emitNavigation starts one while a NavigationEnd, NavigationCancel, NavigationError or NavigationSkipped drops it back to null the way the real router does; provideWindowDouble and provideDocumentDouble merge what the spec names over the real jsdom object, so the member nobody thought of still answers and the globals are never patched; provideMatDialogData and provideMatDialogRef cover the Material dialog trio while @angular/material stays out of this package. mockSignalProp writes through a member that already is a signal(), model() or linkedSignal() — or a read-only asReadonly() view of one — rather than replacing it, so a computed, an effect or a template that read it first is still connected; setInputs changes an input mid-test, and trackRecomputations and trackEffectRuns count what actually re-ran. Each one has a twin that needs no TestBed — createRouterDouble, createWindowDouble, createDocumentDouble, createMatDialogRef — while injectRouterDouble and injectMatDialogRef read the handle back inside the test.'
    link: /adapters/angular
  - title: Angular signal forms, in a spec
    details: 'Signal forms are stable from Angular 22 and no testing tool ships for them; form() injects, so the call a spec makes in a beforeEach dies on NG0203 — a message about inject() that never says form. createForm builds Angular own form() inside the TestBed injection context and hands back the framework FieldTree with nothing wrapped, taking the model as a signal() or as a plain value. registerFormMatchers then adds toHaveFieldErrors, which compares the whole error set order-free by kind, where errors() answers validation-error instances that toEqual fails on over a back-reference nobody wrote.'
    link: /adapters/signal-forms
  - title: Strict mode instead of undefined
    details: 'The method nobody stubbed throws with the class, the method and the arguments in the message, rather than returning undefined that fails three frames later. A throw the code under test caught — a try/catch, an operator with no error handler — fails the test afterwards anyway, and one provoked on purpose is taken with takeStrictViolations(). A getter nobody configured or a stream nobody fed is reported after the test under unconfiguredReads, and surveyed first with onUnstubbedRead. A mockDeep tree takes fallbackMockImplementation, so a query nobody configured throws instead of answering one more proxy.'
    link: /core/strict-mode
  - title: Thirty-nine lint rules and a codemod
    details: 'The ESLint plugin underlines the old patterns as you type — a private member reached through a cast, an observer global stubbed by hand, a fetch assigned to a global that nothing restores (no-hand-assigned-global), a stub class of vi.fn() fields registered with useClass, schemas that can never apply, a useValue no compiler ever checked, a lifecycle hook spied on the instance, a @ts-expect-error over a stub, an expect that cannot fail, and with no-redundant-smoke-test the generated smoke test that asserts only what the TestBed itself just built, and with prefer-set-inputs a componentRef.setInput whose name Angular checks against nothing — and the CLI codemod rewrites a jest-auto-spies suite into a diff you can read before you keep it.'
    link: /utilities/eslint-plugin
  - title: Failures nothing else reports
    details: 'A mock*Prop patch left in a describe body stops applying after the first test, a component whose own providers shadow the spy quietly runs the real service, and one key left on Object.prototype stops every later file in the worker from collecting while Vitest 5.0 still prints zero failing tests and no stack — silent under every runner, named here by the property, the token or the file. enableAngularDiagnostics, on for a whole suite from one setup line, takes five more of these from silent to failing — an NgModule import that contributes nothing, schemas that cannot apply beside a standalone component, injectSpy landing a real instance, a request no spec flushed, the shadowed provider itself — and its timing half, enableTestBedDiagnostics, prints one line per file of how much of its wall clock went into TestBed and how many components it built, which is the list a slow Angular suite is rewritten from. Console output nothing absorbed fails the test that wrote it, with a code frame at the line; the onConsoleLog hook of Vitest 5.0 can only drop a line, never fail a test. An attribute a component set on <body> and never took off turns a later file red about one run in six, only when the two share a worker; documentPollution names the test that left it and puts the document back, where no runner compares the document between files. blockNetwork fails a request that reached the real network and steps aside when MSW or nock intercepts fetch; stubResponse builds the real Response a stubbed fetch returns, without a cast. One strict preset turns every guard to its failing grade.'
    link: /utilities/setup
  - title: Which test is slow, and why
    details: 'npx vitest-auto-spy perf --gate fails CI over a file whose tests each cost many times the median test of the same run, so a laptop and a runner nine times slower reach the same verdict. Every suspect is re-measured on its own before it fails anything, and a confirmed one comes with a CPU profile card — its slowest tests, hooks against test bodies, the share by package and in your own code, and a likely cause in two sentences. An ordinary run never loads the profiler. Vitest 5.0 marks a test over a fixed slowTestThreshold of 300 ms, the same number on every machine, and says nothing about where the time went.'
    link: /utilities/cli#the-gate
---

<div class="vas-section">

<p class="vas-eyebrow">01 / Install</p>

## Sixty seconds to the first spy

Zero runtime dependencies; `rxjs` and the `@angular/*` packages are optional and only for the
matching entry point. The Angular entries want Angular 20 or newer — 22 for `/signal-forms` — see
[Installation](/core/installation).

```bash
npm i -D vitest-auto-spy
```

Then import from the entry point that matches your runner — everything after that line is identical.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest, zero config
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

</div>

<div class="vas-section">

<p class="vas-eyebrow">02 / The idea</p>

## The double you keep in sync by hand, deleted

<div class="vas-split">

<div>

### The mock you write today

```ts
const users = {
  load: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
} as unknown as UserService;

vi.mocked(users.load).mockResolvedValue(user);
vi.mocked(users.save).mockRejectedValue(new HttpError(409));
```

</div>

<div>

### <span class="vas-mark">The line that replaces it</span>

```ts
const users = createSpyFromClass(UserService);

users.load.resolveWith(user);
users.save.rejectWith(new HttpError(409));
```

</div>

</div>

The cast is what goes. Rename a method on `UserService` and the hand-rolled object still compiles,
still runs green, and no longer tests anything; `Spy<UserService>` turns the same rename into a red
line in the spec that uses it. No class to point at? `createAutoMock<T>()` builds the same surface
from a type or an interface.

[How it works](/core/how-it-works) · [createSpyFromClass](/core/create-spy-from-class) ·
[Control helpers](/core/control-helpers)

</div>

<div class="vas-section">

<p class="vas-eyebrow">03 / Slow tests</p>

## Which test is slow, and why

Vitest prints one `Duration` line for the whole run. `perf` turns it into the files that are actually
slow, re-measures each of them on its own so a busy runner cannot frame one, and prints where the CPU
time went. One command, locally or in CI:

```bash
npx vitest-auto-spy perf --gate
```

```
error  perf-gate-slow-file libs/player/src/lib/vod/vod.component.spec.ts
       The test bodies in this file add up to 9.20s, over the 5.00s budget (…). Re-measured on its own: 8.70s, still over budget.

       ┌─ measurements ────────────────────────────────────────────────
       │ tests             38   242ms each   20× the median test
       ├─ slowest tests ───────────────────────────────────────────────
       │  527ms  focus > moves through the controls
       ├─ where the time went · CPU profile, 8.41s sampled ────────────
       │ hooks        ███████████░░░░░░░░░ 54%   test bodies 46%
       │ by package   ██████░░░░░░░░░░░░░░  28%  jsdom
       │ in the spec  setUpWith 38%  ·  VodComponent_Template 17%  ·  assertFocus 8%
       ├─ likely cause ────────────────────────────────────────────────
       │ Most of the time is set-up that every test repeats: 54% is in hooks — setUpWith alone is 38%.
       └───────────────────────────────────────────────────────────────
```

The budget is counted in the median test **of the same run**, so a laptop and a runner nine times
slower give the same verdict, and a large file of ordinary tests never fails it — on a 2 023-file
consumer suite the rule it replaced flagged 0 files at ×1 slowdown and 19 at ×9, and this one flags
none at either. A file that is fast with the machine to itself is reported as _not reproduced_, not
as a defect. The profiler is loaded only for that re-measurement; an ordinary run pays nothing. On an Angular spec the
card also splits the time into TestBed set-up, component creation, change detection and JIT
compilation, and `--code-quality` puts every finding into the GitLab merge request widget without a
network or a token.

[The gate](/utilities/cli#the-gate) · [`perf` in full](/utilities/cli#perf-—-where-the-cpu-time-actually-goes) ·
[In CI](/utilities/cli#in-ci)

</div>

<div class="vas-section">

<p class="vas-eyebrow">04 / Where to go next</p>

## Start where you already are

<div class="vas-map">

<div class="vas-map-group">

### Runtimes

- [Vitest](/runtimes/vitest)
- [Bun](/runtimes/bun)
- [Angular on Bun](/runtimes/bun-angular)
- [node:test](/runtimes/node)
- [Rstest](/runtimes/rstest)
- [RxJS](/runtimes/rxjs)

</div>

<div class="vas-map-group">

### Frameworks

- [Angular](/adapters/angular)
- [Angular HTTP](/adapters/angular-http)
- [Angular router](/adapters/angular-router)
- [Signal forms](/adapters/signal-forms)
- [NestJS](/adapters/nestjs)
- [React](/adapters/react)
- [Vue / Pinia](/adapters/vue)
- [Svelte](/adapters/svelte)

</div>

<div class="vas-map-group">

### Coming from

- [jest-auto-spies](/migrating)
- [jasmine-auto-spies](/migrating-jasmine)
- [@ngneat/spectator](/migrating-spectator)
- [@testing-library/angular](/migrating-testing-library-angular)
- [Suites](/migrating-suites)

</div>

<div class="vas-map-group">

### Reference

- [Full API](/api)
- [Patterns that hold up](/recipes)
- [Strict mode](/core/strict-mode)
- [ESLint plugin](/utilities/eslint-plugin)
- [ESLint rules](/utilities/eslint-rules)
- [Written for AI agents](/agents)

</div>

</div>

<div class="vas-facts">

<div class="vas-fact"><b>0</b><span>runtime dependencies</span></div>
<div class="vas-fact"><b>4</b><span>runtimes, one core</span></div>
<div class="vas-fact"><b>5</b><span>framework adapters</span></div>
<div class="vas-fact"><b>36</b><span>lint rules</span></div>
<div class="vas-fact"><b>100%</b><span>covered core</span></div>

</div>

</div>

<div class="vas-section">

<p class="vas-eyebrow">05 / Already have one</p>

## If a spy library is already in the repo

<div class="vas-closer">

`jest-auto-spies` and `jasmine-auto-spies` share this API — the codemod rewrites the imports and the
calls, and prints the diff before anything is kept. Spectator, `@testing-library/angular` and Suites
each have a page that maps their helpers onto these ones, line for line.

[What the others do differently](/comparison) · [Migrate a suite](/migrating) ·
[What is new in 4.0](/upgrading-4)

</div>

</div>
