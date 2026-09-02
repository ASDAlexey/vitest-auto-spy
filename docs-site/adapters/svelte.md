---
title: Svelte
description: Spy class-based Svelte services and stores, and inject the spy through props, context or a mocked module.
---

# Svelte

Svelte has no class-based dependency injection, so `vitest-auto-spy/svelte` adds **no** helper of
its own — it is a recipe, not a framework integration. Svelte apps typically keep their logic in
plain class-based services or stores; `createSpyFromClass` spies that class, and you inject the spy
into the component under test (props, context, or a mocked module) exactly the way the component
receives the real one.

```ts
import { render } from '@testing-library/svelte';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';

import Cart from './Cart.svelte';
import { CartStore } from './cart-store';

const cartStore = createSpyFromClass(CartStore);
cartStore.total.mockReturnValue(42);

render(Cart, { props: { store: cartStore } });
```

Importing this entry registers the default Vitest mock adapter and re-exports the whole core, so a
Svelte suite needs a single import. It pulls in neither `svelte` nor `@testing-library/svelte`.

## Through context

When the component reads its collaborator from `getContext`, seed the same key with the spy:

```ts
import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';

import Cart from './Cart.svelte';
import { CART_STORE, CartStore } from './cart-store';

it('renders the total the store reports', () => {
  const cartStore = createSpyFromClass(CartStore);

  cartStore.total.mockReturnValue(42);

  render(Cart, { context: new Map([[CART_STORE, cartStore]]) });

  expect(screen.getByText('$42')).toBeInTheDocument();
});
```

## Through a mocked module

When the component imports a singleton directly, replace the module — the spy is what the factory
returns:

```ts
import { render } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';

import { CartStore } from './cart-store';

const cartStore = vi.hoisted(() => createSpyFromClass(CartStore));

vi.mock('./cart-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cart-store')>()),
  cartStore,
}));

it('checks out through the module singleton', async () => {
  cartStore.checkout.resolveWith({ orderId: 'ord_42' });

  render(await import('./Cart.svelte').then((m) => m.default));

  expect(cartStore.checkout).toHaveBeenCalled();
});
```

::: warning `vi.mock` needs a module boundary
A `vi.mock` factory is hoisted above the file's own imports, so it must not close over anything
declared at module scope — `vi.hoisted` is what makes the spy available to it. And in setups that
bundle the spec (Angular's `@angular/build:unit-test` builder, for instance) a relative path has no
module boundary left to replace; inject the spy through props or context there instead.
:::
