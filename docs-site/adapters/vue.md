---
title: Vue / Pinia
description: provideAutoSpy for @vue/test-utils global.provide, and spying a class-based Pinia store's actions.
---

# Vue / Pinia

The `vitest-auto-spy/vue` entry re-exports the full core (zero-config on Vitest) and adds a small
`provideAutoSpy(token, Class)` that builds a `global.provide` entry for `@vue/test-utils`. Nothing
here imports `vue`, `pinia` or `@vue/test-utils` — they stay optional peers.

Class-based services injected via `provide`/`inject` and class-based Pinia stores are the natural
fit:

```ts
import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/vue';

// Spy a Pinia store's actions
const store = createSpyFromClass(CartStore);
store.checkout.resolveWith({ ok: true });

// Provide a spied service to a mounted component
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Fake Name');
```

## A full `mount` example

`provideAutoSpy(token, Class, methodsOrConfig?)` returns a **`global.provide` map** —
`{ [token]: Spy<T> }` — so it spreads straight into `@vue/test-utils`:

```ts
import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import { provideAutoSpy } from 'vitest-auto-spy/vue';

import Greeting from './Greeting.vue';
import { UserService, UserServiceKey } from './user.service';

it('renders the name the service returns', () => {
  const provide = provideAutoSpy(UserServiceKey, UserService);

  provide[UserServiceKey].getName.calledWith(1).mockReturnValue('Ada');

  const wrapper = mount(Greeting, {
    props: { userId: 1 },
    global: { provide },
  });

  expect(wrapper.text()).toContain('Ada');
  expect(provide[UserServiceKey].getName).toHaveBeenCalledWith(1);
});
```

Providing more than one collaborator is a merge of the maps:

```ts
const provide = {
  ...provideAutoSpy(UserServiceKey, UserService),
  ...provideAutoSpy(CartKey, CartStore, { onlyMethodsToSpyOn: ['total', 'checkout'] }),
};
```

The token can be a plain string, a `symbol`, or a typed `InjectionKey<T>` (which is a branded
`symbol`) — the returned map is keyed by exactly the token you passed.

## A class-based Pinia store

A store written as a class is just a class, so `createSpyFromClass` spies every action and getter:

```ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/vue';

import { CartStore } from './cart.store';

it('drives the store the component talks to', async () => {
  const cart: Spy<CartStore> = createSpyFromClass(CartStore);

  cart.itemCount.mockReturnValue(3); // a getter-style action
  cart.checkout.resolveWith({ orderId: 'ord_42' }); // an async action

  expect(cart.itemCount()).toBe(3);
  await expect(cart.checkout('tok_abc')).resolves.toEqual({ orderId: 'ord_42' });
  expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
});
```

Every action is inert until you configure it — `cart.addItem('sku', 1)` records the call and returns
`undefined`, so no real store logic runs.

::: tip Setup-store (composition API) stores
`defineStore('cart', () => …)` returns a plain object of refs and functions, not a class. Use
[`createAutoMock<T>()`](/core/auto-mock-by-type) there — it mocks from the store's **type** with the
same helpers, no class required.
:::
