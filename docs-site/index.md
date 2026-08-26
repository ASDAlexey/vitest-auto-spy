---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'vitest-auto-spy'
  text: 'Typed auto-spies from a class'
  tagline: A drop-in, fully-typed jest-auto-spies successor — runtime-agnostic across Vitest, Bun and node:test.
  actions:
    - theme: brand
      text: Get started
      link: /core/introduction
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
    title: Reads a real class
    details: createSpyFromClass reads your class and spies every method — or mock straight from a type with createAutoMock and recursive mockDeep, no class required.
    link: /core/auto-mock-by-type
  - icon: 🔀
    title: Multi-runtime
    details: One identical public API behind a MockAdapter seam — run the same core on Vitest, Bun (bun:test) or node:test.
    link: /runtimes/vitest
  - icon: ⚡
    title: Faster Angular specs
    details: renderShallow collapses the shallow-TestBed copy-paste into one call (1.7× on real component specs), createWithAutoSpies builds a class through DI with every unprovided token spied, and per-file diagnostics say which specs are worth converting.
    link: /adapters/angular
  - icon: 📡
    title: Observables that fail on silence
    details: expectEmission / expectEmissions / expectNoEmission replace the expect() inside a subscribe callback that never runs — the assertion is the await. Duck-typed, so no rxjs is pulled in.
    link: /core/observable-assertions
  - icon: 📏
    title: Lint rules and hygiene
    details: Five ESLint rules steer a suite onto these helpers, each linking to its recipe, and setupAutoSpy() wires property restore, duplicate-copy detection and mock-registry hygiene in one line.
    link: /utilities/eslint-plugin
  - icon: 📦
    title: Zero runtime deps
    details: An in-tree arg serializer and opt-in subpaths keep rxjs and Angular out of your runtime bundle. 100% test coverage.
    link: /core/installation
---
