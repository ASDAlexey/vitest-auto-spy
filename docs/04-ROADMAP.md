# Growth roadmap — more users & GitHub stars (task 6)

> Goal: maximize adoption and stars in **future** versions. Strategy in one line:
> stop being "the Angular/rxjs auto-spy for Vitest" and become **"the framework-agnostic
> auto-spy for Vitest / Bun / Node — with Angular as one first-class adapter."**

## The core growth blocker

Today, importing the package pulls in the Angular code path (`auto-spy.ts` statically
re-exports `./lib/angular`, which imports `@angular/core/testing`), and rxjs is a hard runtime
dependency of the core. A plain Node / Bun / React / Vue / Nest user who just wants auto-spies
can't adopt it cleanly. That audience is **10–50× larger** than the "Vitest + Angular + rxjs"
intersection. **Decoupling (see `docs/02`) is the #1 lever; everything else compounds off it.**

## 1. Framework-agnostic core — #1 lever
The good idea — *"read a class, get a fully-typed spy of every method with return-type-aware
helpers"* — is 100% framework-independent. Only the rxjs return-type branch and the Angular
`TestBed` glue are specific. Split into subpath exports (`.` core / `/rxjs` / `/angular`), make
`rxjs` + `@angular/core` optional peers, ship a thin compat barrel for one major, bump to
**2.0.0**. Effort: medium. Impact: highest (gates everything below).

## 2. Bun & Node test runners (the user's explicit interest, future versions)
- **`bun test` — feasibility High, positioning strong.** Bun's runner is Jest/Vitest-compatible
  (`mock`, `spyOn` from `bun:test`). Our only runtime seam is "give me a mock function." Abstract
  the single `vi.fn()` call behind a `MockAdapter` and ship `vitest-auto-spy/bun`. There is **no
  established auto-spy-from-class library for `bun test`** — early + good = own the keyword and
  ride Bun's growth. Effort: small–medium once the adapter seam exists.
- **`node:test` — feasibility Medium, credibility/SEO play.** `node:test` has `mock.fn()` with a
  different shape, so the adapter needs more glue. Lower raw adoption, high "truly
  runtime-agnostic" signal. Effort: medium.
- Sequencing: the decouple (item 1) **and** the `MockAdapter` seam are the same refactor — pull
  the two hard deps (`vi.fn`, `rxjs`) behind interfaces together.

## 3. Framework adapters (thin, ~50 LOC + a recipe each)
| Adapter | Effort | Impact | Why |
|---|---|---|---|
| **NestJS** (`/nestjs`) | Small | **High** | Nest = class DI + `{ provide, useValue }`, nearly identical to the Angular helper; huge on Vitest. Do this first. |
| **React Testing Library** | Medium | Medium-High | Position as "spy your service/store classes & injected deps," not components. Biggest Vitest audience. |
| **Vue / Pinia** | Medium | Medium | Pinia store spying is the killer recipe. |
| **Svelte** | Small-Med | Low-Med | Cheap once core is generic; "we support everything" optics. |

If an adapter needs real engine work, the core abstraction is wrong — adapters are recipes +
types + a tiny `provide*` helper.

## 4. DX & marketing (cheap, outsized star impact)
- **npm keywords overhaul** — currently lead with `angular`. After decoupling, lead with
  `auto-mock`, `class-mock`, `typed-mock`, `bun`, `bun-test`, `node-test`, `nestjs`, `react`,
  `vue`, `vitest-mock`, `sinon-alternative`. (Free, real npm-search impact.)
- **Comparison table** in README + docs (the single most shared/screenshotted artifact — §6).
- **Non-Angular hero example first.** Lead the README with a plain-TS service + Vitest snippet;
  demote Angular to a section. The current first impression silently filters out most of the market.
- **Badges:** add a runtime-support row (Vitest ✓ / Bun ✓ / node:test ✓) and a "0 runtime deps"
  core badge (decoupling makes this true and impressive).
- **StackBlitz/CodeSandbox live demos** per runtime — one-click "try it" converts browsers.
- **Docs site** (VitePress or Astro Starlight): Core → Runtimes → Adapters → Migrating from
  jest-auto-spies → API → Comparison. Big Google-discoverability win over a single README.
- **Launch content + Awesome-list PRs** (Awesome Vitest / Bun / Nest) — a top star source.

## 5. Quick wins vs long-term
**Quick (days, no architecture change):** README hero rewrite, npm keywords, comparison table,
Awesome-list PRs, StackBlitz link — ship this week, immediate discoverability lift.
**Mid-term (the 2.0 inflection):** decouple + `MockAdapter` seam + Bun adapter + Nest adapter +
docs site — launch as one "vitest-auto-spy is now framework-agnostic" narrative worth a
HN/Reddit/newsletter push.
**Long-term:** node:test adapter; React/Vue/Svelte adapters; auto-mock by *type/interface*
(Proxy-based, matching `vitest-mock-extended`'s headline) — high impact, TS-only, riskier.

## 6. Competitor analysis & the unique niche
| Library | Reads a class? | Return-type-aware helpers (Promise/Observable)? | Runtime | We win on |
|---|---|---|---|---|
| **jest-auto-spies** | ✅ | ✅ | Jest only | We're the Vitest/Bun/Node successor with the same API — direct migration path. |
| **vitest-mock-extended** | ❌ (interface/Proxy) | ❌ | Vitest | Return-type ergonomics + reading a real class. Complementary. |
| **@golevelup/ts-vitest** | partial (object) | ❌ | Vitest | Typed Promise/Observable helpers + explicit class→spy + `mustBeCalledWith`. |
| **sinon** | ❌ (manual) | ❌ | Any | Auto-generated + fully typed vs manual + loosely typed. |

**One-sentence pitch:** *the only auto-spy library that reads a **class** and gives a
**fully-typed** spy of every method with **return-type-aware** control helpers (`resolveWith` /
`nextWith` / `calledWith`) — across any Vitest-compatible runtime (Vitest, Bun, node:test) and
framework (Angular, Nest, React, Vue).* No competitor combines all three. Decoupling is what
makes "runtime/framework-agnostic" true rather than aspirational — which is why it's #1.

**Bottom line:** only two concrete couplings (`vi.fn`, `rxjs`) plus one static Angular re-export
stand between today's niche tool and a runtime-agnostic library with a 10–50× larger audience.
