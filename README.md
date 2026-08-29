<div align="center">

# vitest-auto-spy

**Auto-generate fully-typed test spies from a class — across any Vitest-compatible runtime and framework.**

The only auto-spy library that reads a **class** and gives a **fully-typed** spy of every method
with **return-type-aware** helpers — `resolveWith` / `rejectWith` for `Promise`s, `nextWith` /
`throwWith` for RxJS `Observable`s, and `calledWith` / `mustBeCalledWith` for argument matching. Or
skip the class entirely and mock straight from a **type or interface** with `createAutoMock<T>()` and
recursive `mockDeep<T>()`. Runs on **Vitest**, **Bun** (`bun:test`) and **`node:test`** behind one
identical API, with **RxJS** spies and **Angular / NestJS / React / Vue·Pinia / Svelte** recipes
([availability](#availability)). A drop-in replacement for
[`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies) — same API.

[![npm version](https://img.shields.io/npm/v/vitest-auto-spy?color=brightgreen&logo=npm)](https://www.npmjs.com/package/vitest-auto-spy)
[![npm downloads](https://img.shields.io/npm/dm/vitest-auto-spy?color=brightgreen&logo=npm)](https://www.npmjs.com/package/vitest-auto-spy)
[![CI](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml/badge.svg)](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml)
[![minzipped size](https://img.shields.io/badge/minzip-10.8%20kB-brightgreen)](#install)
[![types](https://img.shields.io/npm/types/vitest-auto-spy?logo=typescript&logoColor=white)](https://www.npmjs.com/package/vitest-auto-spy)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vitest-auto-spy?color=blue)](./LICENSE)

[![Vitest](https://img.shields.io/badge/Vitest-✓-6E9F18?logo=vitest&logoColor=white)](#runtimes)
[![Bun](https://img.shields.io/badge/Bun%201.4-✓-6E9F18?logo=bun&logoColor=white)](#availability)
[![Angular on Bun](https://img.shields.io/badge/Angular%20on%20Bun-✓-6E9F18?logo=angular&logoColor=white)](#angular-on-bun-buntest)
[![node:test](https://img.shields.io/badge/node%3Atest-✓-6E9F18?logo=node.js&logoColor=white)](#availability)
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](#install)

📚 [**Documentation**](https://asdalexey.github.io/vitest-auto-spy/) · 🧭 [**Spec patterns**](https://asdalexey.github.io/vitest-auto-spy/recipes) · 📦 [**npm**](https://www.npmjs.com/package/vitest-auto-spy) · 🐙 [**GitHub**](https://github.com/ASDAlexey/vitest-auto-spy) · 🔖 [**Changelog**](./CHANGELOG.md)

🤖 [**AGENTS.md**](./AGENTS.md) · 🔤 [**llms.txt**](https://asdalexey.github.io/vitest-auto-spy/llms.txt) · 📄 [**llms-full.txt**](https://asdalexey.github.io/vitest-auto-spy/llms-full.txt) — see [Using this library with an AI agent](#using-this-library-with-an-ai-agent)

<br/>

<img src="./assets/one-api-three-runtimes.svg" alt="One class-based API — createSpyFromClass, or provideAutoSpy for Angular DI — across three Vitest-compatible runtimes: Vitest, Bun and node:test" width="720" />

</div>

---

- 🧪 Reads a class and generates a typed spy for **every** method — no hand-written `vi.fn()` lists
- 🧬 Or mock from a **type/interface** alone — `createAutoMock<T>()`, no class required
- 🌐 One `MockAdapter` core — **Vitest**, **Bun** and **`node:test`**, identical API on each
- 🧩 Framework recipes: **Angular**, **NestJS**, **React**, **Vue/Pinia** and **Svelte**
- 🎯 Return-type-aware helpers — sync, `Promise`, and `Observable` all get the right API
- 🔀 `calledWith` / `mustBeCalledWith` argument dispatch
- 📡 First-class RxJS `Observable` spying (`nextWith`, `nextWithValues`, `throwWith`, …)
- ⚙️ Getter / setter spies via `accessorSpies`
- 🧰 DI & mocking utilities — `provideAutoSpy` / `injectSpy` (Angular, NestJS, Vue), `createFunctionSpy`, `mockReadonlyProp` for signals
- ⚡ Angular speed & zoneless helpers — `renderShallow` (**1.7×** on real component specs), `createWithAutoSpies`, `stable` / `flushEffects`, `toHaveSignalValue`, per-file `TestBed` timings
- 🧱 The providers a testing module cannot reach — `overrideComponentProvider`, `provideAutoSpyForToken`, `assertNgModuleScopes`, `createDirectiveHost`
- 📡 Observable assertions that fail on silence — `expectEmission` / `expectEmissions` / `expectNoEmission` / `expectCompletion` / `expectError`, no rxjs required, Angular `output()` included
- 🏗️ Doubles for what the code builds itself — `mockConstructor` / `stubConstructor` for `new`, plus `stubMediaElement`, `stubAbortController` and the observer stubs
- ⏳ Waiting that is not a guess — `flushEventLoop`, `settleDynamicImport`, `flushEventLoopUntil`, and a clock that survives fake timers (`mockSystemTime`, `useCountingClock`)
- 🌀 `fakeAsync` / `waitForAsync` on Vitest — one import of `vitest-auto-spy/zone`; zone.js stays out of every other entry
- 🧩 Module mocks that prove they applied — `assertMocked`, `moduleNamespace`, for a `vi.mock()` a bundler quietly ignored
- 🧾 Fixtures without casts — deep-partial `createMock`, `narrow()`, `withOverrides()`, `asInstances()`
- 🚚 A migration you can verify — `compareTestRuns` on the two JSON reports, `diffByField` for the assertion the reporter collapses
- 📏 Lint rules and one-line test-run hygiene — nine rules in `vitest-auto-spy/eslint-plugin` (one `--fix`, three suggestions), `setupAutoSpy()`
- 🔇 Console spies — `import { consoleInfoSpy } from 'vitest-auto-spy/console'` silences `console` and asserts its calls
- 🧭 [**Spec patterns**](https://asdalexey.github.io/vitest-auto-spy/recipes) — the shapes a ~370-file Angular suite converged on, and the traps that only surface at scale
- 🤖 Built for AI agents too — an offline [`AGENTS.md`](#using-this-library-with-an-ai-agent) inside the package, `llms.txt` on the docs site, a Claude Code skill, and errors that name their own fix
- 🟢 100% test coverage, **zero runtime dependencies** (in-tree arg serializer, no `javascript-stringify`)

## Table of contents

- [Install](#install)
- [Using this library with an AI agent](#using-this-library-with-an-ai-agent)
- [Availability](#availability)
- [Quick start](#quick-start)
- [How to mock](#how-to-mock)
- [Why](#why)
- [How it works (and what it won't spy)](#how-it-works-and-what-it-wont-spy)
- [Entry points & runtimes](#entry-points--runtimes)
- [Angular on Bun (`bun:test`)](#angular-on-bun-buntest)
- [Comparison](#comparison)
- [Migrating from jest-auto-spies](#migrating-from-jest-auto-spies)
- [Configuration](#configuration)
- [Auto-mock by type (no class needed)](#auto-mock-by-type-no-class-needed)
- [Synchronous methods](#synchronous-methods)
- [Promise-returning methods](#promise-returning-methods)
- [Observable methods & properties](#observable-returning-methods--observable-properties)
- [Getters & setters](#getters--setters)
- [Framework adapters](#framework-adapters)
  - [NestJS](#nestjs)
  - [React (Testing Library)](#react-testing-library)
  - [Vue / Pinia](#vue--pinia)
  - [Svelte](#svelte)
  - [Angular](#angular)
    - [Shallow component rendering](#shallow-component-rendering)
    - [Building a class with auto-spied dependencies](#building-a-class-with-auto-spied-dependencies)
    - [Zoneless waiting](#zoneless-waiting)
    - [Asserting a signal's value](#asserting-a-signals-value)
    - [Where a spec spends its time](#where-a-spec-spends-its-time)
- [Utilities](#utilities)
- [Observable assertions](#observable-assertions)
- [Test-run hygiene](#test-run-hygiene)
- [Fake timers](#fake-timers)
- [Observer stubs](#observer-stubs)
- [ESLint plugin](#eslint-plugin)
- [Bridging `Spy<T>` and `T`](#bridging-spyt-and-t)
- [API reference](#api-reference)
- [FAQ & troubleshooting](#faq--troubleshooting)
- [Versioning](#versioning)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Install

```bash
npm i -D vitest-auto-spy
```

> The plural name — [`vitest-auto-spies`](https://www.npmjs.com/package/vitest-auto-spies) — is an
> alias package that re-exports this one, entry point for entry point, so a typo resolves to the
> same code. Prefer the singular; the alias only follows it.

### Requirements

| Tool       | Minimum                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| Node.js    | ≥ 18 for the library — in practice, whatever your runner needs                    |
| Vitest     | ≥ 2.1 (required peer)                                                             |
| Bun        | ≥ 1.4 for `vitest-auto-spy/bun-angular`; any recent Bun for `vitest-auto-spy/bun` |
| TypeScript | ≥ 4.7 for the typed helpers (plain JS works too, just untyped)                    |

Vitest **≥ 2.1** because the typed `spy.method.mock.settledResults` surface is Vitest's own `Mock`
type, and `@vitest/spy` only grew `settledResults` in 2.0 — 2.1 is where the 2.x line actually sits.
The runtime helpers themselves still run on older Vitest (the library polyfills `settledResults` for
`bun:test` and `node:test` regardless), but the types no longer line up there, so the range stops
claiming it.

Node **≥ 18** is the library's own floor and it holds — the published output is ES2022 and every
entry runs on 18. What moves the real minimum is the runner: **Vitest 4 cannot start on Node 18 at
all**, because Vite 7 calls `crypto.hash` (added in Node 20.12) and the run dies with
`TypeError: crypto.hash is not a function` before a spec loads. On Vitest ≤ 3 Node 18 is fine. Which
version to actually run is measured in
[Performance → Which Node version](https://vitest-auto-spy.dev/core/performance#which-node-version):
the core is 9–15% faster from Node 24 on, and a cold import more than halves.

Ships **ESM with bundled `.d.ts` types**. Two subpaths additionally ship a CommonJS build —
`vitest-auto-spy/node` (a `node --test` suite written in CJS) and `vitest-auto-spy/eslint-plugin`
(loaded by a CommonJS `eslint.config.cjs`). Everything else is ESM-only, because a `require()` of it
could never have worked: Vitest itself refuses to be required (`Vitest cannot be imported in a
CommonJS module using require()`), so every Vitest-backed entry threw on the first line of its own
`.cjs`. Test runners load ESM natively, so nothing is lost — and dropping the unreachable output cut
the published package roughly in half.

### Peer dependencies

All peers are **provided by your project**; `rxjs` and `@angular/core` are **optional** — install
them only for the matching entry point. The package itself has **zero runtime dependencies**.

| Peer            | Needed for                                                                                                                  | Optional? |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| `vitest`        | the default runner                                                                                                          | no        |
| `rxjs`          | `vitest-auto-spy/rxjs` observable spies (and `Spy<T>` type-checking) — `>=7`, **no upper bound** (the rxjs 8 line included) | yes       |
| `@angular/core` | `vitest-auto-spy/angular` helpers                                                                                           | yes       |

## Using this library with an AI agent

Most tests are now written with an assistant in the loop, so this package ships documentation
written for one — not a second copy of the README, but the compressed form an agent can act on:
the decision tree, the configuration semantics, an error→fix table and the anti-patterns.

| What                                                                         | Where                                                  | For                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| [`AGENTS.md`](./AGENTS.md)                                                   | `node_modules/vitest-auto-spy/AGENTS.md`               | any agent, **offline** — it ships inside the npm tarball |
| [`llms.txt`](https://asdalexey.github.io/vitest-auto-spy/llms.txt)           | the docs site root                                     | a crawler picking the one page it needs                  |
| [`llms-full.txt`](https://asdalexey.github.io/vitest-auto-spy/llms-full.txt) | the docs site root                                     | reading the entire documentation in one fetch            |
| A Claude Code skill                                                          | `skills/vitest-auto-spy/SKILL.md`, also in the tarball | Claude Code, loaded on demand                            |
| Runtime error messages                                                       | every thrown error ends with `Docs: <url>`             | reading a stack trace instead of guessing                |

### Point your agent at it once

Add this to your project's `CLAUDE.md`, `AGENTS.md`, `.cursorrules` or equivalent:

```md
When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md`. It is the authoritative reference for the API,
the configuration semantics and the common mistakes.
```

### Claude Code plugin

The repository is also a Claude Code marketplace, so the skill installs without touching your
project files:

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

The skill loads only when a spec actually mentions the library, so it costs nothing the rest of
the time.

## Availability

> **All entry points are published.** The **Vitest / Bun / `node:test`** runtimes, the **RxJS** layer,
> and the **Angular / NestJS / React / Vue·Pinia / Svelte** recipes all ship as importable entry points —
> one identical API across every runner and framework.

| Entry point                                                                    | Status           |
| ------------------------------------------------------------------------------ | ---------------- |
| `vitest-auto-spy` · `vitest-auto-spy/rxjs` · `vitest-auto-spy/angular`         | ✅ **Published** |
| `vitest-auto-spy/bun` · `vitest-auto-spy/bun-angular` · `vitest-auto-spy/node` | ✅ **Published** |
| `vitest-auto-spy/nestjs` · `/react` · `/vue` · `/svelte` · `/console`          | ✅ **Published** |
| `vitest-auto-spy/setup` · `vitest-auto-spy/eslint-plugin`                      | ✅ **Published** |

## Quick start

Pass a class — every method becomes a typed spy, and the **constructor is never called** (no side
effects). The helper you get on each method matches its return type:

```ts
import { beforeEach, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

class UserService {
  getName(id: number): string {
    return 'real name';
  }
  async getUser(id: number): Promise<{ id: number; name: string }> {
    return fetchUser(id);
  }
}

let userService: Spy<UserService>;

beforeEach(() => {
  userService = createSpyFromClass(UserService); // every method is now a spy
});

it('stubs each method with the right helper for its return type', async () => {
  userService.getName.mockReturnValue('Ada'); // sync
  userService.getUser.resolveWith({ id: 1, name: 'Ada' }); // Promise helper

  expect(userService.getName(1)).toBe('Ada');
  await expect(userService.getUser(1)).resolves.toEqual({ id: 1, name: 'Ada' });
  expect(userService.getName).toHaveBeenCalledWith(1);
});
```

No class, only a TypeScript type? Reach for
[`createAutoMock<T>()`](#auto-mock-by-type-no-class-needed).

## How to mock

One recipe per thing a spec has to stand in for — each is the whole answer, not a fragment. The
[ESLint rules](#eslint-plugin) shipped with the package link back to these, so a report always
comes with the replacement.

### How to mock: a service behind Angular DI

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService)] });

const cart = injectSpy(CartService); // Spy<CartService>
cart.total.mockReturnValue(42);
```

`provideAutoSpy` reads the real class, so the stub cannot drift from it: add a method to
`CartService` and the spy has it. A hand-written `{ provide: CartService, useValue: { total:
vi.fn() } }` silently keeps mocking yesterday's class.

### How to mock: a service without DI

```ts
import { createAutoMock, createSpyFromClass } from 'vitest-auto-spy';

const cart = createSpyFromClass(CartService); // from a class
const gateway = createAutoMock<PaymentGateway>(); // from a type/interface alone
```

The constructor is never called, so no side effects run. `createAutoMock<T>()` is for the case
where there is no runtime class to read — an interface, a type alias, an imported `.d.ts`.

### How to mock: reading a spy back from DI

```ts
const cart = injectSpy(CartService); // typed Spy<CartService>, no cast
```

Not `vi.spyOn(TestBed.inject(CartService), 'total')`: that replaces one method and leaves the rest
of a **real** service live, which is how a unit test quietly turns into an integration test.

### How to mock: a whole class's dependencies at once

```ts
import { createWithAutoSpies } from 'vitest-auto-spy/angular';

const { instance, spies } = createWithAutoSpies(CartService);

spies.get(PricingService).total.mockReturnValue(100);
expect(instance.checkout(3)).toBe(120);
```

Angular DI still builds the class — constructor parameters and `inject()` fields resolve exactly as
they do in the app — but any token nobody provided is answered with a spy instead of a
`NullInjectorError`. Pass `providers` for the ones you want to control by hand; they win.

### How to mock: a readonly property or a signal

```ts
import { mockReadonlyProp, mockValueProp, restoreMockedProps } from 'vitest-auto-spy';

mockReadonlyProp(store, 'items', signal([task])); // readonly field, signal(), computed()
mockValueProp(service, 'retries', 3); // a field the code assigns to
```

Not `Object.defineProperty`: these record the descriptor they overwrote, hand back the undo for
their own patch, and are all reverted by one `restoreMockedProps()` — which
[`setupAutoSpy()`](#test-run-hygiene) wires into `afterEach` for you. An un-restored patch on a
global, a prototype or a singleton leaks into the next file whenever `isolate: false` is on.

### How to mock: an Observable

```ts
import { expectEmission } from 'vitest-auto-spy';

cart.items$.nextWith([task]); // drive the stream from the spy

await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first value, not a list
```

Not `source$.subscribe(value => expect(value).toEqual(…))`: if the stream never emits, the callback
never runs, nothing is asserted, and the test is green and empty. `expectEmission` **is** the
assertion — a silent stream fails it, with the stream's name and the timeout in the message.

### How to mock: a promise a test forgets to await

```ts
// ❌ the test ends before the callback runs, so the assertion never runs at all
it('renders once compiled', () => {
  TestBed.compileComponents().then(() => expect(component.ready).toBe(true));
});

// ✅ the assertion lands inside the test
it('renders once compiled', async () => {
  await TestBed.compileComponents();

  expect(component.ready).toBe(true);
});
```

Nothing awaits that chain, so the test is over before the callback runs, and an assertion that
settles after its test cannot fail it — the test was reported green without ever running it. Under
zone.js the failure does not even reach the runner: `ZoneAwarePromise` drains a rejection nobody
handled into `console.error` and stops there, so the run exits 0 with the assertion sitting in
stderr. The same is true of a `TypeError` thrown on the way to it, in production code.

Make the runner care — one switch in [`setupAutoSpy()`](#test-run-hygiene):

```ts
setupAutoSpy({ strayRejections: true }); // needs zone.js loaded — see test-run hygiene
```

The rejection then fails the test it surfaced in, named, with the advice that matches its kind. In
one migrated Angular monorepo — 1688 spec files, 11 587 tests, green, exit 0 — that turned up six
real defects of exactly this shape, two of them assertions that were simply false and one a
`TypeError` thrown by production code. The `no-floating-assertion` lint rule finds the shape
statically, before it ever runs.

### How to mock: a component's children

```ts
import { renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 },
});
```

One call for `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` with trimmed
`imports` and a blank template. `fixture` is a real `ComponentFixture`, so everything in
`@angular/core/testing` still applies. See [shallow rendering](#shallow-component-rendering) for
`keepTemplate`, `keepChildren` and what it actually saves.

### How to mock: a class the code under test builds with `new`

```ts
import { createSpyClass, mockValueProp } from 'vitest-auto-spy';

