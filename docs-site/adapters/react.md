---
title: React
description: Spy the classes a React app owns (services, stores, API clients) and pass the spy to a Context provider or a hook; mock a custom hook with a typed return value.
---

# React

`vitest-auto-spy/react` turns a class you own (a service, a store, an API client) into a typed spy.
A spy is a stand-in object: every method records its calls and returns what you set. You pass it
wherever the component gets the real object, most often a Context provider.

`vitest-auto-spy/react` is an entry: the import path you use in React specs. It exports
`createSpyFromClass`, `createAutoMock`, `autoMocked`, the `Spy<T>` type, `asInstance`, `resetAutoSpy`
and the module-mock helpers used below. The full list is in the [API reference](/api).

## Through a Context provider

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/react';

import { Cart, CartContext } from './cart';
import { CartStore, type Order } from './cart-store';

describe('<Cart />', () => {
  let cart: Spy<CartStore>;

  beforeEach(() => {
    cart = createSpyFromClass(CartStore);
  });

  it('renders the total the store reports', () => {
    cart.total.mockReturnValue(42); // total(): number

    render(
      <CartContext.Provider value={cart}>
        <Cart />
      </CartContext.Provider>,
    );

    expect(screen.getByText('$42')).toBeInTheDocument();
  });

  it('shows the order number after checkout', async () => {
    const order: Order = { id: 'ord_42', total: 42 };
    cart.checkout.resolveWith(order); // checkout(token): Promise<Order>

    render(
      <CartContext.Provider value={cart}>
        <Cart paymentToken="tok_abc" />
      </CartContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Check out' }));

    expect(await screen.findByText('Order ord_42 placed')).toBeInTheDocument();
    expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
  });
});
```

How to set an answer on a spy method:

- `mockReturnValue(value)` for a method that returns a plain value.
- `resolveWith(value)` for a method that returns a `Promise`. The value must match the promise type
  (`Order` here). For a partial object, cast it: `resolveWith({ id: 'ord_42' } as Order)`.
- `calledWith(args)` before either one limits the answer to calls with those arguments.

The answer of `resolveWith` arrives asynchronously, so wait for the result with `findByText`, not
`getByText`. `toBeInTheDocument` comes from `@testing-library/jest-dom`: add
`import '@testing-library/jest-dom/vitest'` to your Vitest setup file.

**Common mistake:** you need `asInstance` only when the class has `#private` or `private` members.
TypeScript then reports a type error on `value={cart}`, because the spy type drops those members.
Pass `asInstance(cart)` instead of an `as` cast:

```tsx
import { asInstance } from 'vitest-auto-spy/react';

<CartContext.Provider value={asInstance(cart)}>
  <Cart />
</CartContext.Provider>;
```

More in [Spy typing](/core/spy-typing).

React has no dependency injection container, so there is nothing like Angular's `provideAutoSpy`
here: you put the spy into the provider yourself, as above. `react` and `@testing-library/react`
stay your own dev dependencies, in any version.

::: tip Which runner
On Vitest you need nothing else. If your setup file already imports another runner entry, such as
`vitest-auto-spy/bun`, that runner keeps building the spies. This entry imports `vitest`, so it does
not load under `bun test` or `node --test`: there, import the same functions from
`vitest-auto-spy/bun` or `vitest-auto-spy/node`.
:::

## As a hook dependency

If a hook takes its dependency as an argument, pass the spy directly. No wrapper is needed:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createSpyFromClass } from 'vitest-auto-spy/react';

import { useUser } from './use-user';
import { UserApi } from './user-api';

it('exposes the loaded user', async () => {
  const api = createSpyFromClass(UserApi);

  api.fetchUser.calledWith(1).resolveWith({ id: 1, name: 'Ada' });

  const { result } = renderHook(() => useUser(1, api));

  await waitFor(() => expect(result.current.user?.name).toBe('Ada'));
  expect(api.fetchUser).toHaveBeenCalledTimes(1);
});
```

## Mocking a custom hook

Prefer the two options above. Sometimes a component calls a hook directly, for example `useMovies()`
from a hooks module, and nothing is passed in. Then you replace the module with `vi.mock`. The hard
part is the hook's return value: written by hand, it is a big object rebuilt in every test and
checked against no type. `autoMocked` builds it from the type.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertMocked, autoMocked, moduleNamespace } from 'vitest-auto-spy/react';

import * as hooks from './hooks';
import { MovieSearch } from './movie-search';

vi.mock('./hooks', () => moduleNamespace({ useMovies: vi.fn(), useFetch: vi.fn() }));

beforeEach(() => {
  assertMocked(hooks, { specifier: './hooks', exports: ['useMovies', 'useFetch'] });
});

describe('<MovieSearch />', () => {
  it('renders what the hook filtered', () => {
    const movies = autoMocked<hooks.UseMoviesResult>({
      searchTerm: 'star',
      filteredItems: [{ id: 1, title: 'Star Wars' }],
    });

    vi.mocked(hooks.useMovies).mockReturnValue(movies);

    render(<MovieSearch movies={[]} />);

    expect(screen.getByRole('listitem').textContent).toBe('Star Wars');
  });

  it('hands every keystroke to the setter', async () => {
    const movies = autoMocked<hooks.UseMoviesResult>({ searchTerm: '', filteredItems: [] });

    vi.mocked(hooks.useMovies).mockReturnValue(movies);

    render(<MovieSearch movies={[]} />);
    await userEvent.type(screen.getByLabelText('Search'), 'x');

    expect(movies.setSearchTerm).toHaveBeenCalledWith('x');
  });
});
```

