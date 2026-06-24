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
    details: Every method becomes a typed mock, with return-type-aware helpers — sync, Promise and Observable each get the right API.
  - icon: 🧪
    title: Reads a real class
    details: createSpyFromClass reads your class and generates a spy for every method, so you never hand-maintain a mock object again.
  - icon: 🔀
    title: Multi-runtime
    details: One identical public API behind a MockAdapter seam — run the same core on Vitest, Bun (bun:test) or node:test.
  - icon: 📦
    title: Zero runtime deps
    details: An in-tree arg serializer and opt-in subpaths keep rxjs and Angular out of your runtime bundle. 100% test coverage.
---
