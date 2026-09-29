---
title: React
description: Спаи для классов React-приложения (сервисов, сторов, API-клиентов) через Context-провайдер или аргумент хука; мок кастомного хука с типизированным результатом.
---

# React

`vitest-auto-spy/react` превращает ваш класс (сервис, стор, API-клиент) в типизированный спай.
Спай — объект-заглушка: каждый его метод запоминает вызовы и возвращает то, что вы задали. Вы
передаёте спай туда, откуда компонент берёт настоящий объект, чаще всего в Context-провайдер.

`vitest-auto-spy/react` — точка входа, то есть путь импорта для React-спек. Она экспортирует
`createSpyFromClass`, `createAutoMock`, `autoMocked`, тип `Spy<T>`, `asInstance`, `resetAutoSpy` и
хелперы для моков модулей, которые встретятся ниже. Полный список — в [справочнике API](/ru/api).

## Через Context-провайдер {#through-a-context-provider}

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/react';

import { Cart, CartContext } from './cart';
import { CartStore, type Order } from './cart-store';

describe('<Cart />', () => {
  let cart: Spy<CartStore>;

  beforeEach(() => {
    cart = createSpyFromClass(CartStore);
  });

  it('renders the total the store reports', () => {
    cart.total.mockReturnValue(42); // total(): number

    render(
      <CartContext.Provider value={cart}>
        <Cart />
      </CartContext.Provider>,
    );

    expect(screen.getByText('$42')).toBeInTheDocument();
  });

  it('shows the order number after checkout', async () => {
    const order: Order = { id: 'ord_42', total: 42 };
    cart.checkout.resolveWith(order); // checkout(token): Promise<Order>

    render(
      <CartContext.Provider value={cart}>
        <Cart paymentToken="tok_abc" />
      </CartContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Check out' }));

    expect(await screen.findByText('Order ord_42 placed')).toBeInTheDocument();
    expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
  });
});
```

Как задать ответ методу спая:

- `mockReturnValue(value)` — для метода, который возвращает обычное значение.
- `resolveWith(value)` — для метода, который возвращает `Promise`. Передайте значение, которое вернёт
  промис (здесь `Order`). Неполный объект приведите к типу: `resolveWith({ id: 'ord_42' } as Order)`.
- `calledWith(args)` перед любым из них — ответ сработает только на вызов с этими аргументами.

Ответ `resolveWith` приходит асинхронно, поэтому результат ждите через `findByText`, а не
`getByText`. `toBeInTheDocument` приходит из `@testing-library/jest-dom`: добавьте
`import '@testing-library/jest-dom/vitest'` в setup-файл Vitest.

**Частая ошибка:** `asInstance` нужен, только если у класса есть `#private`- или `private`-члены.
Тогда TypeScript сообщает об ошибке типа на `value={cart}`: тип спая эти члены отбрасывает.
Передайте `asInstance(cart)` вместо приведения через `as`:

```tsx
import { asInstance } from 'vitest-auto-spy/react';

<CartContext.Provider value={asInstance(cart)}>
  <Cart />
</CartContext.Provider>;
```

Подробнее — в разделе [Типизация спаев](/ru/core/spy-typing).

В React нет контейнера зависимостей, поэтому аналога Angular-хелпера `provideAutoSpy` здесь нет:
спай кладётся в провайдер руками, как в примере выше. `react` и `@testing-library/react` остаются
вашими dev-зависимостями любой версии.

::: tip Какой раннер
На Vitest больше ничего не нужно. Если setup-файл уже импортирует другую точку входа раннера,
например `vitest-auto-spy/bun`, спаи продолжает создавать тот раннер. Эта точка входа импортирует
`vitest`, поэтому под `bun test` и `node --test` не загрузится: там импортируйте те же функции из
`vitest-auto-spy/bun` или `vitest-auto-spy/node`.
:::

## Как зависимость хука {#as-a-hook-dependency}

Если хук принимает зависимость аргументом, передайте спай напрямую. Обёртка не нужна:

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

## Мок кастомного хука {#mocking-a-custom-hook}

Лучше подходят два способа выше. Но бывает, что компонент вызывает хук сам, например `useMovies()` из
модуля с хуками, и снаружи ничего не получает. Тогда модуль подменяют через `vi.mock`. Сложнее всего
с результатом хука: написанный руками, это большой объект, который собирается заново в каждом тесте
и не сверяется с типом. `autoMocked` собирает его по типу.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertMocked, autoMocked, moduleNamespace } from 'vitest-auto-spy/react';

import * as hooks from './hooks';
import { MovieSearch } from './movie-search';

vi.mock('./hooks', () => moduleNamespace({ useMovies: vi.fn(), useFetch: vi.fn() }));

beforeEach(() => {
  assertMocked(hooks, { specifier: './hooks', exports: ['useMovies', 'useFetch'] });
});