What each piece does:

- **[`autoMocked<UseMoviesResult>(values)`](/core/auto-mock-by-type)** builds the return value from
  its type. The fields you pass are plain values. Every other member (`setSearchTerm`, `reload`) is
  a spy, created when first read. The values are type-checked, so a field the hook renamed is a
  compile error. The result is typed both as `UseMoviesResult` and as its spy, so the same object
  goes into `mockReturnValue` and into `expect`. If you only need the spy type, use
  `createAutoMock<T>()`.
- **[`moduleNamespace`](/utilities/module-mocks#modulenamespace-exports-options)** adds the `default`
  and `__esModule` keys to the factory result. Without them, a hooks module read through a CommonJS
  compatibility layer fails with `No "default" export is defined on the mock`.
- **[`assertMocked`](/utilities/module-mocks#assertmocked-namespace-options)** fails on this line if
  the mock did not apply. That happens when a bundler has already inlined the module; the component
  would then call the real hook. `exports` lists the hooks this file drives.

The hook itself stays a plain `vi.fn()`. `vi.mocked` types it as the real hook, so `mockReturnValue`
accepts only a `UseMoviesResult`.

Two variations:

- **Keep the real hooks and replace one.** With
  `vi.mock('./hooks', async (importOriginal) => moduleNamespace(await importOriginal(), { passthrough: true }))`
  every exported function becomes a spy that runs the real hook until you configure it.
- **Give a factory's `vi.fn()` `calledWith` and `resolveWith`.**
  [`adoptMock(hooks.useMovies)`](/utilities/module-mocks#adoptmock-mock-options) adds them in place.

Both are described on the [module mocks page](/utilities/module-mocks).

### A hook that returns a tuple

A `useState`-style hook returns a tuple such as `[value, loading, error]`. That tuple is data, so
write it by hand. The hook's return type checks every position:

```tsx
// same file as above
import { UserCard } from './user-card';

it('shows the loading state', () => {
  vi.mocked(hooks.useFetch).mockReturnValue([undefined, true, null]);

  render(<UserCard id={1} />);

  expect(screen.getByText('Loading…')).toBeTruthy();
});

it('shows the error the hook reported', () => {
  vi.mocked(hooks.useFetch).mockReturnValue([undefined, false, new Error('Not found')]);

  render(<UserCard id={1} />);

  expect(screen.getByRole('alert').textContent).toBe('Not found');
});

it('goes from loading to loaded across renders', () => {
  vi.mocked(hooks.useFetch)
    .mockReturnValueOnce([undefined, true, null])
    .mockReturnValue([{ name: 'Ada' }, false, null]);

  const { rerender } = render(<UserCard id={1} />);
  expect(screen.getByText('Loading…')).toBeTruthy();

  rerender(<UserCard id={1} />);
  expect(screen.getByRole('heading').textContent).toBe('Ada');
  expect(hooks.useFetch).toHaveBeenCalledWith('/api/users/1');
});
```

**Common mistake:** `createAutoMock<[T, boolean]>()` for a tuple. The destructuring line
`const [data, loading] = hook()` throws `TypeError: … is not iterable`, because an auto-mock is not
iterable. `mockDeep` fails the same way. Use auto-mocks for objects that hold functions, not for
tuples.

### The value that leaks into the next test

A `vi.fn()` created in a `vi.mock` factory lives for the whole file. A `mockReturnValue` set in one
test still answers in the next one. The symptom: a test passes alone and fails when the whole file
runs.

With `clearMocks: true` (the default since Vitest 5), any Vitest clears recorded calls before every
test, but clearing keeps the configured return value. Fix it one of two ways:

- set `mockReset: true` in the Vitest config, or
- configure the hook in every test that renders, as the examples above do.

Values from `autoMocked` or `createAutoMock` created inside a test are new objects each time, so
they do not leak. For a spy created once per file, see [`setupAutoSpy()`](/utilities/setup) and
[`resetAutoSpy`](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

::: tip What not to spy
Spy the classes you own. Mock a hook only when it is the component's dependency. A spied component
tells you nothing about rendering. A hook test that mocks the hook only tests its own mock: test the
hook with `renderHook` and a spied dependency, as in [As a hook dependency](#as-a-hook-dependency).
:::
