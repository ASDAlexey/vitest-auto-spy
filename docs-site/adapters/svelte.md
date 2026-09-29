---
title: Svelte
description: Spy class-based Svelte services and stores, and pass the spy to the component through props, context or a mocked module.
---

# Svelte

`vitest-auto-spy/svelte` turns a class-based service or store into a typed spy. A spy is a stand-in
object: every method records its calls and returns what you set. You give the spy to the component
the same way it gets the real object: through props, context, or the module it imports.

## Through props

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';

import Cart from './Cart.svelte';
import { CartStore } from './cart-store';

it('renders the total the store reports', () => {
  const cartStore = createSpyFromClass(CartStore);

  cartStore.total.mockReturnValue(42);

  render(Cart, { props: { store: cartStore } });

  expect(screen.getByText('$42')).toBeInTheDocument();
  expect(cartStore.total).toHaveBeenCalled();
});

it('checks out when the button is clicked', async () => {
  const cartStore = createSpyFromClass(CartStore);

  cartStore.checkout.resolveWith({ orderId: 'ord_42' }); // checkout() returns a Promise

  render(Cart, { props: { store: cartStore } });
  await fireEvent.click(screen.getByRole('button', { name: 'Check out' }));

  expect(cartStore.checkout).toHaveBeenCalledTimes(1);
});
```

You set answers with `mockReturnValue` (a plain value) or `resolveWith` (a resolved promise), and
check calls with the usual `toHaveBeenCalled…` matchers. `toBeInTheDocument` needs
`import '@testing-library/jest-dom/vitest'` in your Vitest setup file.

`vitest-auto-spy/svelte` is an entry: the import path you use in Svelte specs. It exports the core
API of the library: `createSpyFromClass`, `createAutoMock`, the `Spy<T>` type, `asInstance`,
`resetAutoSpy` and the rest. Svelte has no class-based dependency injection, so there are no extra
helpers.

## Through context

If the component reads the store with `getContext`, pass the spy under the same key:

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

If the component imports a ready instance (a singleton) from a module, replace that export with
the spy:

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

**Common mistake:** creating the spy in a plain `const` at the top of the file. Vitest moves
`vi.mock` above all other code, so the factory cannot see that variable. Wrap it in `vi.hoisted`, as
above.

## Which runner

This entry never imports `svelte` or `@testing-library/svelte`. It does import `vitest`, so it does
not load under `bun test` or `node --test`. On those runners, import `createSpyFromClass` from your
runner's entry (`vitest-auto-spy/bun`, `vitest-auto-spy/node`).

If a setup file already imports a runner entry such as `vitest-auto-spy/bun`, that runner's mocks
stay in use after you import this entry.

## In depth

### When `vi.mock` has nothing to replace

`vi.mock` replaces a module by its path. Some test setups bundle the spec together with its imports
into one file (for example, the `@angular/build:unit-test` builder), so a relative path no longer points to a separate module. Then `vi.mock` changes
nothing and the component uses the real store. Pass the spy through props or context instead.
