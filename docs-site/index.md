---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: vitest-auto-spy
description: Typed auto-spies from a class — one API across Vitest, Bun and node:test, with Angular's TestBed running under bun test.

hero:
  name: 'vitest-auto-spy'
  text: 'Typed auto-spies from a class'
  tagline: A drop-in, fully-typed jest-auto-spies successor — one API across Vitest, Bun and node:test, and the only way to run Angular's TestBed under bun test.
  actions:
    - theme: brand
      text: Get started
      link: /core/introduction
    - theme: alt
      text: Angular on Bun
      link: /runtimes/bun-angular
    - theme: alt
      text: Installation
      link: /core/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/ASDAlexey/vitest-auto-spy

features:
  - icon: 🎯
    title: Fully typed spies
    details: Every method becomes a typed mock with return-type-aware helpers — resolveWith for Promises, nextWith for Observables, calledWith / mustBeCalledWith for argument matching. Overloaded methods included — a generated API client no longer forces the last signature, the one nobody calls. strict — per double or per suite — turns the forty-first method nobody configured from an undefined that fails three frames later into a throw that names the class, the method and the arguments. And every double is Disposable, so using spy = createSpyFromClass(X) retires the afterEach that existed only to reset one spy.
    link: /core/create-spy-from-class
  - icon: 🧪
    title: Class, type, or neither
    details: createSpyFromClass reads a real class and spies every method. No class? createAutoMock<T>() and recursive mockDeep<T>() mock straight from a type — and createMock<T>() builds the spy-free data shape a test only reads, from a deep partial that is still checked at every level.
    link: /core/auto-mock-by-type
  - icon: 🔀
    title: One API, three runtimes
    details: The core talks to your runner through a MockAdapter seam, so the same spies run on Vitest, Bun (bun:test) and node:test. Only native mock methods stay the runner's own.
    link: /runtimes/vitest
  - icon: 🅰️
    title: Angular TestBed on Bun
    details: Bun ships no DOM and cannot resolve templateUrl, so Angular specs simply do not run there. One preload installs a DOM, inlines external templates and styles through a Bun.plugin hook, and boots a zoneless TestBed.
    link: /runtimes/bun-angular
  - icon: 🧭
    title: Signals a spec can drive
    details: mockSignalProp replaces a signal-valued property with a real WritableSignal and hands back the writable half, so a computed downstream recomputes and an effect runs. runEffect() runs one effect body on demand when its trigger is now static.
    link: /adapters/angular
  - icon: 🧵
    title: Resources that settle, or say why not
    details: Angular's httpResource() and resource() need a different wait each — measured on 21.2.17, an httpResource settles one tick plus one microtask after its response is flushed, a plain resource() takes two rounds, and neither has issued a request at all until something ticks. Get it wrong and nothing fails — the spec asserts the resource's default value and passes. settleResource() is the one wait both converge under, with a budget and a failure that names the resource and the flush it is missing. When the request is not the point at all, mockResourceProp drives a resource with no HTTP at all — set, fail and loading move it directly, so nothing is ever in flight. And toHaveResourceValue refuses to compare an unresolved resource even when its default happens to match — the assertion the whole family exists to stop passing. No library in the Angular world had an answer.
    link: /adapters/angular#resources-httpresource-and-resource
  - icon: ⚡
    title: Faster Angular specs
    details: renderShallow collapses the shallow-TestBed copy-paste into one call (1.7× on real component specs), createWithAutoSpies builds a class through DI with every unprovided token spied, and per-file diagnostics say which specs are worth converting.
    link: /adapters/angular
  - icon: 🧱
    title: The providers a testing module cannot reach
    details: overrideComponentProvider replaces a dependency a component declares in its own providers, and queues the component with the TestBed compiler so the override reaches it. assertNgModuleScopes names the module an AOT bundle stripped, createDirectiveHost compiles a host that is correct for both the compiler and the TestBed, and provideAutoSpyForToken covers a dependency behind an InjectionToken. enableAngularDiagnostics turns four more silences into failures in one setup line — a testing module importing an NgModule that contributes nothing at all, schemas sitting next to a standalone component where they can never apply, injectSpy handed a real instance instead of a spy, and a test that ends with unflushed HttpTestingController requests.
    link: /adapters/angular
  - icon: 📡
    title: Observables that fail on silence
    details: expectEmission / expectEmissions / expectNoEmission replace the expect() inside a subscribe callback that never runs — the assertion is the await. Duck-typed, so no rxjs is pulled in.
    link: /core/observable-assertions
  - icon: 🫥
    title: When a green suite is lying
    details: zone.js replaces the global Promise, and a rejection nobody handled is drained into console.error and no further — it never reaches the channel Vitest listens on, so the runner is never told and the file still exits 0. An expect() inside a .then(), an async helper called without await, a TypeError thrown inside an import() in production code — every one of them is a passing test with a line of stderr behind it. The strayRejections option fails the test the rejection surfaced in, and the no-floating-assertion lint rule catches the commonest shape before it ever runs. One migrated suite of 11 587 tests, green, was hiding six real defects of that shape — two of them assertions that were simply false.
    link: /utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed
  - icon: 🏗️
    title: Doubles for what the code builds itself
    details: Vitest only forwards new to a constructible implementation, so the Jest idiom vi.fn(() => instance) records the call, skips the body and returns an empty object. mockConstructor / stubConstructor stay full runner mocks, collect instances, and refuse to be called without new.
    link: /utilities/constructor-doubles
  - icon: ⏳
    title: Waiting and the clock
    details: flushEventLoop and settleDynamicImport give a real event-loop turn while the timers stay faked, flushEventLoopUntil replaces a tuned sleep with a budgeted condition, and mockSystemTime / useCountingClock survive fake timers being re-installed around every test. Every wait here is bounded and names its own cause — including stable(fixture), which used to hand a stuck fixture to the runner's file-level timeout.
    link: /utilities/event-loop
  - icon: ⏱️
    title: Fake timers that settle
    details: setupFakeTimers() pairs install with restore, and advanceTimers() drains the microtasks a bare advanceTimersByTime leaves pending — the gap that makes a timer assertion read like a race. betweenTests keeps the clock fake between the tests as well, which is what Jest fakeTimers.enableGlobally did and what a nested beforeAll needs.
    link: /utilities/fake-timers
  - icon: 🌀
    title: fakeAsync on Vitest
    details: zone.js/testing installs its ProxyZone through Jasmine and Jest hooks only, so fakeAsync and waitForAsync throw on Vitest. One import of vitest-auto-spy/zone patches them in — behind its own specifier, so a zoneless project never sees zone.js. One proxy zone serves the whole run, as Angular own jasmine patch does, so a component built in beforeEach and a tick() in the test share their timers.
    link: /utilities/zone
  - icon: 🧩
    title: Module mocks that prove they applied
    details: Under a bundler a vi.mock() with an unmatched specifier does nothing at all, and the spec asserts on the real module. assertMocked fails loudly instead, and moduleNamespace gives a factory the shape an interop probe recognises — no more "No default export is defined on the mock".
    link: /utilities/module-mocks
  - icon: 🧾
    title: Fixtures without casts
    details: narrow() says which branch of a union a test got, and prints the shape it actually had when it is wrong. withOverrides() builds a fixture from a model whose getters a spread would drop. asInstances() bridges a whole argument list at once, instead of one asInstance per tsc run. captureArg() takes hold of a callback or config the code under test built — expect.any tells you the kind, a captor hands you the value, which is the difference between "a callback was passed" and "call the callback that was passed".
    link: /utilities/fixtures
  - icon: 👁️
    title: The DOM the runner does not ship
    details: stubIntersectionObserver / stubResizeObserver / stubMutationObserver replace the global the code under test constructs and hand the spec the instance. stubMediaElement makes a <video> play and report a duration, stubAbortController fixes addEventListener(…, { signal }) — and restoreMockedProps takes all of it off again.
    link: /utilities/observer-stubs
  - icon: 📏
    title: Lint rules that steer a suite
    details: Twelve ESLint rules point a suite at these helpers, each message linking to its recipe. Five of them catch a test being wrong rather than verbose — an expect() inside subscribe(), an expect() in a .then() nobody awaits, an Object.defineProperty nothing restores, a module-level mock shared across files, and a done callback that makes a test pass having run almost none of its body.
    link: /utilities/eslint-plugin
  - icon: 🧹
    title: Hygiene for a shared environment
    details: One setupAutoSpy() call covers what isolate false breaks — property restore, duplicate-install detection, timers and animation frames that outlive their file, fetch that keeps a green run exiting 1, promise rejections zone.js prints and then swallows, and timer globals the fakes delete instead of restoring. installPerTest re-installs a stub for every test, and guardGlobals names the file that sealed a global. The one thing to know — those hooks belong to the spec file whose collection imported the setup module, so a runner that caches it across files leaves every file but the first without them.
    link: /utilities/setup
  - icon: 🚚
    title: A migration you can verify
    details: Counters cannot answer whether a port lost a test — a file can lose a whole suite while a flake elsewhere starts passing, and the totals match. compareTestRuns diffs the two sets of names from the JSON report both runners write, and diffByField turns a collapsed "…(8) to deeply equal" into the field that actually differs. npx vitest-auto-spy codemod does the edit half and declines the rest — it splits the legacy import across the entry points read off the installed package's own export map instead of a table typed into the tool, transposes jest.Mock<void, [Order]> into the call signature Vitest takes rather than renaming it into the reverse meaning, and leaves every span it cannot decide byte-for-byte as it was, with a file:line. Dry run by default, and --verify then matches the result against what should be gone — the one check that still works on a file somebody migrated by hand.
    link: /migrating
  - icon: 🩺
    title: The anti-patterns, underlined as you type
    details: A spy declared as the class, an expect() inside subscribe(), a done callback Vitest never calls — every one of them passes, so finding them in CI is an hour too late. The twelve rules ship with the package and need no editor plugin of their own — WebStorm and the other JetBrains IDEs run them natively, VS Code, Cursor and Windsurf through the ESLint extension.
    link: /utilities/editor-diagnostics
  - icon: 🔎
    title: Defects a green suite cannot show
    details: npx vitest-auto-spy doctor reports what nothing consumes — a tsconfig include pattern that matches no file, so it type-checks nothing while tsc --noEmit still reports success; a production module importing a spec, which under a shared environment is a cycle that costs the spec its own suite; a spec importing another spec; a @jest-environment pragma the runner never reads; configuration left behind for a runner that is gone, together with the setup files only it referenced. The check that motivated it found nine of 152 spec tsconfigs still covering their specs, after a codemod ate a /** and left a valid glob matching nothing. Read-only, zero config, exit 1 in CI.
    link: /utilities/cli
  - icon: 🤖
    title: Readable by your agent, not just by you
    details: One npx vitest-auto-spy init writes the pointer into the files the agents in your repository actually read — AGENTS.md, CLAUDE.md, GEMINI.md, a Claude Code skill stub, and a glob-scoped rule file for each tool already set up here — specialised for this runner, this framework and this setup file, between markers it regenerates on the next run. Behind it sits an AGENTS.md inside the tarball for offline reading, llms.txt and llms-full.txt at the docs root, and every error message ending with a link to the page that explains it.
    link: /agents
  - icon: 📦
    title: Zero runtime deps
    details: An in-tree arg serializer and opt-in subpaths keep rxjs, zone.js and Angular out of your runtime bundle. 100% test coverage, verified on Node 22/24/26 and Bun 1.4.
    link: /core/installation
---
