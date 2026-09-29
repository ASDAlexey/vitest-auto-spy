---
title: Миграция с @testing-library/angular
description: Замена createMock и provideMock из @testing-library/angular/vitest-utils на vitest-auto-spy, а render, screen и запросы остаются - соответствие API, спека до и после и два дефекта, которые это исправляет.
---

# Миграция с `@testing-library/angular`

Эта страница заменяет хелперы моков из `@testing-library/angular/vitest-utils` (`createMock`,
`provideMock` и их версии `WithValues`) на `vitest-auto-spy`. `render`, `screen` и запросы остаются;
меняются только `providers`. Переезжайте, если ваши моки теряют геттеры или ломаются на `toString`
или если нужны типизированные спаи. Провайдер меняется так:

::: code-group

```ts [Было — /vitest-utils]
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';

const load = vi.fn().mockReturnValue(of({ name: 'Ann' }));

await render(ProfileComponent, { providers: [provideMockWithValues(UserService, { load })] });
```

```ts [Стало — vitest-auto-spy]
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

await render(ProfileComponent, {
  providers: [provideAutoSpy(UserService, { returns: { load: of({ name: 'Ann' }) } })],
});
expect(injectSpy(UserService).load).toHaveBeenCalledOnce();
```

:::

Задавайте ответы в провайдере — тогда компонент видит их уже при первом рендере.
`injectSpy(UserService)` возвращает тот же спай, уже с типом, чтобы потом поменять ответ или проверить
вызовы. То же касается самописного
`{ provide: UserService, useValue: { load: vi.fn(() => of(user)) } }`: замените его на
`provideAutoSpy(UserService, { returns: { load: of(user) } })`. `render` и `screen` остаются как
есть.

## Установить и оставить {#install-and-keep}

```bash
npm i -D vitest-auto-spy
```

Удалять ничего не нужно. `@testing-library/angular` остаётся ради `render`; уходит только импорт
`/vitest-utils`. Переезд — про то, что делает мок, а не про то, чтобы ставить меньше пакетов.

## Перевод {#the-translation}

| `@testing-library/angular/vitest-utils`        | `vitest-auto-spy`                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `createMock(Service)`                          | [`createSpyFromClass(Service)`](/ru/core/create-spy-from-class)       |
| `createMock<SomeInterface>(…)` — невозможно    | [`createAutoMock<SomeInterface>()`](/ru/core/auto-mock-by-type)       |
| `createMockWithValues(Service, { a: 1 })`      | `createSpyFromClass(Service, { overrides: { a: 1 } })`                |
| `provideMock(Service)`                         | [`provideAutoSpy(Service)`](/ru/adapters/angular)                     |
| `provideMockWithValues(Service, { a: 1 })`     | `provideAutoSpy(Service, { overrides: { a: 1 } })`                    |
| — аналога нет                                  | `provideAutoSpy(Service, { returns: { load: of([]) } })`              |
| — аналога нет                                  | [`provideAutoSpyForToken(TOKEN)`](/ru/adapters/angular)               |
| `TestBed.inject(Service)` с ручным приведением | [`injectSpy(Service)`](/ru/adapters/angular)                          |
| `Mock<T>`                                      | [`Spy<T>`](/ru/core/spy-typing)                                       |
| `mock.method.mockReturnValue(v)`               | то же самое, плюс `resolveWith` / `nextWith` / `calledWith`           |
| — аналога нет                                  | [`gettersToSpyOn` / `settersToSpyOn`](/ru/core/create-spy-from-class) |
| — аналога нет                                  | [`strict: true`](/ru/core/strict-mode)                                |

`overrides` и `returns` — разные вещи:

- **`overrides`** ставит члену готовое значение. Член перестаёт быть спаем. Именно это делает
  `createMockWithValues` со своими `values`.
- **`returns`** оставляет метод спаем и задаёт, что он отвечает. В `/vitest-utils` аналога нет.

Обе опции можно передать в одном вызове; каждая действует только на те члены, которые в ней названы.
Называйте каждый член только в одной из них.
Если тест берёт `createMockWithValues`, чтобы задать результат метода, используйте `returns`.

### Провайдер, до и после {#a-provider-before-and-after}

Полная спека со значением поля и ответом метода:

