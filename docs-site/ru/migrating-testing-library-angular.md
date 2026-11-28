---
title: Миграция с @testing-library/angular
description: Замените моки из @testing-library/angular/vitest-utils на типизированные спаи vitest-auto-spy. Оставьте render, screen и запросы к DOM.
---

# Миграция с `@testing-library/angular`

Замените моки из `@testing-library/angular/vitest-utils` на типизированные спаи `vitest-auto-spy`.
Это пригодится, если мок пропускает геттеры или подменяет `toString`. Оставьте `render`, `screen`
и запросы к DOM. В существующем тесте замените провайдер и проверяйте вызовы через `injectSpy`:

::: code-group

```ts [Было — /vitest-utils]
import { render } from '@testing-library/angular';
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';
import { of } from 'rxjs';
import { vi } from 'vitest';

const load = vi.fn().mockReturnValue(of({ name: 'Ann' }));

await render(ProfileComponent, { providers: [provideMockWithValues(UserService, { load })] });
```

```ts [Стало — vitest-auto-spy]
import { render } from '@testing-library/angular';
import { of } from 'rxjs';
import { expect } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

await render(ProfileComponent, {
  providers: [provideAutoSpy(UserService, { returns: { load: of({ name: 'Ann' }) } })],
});
expect(injectSpy(UserService).load).toHaveBeenCalledOnce();
```

:::

Задайте результат метода через `returns`, чтобы он был доступен уже при первом рендере.
`injectSpy(UserService)` возвращает тот же типизированный спай: после рендера можно изменить
результат или проверить вызовы. Если провайдер написан вручную, например
`{ provide: UserService, useValue: { load: vi.fn(() => of(user)) } }`, замените его на
`provideAutoSpy(UserService, { returns: { load: of(user) } })`.

## Установить и оставить {#install-and-keep}

```bash
npm i -D vitest-auto-spy
```

Оставьте `@testing-library/angular`: из него по-прежнему нужен `render`. Уберите только импорты
из `/vitest-utils` в тех тестах, которые переносите.

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

- **`overrides`** заменяет свойство или метод готовым значением, как `values` в
  `createMockWithValues`. Если там был спай, он заменится целиком.
- **`returns`** задаёт результат вызова, но оставляет метод спаем. В `/vitest-utils` такой опции нет.

Можно передать обе опции в одном вызове. Указывайте каждое имя только в одной из них.
Если `createMockWithValues` нужен был только для задания результата метода, используйте `returns`.

### Провайдер, до и после {#a-provider-before-and-after}

В этом тесте `currentUserId` — обычное поле, а `load` — метод, вызовы которого нужно проверить.

