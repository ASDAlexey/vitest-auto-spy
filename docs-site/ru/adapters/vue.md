---
title: Vue / Pinia
description: provideAutoSpy для global.provide из @vue/test-utils и спаи для экшенов Pinia-стора, написанного классом.
---

# Vue / Pinia

Точка входа `vitest-auto-spy/vue` реэкспортирует ядро целиком (на Vitest — без настройки) и добавляет
небольшой `provideAutoSpy(token, Class)`, который собирает запись `global.provide` для
`@vue/test-utils`. Ничто здесь не импортирует `vue`, `pinia` или `@vue/test-utils` — они остаются
необязательными пирами.

Классовые сервисы, инжектируемые через `provide`/`inject`, и классовые Pinia-сторы ложатся сюда
естественнее всего:

```ts
import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/vue';

// Спай на экшены Pinia-стора
const store = createSpyFromClass(CartStore);
store.checkout.resolveWith({ ok: true });

// Отдать смонтированному компоненту заспаенный сервис
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Fake Name');
```

## Полный пример с `mount` {#a-full-mount-example}

`provideAutoSpy(token, Class, methodsOrConfig?)` возвращает **карту `global.provide`** —
`{ [token]: Spy<T> }`, — поэтому она спредится прямо в `@vue/test-utils`:

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

Отдать больше одного коллаборатора — это слияние карт:

```ts
const provide = {
  ...provideAutoSpy(UserServiceKey, UserService),
  ...provideAutoSpy(CartKey, CartStore, { onlyMethodsToSpyOn: ['total', 'checkout'] }),
};
```

Токеном может быть обычная строка, `symbol` или типизированный `InjectionKey<T>` (который является
брендированным `symbol`) — ключом в возвращённой карте будет ровно тот токен, который вы передали.

## Pinia-стор, написанный классом {#a-class-based-pinia-store}

Стор, написанный классом, — это просто класс, поэтому `createSpyFromClass` спаит каждый экшен и
каждый геттер:

```ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/vue';

import { CartStore } from './cart.store';

it('drives the store the component talks to', async () => {
  const cart: Spy<CartStore> = createSpyFromClass(CartStore);

  cart.itemCount.mockReturnValue(3); // экшен в стиле геттера
  cart.checkout.resolveWith({ orderId: 'ord_42' }); // асинхронный экшен

  expect(cart.itemCount()).toBe(3);
  await expect(cart.checkout('tok_abc')).resolves.toEqual({ orderId: 'ord_42' });
  expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
});
```

Каждый экшен инертен, пока вы его не настроите: `cart.addItem('sku', 1)` записывает вызов и
возвращает `undefined`, так что никакая настоящая логика стора не выполняется.

::: tip Setup-сторы (composition API)
`defineStore('cart', () => …)` возвращает обычный объект из ref-ов и функций, а не класс. Там
используйте [`createAutoMock<T>()`](/ru/core/auto-mock-by-type) — он мокает по **типу** стора, с теми
же хелперами и без всякого класса.
:::
