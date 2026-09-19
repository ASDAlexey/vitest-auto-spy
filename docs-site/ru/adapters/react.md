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

Импорт этой точки входа регистрирует дефолтный mock-адаптер Vitest — только если его ещё никто не
зарегистрировал, так что подменить адаптер, поставленный рантайм-точкой входа, он не может, — и
реэкспортирует то же публичное API, что и ядро. Он тянет только `vitest`, никогда `react` и
`@testing-library/react`, они остаются вашими dev-зависимостями. Из-за этого же импорта `vitest`
точка входа не грузится под `bun test` и `node --test`: на этих раннерах импортируйте ядро через их
собственную рантайм-точку входа.

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

## Мок кастомного хука {#mocking-a-custom-hook}

Шов из раздела выше — предпочтительный. Когда же компонент зовёт хук напрямую — `useMovies()` из
модуля с хуками, ничего не принимая снаружи, — хук становится его коллаборатором, и спека подменяет
модуль. Рукописный мок ошибается в возвращаемом значении: весь объект собирается заново в каждом
тесте и ни с чем не сверен по типу.

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

Три части, у каждой одна работа:

- **[`autoMocked<UseMoviesResult>(seed)`](/ru/core/auto-mock-by-type)** собирает возвращаемое
  значение хука по его типу. Засеянные поля — обычные значения; каждый член, который спека не
  засеяла, — `setSearchTerm`, `reload`, — становится спаем с хелперами по своему типу возврата и
  создаётся при первом чтении. Сид сверяется с типом, так что переименованное в хуке поле — ошибка
  компиляции. Результат типизирован одновременно как `UseMoviesResult` и как его спай, поэтому один и
  тот же объект уходит в `mockReturnValue` и возвращается в проверку. Если результат путешествует
  только как спай, тип `createAutoMock<T>()` уже.
- **[`moduleNamespace`](/ru/utilities/module-mocks#modulenamespace-exports-options)** даёт результату
  фабрики `default` и `__esModule`, которые ищет interop-проба, поэтому модуль хуков, прочитанный
  через CommonJS-совместимый слой, не падает с `No "default" export is defined on the mock`.
- **[`assertMocked`](/ru/utilities/module-mocks#assertmocked-namespace-options)** падает на строке
  самой спеки, если мок не применился: под бандлером, который уже заинлайнил модуль, компонент иначе
  вызвал бы настоящий хук, и тест прошёл бы или упал по посторонней причине. Список `exports` заставляет
  проверить именно те хуки, которыми управляет файл.

Сам хук остаётся `vi.fn()`: это функция, которую экспортирует модуль, а не метод класса, и
`vi.mocked` типизирует её как настоящий хук, так что `mockReturnValue` принимает только
`UseMoviesResult`.

Два варианта, когда простого `vi.fn()` мало. Чтобы оставить настоящие хуки и заменить один,
`vi.mock('./hooks', async (importOriginal) => moduleNamespace(await importOriginal(), { passthrough: true }))`
делает каждую экспортируемую функцию спаем, который выполняет настоящий хук, пока спека его не
настроит. Чтобы дать `vi.fn()` из фабрики `calledWith` и `resolveWith`,
[`adoptMock(hooks.useMovies)`](/ru/utilities/module-mocks#adoptmock-mock-options) забирает его на
месте. Оба способа — на [странице о моках модулей](/ru/utilities/module-mocks).

### Хук, который возвращает кортеж {#a-hook-that-returns-a-tuple}

Хук в форме `useState` возвращает `[value, loading, error]`, и этот кортеж — данные. Напишите его
руками — тип возврата самого хука проверит каждую позицию:

```tsx
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

Автомок здесь не нужен. `const [data, loading] = hook()` деструктурирует через `Symbol.iterator`, а
дубль на Proxy не итерируем — `createAutoMock<[T, boolean]>()` бросает `TypeError: … is not iterable`
прямо на строке деструктуризации, и `mockDeep` тоже. Член `mockDeep` становится массивом только после
чтения по индексу и держит только прочитанные индексы, так что кортежем не становится и он. Автомок — для объекта, который возвращает хук и в котором живут функции;
кортеж — это три значения.

### Значение, которое протекает в следующий тест {#the-value-that-leaks-into-the-next-test}

`vi.fn()`, созданный в фабрике `vi.mock`, живёт весь файл, поэтому `mockReturnValue` из одного теста
продолжает отвечать и в следующем — классический баг «последнее замоканное значение `useSearch` всё
ещё активно», который выглядит как тест, проходящий в одиночку и падающий в составе файла. Vitest 5
по умолчанию очищает вызовы перед каждым тестом (`clearMocks: true`), но очистка не сбрасывает
реализацию. Либо включите `mockReset: true` в конфиге Vitest, либо настраивайте хук в каждом тесте,
который рендерит, как в примерах выше.

У возвращаемых значений, собранных через `autoMocked` / `createAutoMock` внутри теста, такой проблемы
нет: это каждый раз новые объекты. Для дублей, которые переживают тест, — спая, собранного один раз на
файл, — сброс описывают [`setupAutoSpy()`](/ru/utilities/setup) и
[`resetAutoSpy`](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

::: tip Что спаить не надо
Спайте классы, которыми владеете, а хук мокайте только там, где он — коллаборатор компонента.
Заспаенный компонент ничего не говорит о рендеринге, а тест хука, в котором замокан сам хук, проверяет
собственный мок — тестируйте хук через `renderHook` и заспаенную зависимость, как в разделе выше.
:::
