---
title: React
description: Спаи для классов, которыми владеет React-приложение — сервисов, стора, API-клиентов, — и передача спая в Context-провайдер или хук.
---

# React

В React нет DI-контейнера, поэтому `vitest-auto-spy/react` не поставляет **никакого** хелпера
`provide*` — это _рецепт_: спаить **классы**, которыми вы владеете (сервисы, сторы, API-клиенты,
зависимости, которые вы инжектите в хуки или отдаёте Context-провайдеру), а не сами компоненты.

```ts
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/react';
```

Спай — это обычный объект из моков, поэтому его можно передать напрямую в
`<Context.Provider value={spy}>` или в аргумент-зависимость хука, а затем задавать возвращаемые
значения через `calledWith` / `resolveWith` / `mockReturnValue` и проверять `spy.method.mock.calls`.

Импорт этой точки входа регистрирует дефолтный mock-адаптер Vitest и реэкспортирует то же публичное
API, что и ядро. Он тянет только `vitest` — никогда `react` и `@testing-library/react`, они остаются
вашими dev-зависимостями.

## Через Context-провайдер {#through-a-context-provider}

Спай — обычный объект из моков, поэтому он идёт прямо в `value` провайдера:

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

`Spy<CartStore>` — маппед-тип, и он отбрасывает `#private`-члены, поэтому не присваивается
`CartStore`. Если контекст типизирован классом, наведите мост через
[`asInstance(cart)`](/ru/core/spy-typing), а не через `as`.

## Как зависимость хука {#as-a-hook-dependency}

Хук, который принимает коллаборатора аргументом, — самое простое, что можно протестировать в
React-кодовой базе, и спаю здесь не нужна вообще никакая обёртка:

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

::: tip Что спаить не надо
Спайте классы, которыми владеете, а не компоненты и не хуки. Заспаенный компонент ничего не говорит
о рендеринге, а заспаенный хук заставляет тест проверять собственный мок. Держите границу на шве
сервис / стор / API-клиент.
:::
