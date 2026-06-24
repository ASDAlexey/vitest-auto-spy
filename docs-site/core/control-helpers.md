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

## Promise-returning methods — `resolveWith`

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');

// per-call values, and conditional-by-args
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

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