```ts
// Было
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';
import { of } from 'rxjs';

it('shows the user name', async () => {
  await render(ProfileComponent, {
    providers: [
      provideMockWithValues(UserService, {
        currentUserId: 7,
        load: vi.fn().mockReturnValue(of({ name: 'Ann' })),
      }),
    ],
  });

  expect(await screen.findByText('Ann')).toBeTruthy();
  expect((TestBed.inject(UserService) as Mock<UserService>).load).toHaveBeenCalledOnce();
});
```

```ts
// Стало
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('shows the user name', async () => {
  await render(ProfileComponent, {
    providers: [
      provideAutoSpy(UserService, {
        overrides: { currentUserId: 7 },
        returns: { load: of({ name: 'Ann' }) },
      }),
    ],
  });

  expect(await screen.findByText('Ann')).toBeTruthy();
  expect(injectSpy(UserService).load).toHaveBeenCalledOnce();
});
```

`render` не меняется. Меняется вот что:

- `load` задан через `returns`, поэтому остаётся спаем с типом; `vi.fn()` руками не нужен.
- `injectSpy` не требует приведения типа.
- Метод, который вы не настроили, возвращает `undefined`, как и `vi.fn()`. Добавьте
  [`strict: true`](/ru/core/strict-mode), чтобы такой вызов падал.
- Если вы забыли подменить токен, `injectSpy` пишет предупреждение в консоль, а не молча возвращает
  настоящий сервис под типом мока. [Диагностика](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing)
  может превратить предупреждение в падение теста.

## Чему здесь нет пары — и не должно быть {#what-has-no-twin-here-and-should-not}

