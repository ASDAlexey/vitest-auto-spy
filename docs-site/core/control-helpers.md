# Control helpers

Each spied method gets helpers chosen by its return type. `calledWith` / `mustBeCalledWith`
dispatch by argument, and the type-specific helpers configure the result.

## Synchronous methods

```ts
// standard vi.fn() API works as-is
myService.getName.mockReturnValue('Fake Name');

// return a value only for specific arguments
myService.getName.calledWith(1).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBeUndefined();

// throw if called with the "wrong" arguments
myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
expect(() => myService.getName(2)).toThrow();
```

### Asymmetric matchers in `calledWith`

`calledWith` / `mustBeCalledWith` accept the same asymmetric matchers as `expect`
(`expect.any`, `expect.objectContaining`, `expect.stringMatching`, …). A config that
contains at least one matcher is stored as a predicate and matched against the actual
arguments at call time, instead of by exact serialization.

```ts
myService.getName.calledWith(expect.any(Number)).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBe('Fake Name');

myService.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
expect(myService.save({ id: 1, name: 'x' })).toBe(true);
```

## Promise-returning methods — `resolveWith`

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');

// per-call values, and conditional-by-args
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

### Inspecting promise outcomes — `mock.settledResults` {#settled-results}

Every spied method exposes `mock.settledResults`: one index-aligned entry per call,
recording how that call's returned promise eventually settled. Vitest tracks this
natively; on Bun (`bun:test`) and `node:test` it is provided by a built-in polyfill,
so the surface is identical across all three runtimes.

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await myService.getProducts();
expect(myService.getProducts.mock.settledResults).toEqual([{ type: 'fulfilled', value: [{ name: 'Product 1' }] }]);

myService.getProducts.rejectWith('FAKE ERROR');
await myService.getProducts().catch(() => undefined);
expect(myService.getProducts.mock.settledResults).toContainEqual({ type: 'rejected', value: 'FAKE ERROR' });
```

Each entry is `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`. A call whose
promise is still pending is recorded as `incomplete` until it settles.

## Resetting spies — `clearAutoSpy` / `resetAutoSpy`

Reset every spy inside an assembled spy with one call, instead of reaching for
`mockClear` / `mockReset` on each method by hand. Both work on `createSpyFromClass`
spies and `createAutoMock` proxies, and cover method spies **and** accessor spies.

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

// clears recorded calls only — configured returns are kept
clearAutoSpy(myService);

// clears calls AND reverts configuration to pristine
resetAutoSpy(myService);
```

`resetAutoSpy` reverts both the library config (`calledWith` / `resolveWith` / `nextWith` / …) **and**
a bare return value set directly on a spy (`myService.getName.mockReturnValue('x')`) — after a reset
the method returns `undefined` again until reconfigured.

## Observable methods & properties — `nextWith`

Enabled by importing the rxjs layer once (`import 'vitest-auto-spy/rxjs';`). See
[Runtimes → RxJS](/runtimes/rxjs).

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stream stays open
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]);  // emit once, then complete
myService.getProducts$.throwWith('FAKE ERROR');           // error the stream
myService.getProducts$.complete();                        // complete the stream
```

<!-- TODO: expand — full nextWithValues / nextWithPerCall / returnSubject reference and a ValueConfig table. -->
