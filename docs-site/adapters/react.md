---
title: React
description: Spy the classes a React app owns — services, stores, API clients — and hand the spy to a Context provider or a hook.
---

# React

React has no DI container, so `vitest-auto-spy/react` ships **no** `provide*` helper — it is a
_recipe_: spy the **classes** you own (services, stores, API clients, the deps you inject into
hooks or hand to a Context provider), not the components themselves.

```ts
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/react';
```

The spy is a plain object of mocks, so you pass it straight into a `<Context.Provider value={spy}>`
or a hook's dependency argument, then drive return values with `calledWith` / `resolveWith` /
`mockReturnValue` and assert against `spy.method.mock.calls`.

Importing this entry registers the default Vitest mock adapter — only when nothing else has, so it
cannot replace one a runtime entry installed first — and re-exports the same public API as the core.
It pulls in `vitest` only, never `react` or `@testing-library/react`, which stay your own dev
dependencies. That `vitest` import is also why the entry does not load under `bun test` or
`node --test`: on those runners import the core through their own runtime entry instead.

## Through a Context provider

The spy is a plain object of mocks, so it goes straight into a provider's `value`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/react';

import { Cart, CartContext } from './cart';
import { CartStore } from './cart-store';

describe('<Cart />', () => {
  let cart: Spy<CartStore>;

  beforeEach(() => {
    cart = createSpyFromClass(CartStore);
  });

  it('renders the total the store reports', () => {
    cart.total.mockReturnValue(42);

    render(
      <CartContext.Provider value={cart}>
        <Cart />
      </CartContext.Provider>,
    );

    expect(screen.getByText('$42')).toBeInTheDocument();
  });

  it('checks out with the items on screen', async () => {
    cart.checkout.resolveWith({ orderId: 'ord_42' });

    render(
      <CartContext.Provider value={cart}>
        <Cart />
      </CartContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Check out' }));

    expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
  });
});
```

`Spy<CartStore>` is a mapped type and drops `#private` members, so it is not assignable to
`CartStore`. If the context is typed as the class, bridge it with
[`asInstance(cart)`](/core/spy-typing) rather than an `as`.

## As a hook dependency

A hook that takes its collaborator as an argument is the easiest thing in a React codebase to test,
and the spy needs no wrapper at all:

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

The seam above is the one to prefer. When a component calls a hook directly — `useMovies()` from a
module of hooks, with nothing passed in — the hook is its collaborator, and the spec replaces the
module. What a hand-written mock gets wrong is the return value: the whole object, rebuilt in every
test, typed against nothing.

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

Three pieces, each doing one job:

- **[`autoMocked<UseMoviesResult>(seed)`](/core/auto-mock-by-type)** builds the hook's return value
  from its type. The seeded fields are plain values; every member the spec did not seed —
  `setSearchTerm`, `reload` — is a spy with the helpers its return type earns, created on first
  read. The seed is checked against the type, so a field the hook renamed is a compile error. It is
  typed as both `UseMoviesResult` and its spy, which is what lets one object go into
  `mockReturnValue` and come back out in the assertion. When the result only ever travels as a spy,
  `createAutoMock<T>()` is the narrower type.
- **[`moduleNamespace`](/utilities/module-mocks#modulenamespace-exports-options)** gives the factory's
  result the `default` and `__esModule` an interop probe looks for, so a hooks module consumed through
  a CommonJS-compatible layer does not fail with `No "default" export is defined on the mock`.
- **[`assertMocked`](/utilities/module-mocks#assertmocked-namespace-options)** fails at the spec's
  own line when the mock did not apply — under a bundler that has already inlined the module, the
  component would otherwise call the real hook and the test would pass or fail for an unrelated
  reason. Naming `exports` makes it check the hooks the file actually drives.

The hook itself stays a `vi.fn()`: it is a function the module exports, not a method of a class, and
`vi.mocked` types it as the real hook, so `mockReturnValue` only accepts a `UseMoviesResult`.

Two variations, when the plain `vi.fn()` is not enough. To keep the real hooks and replace one,
`vi.mock('./hooks', async (importOriginal) => moduleNamespace(await importOriginal(), { passthrough: true }))`
turns every exported function into a spy that runs the real hook until the spec configures it. To
give a factory's `vi.fn()` `calledWith` and `resolveWith`, [`adoptMock(hooks.useMovies)`](/utilities/module-mocks#adoptmock-mock-options)
takes it over in place. Both are on the [module-mocks page](/utilities/module-mocks).

### A hook that returns a tuple

A `useState`-shaped hook returns `[value, loading, error]`, and that tuple is data. Write it — the
hook's own return type checks every position:

```tsx
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

Do not reach for an auto-mock here. `const [data, loading] = hook()` destructures through
`Symbol.iterator`, and a Proxy-backed double is not iterable — `createAutoMock<[T, boolean]>()`
throws a `TypeError: … is not iterable` at the destructuring line, and so does `mockDeep`. A
`mockDeep` member turns into an array only once it is read by index, and holds only the indices read,
so it is no tuple either. An auto-mock is for the object a hook returns, where the callables are; a
tuple is three values.

### The value that leaks into the next test

A `vi.fn()` created in a `vi.mock` factory lives for the whole file, so a `mockReturnValue` set in one
test is still answering in the next — the classic "the last mocked value of `useSearch` is still
active" bug, which surfaces as a test that passes alone and fails in the file. Vitest 5 clears calls
before every test by default (`clearMocks: true`); clearing does not reset an implementation.
Either set `mockReset: true` in the Vitest config, or configure the hook in every test that renders,
as the examples above do.

The return values built with `autoMocked` / `createAutoMock` inside a test have no such problem: they
are new objects each time. For the doubles that do outlive a test — a spy built once for the file —
[`setupAutoSpy()`](/utilities/setup) and [`resetAutoSpy`](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy)
are the reset story.

::: tip What not to spy
Spy the classes you own, and mock a hook only where it is the component's collaborator. A spied
component tells you nothing about rendering, and a test of a hook that mocks the hook asserts its own
mock — test the hook itself with `renderHook` and a spied dependency, as in the section above.
:::