describe('<MovieSearch />', () => {
  it('renders what the hook filtered', () => {
    const movies = autoMocked<hooks.UseMoviesResult>({
      searchTerm: 'star',
      filteredItems: [{ id: 1, title: 'Star Wars' }],
    });

    vi.mocked(hooks.useMovies).mockReturnValue(movies);

    render(<MovieSearch movies={[]} />);

    expect(screen.getByRole('listitem').textContent).toBe('Star Wars');
  });

  it('hands every keystroke to the setter', async () => {
    const movies = autoMocked<hooks.UseMoviesResult>({ searchTerm: '', filteredItems: [] });

    vi.mocked(hooks.useMovies).mockReturnValue(movies);

    render(<MovieSearch movies={[]} />);
    await userEvent.type(screen.getByLabelText('Search'), 'x');

    expect(movies.setSearchTerm).toHaveBeenCalledWith('x');
  });
});
```

Что делает каждая часть:

- **[`autoMocked<UseMoviesResult>(values)`](/ru/core/auto-mock-by-type)** собирает результат хука по
  его типу. Поля, которые вы передали, — обычные значения. Все остальные члены (`setSearchTerm`,
  `reload`) — спаи, они создаются при первом чтении. Переданные значения проверяются по типу, так что
  переименованное в хуке поле даст ошибку компиляции. Результат
  подходит и как `UseMoviesResult`, и как спай: один и тот же объект можно передать в
  `mockReturnValue` и проверить в `expect`. Если нужен только тип спая,
  берите `createAutoMock<T>()`.
- **[`moduleNamespace`](/ru/utilities/module-mocks#modulenamespace-exports-options)** добавляет к
  результату фабрики ключи `default` и `__esModule`. Без них модуль хуков, прочитанный через
  слой совместимости с CommonJS, падает с `No "default" export is defined on the mock`.
- **[`assertMocked`](/ru/utilities/module-mocks#assertmocked-namespace-options)** падает на этой
  строке, если мок не применился. Так бывает, когда бандлер уже встроил модуль в код; тогда компонент
  вызвал бы настоящий хук. В `exports` перечислены хуки, которыми управляет этот файл.

Сам хук остаётся обычным `vi.fn()`. `vi.mocked` даёт ему тип настоящего хука, поэтому
`mockReturnValue` принимает только `UseMoviesResult`.

Два варианта:

- **Оставить настоящие хуки и заменить один.** С
  `vi.mock('./hooks', async (importOriginal) => moduleNamespace(await importOriginal(), { passthrough: true }))`
  каждая экспортируемая функция становится спаем, который вызывает настоящий хук, пока вы его не
  настроите.
- **Дать `vi.fn()` из фабрики методы `calledWith` и `resolveWith`.**
  [`adoptMock(hooks.useMovies)`](/ru/utilities/module-mocks#adoptmock-mock-options) добавляет их на
  месте.

Оба описаны на [странице о моках модулей](/ru/utilities/module-mocks).

### Хук, который возвращает кортеж {#a-hook-that-returns-a-tuple}

Хук в стиле `useState` возвращает кортеж вроде `[value, loading, error]`. Кортеж — это данные,
пишите его руками. Тип результата хука проверит каждую позицию:

```tsx
// тот же файл, что выше
import { UserCard } from './user-card';

it('shows the loading state', () => {
  vi.mocked(hooks.useFetch).mockReturnValue([undefined, true, null]);

  render(<UserCard id={1} />);

  expect(screen.getByText('Loading…')).toBeTruthy();
});

it('shows the error the hook reported', () => {
  vi.mocked(hooks.useFetch).mockReturnValue([undefined, false, new Error('Not found')]);

  render(<UserCard id={1} />);

  expect(screen.getByRole('alert').textContent).toBe('Not found');
});

it('goes from loading to loaded across renders', () => {
  vi.mocked(hooks.useFetch)
    .mockReturnValueOnce([undefined, true, null])
    .mockReturnValue([{ name: 'Ada' }, false, null]);

  const { rerender } = render(<UserCard id={1} />);
  expect(screen.getByText('Loading…')).toBeTruthy();

  rerender(<UserCard id={1} />);
  expect(screen.getByRole('heading').textContent).toBe('Ada');
  expect(hooks.useFetch).toHaveBeenCalledWith('/api/users/1');
});
```

**Частая ошибка:** `createAutoMock<[T, boolean]>()` для кортежа. Строка
`const [data, loading] = hook()` бросает `TypeError: … is not iterable`: автомок не итерируемый.
`mockDeep` падает так же. Автомок — для объектов с функциями, не для кортежей.

### Значение, которое протекает в следующий тест {#the-value-that-leaks-into-the-next-test}

`vi.fn()` из фабрики `vi.mock` живёт весь файл. `mockReturnValue`, заданный в одном тесте, отвечает и
в следующем. Признак: тест проходит один и падает, когда запускается весь файл.

С `clearMocks: true` (в Vitest 5 это значение по умолчанию) любой Vitest перед каждым тестом очищает
записанные вызовы, но заданный ответ при этом остаётся. Исправить можно одним из двух способов:

- включите `mockReset: true` в конфиге Vitest;
- настраивайте хук в каждом тесте, который рендерит компонент, как в примерах выше.

Значения из `autoMocked` или `createAutoMock`, созданные внутри теста, каждый раз новые и не
протекают. Для спая, созданного один раз на файл, см. [`setupAutoSpy()`](/ru/utilities/setup) и
[`resetAutoSpy`](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

::: tip Что спаить не надо
Спайте классы, которыми владеете. Мокайте хук, только когда он — зависимость компонента.
Заспаенный компонент ничего не говорит о рендеринге. Тест хука, в котором замокан сам хук, проверяет
только свой мок: тестируйте хук через `renderHook` и спай зависимости, как в разделе
[Как зависимость хука](#as-a-hook-dependency).
:::
