# Comparison

How `vitest-auto-spy` compares to other mocking / auto-spy libraries. The niche: the only auto-spy
library that reads a **class** and gives a **fully-typed** spy of every method with
**return-type-aware** control helpers — across any Vitest-compatible runtime and framework.

| Library                         | Reads a class? | Return-type-aware helpers? | Runtime     | We win on                                                                                                                                                                                                                 |
| ------------------------------- | -------------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **jest-auto-spies**             | ✅             | ✅                         | Jest only   | Vitest/Bun/Node successor, same API — direct migration path.                                                                                                                                                              |
| **@bugsplat/vitest-auto-spies** | ✅             | ✅                         | Vitest only | Same class-based API **plus** Bun & `node:test`, type-only `createAutoMock`, framework recipes, console spies, and **zero runtime deps** (it depends on `@hirez_io/auto-spies-core`; `rxjs < 8` cap — we support rxjs 8). |
| **vitest-mock-extended**        | ❌ (Proxy)     | ❌                         | Vitest      | Return-type ergonomics + reading a real class. Complementary.                                                                                                                                                             |
| **@golevelup/ts-vitest**        | partial        | ❌                         | Vitest      | Typed Promise/Observable helpers + explicit class→spy + `mustBeCalledWith`.                                                                                                                                               |
| **sinon**                       | ❌ (manual)    | ❌                         | Any         | Auto-generated + fully typed vs manual + loosely typed.                                                                                                                                                                   |

**Pitch:** the only auto-spy library that reads a **class** and gives a **fully-typed** spy of
every method with **return-type-aware** control helpers (`resolveWith` / `nextWith` /
`calledWith`) — across any Vitest-compatible runtime and framework.

## Beyond the class spy

The table above compares the part every one of these libraries does. What none of the others ship
alongside it:

- [`renderShallow`](/adapters/angular#shallow-component-rendering) and
  [`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies) — the
  shallow-`TestBed` copy-paste and DI-driven instantiation as one call each.
- [`stable` / `flushEffects`](/adapters/angular#zoneless-waiting) and `toHaveSignalValue` — zoneless
  waiting and a signal matcher, for a codebase where `detectChanges()` is no longer enough.
- [Observable assertions](/core/observable-assertions) that fail when the stream stays silent,
  duck-typed so they pull in no rxjs.
- [Five ESLint rules](/utilities/eslint-plugin) versioned together with the API they recommend, and
  [`setupAutoSpy()`](/utilities/setup) for the test-run hygiene a shared environment needs.
- [Per-file `TestBed` diagnostics](/adapters/angular#where-a-spec-spends-its-time) — which specs
  actually pay for `TestBed`, and by how much.

<!-- TODO: expand — link each row to the relevant library, and add a feature-by-feature breakdown (e.g. type-based auto-mock once it lands, to position vs vitest-mock-extended). -->