const WorkerSpy = createSpyClass(BackgroundWorker);

mockValueProp(globalThis, 'BackgroundWorker', WorkerSpy);
service.start();

expect(WorkerSpy.calls[0]).toEqual(['./task.js']);
WorkerSpy.instances[0].postMessage.mockReturnValue(undefined);
```

A runner mock (`vi.fn()`) refuses `new` as soon as it carries a `mockReturnValue`. `createSpyClass`
is a real constructor whose instances are full auto-spies, and it records every construction.

When there is no class at runtime — a browser global, a vendor SDK, a type-only client — use
`mockConstructor` (a runner mock that is also a constructor) or `stubConstructor` (the same, put on
a global and taken off again by `restoreMockedProps()`):

```ts
import { mockConstructor, stubConstructor } from 'vitest-auto-spy';

const Image = stubConstructor(globalThis, 'Image', () => ({ src: '' }));

tracker.ping();

expect(Image).toHaveBeenCalledTimes(1);
expect(Image.instances[0].src).toBe('https://tns.example/hit');
```

This is the most common failure of a Jest → Vitest move. `jest.fn().mockImplementation(() => obj)`
served `new`; Vitest only forwards `new` to a **constructible** implementation, and an arrow is not
one — the call is recorded, the body never runs, `new` hands back an empty object, and what surfaces
is `TypeError: (cb) => {…} is not a constructor` with a stack in production code (or a green test,
when the resulting `undefined` is swallowed by a `catch`).

### How to mock: a double more than one spec uses

```ts
// ❌ a constant: one set of spies for the whole worker
export const actionContext = { actions: { navigateToSection: vi.fn() } };

// ✅ a factory: one set per caller
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
```

Under `isolate: false` a module is evaluated **once per worker**, so an exported object holding
`vi.fn()`s is one set of spies shared by every file that imports it — registered against whichever
file got there first, where the other files' `clearMocks` never reaches them. What surfaces is a
30-second timeout, in a different file on each run.

The same applies to a shared provider fixture (`{ provide: X, useValue: { load: vi.fn() } }` is a
constant unless a function returns it), and a **spec file must export nothing at all**: under
`isolate: false` an exported spec file gets imported by its neighbours and loses its own suite. Put
shared doubles in a `*.mock.ts` beside them. The `no-shared-module-level-mock` lint rule finds these
mechanically.

### How to mock: a pipe

A pipe is a class with one method, so it is the plain case:

```ts
const currency = createSpyFromClass(CurrencyPipe);

currency.transform.calledWith(10, 'EUR').mockReturnValue('€10');
```

In a component spec, provide it (`provideAutoSpy(CurrencyPipe)`) or keep it out of the template
entirely — `renderShallow` drops it with the rest of the subtree.

## Why

Manually mocking a service is tedious and brittle:

```ts
// 😫  the old way
const userService = {
  getUser: vi.fn(),
  getUserList: vi.fn(),
  // ...one line per method, kept in sync by hand
};
```

`createSpyFromClass` reads the class and generates a typed spy for **every** method:

```ts
// 😎  the auto-spy way
let userService: Spy<UserService>;

