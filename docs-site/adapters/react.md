---
title: React
description: Spy the classes a React app owns — services, stores, API clients — and hand the spy to a Context provider or a hook.
---

# React

React has no DI container, so `vitest-auto-spy/react` ships **no** `provide*` helper — it is a
*recipe*: spy the **classes** you own (services, stores, API clients, the deps you inject into
hooks or hand to a Context provider), not the components themselves.

```ts
import { createSpyFromClass, type Spy } from 'vitest-auto-spy/react';
```

The spy is a plain object of mocks, so you pass it straight into a `<Context.Provider value={spy}>`
or a hook's dependency argument, then drive return values with `calledWith` / `resolveWith` /
`mockReturnValue` and assert against `spy.method.mock.calls`.

Importing this entry registers the default Vitest mock adapter and re-exports the same public API
as the core. It pulls in `vitest` only — never `react` or `@testing-library/react`, which stay your
own dev dependencies.

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

import { UserApi } from './user-api';
import { useUser } from './use-user';

it('exposes the loaded user', async () => {
  const api = createSpyFromClass(UserApi);

  api.fetchUser.calledWith(1).resolveWith({ id: 1, name: 'Ada' });

  const { result } = renderHook(() => useUser(1, api));

  await waitFor(() => expect(result.current.user?.name).toBe('Ada'));
  expect(api.fetchUser).toHaveBeenCalledTimes(1);
});
```

::: tip What not to spy
Spy the classes you own, not components or hooks. A spied component tells you nothing about
rendering, and a spied hook makes the test assert its own mock. Keep the boundary at the
service/store/API-client seam.
:::
