# createSpyFromClass

`createSpyFromClass(Class, methodsOrConfig?)` builds a fully-typed `Spy<T>` from a class, turning
every method into a mock with return-type-aware helpers.

## Configuration

```ts
// 1. all methods (default)
createSpyFromClass(MyService);

// 2. only these methods
createSpyFromClass(MyService, ['getName', 'getAge']);

// 3. full config object
createSpyFromClass(MyService, {
  methodsToSpyOn: ['getName'],
  observablePropsToSpyOn: ['products$'], // Observable *properties*
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  autoSpyAccessors: true, // auto-discover every getter/setter on the prototype chain
  lazySpies: true, // build each method spy on first access (see below)
});
```

Passing an array **restricts** spying to the listed methods (matching `jest-auto-spies`), rather
than augmenting the auto-discovered set.

The `ClassSpyConfiguration` keys are `methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`,
`settersToSpyOn`, `autoSpyAccessors` and `lazySpies`.

## Lazy spies — `lazySpies`

**What it is.** By default `createSpyFromClass` builds a spy for **every** method up front (eager).
With `lazySpies: true`, each method spy is instead created on **first access** (`spy.method`) and
then cached, so methods a test never touches never pay the spy-construction cost.

**Why it matters.** Building a spy is not free: each method gets a host-runner mock plus the
`calledWith` / `resolveWith` / `nextWith` helper surface. On a wide service where a test calls only
a couple of methods, eagerly building all of them is mostly wasted work.

```ts
const spy = createSpyFromClass(WideService, { lazySpies: true });
spy.getName.mockReturnValue('Ada'); // getName is built here, on first access
// the other 18 methods are never built — nothing to construct, nothing to reset
```

**When to use it.** Reach for `lazySpies` when spying **wide services** (many methods) where each
test exercises only a few — the typical unit-test shape. For small classes the difference is
negligible, so the eager default is fine.

::: tip Angular defaults to this
The `vitest-auto-spy/angular` `provideAutoSpy` helper already sets `lazySpies: true` by default —
Angular tests overwhelmingly match this pattern. Pass `{ lazySpies: false }` there to opt back into
eager spies. See [Adapters → Angular](/adapters/angular#lazy-spies-by-default).
:::

**Behaviour is identical either way.** `Object.keys`, `vi.isMockFunction`, `calledWith`,
`resetAutoSpy` / `clearAutoSpy` and enumeration all work the same; lazy only changes *when* each spy
is constructed, not what it does. The one nuance: a lazy method is an accessor until first touched,
so a never-accessed spy has no recorded calls (which is exactly why `resetAutoSpy` can skip it).

<!-- TODO: expand — document the Spy<T> shape, accessorSpies, createFunctionSpy, and edge cases (inherited methods, abstract classes). -->