beforeEach(() => {
  userService = createSpyFromClass(UserService);
});
```

`Spy<UserService>` exposes each method as a `vi.fn()` **plus** the right helpers based on
the method's return type (sync / `Promise` / `Observable`).

## How it works (and what it won't spy)

`createSpyFromClass(MyService)` reads `MyService.prototype` and walks the **prototype chain** — it
never `new`s the class. Concretely:

- ✅ **The class is never instantiated.** The constructor and its side effects (HTTP clients, DB
  connections, `inject()` calls) never run — you pass the class itself, not an instance.
- ✅ **Inherited methods are spied too**, all the way up the prototype chain.
- ✅ Each method is replaced by a fresh spy carrying the helpers that match its **return type**:
  sync → `mockReturnValue` / `calledWith`; `Promise` → `resolveWith` / `rejectWith`; `Observable`
  → `nextWith` / `throwWith` / … .

What it **won't** auto-discover — by design, because these aren't prototype methods:

- ⚠️ **Arrow-function class fields** (`doThing = () => {}`) are instance properties set in the
  constructor, so prototype scanning can't see them. Use regular methods, list them explicitly, or
  mock them by hand. (Same constraint as `jest-auto-spies`.)
- ⚠️ **Getters / setters** are skipped unless named in `gettersToSpyOn` / `settersToSpyOn` — see
  [Getters & setters](#getters--setters).
- ⚠️ **Plain data properties** carry no value until you set one; auto-spy mocks _behaviour_
  (methods), not state. To mock by type including properties, use
  [`createAutoMock`](#auto-mock-by-type-no-class-needed).

For the full walkthrough of the two ideas the library is built on — the prototype-chain walk and
the conditional types that pick helpers from a return type — see
[How it works](https://asdalexey.github.io/vitest-auto-spy/core/how-it-works).

## Entry points & runtimes

The library ships a framework-agnostic core plus runtime and framework layers, so a plain
Node / Bun / React / Vue project pulls **neither rxjs nor Angular into its runtime bundle**:

| Import                          | Provides                                                                                                                                                      | Pulls in                    | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | :----: |
| `vitest-auto-spy`               | `createSpyFromClass`, `createAutoMock`, `createFunctionSpy`, sync + promise + accessor spies, `errorHandler`, types                                           | `vitest`                    |   ✅   |
| `vitest-auto-spy/rxjs`          | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) + `createObservableWithValues`                                                   | `rxjs`                      |   ✅   |
| `vitest-auto-spy/angular`       | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`/`flushEffects`, the `mock*Prop` helpers, signal matchers, TestBed diagnostics | `@angular/core`             |   ✅   |
| `vitest-auto-spy/bun`           | the same core, driven by Bun's `bun:test` mocks                                                                                                               | `bun:test`                  |   ✅   |
| `vitest-auto-spy/bun-angular`   | Angular's `TestBed` under `bun test` — DOM, JIT `templateUrl` resolution and a zoneless environment, from one preload                                         | `bun:test`, `@angular/core` |   ✅   |
| `vitest-auto-spy/node`          | the same core, driven by `node:test`'s `mock.fn()`                                                                                                            | `node:test`                 |   ✅   |
| `vitest-auto-spy/nestjs`        | `provideAutoSpy`, `injectSpy` for `Test.createTestingModule`                                                                                                  | — (your `@nestjs/*`)        |   ✅   |
| `vitest-auto-spy/react`         | the core, with a natural import for React Testing Library suites                                                                                              | — (your `react`)            |   ✅   |
| `vitest-auto-spy/vue`           | `provideAutoSpy` for `global.provide` + Pinia store spying                                                                                                    | — (your `vue`/`pinia`)      |   ✅   |
| `vitest-auto-spy/svelte`        | the core, with a natural import for Svelte suites                                                                                                             | — (your `svelte`)           |   ✅   |
| `vitest-auto-spy/console`       | `consoleInfoSpy` & friends — silent typed spies over the global `console`, installed on import                                                                | `vitest`                    |   ✅   |
| `vitest-auto-spy/setup`         | `setupAutoSpy()` — property restore, duplicate-copy detection and mock-registry hygiene in one call; `setupFakeTimers()` / `advanceTimers()`                  | `vitest`                    |   ✅   |
| `vitest-auto-spy/zone`          | `fakeAsync` / `waitForAsync` on Vitest — the ProxyZone patch `zone.js/testing` does not ship. Reads the `zone.js` **you** loaded; imports none of it          | — (your `zone.js`)          |   ✅   |
| `vitest-auto-spy/eslint-plugin` | the lint rules that steer a suite onto these helpers                                                                                                          | — (your `eslint`)           |   ✅   |