```ts
// Before
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
// After
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

`render` и проверка текста на странице не меняются. `returns` оставляет `load` типизированным
спаем без ручного `vi.fn()`, а `injectSpy` позволяет получить его без приведения типа.

- Ненастроенный метод возвращает `undefined`, как `vi.fn()`. Чтобы вызов сразу бросал ошибку,
  добавьте [`strict: true`](/ru/core/strict-mode).
- Если `injectSpy` получает настоящий сервис вместо спая, он предупреждает в консоли. Например,
  это случается, если забыть провайдер для токена.
  [Диагностика](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing) может сделать такое
  предупреждение ошибкой теста.

## Чему здесь нет пары — и не должно быть {#what-has-no-twin-here-and-should-not}

- **`render`, `screen`, запросы, `fireEvent`, `rerender`, `navigate`.** Оставьте их, чтобы проверять
  интерфейс так, как его видит пользователь. [`renderShallow`](/ru/adapters/angular#shallow-component-rendering)
  помогает проверить поведение компонента без рендеринга его дочерних компонентов. Он не заменяет
  `render` из `@testing-library/angular`.
- **`@testing-library/dom` и `@testing-library/user-event`.** Оставьте без изменений.
- **`aliasedInput`, `configure`, `getConfig`, привязки `componentInputs` и `on`.** Оставьте эти
  настройки рендеринга.
- **`jest-utils`.** Если тесты остаются на Jest, используйте `@testing-library/angular/jest-utils`.
  `vitest-auto-spy` поддерживает Vitest, `bun:test` и `node:test`, но не предоставляет публичного API
  для подключения другого раннера.

## Zoneless — где он впереди поля {#zoneless-—-where-it-is-ahead-of-the-field}

Моки можно заменить и в тестах без zone.js. Спаи не используют `NgZone`. Хелперы для Angular в
первую очередь рассчитаны на [приложения с `provideZonelessChangeDetection`](/ru/adapters/angular#zoneless-waiting).
Для `fakeAsync` по-прежнему нужен zone.js. Подключите патч из
[`vitest-auto-spy/zone`](/ru/utilities/zone).

`@testing-library/angular` — единственная сторонняя библиотека на странице [сравнения](/ru/comparison)
с поддержкой тестов без zone.js. Импорт `./zoneless` появился в версии 19.2.0 (**2026-03-17**).
В `exports` версии 19.1.1 его ещё нет.

У `render` из `./zoneless` меньше возможностей, чем у основного `render`:

- Возвращает `{ fixture, container, debug }` и запросы, привязанные к контейнеру.
- Принимает `queries`, `configureTestBed`, `imports`, `providers`, `bindings`, `importOverrides`,
  `wrapper`, `wrapperProperties`, `skipDetectChanges` и `waitForStableOnRender`.
- Не предоставляет `rerender`, `detectChanges`, `navigate`, `autoDetectChanges`, `routes`,
  `componentProperties` и обёртку `fireEvent`, которая запускает проверку изменений после каждого
  события. В таком тесте запускайте проверку изменений сами.

## Что вы выигрываете {#what-you-gain}

- **Спаи на геттеры и сеттеры.** Выберите их через `gettersToSpyOn`, `settersToSpyOn` или
  `autoSpyAccessors`. Проверяйте вызовы через `accessorSpies`. `createMock` пропускает геттеры и
  сеттеры, хотя его тип говорит обратное.
- **Обычные `toString` и `hasOwnProperty`.** Спай не подменяет методы `Object.prototype`. В
  [примере ниже](#the-two-defects-and-how-to-reproduce-them) у него три собственных ключа вместо тринадцати.
- **Типы соответствуют объекту.** [`Spy<T>`](/ru/core/spy-typing) различает методы и свойства.
  `Mock<T>` добавляет `& Mock` к типу каждого из них.
- **Хелперы для результата метода.** Для `Promise` есть `resolveWith` и `rejectWith`, для
  `Observable` — `nextWith` и `throwWith`. `calledWith(…)` задаёт результат для конкретных
  аргументов, а `mustBeCalledWith` бросает ошибку при неожиданных аргументах.
- **Ошибка на месте вызова.** С [`strict: true`](/ru/core/strict-mode) ненастроенный метод бросает
  ошибку вместо того, чтобы возвращать `undefined`.
- **Моки без класса.** [`createAutoMock<T>()`](/ru/core/auto-mock-by-type) позволяет создать мок по
  интерфейсу или типу токена внедрения. `createMock` требует класс: ему нужен `type.prototype`.
- **Спаи по мере обращения.** По умолчанию спай метода создаётся при первом обращении к нему.
  `lazySpies: false` создаёт все спаи сразу.
- **Предупреждение о забытом провайдере.**
  [`injectSpy`](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing) предупреждает, если
  вместо спая получает настоящий сервис.
- **Тот же API за пределами Angular.** Используйте его с [`bun:test`](/ru/runtimes/bun),
  [`node:test`](/ru/runtimes/node), NestJS, React, Vue и Svelte. Angular `TestBed` тоже работает
  [под `bun test`](/ru/runtimes/bun-angular).
- **[Правила линтера](/ru/utilities/eslint-plugin).** Они выходят в той же версии, что и API,
  который рекомендуют использовать.

## Весь `/vitest-utils` целиком {#the-whole-of-vitest-utils}

Из 52 строк модуля `/vitest-utils` вот те, что создают мок:

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

`createSpyFromClass` заменяет `createMock`: обе функции создают моки методов по прототипу класса.
Три остальных хелпера используют `createMock`:

- `createMockWithValues` создаёт мок и заменяет указанные свойства или методы переданными значениями.
- `provideMock` возвращает мок в провайдере `{ provide: type, useValue: … }`.
- `provideMockWithValues` возвращает такой же провайдер, но с переданными значениями.

В `@testing-library/angular/jest-utils` тот же код, только вместо `vi.fn()` используется `jest.fn()`.

## Два дефекта и как их воспроизвести {#the-two-defects-and-how-to-reproduce-them}

Этот пример воспроизводит оба дефекта в опубликованном модуле 19.4.2. Вывод получен 2026-09-04.
Первая строка перенесена, чтобы её было удобнее читать.

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

У класса три метода, включая унаследованные. У мока тринадцать собственных ключей.

**Геттеры и сеттеры отсутствуют.** `createMock` подменяет только свойства с функцией в
`descriptor.value`. У геттеров и сеттеров вместо `value` есть `get` или `set`. Поэтому на моке нет
ни геттера `isLoggedIn`, ни сеттера `token`, хотя тип обещает оба. При чтении `session.isLoggedIn`
код получает `undefined` вдали от места, где создали мок.

В `createSpyFromClass` укажите нужные имена или включите спаи на все геттеры и сеттеры:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const session = createSpyFromClass(AdminSession, { gettersToSpyOn: ['isLoggedIn'] });
// or { autoSpyAccessors: true } to spy on every getter and setter of the class and its parents

session.accessorSpies.getters.isLoggedIn.mockReturnValue(false);
```

