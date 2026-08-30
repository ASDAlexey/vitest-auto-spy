---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: vitest-auto-spy
description: The only auto-spy library that reads a real class and returns a fully-typed spy of every method, with control helpers that follow each return type — identical on Vitest, Bun and node:test.

hero:
  name: 'vitest-auto-spy'
  text: 'A typed spy of every method, read off the class'
  tagline: Control helpers that follow each return type, behind one identical API on Vitest, Bun and node:test.
  actions:
    - theme: brand
      text: Get started
      link: /core/introduction
    - theme: alt
      text: Why not the one you have
      link: /comparison
    - theme: alt
      text: Installation
      link: /core/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/ASDAlexey/vitest-auto-spy

features:
  - icon: 🎯
    title: Every method, from the real prototype
    details: createSpyFromClass reads the class, so the double has the methods the class has — including the overloads a generated API client would otherwise collapse onto the last signature, the one nobody calls. A deep Proxy answers every property, so a typo in a mocked method name never fails there; onlyMethodsToSpyOn here reports a name that is not on the prototype. strict, per double or per suite, turns the forty-first method nobody configured from an undefined that fails three frames later into a throw naming the class, the method and the arguments. Every double is Disposable, so using spy = createSpyFromClass(X) retires the afterEach that existed only to reset it. No class to read? createAutoMock&lt;T&gt;() and recursive mockDeep&lt;T&gt;() work from the type alone, and createMock&lt;T&gt;() returns the spy-free data shape a test only reads.
    link: /core/create-spy-from-class
  - icon: 🎛️
    title: Helpers that follow the return type
    details: A method returning a Promise gets resolveWith / rejectWith, one returning an Observable gets nextWith / throwWith, and every method gets calledWith and mustBeCalledWith. Only jest-auto-spies has the same, and it is Jest-only — the deep-Proxy libraries hand you one mockReturnValue for all three cases and no argument dispatch at all. A mustBeCalledWith mismatch prints both sides, with every configured call listed and its matchers shown, because the diagnosis is the comparison and not either half of it.
    link: /core/control-helpers
  - icon: 🔀
    title: One core, three runtimes, five frameworks
    details: The core never imports your runner. vi.fn() and its equivalents sit behind a MockAdapter that each entry point registers on import, so the same spec code runs on Vitest, bun:test and node:test — only native mock methods stay the runner's own. Angular, NestJS, React, Vue / Pinia and Svelte have their own entry points on top of it, and rxjs stays opt-in behind a subpath.
    link: /runtimes/vitest
  - icon: ⚙️
    title: Getter and setter spies, including where Bun refuses
    details: bun:test's own spyOn(obj, 'prop', 'get') throws — "does not support accessor properties yet", verified on Bun 1.4.0. And no library that generates a double from a class or a type has accessor spies at all, on any runner — not ng-mocks, spectator, @testing-library/angular, vitest-mock-extended, @golevelup or Suites. accessorSpies never calls the runner's spyOn. It redefines the property with a mock built by the adapter and preserves the half it is not replacing, so getters and setters behave identically on Vitest, Bun and node:test.
    link: /comparison#_1-accessor-spies-on-bun
  - icon: 🅰️
    title: Angular's TestBed under bun test
    details: Bun ships no DOM and cannot resolve templateUrl, so Angular specs simply do not run there — no other library in the field claims otherwise. One preload installs a DOM, inlines external templates and styles through a Bun.plugin hook, and boots a zoneless TestBed. provideAutoSpy, injectSpy and the zoneless waits come from one bun-angular entry point and read the same as they do on Vitest.
    link: /runtimes/bun-angular
  - icon: 📏
    title: Fourteen lint rules, underlined as you type
    details: Fourteen flat-config rules versioned together with the API they recommend, each message linking to its recipe. Seven of them catch a test being wrong rather than verbose — an expect() inside subscribe(), an expect() in a .then() nobody awaits, an Object.defineProperty nothing restores, a module-level mock shared across files, a done callback that makes a test pass having run almost none of its body. Two rewrite the source under --fix and six offer the rewrite as a suggestion, because a fix that silences the rule while the type gate still fails is worse than no fix. No editor plugin of their own — WebStorm runs them natively, VS Code, Cursor and Windsurf through the ESLint extension.
    link: /utilities/eslint-plugin
  - icon: 🧭
    title: Signals and resources a spec can drive
    details: mockSignalProp replaces a signal-valued property with a real WritableSignal and hands back the writable half, so a computed downstream recomputes and an effect runs. runEffect() runs one effect body on demand when its trigger is now static. httpResource() and resource() need a different wait each — measured on 21.2.17, an httpResource settles one tick plus one microtask after its response is flushed, a plain resource() takes two rounds, and neither has issued a request until something ticks. Get it wrong and nothing fails — the spec asserts the resource's default value and passes. settleResource() is the one wait both converge under, mockResourceProp drives a resource with no HTTP in flight at all, and toHaveResourceValue refuses to compare an unresolved resource even when its default happens to match.
    link: /adapters/angular#resources-httpresource-and-resource
  - icon: ⚡
    title: Less TestBed, and proof of what was injected
    details: renderShallow collapses the shallow-TestBed copy-paste into one call — 291 ms down to 174 ms, 1.7×, on real component specs — and createWithAutoSpies builds a class through DI with every unprovided token spied. overrideComponentProvider reaches a dependency a component declares in its own providers, which a testing module cannot. trackInjections answers the question most vi.mock() calls were really asking, which collaborators the entry point actually asked for, by registering them as provider factories and reading back the ones that fired — an assertion that survives a bundler removing the module boundary a mock would have needed.
    link: /adapters/angular#shallow-component-rendering
  - icon: 🩺
    title: Four Angular failures that pass quietly
    details: enableAngularDiagnostics() turns four silences into failures in one setup line — a testing module importing an NgModule that contributes nothing at all, schemas sitting next to a standalone component where they can never apply, injectSpy handed a real instance instead of a spy, and a test that ends with unflushed HttpTestingController requests. The third is the one nothing else looks for. injectSpy already warns once per token, naming the token and the provideAutoSpy call that is missing, and the group raises that warning to a failure — where spectator declares inject&lt;T&gt;(token) as SpyObject&lt;T&gt; whether the token was mocked or not, so the compiler hides the mistake until a real method meets .mockReturnValue somewhere else entirely.
    link: /adapters/angular-diagnostics
  - icon: 📡
    title: Assertions that fail on silence
    details: expectEmission / expectEmissions / expectNoEmission replace the expect() inside a subscribe callback that never runs — the assertion is the await, so a stream that stays quiet fails the test instead of passing it. Duck-typed, so no rxjs is pulled in. assertMocked does the same job one level up, where a vi.mock() specifier did not match under a bundler and the spec has been asserting against the real module all along, and moduleNamespace gives a factory the shape an interop probe recognises.
    link: /core/observable-assertions
  - icon: 🫥
    title: When a green suite is lying
    details: zone.js replaces the global Promise and drains a rejection nobody handled into console.error and no further — it never reaches the channel Vitest listens on, so the runner is never told and the file still exits 0. strayRejections fails the test the rejection surfaced in. One migrated monorepo of 1688 spec files and 11 587 tests, green, was hiding six real defects of that shape, two of them assertions that were simply false. npx vitest-auto-spy doctor reads the other half — a tsconfig include pattern that matches no file, so it type-checks nothing while tsc --noEmit still reports success. On the suite that motivated it, nine of 152 spec tsconfigs still covered their specs. Read-only, zero config, exit 1 in CI.
    link: /utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed
  - icon: 🚚
    title: A migration you can verify
    details: Counters cannot answer whether a port lost a test — a file can lose a whole suite while a flake elsewhere starts passing, and the totals still match. compareTestRuns diffs the two sets of names from the JSON report both runners write, and diffByField turns a collapsed "…(8) to deeply equal" into the field that actually differs. npx vitest-auto-spy codemod does the edit half and declines the rest — it splits the legacy import across the entry points read off the installed package's own exports map rather than a table typed into the tool, transposes jest.Mock&lt;void, [Order]&gt; into the call signature Vitest takes instead of renaming it into the reverse meaning, and leaves every span it cannot decide byte-for-byte as it was, with a file and a line. Dry run by default, and --verify then checks the result by matching what should be gone, which still works on a file somebody migrated by hand.
    link: /migrating
  - icon: 📐
    title: Half the type-checker work, no runtime dependencies
    details: Deep-Proxy mocking is paid for at tsc time and nobody publishes the bill. On one fixture — an 80-member class, 30 mock declarations, 600 member touches — Spy&lt;T&gt; costs 2 656 type instantiations against @golevelup/ts-vitest's 5 092 and vitest-mock-extended's 5 614, while carrying more helpers on each method. Spies are lazy at runtime too, so a 40-method class costs 10.3 µs against 68.6 µs eager. Zero runtime dependencies, with an in-tree arg serializer and opt-in subpaths keeping rxjs, zone.js and Angular out of your bundle. 100% test coverage, on Node 22, 24 and 26 and on Bun 1.4.
    link: /comparison#_3-type-check-cost
  - icon: 🧰
    title: The rest of the toolbox
    details: The helpers that are not the headline but are why a suite stops flaking — setupFakeTimers / advanceTimers, which drain the microtasks a bare advanceTimersByTime leaves pending; flushEventLoop and settleDynamicImport for the queue the clock does not reach at all; fakeAsync and waitForAsync patched onto Vitest, behind their own specifier so a zoneless project never sees zone.js; mockConstructor / stubConstructor for a double the code under test calls with new, which vi.fn(() => instance) is not; IntersectionObserver, ResizeObserver, MutationObserver, media-element and AbortController stubs for the DOM the runner does not ship; narrow / withOverrides / asInstances / captureArg for fixtures without casts; console spies; and one setupAutoSpy() call for the hygiene a shared environment needs. Every wait here is bounded and names its own cause.
    link: /api
  - icon: 🤖
    title: Written for the agent in your repo
    details: One npx vitest-auto-spy init writes the pointer into the files the agents in your repository actually read — AGENTS.md, CLAUDE.md, GEMINI.md, a Claude Code skill stub, and a glob-scoped rule file for each tool already set up here — specialised for this runner, this framework and this setup file, between markers it regenerates on the next run. Behind it sits an AGENTS.md inside the tarball for offline reading, llms.txt and llms-full.txt at the docs root, and every error message ending with a link to the page that explains it.
    link: /agents
---