✅ all entry points published (see [Availability](#availability)).

> The framework subpaths import **nothing** from their framework — the helpers are structural, so
> `@nestjs/*`, `react`, `vue`/`pinia` and `svelte` stay your own (already-present) dev dependencies and
> never reach this package's runtime bundle.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
// once (e.g. in your test setup) — enables observable spies
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import 'vitest-auto-spy/rxjs';
```

### Runtimes

The core is runner-agnostic behind a `MockAdapter`: pick the entry that matches your test
runner — the public API (`createSpyFromClass`, `calledWith`, `resolveWith`, `nextWith`, …) is
identical across all three.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest (default, zero-config)
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun — bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
```

Angular's `TestBed` runs on Bun too — see [Angular on Bun](#angular-on-bun-buntest) below.

> Only the auto-spy helpers are normalised across runtimes; **native** mock methods stay the
> runner's own — `mockReturnValue` on Vitest/Bun, `spy.method.mock.mockImplementation` on
> `node:test`. Each entry registers its adapter on import, so import the one matching your runner.

> Using an observable spy (`observablePropsToSpyOn`, `nextWith`, …) without importing
> `vitest-auto-spy/rxjs` throws a clear hint telling you to add that import.
>
> The decoupling is at the **runtime** level. The core's _type_ surface (`Spy<T>`) still
> references rxjs types, so keep `rxjs` available for type-checking (it's normally already a
> devDependency); none of it reaches your runtime bundle.
>
> The same inversion-of-control applies to the **test runner**: the core no longer imports
> `vitest` directly — `vi.fn()` / `vi.spyOn()` sit behind a `MockAdapter` that the
> `vitest-auto-spy` entry registers by default, so it stays zero-config. This is the groundwork
> for running the exact same core on other Vitest-compatible runners.

## Angular on Bun (`bun:test`)

Angular has no `bun test` integration of its own, and two gaps make it a non-starter: Bun ships no
DOM, and `@Component({ templateUrl: './x.html' })` is not an import — nothing in the module graph
points at the HTML file, so Angular's JIT compiler refuses to build the component. Under Vitest,
`@analogjs/vite-plugin-angular` inlines it during transform; Bun has no such transform.

`vitest-auto-spy/bun-angular` closes both from one preload:

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular"]
```

```bash
bun add -d @happy-dom/global-registrator   # or: bun add -d jsdom
```

On load it installs a DOM (unless one is already there), registers a `Bun.plugin` `onLoad` hook that
inlines `templateUrl` / `styleUrl` / `styleUrls`, initialises a **zoneless** `TestBed` environment
that resets after every test, and registers the Bun mock adapter. From there a spec reads exactly
like its Vitest counterpart:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/bun-angular';

import { GreetingComponent } from './greeting.component';
// declared with templateUrl
import { GreetingService } from './greeting.service';

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

> It has to be a **preload**: a `Bun.plugin` hook only sees modules loaded after it is registered, so
> importing this entry from inside a spec is too late for the component under test. Importing it from
> a spec as well is harmless — the module is cached and every step is guarded.

`provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable` / `flushEffects` and
the whole core behave identically to the Vitest entry. Two helpers stay Vitest-only because they need
the runner's `expect.extend` and suite-level hooks: `registerSignalMatchers` and the TestBed
diagnostics family.

Bun 1.4's runner flags need no configuration here — `--isolate` (a fresh global per file, matching
Vitest's default), `--parallel`, `--shard`, `--changed` and `--timings` all work. Without
`--isolate`, treat a Bun run the way you would treat Vitest's `isolate: false`: restore what you
patch (`restoreMockedProps()` in an `afterEach`, `resetAutoSpy(spy)` for a spy that outlives a test).

Full recipe, including building your own preload:
[Angular on Bun](https://asdalexey.github.io/vitest-auto-spy/runtimes/bun-angular).

## Comparison

| Library                                                                                  | Reads a class? | Return-type-aware helpers? | Runtimes                 | We win on                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | :------------: | :------------------------: | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **vitest-auto-spy**                                                                      |       ✅       |             ✅             | Vitest · Bun · node:test | — (and the only one that runs Angular's `TestBed` under [`bun test`](#angular-on-bun-buntest))                                                                                                                                                               |
| [jest-auto-spies](https://www.npmjs.com/package/jest-auto-spies)                         |       ✅       |             ✅             | Jest only                | Vitest/Bun/Node successor, **same API** — direct migration path                                                                                                                                                                                              |
| [@bugsplat/vitest-auto-spies](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies) |       ✅       |             ✅             | Vitest only              | Same class-based API **plus** Bun & `node:test`, [type-only `createAutoMock`](#auto-mock-by-type-no-class-needed), framework recipes (Angular/NestJS/React/Vue/Svelte), console spies, and **zero runtime deps** (it depends on `@hirez_io/auto-spies-core`) |
| [vitest-mock-extended](https://www.npmjs.com/package/vitest-mock-extended)               |   ❌ (Proxy)   |             ❌             | Vitest                   | Return-type ergonomics **and** reading a real class (we also ship a Proxy mode: [`createAutoMock`](#auto-mock-by-type-no-class-needed))                                                                                                                      |
| [@golevelup/ts-vitest](https://www.npmjs.com/package/@golevelup/ts-vitest)               |    partial     |             ❌             | Vitest                   | Typed `Promise`/`Observable` helpers + explicit class→spy + `mustBeCalledWith`                                                                                                                                                                               |
| [sinon](https://www.npmjs.com/package/sinon)                                             |  ❌ (manual)   |             ❌             | Any                      | Auto-generated + fully typed vs. manual + loosely typed                                                                                                                                                                                                      |

**The pitch:** the only auto-spy library that reads a **class** and gives a **fully-typed** spy of
every method with **return-type-aware** control helpers (`resolveWith` / `nextWith` / `calledWith`) —
across any Vitest-compatible runtime and framework.

Feature-by-feature breakdown, and where another library is the better answer:
[Comparison](https://asdalexey.github.io/vitest-auto-spy/comparison).

## Migrating from jest-auto-spies

The public API is intentionally identical. In most projects the migration is a
**find-and-replace of the import**:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // once, if you use observable spies
```

The only API-shape change from `jest-auto-spies` is that the Angular helpers and the
observable layer live behind the `/angular` and `/rxjs` subpaths (see [Entry points & runtimes](#entry-points--runtimes)).

This also covers migrating from [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies),
which re-exports the same `jest-auto-spies` API — the swap is identical, and you gain Bun /
`node:test`, `createAutoMock`, framework recipes and console spies on top.

| jest-auto-spies                                                       | vitest-auto-spy                                            | Status       |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| `createSpyFromClass`                                                  | `createSpyFromClass`                                       | ✅ identical |
| `methodsToSpyOn` (additive)                                           | `methodsToSpyOn` — additive since v2                       | ✅ identical |
| `provideAutoSpy`                                                      | `provideAutoSpy`                                           | ✅ identical |
| `calledWith` / `mustBeCalledWith`                                     | same                                                       | ✅ identical |
| `calledWith(...).returnValue(v)`                                      | same — `.returnValue` **and** `.mockReturnValue` both work | ✅ identical |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                   | same                                                       | ✅ identical |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | same                                                       | ✅ identical |
| `throwWith` / `complete` / `returnSubject`                            | same                                                       | ✅ identical |
| `accessorSpies.getters/setters`                                       | same                                                       | ✅ identical |
| `createObservableWithValues`                                          | same                                                       | ✅ identical |
| underlying mock                                                       | `jest.fn()` → `vi.fn()`                                    | 🔁 swapped   |

Just make sure your tests run under Vitest, and (for Angular) that `TestBed` is set up.

## Configuration

```ts
// 1. all methods (default)
createSpyFromClass(MyService);

// 2. the discovered methods PLUS these names
createSpyFromClass(MyService, ['reload', 'count']);

// 3. only these methods, discovery skipped
createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['getName', 'getAge'] });

// 4. full config object
createSpyFromClass(MyService, {
  methodsToSpyOn: ['reload'], // added to the discovered methods (jest-auto-spies semantics)
  instanceMethodsToSpyOn: ['count'], // the same thing, under a name that says what it is for
  observablePropsToSpyOn: ['products$'], // Observable *properties*
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
});
```

### Spying instance-assigned callables (`signal()`, arrow props, `signalStore()`)

`createSpyFromClass` discovers methods by walking the **prototype**, so a callable assigned on the
instance is invisible to it — an arrow-function property, an Angular `signal()` / `computed()`
field, a method of an ngrx `signalStore()`.

Name them in `instanceMethodsToSpyOn`. They are **added** to whatever the method resolution
produced, and never warn — being absent from the prototype is the point. Both lists behave
identically: `methodsToSpyOn` is the same option under the name `jest-auto-spies` uses, kept so a
migrated spec needs no edit.

```ts
class SettingsService {
  readonly isReady = signal(false); // instance field — not on the prototype
  load(): void {} // prototype method — auto-discovered
}

const spy = createSpyFromClass(SettingsService, { instanceMethodsToSpyOn: ['isReady'] });

spy.isReady.mockReturnValue(true);
expect(spy.isReady()).toBe(true);
expect(vi.isMockFunction(spy.load)).toBe(true); // still spied
```

## Auto-mock by type (no class needed)

`createSpyFromClass` reads a real class's prototype. When you only have a TypeScript **interface or
type** (no runtime class), use `createAutoMock<T>()` — it builds the spy lazily from the type alone,
via a `Proxy`:

```ts
import { createAutoMock } from 'vitest-auto-spy';

interface UserService {
  getName(id: number): string;
  getUser(id: number): Promise<User>;
  apiUrl: string;
}

// Before — needs a concrete class:
// const svc = createSpyFromClass(UserServiceClass);

// After — type only, no class:
const svc = createAutoMock<UserService>();
```

Every accessed method becomes a decorated spy with the **same typed control helpers** as
`createSpyFromClass`, materialized lazily and cached (same reference on re-access):

```ts
svc.getName.calledWith(1).mockReturnValue('Ada'); // sync, arg-matched
svc.getUser.resolveWith({ id: 1, name: 'Ada' }); // promise helper
expect(svc.getName(1)).toBe('Ada');
await expect(svc.getUser(1)).resolves.toEqual({ id: 1, name: 'Ada' });
```

Seed concrete values or implementations with the optional `overrides` argument (seeded keys are
returned as-is, never turned into spies):

```ts
const svc = createAutoMock<UserService>({ apiUrl: 'https://api.test' });
expect(svc.apiUrl).toBe('https://api.test'); // or assign: svc.apiUrl = '...'
```

> Caveat: with only a type at runtime, methods and plain properties are indistinguishable on
> access — an un-seeded property read returns a spy. Seed real property values via `overrides`
> (or assignment) to get them back verbatim.

For a double the code under test only **reads** — a DTO, a route snapshot, a config object — that
caveat is the wrong trade, and [`createMock<T>()`](#utilities) is the other half of the pair: it
returns a plain `T` built from the fields you seed, with no spies anywhere.

```ts
import { createMock } from 'vitest-auto-spy';

const route = createMock<ActivatedRouteSnapshot>({ data: { title: 'Report' } });
```

Rule of thumb: `createAutoMock` for a collaborator you **call** and assert on, `createMock` for a
data shape you **read**. `createMock` is also the one place the `as` lives, so a suite under a
`no-type-assertion` lint rule stops sprinkling `eslint-disable` over its fixtures.

## Synchronous methods

```ts
// standard vi.fn() API works as-is
myService.getName.mockReturnValue('Fake Name');

// return a value only for specific arguments
myService.getName.calledWith(1).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBeUndefined();

// throw if called with the "wrong" arguments
myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
expect(() => myService.getName(2)).toThrow();
```

## Promise-returning methods

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');
await expect(myService.getProducts()).rejects.toBe('FAKE ERROR');

// per-call values, and conditional-by-args
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

## Observable-returning methods & Observable properties

Both spied **methods** that return an `Observable` and spied **properties** of type
`Observable` get the same control surface. Enable them by importing the rxjs layer once:

```ts
import 'vitest-auto-spy/rxjs';
```

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stream stays open
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]); // emit one value, then complete
myService.getProducts$.throwWith('FAKE ERROR'); // error the stream
myService.getProducts$.complete(); // complete the stream

// emit a precise sequence — values, errors, completion, optional delays
myService.getProducts$.nextWithValues([{ value: [{ name: 'Product 1' }] }, { errorValue: 'FAKE ERROR' }, { complete: true }]);

// a fresh stream per call
myService.getProducts$.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// grab the underlying Subject for full manual control
const subject = myService.getProducts$.returnSubject();
subject.next([{ name: 'manual' }]);
```

`calledWith(...)` / `mustBeCalledWith(...)` also chain into the observable helpers:

```ts
myService.getProducts$.calledWith(1).nextWith([{ name: 'Product 1' }]);
```

### Standalone observable builder

```ts
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

const fake$ = createObservableWithValues([{ value: 1 }, { value: 2 }, { complete: true }]);

// or get the subject too
const { values$, subject } = createObservableWithValues([{ value: 1 }], { returnSubject: true });
```

## Getters & setters

```ts
const spy = createSpyFromClass(MyService, {
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
});

// configure / assert the getter
spy.accessorSpies.getters.userName.mockReturnValue('Fake Name');
expect(spy.userName).toBe('Fake Name');

// assert the setter was called
spy.userName = 'New Name';
expect(spy.accessorSpies.setters.userName).toHaveBeenCalledWith('New Name');
```

## Framework adapters

The core is framework-agnostic — `createSpyFromClass` / `createAutoMock` work in any test. The
subpaths below add a natural import and, where the framework has class DI, a tiny `provide*` helper.
None of them pull the framework into this package; they're recipes over the same core.

> The **Angular**, **NestJS**, **React**, **Vue/Pinia** and **Svelte** entry points are all published
> ([Availability](#availability)). Each is a thin recipe over the same core, so you can equally copy it
> using the core `vitest-auto-spy` import directly.

### NestJS

Use `provideAutoSpy` to register a fully-mocked service in a `TestingModule`, then `injectSpy` to
pull it back out already typed as `Spy<T>`. `@nestjs/common` / `@nestjs/testing` are your own
(optional) peers — the helper imports neither:

```ts
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, expect, it } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';

import { AuthService } from './auth.service';
import { UserService } from './user.service';

let moduleRef: TestingModule;
let userServiceSpy: Spy<UserService>;

beforeEach(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [AuthService, provideAutoSpy(UserService)],
  }).compile();

  userServiceSpy = injectSpy(moduleRef, UserService);
});

it('logs in a known user', () => {
  userServiceSpy.findByEmail.mockReturnValue({ id: 1, name: 'Ada' });

  const auth = moduleRef.get(AuthService);
  expect(auth.login('ada@example.com')).toBeTruthy();
  expect(userServiceSpy.findByEmail).toHaveBeenCalledWith('ada@example.com');
});
```

### React (Testing Library)

React has no DI container, so there's no `provide*` helper — the recipe is: **spy the classes you
own** (services, stores, API clients, hook deps), then pass the spy into a Context provider or hook.
The spy is a plain object of spied functions, so it drops straight into `value={...}`:

```tsx
import { render, screen } from '@testing-library/react';
import { createSpyFromClass, type Spy } from 'vitest-auto-spy/react';
import { CartContext, Cart } from './cart';

class CartStore {
  getItemCount(): number { return 0; }
  checkout(token: string): Promise<{ orderId: string }> { /* ... */ }
}

let cart: Spy<CartStore>;

beforeEach(() => {
  cart = createSpyFromClass(CartStore); // every method is now a spy
});

it('shows the item count from the injected store', () => {
  cart.getItemCount.mockReturnValue(3);

  render(
    <CartContext.Provider value={cart}>
      <Cart />
    </CartContext.Provider>,
  );

  expect(screen.getByText('3 items')).toBeInTheDocument();
});

it('drives async deps and asserts the component called them', async () => {
  cart.checkout.resolveWith({ orderId: 'ord_42' });
  // ...trigger checkout in the UI...
  expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
});
```

### Vue / Pinia

`provideAutoSpy(token, Class)` returns a `{ [token]: Spy<T> }` map you can spread into
`@vue/test-utils`' `global.provide`; for a class-based Pinia store, spy it directly:

```ts
// (a) class-based service injected via provide / global.provide
import { UserService, UserServiceKey } from '@/services/user.service';
// (b) class-based Pinia store — every action becomes a spy
import { CartStore } from '@/stores/cart.store';
import { mount } from '@vue/test-utils';
import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/vue';

const provide = provideAutoSpy(UserServiceKey, UserService); // { [UserServiceKey]: Spy<UserService> }
provide[UserServiceKey].getName.mockReturnValue('Fake Name');

const wrapper = mount(UserBadge, { global: { provide } });
expect(provide[UserServiceKey].getName).toHaveBeenCalled();

const store = createSpyFromClass(CartStore);
store.itemCount.mockReturnValue(3); // sync action/getter
store.checkout.resolveWith({ orderId: 'ord_42' }); // async action (Promise)
await store.checkout('tok_abc');
expect(store.checkout).toHaveBeenCalledWith('tok_abc');
```

### Svelte

Svelte has no class-based DI, so it's a recipe: keep your logic in plain class-based
services/stores, spy the class, and hand the spy to the component the same way it receives the real
one (props, context, or a mocked module):

```ts
import { render } from '@testing-library/svelte';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';

import Cart from './Cart.svelte';
import { CartStore } from './cart-store';

it('shows the cart total from the store', () => {
  const cartStore = createSpyFromClass(CartStore); // every method is a spy

  cartStore.total.mockReturnValue(42);
  cartStore.priceOf.calledWith('apple').mockReturnValue(7);

  render(Cart, { props: { store: cartStore } });

  expect(cartStore.total).toHaveBeenCalled();
});
```

### Angular

<div align="center">

<img src="./assets/angular-provide-auto-spy.svg" alt="Angular TestBed recipe: provideAutoSpy registers a typed spy provider and injectSpy returns Spy<ApiService> — no manual { provide, useValue }, no TestBed.inject<any> cast" width="720" />

</div>

`provideAutoSpy` is the shorthand for providing an auto-spy in a `TestBed`:

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [
    provideAutoSpy(MyService),
    // accepts the same second argument as createSpyFromClass
    provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }),
  ],
});

let myService: Spy<MyService>;

beforeEach(() => {
  myService = injectSpy(MyService);
});
```

