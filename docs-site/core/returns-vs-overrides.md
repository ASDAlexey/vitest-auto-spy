---
title: returns vs overrides
description: Two options that set a spy's values when you create it; returns sets what a method answers, overrides replaces a member with a plain value.
---

# `returns` vs `overrides`

Both options set values on the spy at the moment you create it, so the test does not need a
`beforeEach` full of `mockReturnValue`. Use `returns` for a method: it stays a spy. Use `overrides`
for anything else (a signal, a stream, a field): the member becomes exactly the value you pass.

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [LayoutComponent],
    providers: [
      provideAutoSpy(LayoutService, {
        returns: { load: of([]) }, // load() is still a spy and answers of([])
        overrides: { isCompact: signal(true) }, // isCompact is this signal, not a spy
      }),
    ],
  });
});

it('loads the layout once', () => {
  TestBed.createComponent(LayoutComponent).detectChanges();
  expect(injectSpy(LayoutService).load).toHaveBeenCalledOnce();
});
```

Every factory takes both options: `createSpyFromClass`, `provideAutoSpy`, `provideAutoSpyForToken` and
`createAutoMock`. Both configure the same spy: each key sets one of its members.

## Side by side

|                                                | `returns`                                                            | `overrides`                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Takes                                          | a method name                                                        | any member: a field, a signal, an `Observable` property, a config object |
| The value is                                   | what the method answers                                              | the member itself                                                        |
| Afterwards                                     | still a spy; `toHaveBeenCalled` works                                | the value as written, not a spy                                          |
| Same as writing                                | `spy.m.mockReturnValue(x)` in a `beforeEach`                         | `spy.p = x` in a `beforeEach`                                            |
| Configured later                               | a later `calledWith`, `mockReturnValue` or `resolveWith` replaces it | nothing to configure; assign a new value                                 |
| Under `strict` (an unconfigured method throws) | the method is configured, even when the value is `undefined`         | the method is configured when you pass a function for it                 |
| A key that is not a method                     | a warning when the spy is created: the value would never be returned | expected: this is what `overrides` is for                                |

`strict` is the option that makes a spy method throw when the test calls it without configuring it
first. See [Strict mode](./strict-mode).

## Which one

A method goes in `returns`. Everything else goes in `overrides`.
When the method returns an object of another class that the test configures too, name the class in
[`returnsClass`](./create-spy-from-class#returns-class) instead of building that spy yourself.
Read that spy with `innerDouble(double, 'method')`: it does not call the method, so a test that
counts the method's calls can use `returnsClass` too.

```ts
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

// a method: you can still assert on it
provideAutoSpy(CartService, { returns: { total: 0, load: of([]) } });
expect(injectSpy(CartService).load).toHaveBeenCalledOnce();

// state: a signal, a stream, a field
provideAutoSpy(LayoutService, { overrides: { isCompact: signal(true), resize$: new Subject<void>() } });
```

**Common mistake:** `returns: { m: undefined }` without `strict`. An unconfigured method already
answers `undefined`, so without `strict` the line changes nothing. With `strict` it matters: it keeps
the call `m()` from throwing.

## A function in `overrides`

Put a method in `overrides` when its answer depends on its arguments. On `createSpyFromClass` and
`provideAutoSpy` the function you pass [stays a spy](./create-spy-from-class#overrides-function). It
runs as the method's implementation, and the calls are still recorded:

```ts
import { DomSanitizer } from '@angular/platform-browser';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_context, value) => String(value) } });
expect(injectSpy(DomSanitizer).sanitize).toHaveBeenCalledOnce();
```

That holds for `createSpyFromClass` and `provideAutoSpy`. `createAutoMock` and
`provideAutoSpyForToken` work differently: they build the spy from a TypeScript type, not a class. At
runtime there is no class to look at, so they cannot tell a method from a property. There a plain
function is stored as written and is not a spy. A `vi.fn()` is kept as it
is on every factory.

## A member named in both

`overrides` wins. `returns` skips that member, whatever the `overrides` value is: a plain value, a
function or a `vi.fn()`.

The same rule holds between a
[registered default](./create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class)
and the call that creates the spy: the value at the call replaces a registered `returns` or
`selfReturning` (a list of methods that return the spy itself, for chained calls).
