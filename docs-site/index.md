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
    details: Every method becomes a typed mock with return-type-aware helpers — resolveWith for Promises, nextWith for Observables, calledWith / mustBeCalledWith for argument matching.
    link: /core/create-spy-from-class
  - icon: 🧪
    title: Class, type, or neither
    details: createSpyFromClass reads a real class and spies every method. No class? createAutoMock<T>() and recursive mockDeep<T>() mock straight from a type — and createMock<T>() builds the spy-free data shape a test only reads.
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
  - icon: ⚡
    title: Faster Angular specs
    details: renderShallow collapses the shallow-TestBed copy-paste into one call (1.7× on real component specs), createWithAutoSpies builds a class through DI with every unprovided token spied, and per-file diagnostics say which specs are worth converting.
    link: /adapters/angular
  - icon: 📡
    title: Observables that fail on silence
    details: expectEmission / expectEmissions / expectNoEmission replace the expect() inside a subscribe callback that never runs — the assertion is the await. Duck-typed, so no rxjs is pulled in.
    link: /core/observable-assertions
  - icon: ⏱️
    title: Fake timers that settle
    details: setupFakeTimers() pairs install with restore, and advanceTimers() drains the microtasks a bare advanceTimersByTime leaves pending — the gap that makes a timer assertion read like a race.
    link: /utilities/fake-timers
  - icon: 📏
    title: Lint rules that steer a suite
    details: Five ESLint rules point a suite at these helpers, each message linking to its recipe. Two of them catch a test being wrong rather than verbose — an expect() inside subscribe() that never runs, and an Object.defineProperty nothing restores.
    link: /utilities/eslint-plugin
  - icon: 🧹
    title: Hygiene for a shared environment
    details: One setupAutoSpy() call covers what isolate false breaks — property restore, duplicate-install detection, timers and animation frames that outlive their file, fetch that keeps a green run exiting 1, and timer globals the fakes delete instead of restoring.
    link: /utilities/setup
  - icon: 👁️
    title: Observers a component builds itself
    details: stubIntersectionObserver, stubResizeObserver and stubMutationObserver replace the global the code under test constructs, hand the spec the instance, and are taken off again by restoreMockedProps — no static last, no stub inherited by the next file.
    link: /utilities/observer-stubs
  - icon: 🤖
    title: Readable by your agent, not just by you
    details: An AGENTS.md ships inside the tarball for offline reading, llms.txt and llms-full.txt sit at the docs root, a Claude Code skill installs from the repo, and every error message ends with a link to the page that explains it.
    link: /agents
  - icon: 📦
    title: Zero runtime deps
    details: An in-tree arg serializer and opt-in subpaths keep rxjs and Angular out of your runtime bundle. 100% test coverage, verified on Node 22/24/26 and Bun 1.4.
    link: /core/installation
---