> The spies are change-detection agnostic, so they work in **both zoneless and
> zone.js** Angular projects — nothing here touches `NgZone` or change detection.
> You only need the usual Vitest + Angular wiring:
> [`@analogjs/vite-plugin-angular`](https://www.npmjs.com/package/@analogjs/vite-plugin-angular)
> plus a TestBed setup file (e.g. `@analogjs/vitest-angular`'s `setupTestBed()`).

> **Lazy by default, everywhere.** Every factory builds each method spy on first access
> (`lazySpies: true`), since Angular tests typically spy a wide service but call
> only a few of its methods — roughly **4× faster** spy assembly (≈8× on a
> 20-method service). Behaviour is unchanged; pass `{ lazySpies: false }` to build
> every spy eagerly.

#### Signal / readonly property mocking (bonus)

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true); // static value (incl. signals)
mockReadonlyPropGetter(service, 'label', () => 'A'); // dynamic getter
mockValueProp(service, 'retries', 3); // plain writable value
mockAccessorsProp(service, 'theme'); // spied get + set
mockAccessorsProp(input, 'valueAsNumber', { get, set }); // …with real implementations behind them
```

Each helper also returns the undo for _its own_ patch, for a stub that has to come off inside a
single test:

```ts
const restoreNavigator = mockValueProp(globalThis, 'navigator', undefined);

try {
  // …
} finally {
  restoreNavigator();
}
```

Every one of them records the descriptor it overwrote, so a single `restoreMockedProps()` puts them
all back. That matters when the patched object outlives the spec file — a global, a class
prototype, a singleton — which is always the case under Vitest's `isolate: false`:

```ts
// test setup
afterEach(() => restoreMockedProps());
```

Members the public type does not describe (`#private` fields, ad-hoc keys) are accepted too — the
helpers take a `PropertyKey` overload, so no `as never` dance.

#### Shallow component rendering

`renderShallow` is the standard `TestBed` sequence a component-heavy suite ends up copy-pasting —
`configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` with emptied `imports` and a
blank template — given a name:

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService), provideHttpClient()],
  inputs: { projectId: 42 }, // set through componentRef.setInput, before the first CD
});
```

| Option          | Default | What it does                                                                                                                    |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `providers`     | `[]`    | Providers for the testing module. `EnvironmentProviders` (`provideHttpClient()`, …) welcome                                     |
| `imports`       | `[]`    | Extra imports for the testing module (a stub module, a routing harness)                                                         |
| `inputs`        | —       | Values for the component's inputs — signal inputs take the **value**, not the signal                                            |
| `keepTemplate`  | `false` | Keep the real template (for `viewChild`, content projection, host bindings)                                                     |
| `keepChildren`  | `[]`    | Child components/directives/pipes that stay resolvable; everything else is dropped                                              |
| `template`      | `''`    | A stand-in template to render instead of a blank one                                                                            |
| `beforeCreate`  | —       | Runs after the module is configured, before the component exists — the seam for stubbing a dependency a field initializer reads |
| `detectChanges` | `true`  | Run the first change detection, and therefore `ngOnInit`                                                                        |

`fixture` is a real `ComponentFixture`; nothing here replaces `@angular/core/testing`.

**What it saves, measured.** On a private Angular 22 zoneless suite (784 specs, the AOT
`@angular/build:unit-test` builder), three of its most expensive component specs were converted and
the ten-file batch re-run three times — medians, same batch, same machine:

| Spec (479 tests in the batch, all still green) | Before | After  | Change   |
| ---------------------------------------------- | ------ | ------ | -------- |
| a container with a deep child tree (34 tests)  | 129 ms | 61 ms  | **2.1×** |
| a list rendering 58 fixtures                   | 133 ms | 75 ms  | **1.8×** |
| a small leaf component (20 tests)              | 29 ms  | 38 ms  | **0.8×** |
| the three together                             | 291 ms | 174 ms | **1.7×** |

The third row is the honest half of the result: a leaf component has almost no subtree to remove, so
the per-test `overrideComponent` costs more than it saves. **Shallow rendering
pays where there is a real child tree to skip** — the seven untouched files in the same batch moved
by ±10%, which is this suite's run-to-run noise, so the two wins are outside it and the one
regression is only just outside.

Use [the diagnostics](#where-a-spec-spends-its-time) to find the files worth converting rather than
guessing: across those ten files `TestBed` accounted for 820 ms of 3231 ms (25%), but per file the
share ranged from 13% to 66%.

#### Building a class with auto-spied dependencies

```ts
import { createWithAutoSpies } from 'vitest-auto-spy/angular';

const { instance, spies, injector } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // explicit providers win
});

spies.get(PricingService).total.mockReturnValue(100);
```

The class is built through its own Angular factory, so constructor parameters **and** `inject()`
field initializers resolve normally; an unprovided token gets a `createSpyFromClass` spy (a class)
or a `createAutoMock` proxy (an `InjectionToken`). `inject(X, { optional: true })` still returns
`null`, exactly as it would in the app. `spies.get(token)` resolves through the same injector the
instance used, so it returns the explicit provider when there is one — and
`spies.autoSpiedTokens()` lists what was invented.

> Plain providers only: this builds an `Injector.create()` injector, which does not accept the
> `EnvironmentProviders` returned by `provideHttpClient()` and friends. A class that needs those
> belongs in a `TestBed` — `renderShallow`, or a plain `configureTestingModule`.

#### Zoneless waiting

```ts
import { flushEffects, stable } from 'vitest-auto-spy/angular';

component.filter.set('open');
await stable(fixture); // flush effects, then await the fixture

flushEffects(); // the no-fixture half: services, stores, runInInjectionContext code
```

`fixture.detectChanges()` runs a single change-detection pass and does **not** flush pending
effects, so an assertion right after it reads state that has not finished computing. In a zoneless
app the state that matters is signal-derived and effects are what move it forward. `stable` does
both, in the right order; `flushEffects` prefers `TestBed.tick()` (Angular ≥ 20) and falls back to
`ApplicationRef.tick()`.

#### Asserting a signal's value

```ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular';

registerSignalMatchers(); // once, in your setup file

