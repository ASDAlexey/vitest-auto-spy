---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: vitest-auto-spy
description: Typed test spies built from a real class. Every method becomes a spy with helpers that match its return type, on Vitest, Bun, node:test and Rstest. A drop-in replacement for jest-auto-spies and jasmine-auto-spies.

hero:
  name: 'vitest-auto-spy'
  text: 'A typed spy for every method of a class'
  tagline: 'Pass a class and get back an object where every method is a spy, typed from the class, with helpers that match each return type. One API on Vitest, Bun, node:test and Rstest.'
  actions:
    - theme: brand
      text: Get started
      link: /core/introduction
    - theme: alt
      text: How it compares
      link: /comparison
    - theme: alt
      text: View on GitHub
      link: https://github.com/ASDAlexey/vitest-auto-spy

features:
  - title: Every method, from the real class
    details: 'createSpyFromClass reads the class, so the spy object has the same methods and signatures. Rename a method, and the spec that uses it stops compiling. A factory method answers a spy of another class with returnsClass, and innerDouble reads that spy without counting a call.'
    link: /core/create-spy-from-class
  - title: Helpers that match the return type
    details: 'A method returning a Promise gets resolveWith and rejectWith. One returning an Observable gets nextWith and throwWith. With calledWith, a method can return different values for different arguments.'
    link: /core/control-helpers
  - title: Defaults that live with the class
    details: 'Configure a class once in your test setup file with registerAutoSpyDefaults. Every spy of that class starts from it, and each spec adds only what differs.'
    link: /core/create-spy-from-class
  - title: Four runners, one API
    details: 'The same spec runs on Vitest 2.1 to 5, Bun, node:test and Rstest. You change one import, not the tests.'
    link: /runtimes/vitest
  - title: Built for Angular
    details: 'provideAutoSpy and injectSpy for TestBed, shallow rendering, signals, resources, router, HTTP and signal forms. Works with zoneless and zone.js projects.'
    link: /adapters/angular
  - title: NestJS, React, Vue and Svelte
    details: 'Each framework has its own entry point - provideAutoSpy for NestJS testing modules and Vue global.provide, familiar imports for React and Svelte.'
    link: /adapters/nestjs
  - title: Strict mode instead of undefined
    details: 'With strict true, a method you forgot to configure throws instead of returning undefined, naming the class, the method and the arguments.'
    link: /core/strict-mode
  - title: Lint rules and a codemod
    details: 'The ESLint plugin flags fragile test patterns as you type. The codemod moves a jest-auto-spies test set to this library and shows the diff first.'
    link: /utilities/eslint-plugin
  - title: Leaks fail the test that left them
    details: 'setupAutoSpy catches what one test leaves behind for the next - unrestored globals, stray timers, console output, real network requests. Each report names the test, the file and the fix.'
    link: /utilities/setup
  - title: Which test is slow, and why
    details: 'npx vitest-auto-spy perf finds the slow spec files, re-measures each one alone, and shows where the time went. Add --gate to fail CI on them.'
    link: /utilities/cli#the-gate
---

<div class="vas-section">

<p class="vas-eyebrow">01 / The idea</p>

## Stop keeping a hand-written mock in sync

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
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

const users: Spy<UserService> = createSpyFromClass(UserService);

users.load.resolveWith(user);
users.save.rejectWith(new HttpError(409));
```

</div>

</div>

The cast goes away. Because of the cast, renaming a method on `UserService` leaves the hand-written
object compiling and the test passing, while it no longer tests anything. `Spy<UserService>` is typed
from the class, so the same rename turns the spec red. The real constructor never runs, so the
service's own dependencies need no mocks. No class to pass? `createAutoMock<T>()` builds the same spies from a type or an
interface.

[Getting started](/core/introduction) · [createSpyFromClass](/core/create-spy-from-class) ·
[Control helpers](/core/control-helpers)

</div>

<div class="vas-section">

<p class="vas-eyebrow">02 / Install</p>

## Install and import

```bash
npm i -D vitest-auto-spy
```

Import from the entry point for your test runner. Everything after that line is the same.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest, no config
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

The package has no runtime dependencies. `rxjs` and the `@angular/*` packages are needed only for
their own entry points. Angular `TestBed` specs import `provideAutoSpy` and
`injectSpy` from `vitest-auto-spy/angular` (Angular 20 or newer); `createSpyFromClass` works in any
spec. See [Installation](/core/installation).

</div>

<div class="vas-section">

<p class="vas-eyebrow">03 / Slow tests</p>

## Which test is slow, and why

Vitest prints one `Duration` for the whole run. `perf` lists the spec files that are actually slow,
re-measures each one alone, and shows where the CPU time went. Run it locally or in CI:

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

The budget scales with the median test of the same run, so a fast laptop and a slow CI machine reach
the same verdict. A file that was slow only because of its neighbours, and is fast when it runs
alone, is reported as _not reproduced_, not as a failure. The profiler loads only for that re-measurement, so a normal run pays
nothing. On Angular specs the card also splits time into `TestBed` setup, component creation, change
detection and compilation. `--code-quality` writes the findings for the GitLab merge request widget.

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
- [Glossary](/glossary)
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
<div class="vas-fact"><b>57</b><span>lint rules</span></div>
<div class="vas-fact"><b>100%</b><span>covered core</span></div>

</div>

</div>

<div class="vas-section">

<p class="vas-eyebrow">05 / Already have one</p>

## If a spy library is already in the repo

<div class="vas-closer">

`jest-auto-spies` and `jasmine-auto-spies` have the same API. The codemod rewrites the imports and
the calls, and shows the diff before anything is saved. Spectator, `@testing-library/angular` and
Suites each have a page that maps their helpers to these, line by line.

[What the others do differently](/comparison) · [Migrate your tests](/migrating) ·
[What is new in 4.0](/upgrading-4)

</div>

</div>