- **`render`, `screen`, запросы, `fireEvent`, `rerender`, `navigate`.** Этот пакет делает спаи из
  классов. Компоненты так, как их видит пользователь, он не рендерит, поэтому всё это оставьте.
  [`renderShallow`](/ru/adapters/angular#shallow-component-rendering) — не замена. Он отвечает на
  вопрос «что делает этот компонент», а `@testing-library/angular` — «что видит пользователь».
- **`@testing-library/dom` и `@testing-library/user-event`.** Без изменений.
- **`aliasedInput`, `configure`, `getConfig`, привязки `componentInputs` / `on`.** Это настройка
  рендеринга; здесь ей замены нет.
- **Точка входа `jest-utils`.** Точки входа для Jest здесь нет. Пакет поддерживает Vitest, `bun:test`
  и `node:test`, и публичного способа подключить другой раннер нет. Если ваши тесты остаются на Jest,
  оставьте `@testing-library/angular/jest-utils`: этот переезд вам недоступен.

## Zoneless — где он впереди поля {#zoneless-—-where-it-is-ahead-of-the-field}

`@testing-library/angular` — единственная сторонняя библиотека на странице [сравнения](/ru/comparison)
с поддержкой zoneless. Точка входа `./zoneless` впервые появилась в 19.2.0, опубликованной
**2026-03-17** (в карте `exports` версии 19.1.1 её нет).

`render` в этой точке входа — урезанная версия основного:

- Возвращает `{ fixture, container, debug }` плюс привязанные запросы.
- Опции: `queries`, `configureTestBed`, `imports`, `providers`, `bindings`, `importOverrides`,
  `wrapper`, `wrapperProperties`, `skipDetectChanges` и `waitForStableOnRender`.
- Нет `rerender`, `detectChanges`, `navigate`, `autoDetectChanges`, `routes`, `componentProperties` и
  обёртки `fireEvent`, которая перезапускает обнаружение изменений после каждого события.
  Zoneless-спека под эту точку входа запускает обнаружение изменений сама.

Пакеты работают вместе в любом режиме. Спаи никогда не трогают `NgZone`, а хелперы этой библиотеки для Angular
написаны в первую очередь для [приложений с `provideZonelessChangeDetection`](/ru/adapters/angular#zoneless-waiting). `fakeAsync`, которому по-прежнему нужен zone.js, лежит в
[`vitest-auto-spy/zone`](/ru/utilities/zone). Zoneless — не повод оставлять `/vitest-utils`.

## Что вы выигрываете {#what-you-gain}

- **Аксессоры работают.** `gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors` и объект
  `accessorSpies` для проверок. `createMock` аксессоры пропускает, а его тип утверждает, что они есть.
- **`Object.prototype` на спай не попадает.** Ни замоканного `toString`, ни замоканного
  `hasOwnProperty`: три ключа вместо тринадцати в [примере ниже](#the-two-defects-and-how-to-reproduce-them).
- **Тип совпадает с объектом.** [`Spy<T>`](/ru/core/spy-typing) типизирует каждый член по тому, чем он
  является, а не `T[K] & Mock` для всех подряд.
- **Хелперы по типу возврата.** `resolveWith` / `rejectWith` у метода с `Promise`, `nextWith` /
  `throwWith` у метода с `Observable`, `calledWith(…)`, чтобы отвечать по аргументам,
  `mustBeCalledWith`, чтобы падать на неожиданных аргументах.
- **[`strict: true`](/ru/core/strict-mode)**: метод, который никто не настроил, бросает ошибку при
  вызове, а не возвращает `undefined` в чужую проверку.
- **Моки по одному типу.** [`createAutoMock<T>()`](/ru/core/auto-mock-by-type) работает для интерфейса
  или токена внедрения. Фабрика, которая читает `type.prototype`, так не может.
- **Лениво по умолчанию.** Спай метода создаётся, когда тест впервые к нему обращается;
  `lazySpies: false` создаёт все сразу.
- **[`injectSpy`, который сообщает о забытом провайдере](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing)**,
  а не выдаёт настоящий сервис за мок.
- **Тот же API вне Angular:** [`bun:test`](/ru/runtimes/bun), [`node:test`](/ru/runtimes/node),
  NestJS, React, Vue, Svelte, а `TestBed` из Angular — [под `bun test`](/ru/runtimes/bun-angular).
- **[Правила линтера](/ru/utilities/eslint-plugin)**, которые выходят в той же версии, что и API,
  который они советуют.

## Весь `/vitest-utils` целиком {#the-whole-of-vitest-utils}

В точке входа 52 строки. Вот её ядро:

```js
// @testing-library/angular 19.4.2, fesm2022/testing-library-angular-vitest-utils.mjs
function createMock(type) {
  const mock = {};
  function mockFunctions(proto) {
    if (!proto) {
      return;
    }
    for (const prop of Object.getOwnPropertyNames(proto)) {
      if (prop === 'constructor') {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
      if (typeof descriptor?.value === 'function') {
        mock[prop] = vi.fn();
      }
    }
    mockFunctions(Object.getPrototypeOf(proto));
  }
  mockFunctions(type.prototype);
  return mock;
}
```

Остальные три экспорта построены на нём:

- `createMockWithValues` вызывает `createMock` и присваивает переданные значения поверх.
- `provideMock` заворачивает результат в `{ provide: type, useValue: … }`.
- `provideMockWithValues` делает и то и другое.

`@testing-library/angular/jest-utils` — тот же файл, где вместо `vi.fn()` стоит `jest.fn()`.

`createMock` обходит прототип класса и ставит мок на каждый метод. `createSpyFromClass` делает ту же
работу, поэтому одно заменяет другое.

## Два дефекта и как их воспроизвести {#the-two-defects-and-how-to-reproduce-them}

Оба — в коде выше. Оба воспроизведены 2026-09-04: опубликованный модуль 19.4.2 импортирован, результат
напечатан. Можете запустить сами; ниже — то, что вернулось, только первая строка перенесена по ширине.

```ts
import { createMock } from '@testing-library/angular/vitest-utils';

class Session {
  #loggedIn = true;
  get isLoggedIn() {
    return this.#loggedIn;
  }
  set token(v: string) {}
  login() {}
  logout() {}
}
class AdminSession extends Session {
  promote() {}
}

const m = createMock(AdminSession);

console.log('own keys:', Object.keys(m).sort().join(', '));
console.log('isLoggedIn on mock:', m.isLoggedIn);
console.log('hasOwnProperty is a mock:', m.hasOwnProperty?.mock !== undefined);
console.log('toString is a mock:', m.toString?.mock !== undefined);
console.log('String(mock):', String(m));
```

```console
own keys: __defineGetter__, __defineSetter__, __lookupGetter__, __lookupSetter__, hasOwnProperty,
          isPrototypeOf, login, logout, promote, propertyIsEnumerable, toLocaleString, toString,
          valueOf
isLoggedIn on mock: undefined
hasOwnProperty is a mock: true
toString is a mock: true
String(mock): undefined
```

У класса три метода, а у мока — тринадцать собственных ключей.

**Геттеры и сеттеры пропускаются.** Обход добавляет мок, только если
`typeof descriptor?.value === 'function'`. У дескриптора геттера есть `get`, а не `value`, поэтому
`isLoggedIn` и сеттер `token` молча выпадают. Тип при этом говорит, что они есть (см. следующий
раздел). Ошибка всплывает как `undefined` там, где код читает `session.isLoggedIn`, — далеко от мока,
который его потерял.

`createSpyFromClass` ставит спаи на аксессоры, которые вы назвали, или находит все сам:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const session = createSpyFromClass(AdminSession, { gettersToSpyOn: ['isLoggedIn'] });
// или { autoSpyAccessors: true } — спаи на все геттеры и сеттеры класса и его родителей

session.accessorSpies.getters.isLoggedIn.mockReturnValue(false);
```

Свойство по-прежнему читается и пишется как обычно; спаи для проверок лежат в `accessorSpies`. См.
[Спаи на аксессоры](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).

**`Object.prototype` тоже мокается.** Обход идёт вверх, пока прототип не станет `null`, а
`Object.prototype` — последняя остановка перед этим. Поэтому `hasOwnProperty`, `toString`, `valueOf`,
`isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` и четыре метода `__define*` / `__lookup*`
становятся на моке `vi.fn()`. Это десять из тринадцати ключей выше.

Это ломает настоящий код:

- Замоканный `toString` возвращает `undefined`, поэтому мок печатается как `undefined` в каждом
  сообщении об ошибке, снапшоте и строке лога.
- Замоканный `hasOwnProperty` возвращает `undefined`. Любой код с проверкой `obj.hasOwnProperty(key)`,
  ваш или библиотечный, уходит в ложную ветку, даже если ключ есть.
- `vi.clearAllMocks()` между тестами чистит ещё по десять лишних моков на каждый объект.

`createSpyFromClass` никогда не ставит спаи на члены `Object.prototype`. У спая для класса выше три
ключа.

## `Mock` утверждает, что вызвать можно любой член {#mock-t-says-every-member-is-callable}

```ts
// types/testing-library-angular-vitest-utils.d.ts:4
type Mock<T> = T & {
  [K in keyof T]: T[K] & Mock$1;
};
```

Каждый член `T` типизирован как `Mock` из Vitest — включая те, которые `createMock` не создал: поля,
геттеры, всё, что не метод. Поэтому `session.isLoggedIn.mockReturnValue(false)` компилируется, а в
рантайме падает на `undefined`. Два дефекта складываются: геттера нет, а тип прячет это до запуска
теста.

[`Spy<T>`](/ru/core/spy-typing) типизирует каждый член по тому, чем он является. Метод становится
спаем с хелперами, которые подходят к его возвращаемому типу. Поле остаётся полем. До геттера или
сеттера добираются через `accessorSpies`.

## Жадно, и выхода нет {#eager-with-no-way-out}

`createMock` сразу создаёт мок на каждый метод, и опций, чтобы это изменить, у него нет. На широком
Angular-сервисе это стоит времени и памяти. Здесь спаи по умолчанию ленивые: спай метода создаётся,
когда тест впервые к нему обращается. `{ lazySpies: false }` это отключает. Цифры — и время сборки, и
память, которую держит нетронутый спай, — на странице [Производительность](/ru/core/performance).

## Версии, по которым это писалось {#versions-this-was-written-against}

`@testing-library/angular` **19.4.2**, опубликована **2026-08-07**, `latest` на 2026-09-04. Точка
входа `./zoneless` появилась в **19.2.0**, опубликованной **2026-03-17**.

Как это проверялось:

- `npm pack @testing-library/angular@19.4.2`, затем чтение распакованных
  `fesm2022/testing-library-angular-vitest-utils.mjs` и его `.d.ts`;
- `npm view … time` для дат публикации;
- карты `exports` версий 19.1.1 и 19.2.0 рядом — ради точки входа `./zoneless`;
- вывод `createMock` выше получен импортом опубликованного модуля и печатью результата, а не
  предсказан по коду.

## Смотрите также {#see-also}

- [Сравнение → Angular](/ru/comparison#angular): эта библиотека рядом с ng-mocks и Spectator, с
  датами последних релизов.
- [Адаптер Angular](/ru/adapters/angular): `provideAutoSpy`, `injectSpy`, ожидание в zoneless,
  ресурсы.
- [`createSpyFromClass`](/ru/core/create-spy-from-class) и
  [`createAutoMock`](/ru/core/auto-mock-by-type): две фабрики, на которые указывает таблица выше.
- [Миграция с @ngneat/spectator](/ru/migrating-spectator), если ваши тесты используют и его.