expect(component.total).toHaveSignalValue(3);
expect(component.items).toHaveSignalValue([{ id: 1 }]);
```

`expect(component.total).toBeTruthy()` passes for every signal ever created — a signal is a
function. The matcher reads it, deep-compares, and rejects anything that is not a zero-argument
getter, so the missing-parentheses mistake fails instead of quietly passing.

#### Where a spec spends its time

```ts
// vitest.setup.ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular';

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
```

```
[vitest-auto-spy] src/app/…/layer-editor.component.spec.ts — TestBed 353ms of 661ms (53%), logic 308ms, 155 component(s), 132 module config(s)
```

One line per spec file: how much of its wall clock went into `TestBed` (module configuration,
template compilation, component creation) versus plain logic, and how many components it created.
That is the list of rewrite candidates, and the number that says whether a rewrite helped. Pass
`report` to collect the timings yourself, `minTestBedMs` to stay quiet about cheap files, and call
`disableTestBedDiagnostics()` to put the untouched `TestBed` back. `instrumentTestBed()`,
`getTestBedTiming()`, `formatSpecTiming()` and `reportSpecTiming()` are the pieces underneath, for a
suite that wants the numbers without the per-file line.

The clock is captured at import time, so a spec using `vi.useFakeTimers()` is still measured
honestly rather than reported as free.

### Which factory, and what it costs

Reach for `provideAutoSpy` on Angular and `createSpyFromClass` everywhere else; use
`createAutoMock<T>()` when there is no class at runtime (an interface, an ngrx `signalStore()`
whose members live on the instance) and `createMock<T>(partial)` for a data shape the code only
reads.

None of it is worth optimising. On a ten-method class: `provideAutoSpy` ~8 µs per call,
`createSpyFromClass` ~29 µs, `createAutoMock` ~33 µs, a `calledWith` lookup ~0.7 µs — five
providers across two thousand tests come to under a tenth of a second for the whole suite.
`provideAutoSpy` leads because it defaults to `lazySpies: true`, and prototype discovery is
cached per class either way. Full numbers and the two settings that do cost something are in
[Performance](https://asdalexey.github.io/vitest-auto-spy/core/performance).

## Utilities

Beyond the spy factories, the package ships a set of small standalone helpers. Each one is a
single-purpose utility you can pick up independently — they all ride on the same core:

| Utility                                                                              | Entry point                   | What it's for                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `injectSpy(token)` / `injectSpy(moduleRef, token)`                                   | `/angular`, `/nestjs`         | Pull a provided spy out of the DI container, already typed as `Spy<T>` — no casting                                                                   |
| `provideAutoSpy(Class, config?)`                                                     | `/angular`, `/nestjs`, `/vue` | One-liner `{ provide, useValue }` (or Vue `global.provide`) that builds the spy for you                                                               |
| `createFunctionSpy(name)`                                                            | core                          | A single standalone function spy with the full helper set (`calledWith`, `resolveWith`, `nextWith`, …) — no class needed                              |
| `createAutoMock<T>(overrides?)`                                                      | core                          | Proxy-based spy from a **type/interface** alone ([details](#auto-mock-by-type-no-class-needed))                                                       |
| `createMock<T>(partial?)`                                                            | core                          | A plain, spy-free `T` built from the fields a test seeds — for data shapes, not collaborators                                                         |
| `createObservableWithValues(configs, opts?)`                                         | `/rxjs`                       | Build a fake `Observable` emitting a precise sequence of values / errors / completion                                                                 |
| `consoleInfoSpy` / `consoleWarnSpy` / …                                              | `/console`                    | Silent typed spies over the global `console`, installed on import ([details](#console-spies--vitest-auto-spyconsole))                                 |
| `mockReadonlyProp(obj, prop, value)`                                                 | `/angular`                    | Overwrite a `readonly` property (incl. Angular signals) with a static value                                                                           |
| `mockReadonlyPropGetter(obj, prop, getter)`                                          | `/angular`                    | Same, but backed by a dynamic getter                                                                                                                  |
| `mockValueProp(obj, prop, value)`                                                    | `/angular`                    | Overwrite a property with a plain **writable** value                                                                                                  |
| `mockAccessorsProp(obj, prop, accessors?)`                                           | `/angular`                    | Redefine a property with spied `get` + `set`, optionally backed by real implementations                                                               |
| `restoreMockedProps()`                                                               | `/angular`                    | Undo every patch the `mock*Prop` helpers applied — one call in `afterEach` (each helper also returns the undo for its own patch)                      |
| `setupFakeTimers(config?, opts?)`                                                    | `/setup`                      | `vi.useFakeTimers()` / `vi.useRealTimers()` as one paired `beforeEach` + `afterEach`; `{ betweenTests: true }` between them ([details](#fake-timers)) |
| `advanceTimers(ms?)`                                                                 | `/setup`                      | Advance the fake clock **and** settle the microtasks the callbacks queued ([details](#fake-timers))                                                   |
| `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()`     | core                          | Replace an observer global with one the spec drives, restored automatically ([details](#observer-stubs))                                              |
| `intersectionEntry(target, isIntersecting, overrides?)`                              | core                          | Build one `IntersectionObserverEntry` without the fields nothing reads                                                                                |
| `mutationRecord(target, init?)` / `resizeEntry(target, rect?)`                       | core                          | Build one `MutationRecord` (with a real `NodeList`) / one `ResizeObserverEntry`                                                                       |
| `mockConstructor(factory, name?)` / `stubConstructor(obj, key, factory)`             | core                          | A runner mock that can be called with `new` — see [How to mock](#how-to-mock-a-class-the-code-under-test-builds-with-new)                             |
| `stubAbortController()`                                                              | core                          | A realm-consistent `AbortController`, so `addEventListener(…, { signal })` works under jsdom + zone.js                                                |
| `flushEventLoop(turns?)` / `settleDynamicImport(load, turns?)`                       | core                          | Real event-loop turns while the timers are faked — for a dynamic `import()` or native `async` in a dependency                                         |
| `flushEventLoopUntil(isDone, opts?)`                                                 | core                          | Real turns until a condition holds — a `resource()` leaving `loading` — with a budget instead of a hang                                               |
| `stubMediaElement(opts?)`                                                            | core                          | A `<video>` / `<audio>` that plays, reports a duration and fires the media events jsdom never does                                                    |
| `assertMocked(namespace, opts?)`                                                     | core                          | Fail when the `vi.mock()` a spec relies on silently did not apply (a bundled alias, `isolate: false`)                                                 |
| `moduleNamespace(exports, opts?)`                                                    | core                          | The `vi.mock` factory result an interop probe recognises — `default` + `__esModule` in place                                                          |
| `diffByField(actual, expected)`                                                      | core                          | Which field of an array of records moved, and in how many elements — the diff the reporter collapses                                                  |
| `asInstances(...spies)`                                                              | core                          | `asInstance` for a whole argument list — one edit against one compiler error, not five                                                                |
| `narrow(value, guard)` / `narrow.byKey` / `narrow.observable`                        | core                          | The branch of a union a test knows it got, failing with the shape the value actually had                                                              |
| `withOverrides(model, overrides?)`                                                   | core                          | A fixture from a model instance: its getters read once, as data — a spread drops them                                                                 |
| `compareTestRuns(a, b, root?)`                                                       | core                          | Whether a migration lost a test — the set of `file::name`, which matching counters cannot answer                                                      |
| `provideAutoSpyForToken(TOKEN, overrides?)`                                          | `/angular`                    | The provider for a dependency behind an `InjectionToken` — no stand-in class to write                                                                 |
| `createDirectiveHost({ template, scope, props })`                                    | `/angular`                    | A standalone host for a directive under test, with its scope where the compiler reads it                                                              |
| `registerDirectiveMatchers()`                                                        | `/angular`                    | Adds `expect(fixture).toHaveDirectiveApplied(Directive, selector?)`                                                                                   |
| `installProxyZonePatch(opts?)`                                                       | `/zone`                       | `fakeAsync` / `waitForAsync` on Vitest — the patch `zone.js/testing` does not ship; `scope: 'callback'` per callback                                  |
| `autoMocked<T>(overrides?)`                                                          | core                          | `createAutoMock` typed as `T & Spy<T>`, for a collaborator passed as an argument rather than injected                                                 |
| `mockSystemTime(time)` / `withSystemTime(time, fn)`                                  | `/setup`                      | Freeze the clock whether or not fake timers are already running                                                                                       |
| `mockNow(source)` / `useCountingClock(opts?)`                                        | `/setup`                      | A `Date.now` that survives fake timers being re-installed around every test; counts ticks instead of telling the time                                 |
| `registerFocusMatchers()`                                                            | `/setup`                      | Adds `expect(el).toHaveFocus()`, which names _why_ focus is elsewhere                                                                                 |
| `overrideAutoSpy(Token, config?)` / `overrideComponentProvider(Cmp, Token, config?)` | `/angular`                    | Replace a dependency a component declares in its own `providers`                                                                                      |
| `assertNgModuleScopes(...modules)`                                                   | `/angular`                    | Fail early when an AOT test bundle left an NgModule with no runtime declarations                                                                      |
| `mockSignalProp(obj, prop, initial)`                                                 | `/angular`                    | Replace a signal-valued property with a real `WritableSignal`, and hand the writable handle back                                                      |
| `runEffect(effectRef)`                                                               | `/angular`                    | Run one `effect()` body on demand, for an effect whose trigger a spec replaced with a static signal                                                   |
| `blockNetwork(options?)`                                                             | `/setup`                      | Close `fetch`, `XMLHttpRequest` and `sendBeacon`, naming what was requested ([details](#test-run-hygiene))                                            |
| `trackStrayRejections()` / `flushStrayRejections()` / `countStrayRejections()`       | `/setup`                      | Read back the promise rejections zone.js swallowed into `console.error`, so one can fail a test ([details](#test-run-hygiene))                        |
| `guardGlobalPatches(reaction)`                                                       | `/setup`                      | Name the test that redefined a property of `document` / `navigator` / `globalThis` as non-configurable                                                |
| `installPerTest(install)`                                                            | `/setup`                      | Re-install a stub before every test of the block — a `describe`-level stub is restored away after the first                                           |
| `setupAngularTestEnv(opts)`                                                          | `/angular`                    | Zone and zoneless spec files in one worker, switching platforms per file                                                                              |
| `restoreTimerGlobals()`                                                              | `/setup`                      | Put back timer globals that uninstalling the fakes deleted rather than restored                                                                       |
| `trackMockRegistry()` / `keepMockRegistered(mock)`                                    | `/setup`                      | Keep @vitest/spy's mock registry to the mocks that outlive a file; mark one the split would miss ([details](#test-run-hygiene))                        |
| `errorHandler`                                                                       | core                          | The `mustBeCalledWith` argument-mismatch reporter — swap it to customize failure output                                                               |

A taste of the DI pair — provide the spy, inject it back fully typed:

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [provideAutoSpy(UserService)] });
const userService = injectSpy(UserService); // Spy<UserService>, no `as` cast
```

And a standalone function spy, when there's no class or interface at all:

```ts
import { createFunctionSpy } from 'vitest-auto-spy';

const onSave = createFunctionSpy<(id: number) => Promise<void>>('onSave');
onSave.calledWith(1).resolveWith();
```

### Console spies — `vitest-auto-spy/console`

Importing the entry replaces `console.debug` / `error` / `info` / `log` / `time` / `timeEnd` /
`trace` / `warn` with **silent, fully-typed spies** and exports each one ready to assert — no
`vi.spyOn(console, 'info')` boilerplate in every suite, no log output polluting the test run:

```ts
import { consoleInfoSpy, consoleWarnSpy } from 'vitest-auto-spy/console';

service.doWork();

expect(consoleInfoSpy).toHaveBeenCalledWith('done');
expect(consoleWarnSpy).not.toHaveBeenCalled();
```

Housekeeping: `resetConsoleSpies()` clears the recorded calls between tests (Vitest's
`clearMocks: true` already does that automatically), `restoreConsole()` puts the original
methods back, and `installConsoleSpies()` re-installs after a restore.

> The spies use the registered `MockAdapter` — import your runtime entry
> (`vitest-auto-spy/bun`, `…/node`) **before** `vitest-auto-spy/console` and the console spies
> are driven by that runner's mocks; with no prior runtime entry the default Vitest adapter is used.

Prefer a fully detached fake instead of touching the real global? `createAutoMock<Console>()`
gives you a typed, in-memory console to inject into code that takes a logger:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const fakeConsole = createAutoMock<Console>();
const service = new ReportService(fakeConsole);

service.doWork();

