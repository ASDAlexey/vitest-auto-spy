---
name: vitest-auto-spy
description: Write or fix tests that use vitest-auto-spy — typed spies generated from a class or a type on Vitest, bun:test and node:test. Use when a spec imports `vitest-auto-spy` (or a subpath such as `/angular`, `/bun`, `/bun-angular`, `/node`, `/rxjs`, `/nestjs`, `/vue`, `/react`, `/svelte`, `/console`, `/setup`, `/eslint-plugin`), when the user mentions createSpyFromClass, createAutoMock, createMock, mockDeep, provideAutoSpy, injectSpy, renderShallow, createWithAutoSpies, expectEmission, Spy<T>, calledWith, mustBeCalledWith, resolveWith or nextWith, when migrating a suite off jest-auto-spies, or when a test fails with "No mock adapter registered", "Observable spies require rxjs", "not found on the class prototype", or "Spy<T> is not assignable".
---

# vitest-auto-spy

Typed test spies generated from a class, a type, or nothing at all.

## Read this first

The authoritative reference is **`AGENTS.md`** — a complete cheat sheet with the configuration
surface, the error→fix table and the anti-pattern list. Read it before writing a spec:

```bash
cat node_modules/vitest-auto-spy/AGENTS.md   # in the consuming project
cat "${CLAUDE_PLUGIN_ROOT}/AGENTS.md"        # when this skill came from the plugin
```

If neither exists, fetch <https://asdalexey.github.io/vitest-auto-spy/llms-full.txt>.

The **types are the authority** when any doc and the code disagree — check
`node_modules/vitest-auto-spy/dist/index.d.ts` (one `.d.ts` per subpath).

## Before writing anything

1. **Identify the runner.** `package.json` scripts plus the config file: Vitest, `bun test`, or
   `node --test`. The import path depends on it — `vitest-auto-spy` / `…/bun` / `…/node` — and the
   wrong one leaves the wrong mock adapter registered.
2. **Check the setup file** for `import 'vitest-auto-spy/rxjs'` and `setupAutoSpy()`. Observable
   helpers (`nextWith`, `observablePropsToSpyOn`) throw without the rxjs import.
3. **Follow the suite's existing conventions** — globals vs. explicit `import { describe } from
   'vitest'`, file layout, naming. Match the neighbouring spec.

## The decision that matters

```
Angular / NestJS / Vue?         → provideAutoSpy(Class) in the providers, injectSpy(Class) to read
Real class, constructed by you? → createSpyFromClass(Class, config?)   → Spy<T>
Type only, and it gets CALLED?  → createAutoMock<T>(overrides?)        → Spy<T>
…and calls chain (a.b.c())?     → mockDeep<T>(overrides?)
Type only, and it is only READ? → createMock<T>(partial?)              → plain T, no spies
A single function?              → createFunctionSpy<Fn>('name')
Code does `new Foo()`?          → createSpyClass(Foo)
```

In an Angular app the DI path dominates: across a ~370-file suite `provideAutoSpy` appears in 371
files and bare `createSpyFromClass` in 41. Write the DI shape unless the class is constructed by
hand.

## Skeleton — Angular

```ts
describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideAutoSpy(NotificationService),
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current'] }), // signals/computed
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }), // Observable props
      ],
    });

    projects = injectSpy(ProjectStore);
    projects.save.mockReturnValue(of(true)); // seed defaults once
    service = TestBed.inject(TaskService);
  });
});
```

One `configureTestingModule` per `describe` — reconfiguring per `it()` recompiles the module every
test. Use `mockReadonlyProp(component, 'selected', signal(true))` for the signals of the class under
test, `await stable(fixture)` before asserting zoneless state, `renderShallow` for components.

## Skeleton — anything else

```ts
import { createSpyFromClass, type Spy } from 'vitest-auto-spy';

let users: Spy<UserService>;

beforeEach(() => {
  users = createSpyFromClass(UserService);
});

it('loads', async () => {
  users.load.calledWith(1).resolveWith({ id: 1 });

  await expect(subject.open(1)).resolves.toEqual({ id: 1 });
  expect(users.load).toHaveBeenCalledWith(1);
});
```

## Rules that prevent most of the mistakes

- Declare the variable as **`Spy<T>`, never as `T`** — `Spy<T>` is a mapped type and drops private
  members. Bridge with `asInstance()` / `asSpy()`, never with `as unknown as T`.
- **`methodsToSpyOn` is an exhaustive whitelist**, not an addition. Omitting it is usually right.
  For a callable that is an instance field (arrow property, `signal()`, ngrx `signalStore()`), use
  `instanceMethodsToSpyOn` — prototype discovery cannot see it.
- **Never `Object.defineProperty` in a spec.** Use `mockReadonlyProp` / `mockValueProp` /
  `mockAccessorsProp`, which `restoreMockedProps()` can undo (`vi.restoreAllMocks()` cannot).
- **Never `expect()` inside a `subscribe()` callback** — a silent stream makes it a green test that
  asserted nothing. Use `expectEmission` / `expectEmissions` / `expectNoEmission` and `await`.
- **Never assert a signal with `toBeTruthy()`** — every signal is truthy. Use
  `toHaveSignalValue(v)` after `registerSignalMatchers()`.
- **Never `vi.mock('@angular/core')`** (or any relative path) under the Angular unit-test builder —
  the specs are bundled, so it fails with `Cannot access '__vi_import_N__' before initialization`.
  To control an `effect()`, set the signals it reads and assert what it produced.
- **`injectSpy(X)` only reaches the global TestBed.** For a component-level provider use
  `asSpy(fixture.debugElement.injector.get(X))`.

## Finish

```bash
npx vitest run path/to/file.spec.ts   # or the project's own command
npx tsc --noEmit
```

Most of this library's guarantees are type-level, so a green run that does not type-check is not
done. Report failures with their output rather than describing them as passing.
