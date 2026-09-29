---
title: Vue / Pinia
description: provideAutoSpy собирает карту global.provide для @vue/test-utils, а createSpyFromClass превращает Pinia-стор, написанный классом, в спай.
---

# Vue / Pinia

`vitest-auto-spy/vue` отдаёт смонтированному компоненту спай вместо настоящего сервиса. Спай —
объект-заглушка: каждый его метод запоминает вызовы и возвращает то, что вы задали. Это нужно, когда
компонент получает сервис-класс через `provide` / `inject` или работает с Pinia-стором, написанным
классом.

`vitest-auto-spy/vue` — точка входа, то есть путь импорта для Vue-спек. Кроме `provideAutoSpy`, она
экспортирует API ядра библиотеки: `createSpyFromClass`, `createAutoMock`, тип `Spy<T>`,
`asInstance`, `resetAutoSpy` и остальное.

```ts
import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import { provideAutoSpy } from 'vitest-auto-spy/vue';

import Greeting from './Greeting.vue';
import { UserService, UserServiceKey } from './user.service';

it('renders the name the service returns', () => {
  const provide = provideAutoSpy(UserServiceKey, UserService);
  const users = provide[UserServiceKey]; // спай с типом Spy<UserService>

  users.getName.calledWith(1).mockReturnValue('Ada');

  const wrapper = mount(Greeting, {
    props: { userId: 1 },
    global: { provide },
  });

  expect(wrapper.text()).toContain('Ada');
  expect(users.getName).toHaveBeenCalledWith(1);
});
```

Спай достаётся из карты по его токену. `users.getName.mockReturnValue('Ada')` отвечает `'Ada'` на
любой вызов; `calledWith(1)` перед ним ограничивает ответ вызовами с `1`.

## `provideAutoSpy(token, Class, config?)` {#provideautospy-token-class-config}

Возвращает карту для `global.provide` с одной записью: `{ [token]: Spy<Class> }`. Передайте её в
`mount` как `global: { provide }`.

| Параметр | Тип                      | Смысл                                                                                 |
| -------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `token`  | `string \| symbol`       | ключ, по которому компонент делает `inject`; `InjectionKey<T>` — это символ, подходит |
| `Class`  | класс                    | класс, чьи методы становятся спаями                                                   |
| `config` | опции или список методов | то же, что второй аргумент `createSpyFromClass` (см. ниже)                            |

Ключ карты — ровно тот токен, который вы передали, поэтому `provide[UserServiceKey]` имеет тип спая.

Самые частые опции в `config`:

- `onlyMethodsToSpyOn: ['getName']` — спаить только эти методы.
- `gettersToSpyOn: ['isAdmin']` — спаить ещё и `get`-аксессор (см. раздел о сторе ниже).
- `strict: true` — ненастроенный метод бросает ошибку вместо того, чтобы вернуть `undefined`.

Полный список — на странице [createSpyFromClass](/ru/core/create-spy-from-class).

Чтобы передать несколько сервисов, объедините карты в один объект:

```ts
const provide = {
  ...provideAutoSpy(UserServiceKey, UserService),
  ...provideAutoSpy(CartKey, CartStore, { onlyMethodsToSpyOn: ['total', 'checkout'] }),
};
```

## Pinia-стор, написанный классом {#a-class-based-pinia-store}

Стор-класс — обычный класс, поэтому `createSpyFromClass` делает спаем каждый экшен и геттер:

```ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/vue';

import { CartStore } from './cart.store';

it('drives the store the component talks to', async () => {
  const cart: Spy<CartStore> = createSpyFromClass(CartStore);

  cart.itemCount.mockReturnValue(3); // itemCount() — метод
  cart.checkout.resolveWith({ orderId: 'ord_42' }); // checkout() возвращает Promise

  expect(cart.itemCount()).toBe(3);
  await expect(cart.checkout('tok_abc')).resolves.toEqual({ orderId: 'ord_42' });
  expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
});
```

Ненастроенный экшен запоминает вызов и возвращает `undefined`. Настоящий код стора не выполняется.

Методы становятся спаями автоматически, а настоящий `get`-аксессор (`get total() { … }`) — нет. Чтобы
управлять им, перечислите его в `gettersToSpyOn` и задайте значение через `accessorSpies`:

```ts
const cart = createSpyFromClass(CartStore, { gettersToSpyOn: ['total'] });

cart.accessorSpies.getters.total.mockReturnValue(42);
```

Подробнее — в разделе [Спаи на аксессорах](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).

**Частая ошибка:** setup-стор, `defineStore('cart', () => …)`, — это обычный объект из ref-ов и
функций, а не класс, и `createSpyFromClass` читать нечего. Используйте
[`createAutoMock<T>()`](/ru/core/auto-mock-by-type): он собирает такой же спай по типу стора.

## Какой раннер {#which-runner}

Точка входа реэкспортирует всё API ядра, так что хватает одного импорта. Она не импортирует ни
`vue`, ни `pinia`, ни `@vue/test-utils`.

Зато она импортирует `vitest`, поэтому под `bun test` и `node --test` не загрузится. На этих раннерах
импортируйте `createSpyFromClass` из точки входа своего раннера (`vitest-auto-spy/bun`,
`vitest-auto-spy/node`) и соберите карту `provide` руками:
`{ [UserServiceKey]: createSpyFromClass(UserService) }`.

Если setup-файл уже импортирует точку входа раннера, например `vitest-auto-spy/bun`, после импорта
этой точки входа остаются моки того раннера.