expect(fakeConsole.info).toHaveBeenCalledWith('done');
```

## Observable assertions

`expect(...)` inside a `subscribe()` callback is the most common way to write a test that passes
while asserting nothing: if the stream never emits, the callback never runs and no expectation is
ever evaluated. These helpers invert that — the assertion is the `await`.

```ts
import { expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first VALUE, not a list
await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // the task itself, not `[task]`
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // the list is this one
await expectNoEmission(source$, { timeout: 50 }); // asserts silence
await expectCompletion(service.purgeCache()); // asserts termination — the `Observable<void>` case
```

The emitted type is inferred, so `expectEmission(of(1))` is a `Promise<number>`; up to 3.4.0 it was
`Promise<unknown>` and nothing said so. `expectCompletion` covers the stream whose value is not the
point, which `firstValueFrom` rejects with rxjs's `EmptyError`. When the **failure** is the subject,
`expectError` resolves with the error exactly as it was thrown — so `resolves.toBe(originalError)`
and `toBeInstanceOf(HttpErrorResponse)` are ordinary assertions again:

```ts
await expect(expectError(service.load())).resolves.toBe(originalError);
```

Three options put the rest of the rxjs boilerplate in the assertion: `{ skip: 1 }` for the stale
first value of a `shareReplay`, `{ until: (v) => … }` for "it emitted *the* value" (non-matching
emissions are still counted, so the failure says how many arrived), and
`{ advance: () => vi.runAllTimers() }` for a stream whose clock has to move *after* something is
listening.

A stream that stays quiet fails with the label and the timeout in the message, one that errors
fails with the error, and one that completes empty says so:

```
saved$ did not emit within 1000 ms (0 emission(s) received). Either the stream never fired — check
the trigger and any provider spy feeding it — or it is slower than the timeout; …
```

| Option    | Default | Notes                                                        |
| --------- | ------- | ------------------------------------------------------------ |
| `timeout` | `1000`  | Milliseconds to wait. `0` waits indefinitely                 |
| `label`   | —       | Name used in the failure message instead of "the observable" |

The source is duck-typed, so this lives in the **core** entry and pulls in no rxjs. Both
subscription contracts are accepted: an observer object, as rxjs takes, and a bare `next` callback,
as Angular's `output()` (`OutputEmitterRef`) takes — the second one used to hang until the watchdog,
because Angular routes the resulting `TypeError` into its `ErrorHandler` where no spec can see it.

The watchdog uses the timer functions captured at import time, so `vi.useFakeTimers()` cannot stop
it — the failure stays "the stream did not emit", not "the test timed out" — and a virtual watchdog
would race the timers a spec advances. The price is that under global fake timers a *failing*
assertion spends a real second; lower the default once with `setEmissionTimeout(100)` in the setup
file rather than passing `{ timeout: 0 }` at every call site, which disables the watchdog and takes
the message with it.

## Test-run hygiene

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

The pieces of hygiene every project otherwise assembles by hand, each cheap to install and
expensive to diagnose when it is missing. The first three are on by default:

1. **`restoreMockedProps()` after each test.** `vi.restoreAllMocks()` knows about spies, not about
   properties `mockReadonlyProp` / `mockValueProp` redefined. Under `isolate: false` an un-restored
   patch on a global, a prototype or a singleton leaks straight into the next file.
2. **One copy of the library in the process.** Two copies keep two sets of console spies and two
   registries, so an assertion runs against a spy that never replaced the console the code under
   test called; the symptom reads as "tests fail depending on file order". The check fails the run
   with a report naming both copies and what to do about each cause — a second install, or one
   install resolved through two different subpaths.
3. **Draining the runner's restore registry.** Every `vi.spyOn` adds an entry that only
   `vi.restoreAllMocks()` removes; with a shared environment that list grows for the whole run.
4. **Timers that outlive their file.** Opt-in. Under `isolate: false` a `setTimeout` a component
   never clears fires while a **later** file is mid-test, against mocks and a DOM that no longer
   match, and the runner blames whichever file happened to be running.
5. **The network.** Opt-in. jsdom ships no `fetch`, so a component reaching for a remote asset is
   inert under it; happy-dom implements it and the same component issues real requests. Nothing
   asserts on them, so every test passes — then the runner aborts what is in flight at teardown, the
   aborts arrive as unhandled rejections, and a run with every test green exits 1 naming no test.
6. **Timer globals the fakes took with them.** On by default, because it can only repair. Under
   happy-dom `Date` is inherited from the environment's realm, so `vi.useRealTimers()` deletes it
   rather than putting it back; with `isolate: false` the next file then dies inside Vitest's own
   `useFakeTimers`, several files from the cause. Only globals that went missing are restored, so a
   replacement a spec installed on purpose is left alone.
7. **Promise rejections zone.js swallowed.** Opt-in. zone.js replaces the global `Promise`, and a
   rejected one nobody handled is drained into `console.error` and no further — it never reaches
   `process.on('unhandledRejection')`, the channel Vitest watches, so the runner is never told. An
   assertion that dies inside a `.then()` therefore prints to stderr and leaves its test green. One
   migrated Angular monorepo — 1688 spec files, 11 587 tests, green, exit 0 — was hiding six defects
   of exactly that shape, two of them assertions that were simply false and one a `TypeError` thrown
   by production code.
8. **The mock registry, which nothing empties.** Opt-in. Every `vi.fn()` and `vi.spyOn()` is added to
   one `Set` inside `@vitest/spy` so that `vi.clearAllMocks()` has something to walk, and no API takes
   anything out of it again. With `isolate: false` that set is created once per worker and only
   grows, so `clearMocks: true` walks every mock of every file already run before each test, and the
   worker holds all of them at once — with their recorded arguments, and through those whole
   component trees. Pruning it is easy to get wrong in one specific way: drop the module-level
   `vi.fn()` that six spec files import from a shared `*.mock.ts` and nothing clears it any more, so
   its calls accumulate and the file that happens to run second fails on calls its predecessor made.
   `pruneMockRegistry` keeps what a file inherited and drops only what it added.

| Option                | Default   | Notes                                                                         |
| --------------------- | --------- | ----------------------------------------------------------------------------- |
| `duplicateCopies`     | `'throw'` | `'warn'` to report without failing, `'off'` to skip the check                 |
| `restoreProps`        | `true`    | `restoreMockedProps()` in a global `afterEach`                                |
| `restoreMocks`        | `false`   | `vi.restoreAllMocks()` in a global `afterEach` — turn on for `isolate: false` |
| `strayTimers`         | `false`   | Cancel timeouts, intervals and frames that outlive their file                 |
| `strayRejections`     | `false`   | Fail the test a rejection zone.js swallowed surfaced in — needs zone.js       |
| `blockNetwork`        | `false`   | Close every network channel the environment has — `true`, or a narrowing object |
| `guardGlobals`        | `'off'`   | Report a test that redefines a global property as non-configurable            |
| `globalFakeTimers`    | `false`   | Fake timers for every test **and between them** — Jest's `enableGlobally`     |
| `restoreTimerGlobals` | `true`    | Put back timer globals that uninstalling the fakes deleted                    |
| `pruneMockRegistry`   | `false`   | Keep @vitest/spy's ever-growing mock registry to the mocks that outlive a file |

`restoreMocks` is off by default because it also drops `vi.spyOn` stubs a suite installed in
`beforeAll`; it is the knob to reach for when the run shares one environment across files.

Whatever is turned on, the hooks belong to the spec file whose collection imported the setup module.
Vitest re-imports setup files per spec file, so that is normally invisible — until something keeps
the module in the cache across files, and then only the **first** file of each worker gets any of
them: no property restore, no `blockNetwork`, no stray-timer cancellation, no global fake timers,
and no report that they are missing. The case seen in the wild is `@angular/build:unit-test` with
coverage, where each test file is served as a wrapper around the built bundle and the setup module
is never re-evaluated. Run that with `--isolate`, or call `setupAutoSpy()` from something evaluated
per file.

## Fake timers

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

describe('SearchComponent', () => {
  setupFakeTimers();

  it('debounces the query', async () => {
    component.onInput('ab');
    await advanceTimers(300);
    expect(search.query).toHaveBeenCalledWith('ab');
  });
});
```

Two pieces of boilerplate, and the one bug that hides in them.

**`setupFakeTimers(config?)`** installs the clock in a `beforeEach` and gives it back in an
`afterEach`. Written as two separate hooks, the second is the one a suite forgets — and a frozen
clock left behind leaks into every later file in the same worker, where it surfaces as an unrelated
test hanging on a `setTimeout` that never fires. The optional `config` is forwarded verbatim to
`vi.useFakeTimers()` (`{ toFake: ['setTimeout'] }`, `shouldAdvanceTime`, `now`, …).

**`setupFakeTimers(config?, options?)`** takes `{ betweenTests: true }` as its second argument, which
keeps the clock fake in the gaps between tests as well — Jest's `fakeTimers.enableGlobally`. Arming
in `beforeEach` alone does not reproduce that: a `beforeAll` inside a **nested** `describe` runs
_after_ the previous test's `afterEach`, so a block preparing its samples there meets real timers and
fails with "the timers APIs are not mocked", in a set whose own tests never touch a timer. With the
option the fakes are re-armed after every test and taken off for good in `afterAll`, so they never
outlive the file. For a whole run, `setupAutoSpy({ globalFakeTimers: true })` turns it on from the
setup file.

**`advanceTimers(ms?)`** is `vi.advanceTimersByTime()` plus the step that is easy to miss.
Advancing runs the timer callbacks synchronously, but whatever they _queue_ — a resolved promise, an
`await` continuation, an RxJS `delay()` handing control back — is still in the microtask queue when
the next line runs:

```ts
// Reads state from before the callback finished — fails like a race in the code under test:
vi.advanceTimersByTime(300);
expect(search.query).toHaveBeenCalled();

// Awaits the queue the callback filled:
await advanceTimers(300);
expect(search.query).toHaveBeenCalled();
```

That is why it is `async`: the return value must be awaited. On real timers it throws with a message
naming the fix, rather than letting Vitest fail deeper in with "timers are not mocked".

> On Angular, pair it with [`stable(fixture)`](#zoneless-waiting) — `advanceTimers` moves the clock,
> `stable` flushes the effects and change detection that the clock set off.

## Observer stubs

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy';

it('reveals the card once it scrolls into view', async () => {
  const observers = stubIntersectionObserver();
  const fixture = TestBed.createComponent(RevealHost);

  fixture.detectChanges(); // the directive constructs its observer

  observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
  await fixture.whenStable();

  expect(fixture.nativeElement.classList).toContain('is-visible');
});
```

A component constructs its `IntersectionObserver` / `ResizeObserver` / `MutationObserver` itself and
keeps the instance private, so the only handle a spec has is the global constructor. The stub every
project writes for that goes wrong in two ways this one does not.

**It is never taken off.** A directly assigned `globalThis.IntersectionObserver` is inherited by the
next file under `isolate: false`, which then fails on something unrelated — `.observe is not a
function`, or an assertion that never fires — pointing at innocent code. Installation here goes
through `mockValueProp`, so `restoreMockedProps()` (which [`setupAutoSpy()`](#test-run-hygiene)
already runs) puts the real constructor back.

**The instance is reached through `static last`,** which is shared mutable state that outlives the
spec just as the stub does. Here the instances live on the handle the installer returns. Asking for
`last` before the code under test constructed anything throws and names which mistake it is, rather
than failing three lines later against `undefined`.

| Member                                 | What it is                                                              |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `instances`                            | every observer constructed since the stub went in, in order             |
| `last`                                 | the newest — the usual case, where a component builds exactly one       |
| `targets`                              | everything passed to `observe`, with `unobserve` / `disconnect` applied |
| `observe` / `unobserve` / `disconnect` | the spies, for asserting _that_ it happened                             |
| `disconnected`                         | whether teardown ran                                                    |
| `emit(entries)`                        | invoke the callback with one batch, as the browser delivers it          |

`emit` takes an array on purpose: a fast scroll or a resize storm delivers several entries at once,
and code that assumes one entry per call is a real bug this makes reachable.

`stubResizeObserver()`, `stubMutationObserver()` and the generic `stubObserver(name)` are the same
thing for the other two. `intersectionEntry(target, isIntersecting, overrides?)` fills in the fields
nothing reads and derives `intersectionRatio`, since a ratio disagreeing with `isIntersecting` is
not a state the browser produces.

Nothing here is Angular-specific — the spies come from whichever runtime adapter is registered, so
this works on Bun and `node:test` too.

## ESLint plugin

```js
// eslint.config.js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

Scope it to spec files yourself: every rule is about test code, and `Object.defineProperty` or an
object of `vi.fn()`s is perfectly reasonable in application code. Flat config only — the legacy
`.eslintrc` `plugins: ['…']` form resolves names to `eslint-plugin-*` packages, which a subpath
export can never be.

| Rule                           | Recommended | Fix       | Flags                                                                                 |
| ------------------------------ | :---------: | --------- | ------------------------------------------------------------------------------------- |
| `prefer-provide-auto-spy`      |   `warn`    | —         | a hand-rolled `useValue` **or** `useFactory` → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)` |
| `prefer-create-spy-from-class` |   `warn`    | —         | an object literal of two or more `vi.fn()`s → `createSpyFromClass` / `createAutoMock`, unless it is a factory's own seed |
| `prefer-inject-spy`            |   `warn`    | suggest   | `vi.spyOn(TestBed.inject(X), 'm')`, in one step or two → `injectSpy(X).m`              |
| `no-object-define-property`    |   `error`   | suggest   | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp`              |
| `no-expect-in-subscribe`       |   `error`   | suggest   | `expect()` inside a `subscribe()` callback → `expectEmission` / `firstValueFrom`      |
| `no-shared-module-level-mock`  |   `error`   | —         | an **exported** value holding `vi.fn()`s → export a factory that returns it           |
| `no-mocked-for-spy`            |   `warn`    | `--fix`   | `Mocked<T>` in any type position → `Spy<T>`, import and all                            |
| `no-done-callback`             |   `error`   | —         | `it('x', (done) => …)` → `async` + an awaited assertion                               |
| `no-floating-assertion`        |   `error`   | —         | `expect()` in a `.then()` nobody awaits → `expect(await promise)`                     |

Every message ends with a link to the matching [recipe](#how-to-mock): a rule that only says
"don't" moves the problem rather than solving it. Rules travel with the API they recommend, so they
are versioned together and stop being re-written in every project that installs the package.

**One of the nine fixes on its own, three offer suggestions**, and the split is not about how hard
the rewrite is. `no-mocked-for-spy` touches a *declaration*: get it wrong and the file stops
compiling, which is the loudest, cheapest failure there is — so `--fix` rewrites the type, adds
`import type { Spy } from 'vitest-auto-spy'` and drops the `Mocked` import once nothing else uses
it. It stands back where it cannot prove the rename is Vitest's `Mocked` (a `Mocked` the file
declares itself, a `Spy` that already means something else, an argument that is not a named type)
and reports without a fix. The other two change *behaviour* — whether `injectSpy(X)` finds a spy
depends on a `provideAutoSpy(X)` that usually lives in another file, and `mockValueProp` leaves the
property writable and configurable — so they are offered as editor suggestions and applied by a
human — as is `no-expect-in-subscribe`, which rewrites the whole
`it(name, () => new Promise((done) => src$.subscribe(…)))` template into an `async` test that awaits
`firstValueFrom`. The remaining five replace one shape with several statements, or with a shape
whose arguments the source does not contain (`createSpyFromClass` needs the class the object
literal never names), and no per-node edit can do that.

## Bridging `Spy<T>` and `T`

`Spy<T>` is a mapped type. It drops `#private` / `private` members, so it is **not** assignable to
`T` — correct (a spy is not the class), and a constant nuisance when an API asks for `T`. The fix
is a named, documented view instead of `as any` scattered through a suite:

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

asInstance(cartSpy); // Spy<CartService> → CartService, for APIs typed against the class
asSpy(TestBed.inject(CartService)); // CartService → Spy<CartService>, for the helpers
```

Both are the same object at runtime; only the view changes.

## API reference

| Export                                                                                                       | Description                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSpyFromClass(Class, methodsOrConfig?)`                                                                | Build a fully-typed `Spy<T>` from a class                                                                                                           |
| `createAutoMock<T>(overrides?, config?)`                                                                     | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class); `{ returns }` seeds method results                                              |
| `createMock<T>(partial?)`                                                                                    | Build a plain, spy-free `T` from the fields a test seeds — for data shapes the code under test reads                                                |
| `mockDeep<T>(overrides?, options?)`                                                                          | Build a **recursive** auto-mock — `mock.repo.user.find()` chains without seeding; `{ selfReturning: true }` chains through calls too                |
| `resetAutoSpy(spy)` / `clearAutoSpy(spy)`                                                                    | Reset every spy in an auto-spy at once — `reset` also reverts return-value config (`calledWith` **and** a bare `mockReturnValue`); `clear` keeps it |
| `provideAutoSpy(Class, methodsOrConfig?)`                                                                    | Angular / NestJS `{ provide, useValue }` shorthand — an `abstract class` DI token included                                                          |
| `provideAutoSpy(token, Class, methodsOrConfig?)`                                                             | Vue `{ [token]: Spy<T> }` for `global.provide`                                                                                                      |
| `injectSpy(token)` _(Angular)_ / `injectSpy(moduleRef, token)` _(NestJS)_                                    | Inject typed as `Spy<T>`                                                                                                                            |
| `createFunctionSpy(name)`                                                                                    | A single standalone function spy with all helpers                                                                                                   |
| `createObservableWithValues(configs, opts?)`                                                                 | Build an Observable from value configs                                                                                                              |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockValueProp` / `mockAccessorsProp`                        | Mock readonly / writable / accessor / signal props                                                                                                  |
| `restoreMockedProps()` / `countMockedProps()`                                                                | Undo every `mock*Prop` patch (descriptors restored newest-first) / how many are still applied                                                       |
| `expectEmission(source$, opts?)` / `expectEmissions(source$, n, opts?)` / `expectNoEmission(source$, opts?)` | Assert an Observable without a `subscribe` callback that may never run; the emitted type is inferred                                                |
| `expectCompletion(source$, opts?)` / `expectError(source$, opts?)`                                           | Assert that a stream terminates; await the error it fails with, unwrapped                                                                           |
| `setEmissionTimeout(ms)`                                                                                     | Change the process-wide default wait of the emission helpers                                                                                        |
| `asInstance(spy)` / `asSpy(instance)`                                                                        | The two named views between `Spy<T>` and `T`, instead of `as any`                                                                                   |
| `createSpyClass(Class, config?)`                                                                             | A spy that can be called with `new`; records `calls` and `instances`                                                                                |
| `mockConstructor(factory, name?)` / `stubConstructor(obj, key, factory)`                                     | A runner mock that is also a constructor — for a global or an SDK with no class at runtime                                                          |
| `stubAbortController()`                                                                                      | A realm-consistent `AbortController` / `AbortSignal` for jsdom + zone.js                                                                            |
| `flushEventLoop(turns?)` / `settleDynamicImport(load, turns?)`                                               | Real event-loop turns under fake timers; wait for a dynamic `import()`                                                                              |
| `autoMocked<T>(overrides?)`                                                                                  | `createAutoMock` typed as `T & Spy<T>`                                                                                                              |
| `mockSystemTime` / `withSystemTime` / `mockNow` / `useCountingClock` _(`/setup`)_                            | Clock control that survives fake timers being re-installed per test                                                                                 |
| `registerFocusMatchers()` _(`/setup`)_                                                                       | Adds `expect(el).toHaveFocus()`                                                                                                                     |
| `overrideAutoSpy` / `overrideComponentProvider` / `assertNgModuleScopes` _(Angular)_                         | Override a component-level provider; diagnose an NgModule with an empty runtime scope                                                               |
| `setupAutoSpy(opts?)` _(`/setup`)_                                                                           | Property restore + duplicate-copy detection + mock-registry hygiene, in one call                                                                    |
| `setupFakeTimers(config?)` / `advanceTimers(ms?)` _(`/setup`)_                                               | Paired fake-timer install/restore, and an advance that also settles queued microtasks                                                               |
| `describeDuplicateCopies()` / `getPackageCopies()`                                                           | The duplicate-install report, and the copies behind it                                                                                              |
| `renderShallow(Component, opts?)` _(Angular)_                                                                | `TestBed` component, minus its children and (by default) its template                                                                               |
| `createWithAutoSpies(Class, opts?)` _(Angular)_                                                              | Build a class through Angular DI with every unprovided token auto-spied                                                                             |
| `stable(fixture)` / `flushEffects()` _(Angular)_                                                             | Zoneless waiting: flush effects, then await the fixture                                                                                             |
| `registerSignalMatchers()` _(Angular)_                                                                       | Adds `expect(sig).toHaveSignalValue(value)`                                                                                                         |
| `enableTestBedDiagnostics(opts?)` _(Angular)_                                                                | Per-file report of how much of a spec's time went into `TestBed`                                                                                    |
| `setupAngularTestEnv(opts)` _(Angular)_                                                                      | Zone and zoneless spec files in one worker, switching platforms per file                                                                            |
| `stubMediaElement(opts?)`                                                                                    | A `<video>` / `<audio>` that plays, reports a duration and fires the media events                                                                   |
| `assertMocked(namespace, opts?)` / `moduleNamespace(exports, opts?)`                                         | Prove a `vi.mock()` applied; give its factory the shape an interop probe recognises                                                                 |
| `flushEventLoopUntil(isDone, opts?)`                                                                         | Real event-loop turns until a condition holds, with a budget instead of a hang                                                                      |
| `diffByField(actual, expected)`                                                                              | Which field of an array of records moved, and in how many elements                                                                                  |
| `guardGlobalPatches(reaction)` / `installPerTest(install)` _(`/setup`)_                                      | Name the test that sealed a global property; re-install a stub before every test                                                                    |
| `consoleDebugSpy` … `consoleWarnSpy` _(`/console`)_                                                          | Silent typed spies replacing the global `console` methods on import                                                                                 |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()`                                         | Install / clear / undo the console spies                                                                                                            |
| `errorHandler`                                                                                               | The `mustBeCalledWith` argument-mismatch error helper                                                                                               |

