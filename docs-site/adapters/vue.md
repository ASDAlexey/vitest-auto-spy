---
title: Vue / Pinia
description: provideAutoSpy builds a global.provide map for @vue/test-utils, and createSpyFromClass spies a class-based Pinia store.
---

# Vue / Pinia

`vitest-auto-spy/vue` gives a mounted component a spy instead of a real service. A spy is a
stand-in object: every method records its calls and returns what you set. You need it when a
component gets a class-based service through `provide` / `inject`, or uses a Pinia store written as
a class.

`vitest-auto-spy/vue` is an entry: the import path you use in Vue specs. Besides `provideAutoSpy`, it
exports the core API of the library: `createSpyFromClass`, `createAutoMock`, the `Spy<T>` type,
`asInstance`, `resetAutoSpy` and the rest.

```ts
import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import { provideAutoSpy } from 'vitest-auto-spy/vue';

import Greeting from './Greeting.vue';
import { UserService, UserServiceKey } from './user.service';

it('renders the name the service returns', () => {
  const provide = provideAutoSpy(UserServiceKey, UserService);
  const users = provide[UserServiceKey]; // the spy, typed as Spy<UserService>

  users.getName.calledWith(1).mockReturnValue('Ada');

  const wrapper = mount(Greeting, {
    props: { userId: 1 },
    global: { provide },
  });

  expect(wrapper.text()).toContain('Ada');
  expect(users.getName).toHaveBeenCalledWith(1);
});
```

You read the spy back from the map by its token. `users.getName.mockReturnValue('Ada')` answers
`'Ada'` to every call; `calledWith(1)` before it limits the answer to calls with `1`.

## `provideAutoSpy(token, Class, config?)`

Returns a `global.provide` map with one entry, `{ [token]: Spy<Class> }`. Pass it as
`global: { provide }` to `mount`.

| Parameter | Type                     | Meaning                                                                      |
| --------- | ------------------------ | ---------------------------------------------------------------------------- |
| `token`   | `string \| symbol`       | the key the component injects; an `InjectionKey<T>` is a symbol, so it works |
| `Class`   | class                    | the class whose methods become spies                                         |
| `config`  | options or a method list | same as the second argument of `createSpyFromClass` (see below)              |

The map is keyed by exactly the token you passed, so `provide[UserServiceKey]` is typed as the spy.

The options you will use most in `config`:

- `onlyMethodsToSpyOn: ['getName']` — spy only these methods.
- `gettersToSpyOn: ['isAdmin']` — also spy a `get` accessor (see the store section below).
- `strict: true` — a method you did not configure throws instead of returning `undefined`.

The full list is on [createSpyFromClass](/core/create-spy-from-class).

To provide several services, spread the maps into one object:

```ts
const provide = {
  ...provideAutoSpy(UserServiceKey, UserService),
  ...provideAutoSpy(CartKey, CartStore, { onlyMethodsToSpyOn: ['total', 'checkout'] }),
};
```

## A class-based Pinia store

A store written as a class is an ordinary class, so `createSpyFromClass` turns every action and
getter into a spy:

```ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/vue';

import { CartStore } from './cart.store';

it('drives the store the component talks to', async () => {
  const cart: Spy<CartStore> = createSpyFromClass(CartStore);

  cart.itemCount.mockReturnValue(3); // itemCount() is a method
  cart.checkout.resolveWith({ orderId: 'ord_42' }); // checkout() returns a Promise

  expect(cart.itemCount()).toBe(3);
  await expect(cart.checkout('tok_abc')).resolves.toEqual({ orderId: 'ord_42' });
  expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
});
```

An action you did not configure records the call and returns `undefined`. No real store code runs.

Methods become spies automatically. A real `get` accessor (`get total() { … }`) does not. To control
one, list it in `gettersToSpyOn` and set its value through `accessorSpies`:

```ts
const cart = createSpyFromClass(CartStore, { gettersToSpyOn: ['total'] });

cart.accessorSpies.getters.total.mockReturnValue(42);
```

More in [Accessor spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).

**Common mistake:** a setup store, `defineStore('cart', () => …)`, is a plain object of refs and
functions, not a class, so `createSpyFromClass` has nothing to read. Use
[`createAutoMock<T>()`](/core/auto-mock-by-type): it builds the same spy from the store's type.

## Which runner

This entry re-exports the whole core API, so one import is enough. It never imports `vue`, `pinia`
or `@vue/test-utils`.

It does import `vitest`, so it does not load under `bun test` or `node --test`. On those runners,
import `createSpyFromClass` from your runner's entry (`vitest-auto-spy/bun`, `vitest-auto-spy/node`)
and build the `provide` map by hand: `{ [UserServiceKey]: createSpyFromClass(UserService) }`.

If a setup file already imports a runner entry such as `vitest-auto-spy/bun`, that runner's mocks
stay in use after you import this entry.
