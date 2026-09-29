---
title: returns vs overrides
description: Two ways to seed a double where it is built; returns says what a spied method answers, overrides replaces a member with a value that is no longer a spy.
---

# `returns` vs `overrides`

Every factory takes both: `createSpyFromClass`, `provideAutoSpy`, `provideAutoSpyForToken`,
`createAutoMock`. Both seed the double where it is built, and neither builds a second object — there is
one spy, and each key configures one of its members. The difference is whether that member **stays a
spy**.

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]), isFavorite: false }, // load() and isFavorite() are still spies
  overrides: { pointerActive: signal(false), items$: of([]) }, // replaced by these exact values
});
```

## Side by side

|                            | `returns`                                                            | `overrides`                                                              |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Names                      | a spied method                                                       | any member: a field, a signal, an `Observable` property, a config object |
| The value is               | what the method answers                                              | the member itself                                                        |
| Afterwards                 | still a spy — `toHaveBeenCalled` works                               | the value as written, not a spy                                          |
| Same as writing            | `spy.m.mockReturnValue(x)` in a `beforeEach`                         | `spy.p = x` in a `beforeEach`                                            |
| Configured later           | a default: `calledWith`, `mockReturnValue`, `resolveWith` replace it | nothing to configure — assign a new value                                |
| Under `strict`             | counts as configured, `undefined` included                           | a function seeded on a method counts as configured                       |
| A key that is not a method | reported, since its value would never be returned                    | what it is for                                                           |

## Which one

A method goes in `returns`, everything else goes in `overrides`.

```ts
// a method: stays assertable
provideAutoSpy(CartService, { returns: { total: 0, load: of([]) } });
expect(injectSpy(CartService).load).toHaveBeenCalledOnce();

// state: a signal, a stream, a field
provideAutoSpy(LayoutService, { overrides: { isCompact: signal(true), resize$: new Subject<void>() } });
```

`returns: { m: undefined }` matters only under `strict`, where it says out loud that `undefined` is the
answer meant. Without `strict` an unconfigured method already answers `undefined`, and the entry can
go.

## A function in `overrides`

A method whose answer depends on its arguments is the one case for `overrides` on a method. On
`createSpyFromClass` and `provideAutoSpy` a plain function seeded on a method
[stays a spy](./create-spy-from-class#overrides-function) and runs as its implementation, so the calls
are still recorded:

```ts
provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_context, value) => String(value) } });
expect(injectSpy(DomSanitizer).sanitize).toHaveBeenCalledOnce();
```

On `createAutoMock` and `provideAutoSpyForToken` a type does not say which members are methods, so a
function there is stored as written and is not a spy. A `vi.fn()` is kept as it is on every factory.

## A member named in both

The `overrides` seed wins, and `returns` skips that member rather than configuring it — whatever the
seed is: a value, a plain function, a `vi.fn()`. The same precedence holds between a
[registration](./create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class)
and a call site: the call site's seed replaces a registered `returns` or `selfReturning`.
