---
title: Svelte
description: Спаи для классовых сервисов и сторов Svelte и передача спая через пропсы, контекст или замоканный модуль.
---

# Svelte

В Svelte нет классового внедрения зависимостей, поэтому `vitest-auto-spy/svelte` не добавляет
**никакого** собственного хелпера — это рецепт, а не интеграция с фреймворком. Svelte-приложения
обычно держат логику в обычных классовых сервисах или сторах; `createSpyFromClass` спаит такой класс,
а вы отдаёте спай компоненту под тестом (через пропсы, контекст или замоканный модуль) ровно так же,
как компонент получает настоящий.

```ts
import { render } from '@testing-library/svelte';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';

import Cart from './Cart.svelte';
import { CartStore } from './cart-store';

const cartStore = createSpyFromClass(CartStore);
cartStore.total.mockReturnValue(42);

render(Cart, { props: { store: cartStore } });
```

Импорт этой точки входа регистрирует дефолтный mock-адаптер Vitest и реэкспортирует всё ядро,
поэтому Svelte-сюите хватает одного импорта. Ни `svelte`, ни `@testing-library/svelte` он не тянет.

## Через контекст {#through-context}

Когда компонент читает коллаборатора из `getContext`, положите спай под тот же ключ:

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

Когда компонент импортирует синглтон напрямую, подменяйте модуль — спай и есть то, что возвращает
фабрика:

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

::: warning `vi.mock` нужна граница модуля
Фабрика `vi.mock` поднимается выше собственных импортов файла, поэтому она не должна замыкаться ни
на чём, объявленном на уровне модуля, — именно `vi.hoisted` делает спай ей доступным. А в сборках,
которые бандлят спеку (например, билдер Angular `@angular/build:unit-test`), у относительного пути
уже не остаётся границы модуля, которую можно подменить; там отдавайте спай через пропсы или
контекст.
:::
