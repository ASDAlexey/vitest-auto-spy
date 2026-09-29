---
title: Svelte
description: Спаи для сервисов и сторов Svelte, написанных классами, и передача спая компоненту через пропсы, контекст или замоканный модуль.
---

# Svelte

`vitest-auto-spy/svelte` превращает сервис или стор, написанный классом, в типизированный спай.
Спай — объект-заглушка: каждый его метод запоминает вызовы и возвращает то, что вы задали. Спай
передаётся компоненту так же, как настоящий объект: через пропсы, контекст или модуль, который
компонент импортирует.

## Через пропсы {#through-props}

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

  cartStore.checkout.resolveWith({ orderId: 'ord_42' }); // checkout() возвращает Promise

  render(Cart, { props: { store: cartStore } });
  await fireEvent.click(screen.getByRole('button', { name: 'Check out' }));

  expect(cartStore.checkout).toHaveBeenCalledTimes(1);
});
```

Ответы задаются через `mockReturnValue` (обычное значение) или `resolveWith` (успешный промис),
вызовы проверяются обычными матчерами `toHaveBeenCalled…`. Для `toBeInTheDocument` добавьте
`import '@testing-library/jest-dom/vitest'` в setup-файл Vitest.

`vitest-auto-spy/svelte` — точка входа, то есть путь импорта для Svelte-спек. Она экспортирует API
ядра библиотеки: `createSpyFromClass`, `createAutoMock`, тип `Spy<T>`, `asInstance`, `resetAutoSpy` и
остальное. В Svelte нет внедрения зависимостей на классах, поэтому дополнительных хелперов нет.

## Через контекст {#through-context}

Если компонент берёт стор через `getContext`, передайте спай под тем же ключом:

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

## Через замоканный модуль {#through-a-mocked-module}

Если компонент импортирует готовый экземпляр (синглтон) из модуля, замените этот экспорт спаем:

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

**Частая ошибка:** спай создан в обычной `const` в начале файла. Vitest поднимает `vi.mock` выше
всего остального кода, и фабрика эту переменную не видит. Оберните создание в `vi.hoisted`, как выше.

## Какой раннер {#which-runner}

Точка входа не импортирует ни `svelte`, ни `@testing-library/svelte`. Зато она импортирует `vitest`,
поэтому под `bun test` и `node --test` не загрузится. На этих раннерах импортируйте
`createSpyFromClass` из точки входа своего раннера (`vitest-auto-spy/bun`, `vitest-auto-spy/node`).

Если setup-файл уже импортирует точку входа раннера, например `vitest-auto-spy/bun`, после импорта
этой точки входа остаются моки того раннера.

## Подробнее {#in-depth}

### Когда `vi.mock` нечего заменять {#when-vi-mock-has-nothing-to-replace}

`vi.mock` подменяет модуль по его пути. Некоторые тестовые сборки собирают спеку вместе с импортами в
один файл (например, билдер `@angular/build:unit-test`), и относительный путь больше не указывает на отдельный модуль. Тогда `vi.mock` ничего не
меняет, и компонент работает с настоящим стором. Передавайте спай через пропсы или контекст.