Читайте и записывайте свойства как обычно. Для проверок обращайтесь к `accessorSpies`.
Подробнее: [Спаи на аксессоры](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).

**Мок подменяет и методы `Object.prototype`.** `createMock` обходит цепочку прототипов до `null`,
захватывая `Object.prototype`. Десять его методов становятся спаями `vi.fn()`. Их имена видны
в выводе выше рядом с `login`, `logout` и `promote`.

- Из-за подмены `toString` мок выводится как `undefined` в сообщениях об ошибках, снапшотах и логах.
- Подменённый `hasOwnProperty` возвращает `undefined` даже для существующего ключа. Проверка
  `obj.hasOwnProperty(key)` не проходит ни в вашем коде, ни в коде библиотек.
- Между тестами `vi.clearAllMocks()` очищает десять лишних моков на каждый объект.

`createSpyFromClass` пропускает методы `Object.prototype`. В этом примере у спая остаются три ключа.

## `Mock` утверждает, что вызвать можно любой член {#mock-t-says-every-member-is-callable}

```ts
// types/testing-library-angular-vitest-utils.d.ts:4
type Mock<T> = T & {
  [K in keyof T]: T[K] & Mock$1;
};
```

`Mock<T>` добавляет тип Vitest `Mock` даже к полям и геттерам, которых нет на моке.
Поэтому `session.isLoggedIn.mockReturnValue(false)` компилируется, но при запуске падает:
`session.isLoggedIn` равно `undefined`.

В [`Spy<T>`](/ru/core/spy-typing) поле остаётся полем. Метод получает хелперы для своего типа
результата. Спаи геттеров и сеттеров доступны через `accessorSpies`.

## Жадно, и выхода нет {#eager-with-no-way-out}

`createMock` всегда создаёт спаи для всех методов сразу. У сервиса с большим числом методов на это
уходит больше времени и памяти, даже если тест вызывает только один метод. `vitest-auto-spy` по
умолчанию создаёт спаи при первом обращении к методам. Чтобы создать все сразу, передайте
`{ lazySpies: false }`. Замеры времени создания и памяти для спаев, к которым тест не обращался,
есть на странице [Производительность](/ru/core/performance).

## Версии, по которым это писалось {#versions-this-was-written-against}

`@testing-library/angular` **19.4.2** вышла **2026-08-07**. На 2026-09-04 у неё был тег `latest`.
Импорт `./zoneless` появился в **19.2.0** (**2026-03-17**).

Как проверили:

- Упаковали `@testing-library/angular@19.4.2` через `npm pack` и прочитали
  `fesm2022/testing-library-angular-vitest-utils.mjs` и его `.d.ts` из архива.
- Проверили даты публикации через `npm view … time`.
- Сравнили `exports` в 19.1.1 и 19.2.0, чтобы найти первое появление `./zoneless`.
- Импортировали опубликованный модуль и напечатали результат `createMock`, приведённый выше.

## Смотрите также {#see-also}

- [Сравнение → Angular](/ru/comparison#angular): ng-mocks, Spectator и даты последних релизов.
- [Адаптер Angular](/ru/adapters/angular): `provideAutoSpy`, `injectSpy`, ожидание в тестах без
  zone.js и ресурсы.
- [`createSpyFromClass`](/ru/core/create-spy-from-class) и
  [`createAutoMock`](/ru/core/auto-mock-by-type): создание спая по классу и мока по типу.
- [Миграция с @ngneat/spectator](/ru/migrating-spectator), если он тоже используется в тестах.