**Spied sync method:** `mockReturnValue`, `calledWith(...)`, `mustBeCalledWith(...)` — `calledWith`
also matches **asymmetric matchers** (`calledWith(expect.any(Number))`, `expect.objectContaining({...})`)

**Spied Promise method:** `resolveWith`, `rejectWith`, `resolveWithPerCall`

**Spied Observable method / property:** `nextWith`, `nextOneTimeWith`, `nextWithValues`,
`nextWithPerCall`, `throwWith`, `complete`, `returnSubject`

**Config (`ClassSpyConfiguration`):** `methodsToSpyOn` (added to the discovered methods),
`onlyMethodsToSpyOn` (spy on nothing but these — discovery skipped), `instanceMethodsToSpyOn` (same
as `methodsToSpyOn`, named for callables that live on the instance — `signal()` fields, arrow props,
`signalStore()` methods), `observablePropsToSpyOn`,
`gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors` (discover every getter/setter),
`fillMissing` (answer a name the prototype never carried with a spy — for a **partially** abstract
class, where `abstract` members are erased and the empty-prototype fallback no longer fires),
`lazySpies` (materialize method spies on first access — cheaper for wide classes; the `provideAutoSpy` default on Angular)

`ValueConfig` (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` | `{ complete?, delay? }`.

## FAQ & troubleshooting

**"I get `X.nextWith is not a function` / observable helpers are missing."**
Import the rxjs layer once (e.g. in your test setup): `import 'vitest-auto-spy/rxjs';`. Without it,
requesting an observable spy throws a hint pointing you here.

**"My method isn't on the spy."**
Auto-discovery only sees **prototype methods**. Arrow-function class fields (`foo = () => {}`) and
plain properties aren't included — see [How it works](#how-it-works-and-what-it-wont-spy). List
getters/setters via `gettersToSpyOn` / `settersToSpyOn`.

**"Does it construct my class? Will the constructor's side effects run?"**
No. `createSpyFromClass` reads the prototype and never `new`s the class, so constructors (and their
HTTP/DB/`inject()` side effects) never run.

**"I only have an interface/type, not a class."**
Use [`createAutoMock<T>()`](#auto-mock-by-type-no-class-needed) — it builds the spy lazily from the
type via a `Proxy`, no runtime class needed.

**"Can I use it without TypeScript?"**
Yes — the runtime works in plain JS; you just lose the compile-time `Spy<T>` typing.

**"Native mock methods differ between runners."**
Only the auto-spy helpers are normalised. Native APIs stay the runner's own (`mockReturnValue` on
Vitest/Bun, `spy.method.mock.mockImplementation` on `node:test`).

## Versioning

This package follows [Semantic Versioning](https://semver.org). Breaking changes to the public API
land only in major releases; see the [Changelog](./CHANGELOG.md) for what changed in each version.
Releases are automated from Conventional Commits (see [Contributing](#contributing)).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). In short:

```bash
npm ci
npm test            # run the suite once
npm run test:watch  # fast local loop — no v8 coverage instrumentation
npm run test:coverage   # 100% thresholds enforced (slower; for CI / pre-push)
npm run build
```

> **Tip:** develop against `npm run test:watch` — it skips the v8 coverage
> instrumentation that `test:coverage` adds, so the feedback loop is noticeably
> faster. Run `test:coverage` before pushing to confirm the 100% thresholds.

Releases are automated: merging a PR into `master` bumps the version from the
Conventional Commit types and publishes to npm — see
[CONTRIBUTING.md → Releasing](./CONTRIBUTING.md#releasing).

If this package saved you time, a ⭐ on [GitHub](https://github.com/ASDAlexey/vitest-auto-spy)
helps others find it.

## Acknowledgements

API and ergonomics are modelled on Shai Reznik's
[`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies) — `vitest-auto-spy` is its
Vitest-era successor with the same surface, so migrations are (mostly) a find-and-replace. Thanks to
the Vitest, Bun, RxJS and Angular communities whose tooling this builds on.

## License

[MIT](./LICENSE) © [Alexey Popov](https://github.com/ASDAlexey)

Get in touch: [asdalexey.github.io](https://asdalexey.github.io/ru/)
