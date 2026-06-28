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
});
```

Passing an array **restricts** spying to the listed methods (matching `jest-auto-spies`), rather
than augmenting the auto-discovered set.

The `ClassSpyConfiguration` keys are `methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`
and `settersToSpyOn`.

<!-- TODO: expand — document the Spy<T> shape, accessorSpies, createFunctionSpy, and edge cases (inherited methods, abstract classes). -->
