---
title: Миграция с @testing-library/angular
description: Пересекается с этим пакетом ровно половина @testing-library/angular — его точка входа /vitest-utils с createMock и provideMock, 52 строки. Во что они переводятся, два дефекта, воспроизводимых в REPL, и то, что остаётся у вас.
---

# Миграция с `@testing-library/angular`

Это единственная страница про миграцию здесь, которая советует оставить библиотеку, с которой вы
пришли.

[`@testing-library/angular`](https://github.com/testing-library/angular-testing-library) — инструмент
рендеринга: `render`, `screen`, набор запросов и стоящая за ними дисциплина «смотри глазами
пользователя». Ничему из этого здесь нет близнеца, и ничто из этого переезжать не должно.
Пересекается одна вторичная точка входа, `@testing-library/angular/vitest-utils`, четыре экспорта
которой делают ту же работу, что [`createSpyFromClass`](/ru/core/create-spy-from-class) и
[`provideAutoSpy`](/ru/adapters/angular). В этой точке входа 52 строки, она жадная, она игнорирует
аксессоры и она мокает `hasOwnProperty`. Страница — про эти 52 строки.

::: info Как это проверялось
`npm pack @testing-library/angular@19.4.2` и чтение распакованных
`fesm2022/testing-library-angular-vitest-utils.mjs` и соответствующего `.d.ts`; `npm view … time` для
дат публикации; карты `exports` версий 19.1.1 и 19.2.0 рядом — ради точки входа `./zoneless`; и вывод
`createMock` ниже, полученный импортом опубликованного модуля и печатью того, что вернулось, а не
чтением кода с предсказанием результата. Проверено **2026-09-04** на 19.4.2, опубликованной
2026-08-07.
:::

## Весь `/vitest-utils` целиком {#the-whole-of-vitest-utils}

Он достаточно короткий, чтобы процитировать его полностью, — для конкурента это необычно и как раз
поэтому каждое утверждение на этой странице легко перепроверить:

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

`createMockWithValues` вызывает эту функцию и присваивает переданные значения поверх. `provideMock`
заворачивает её в `{ provide: type, useValue: … }`. `provideMockWithValues` делает и то и другое. Это
вся точка входа целиком. Точка входа `@testing-library/angular/jest-utils` — тот же файл, где
`vi.fn()` заменён на `jest.fn()`, в остальном байт в байт.

Жадный обход прототипа, дающий мешок моков, — ровно то, что делает `createSpyFromClass`, поэтому эти
двое конкуренты, а не дополнение друг к другу.

## Установить и оставить {#install-and-keep}

```bash
npm i -D vitest-auto-spy
```

Удалять ничего не нужно. `@testing-library/angular` остаётся ради `render`; уходит только импорт
`/vitest-utils`, а если сюита его никогда не импортировала, мигрировать вообще нечего. В
`dependencies` пакета лежит один `tslib`, а его peer-зависимости — это `@angular/*` плюс
`@testing-library/dom`, так что отказ от импорта подпути не экономит вам ни одной установки. Этот
переезд — про то, что делает дубль, а не про вес зависимостей.

## Перевод {#the-translation}

| `@testing-library/angular/vitest-utils`        | `vitest-auto-spy`                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `createMock(Service)`                          | [`createSpyFromClass(Service)`](/ru/core/create-spy-from-class)       |
| `createMock<SomeInterface>(…)` — невозможно    | [`createAutoMock<SomeInterface>()`](/ru/core/auto-mock-by-type)       |
| `createMockWithValues(Service, { a: 1 })`      | `createSpyFromClass(Service, { overrides: { a: 1 } })`                |
| `provideMock(Service)`                         | [`provideAutoSpy(Service)`](/ru/adapters/angular)                     |
| `provideMockWithValues(Service, { a: 1 })`     | `provideAutoSpy(Service, { overrides: { a: 1 } })`                    |
| — эквивалента нет                              | `provideAutoSpy(Service, { returns: { load: of([]) } })`              |
| — эквивалента нет                              | [`provideAutoSpyForToken(TOKEN)`](/ru/adapters/angular)               |
| `TestBed.inject(Service)` с ручным приведением | [`injectSpy(Service)`](/ru/adapters/angular)                          |
| `Mock<T>`                                      | [`Spy<T>`](/ru/core/spy-typing)                                       |
| `mock.method.mockReturnValue(v)`               | то же самое, плюс `resolveWith` / `nextWith` / `calledWith`           |
| — эквивалента нет                              | [`gettersToSpyOn` / `settersToSpyOn`](/ru/core/create-spy-from-class) |
| — эквивалента нет                              | [`strict: true`](/ru/core/strict-mode)                                |

Две строки заслуживают того, чтобы их назвать по именам. `values` у `createMockWithValues`
присваиваются поверх готового мока, затирая то, что там было, — это `overrides`, затравка, которая
хранится дословно и спаем после этого **не является**. А слова у неё нет для `returns` — того, что
настраивает ответ метода, остающегося спаем. Если сюита тянется к `createMockWithValues`, чтобы
подставить возвращаемое значение, ей нужна была строка `returns`.

### Провайдер, до и после {#a-provider-before-and-after}

```ts
// Было
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';

await render(CartComponent, {
  providers: [provideMockWithValues(PricingService, { currency: 'EUR' })],
});

const pricing = TestBed.inject(PricingService) as Mock<PricingService>;
pricing.total.mockReturnValue(150);
```

```ts
// Стало
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

await render(CartComponent, {
  providers: [provideAutoSpy(PricingService, { overrides: { currency: 'EUR' }, returns: { total: 150 } })],
});

const pricing = injectSpy(PricingService);
```

`render` не тронут — это правка массива провайдеров и ничего больше. Меняется то, что дубль засеян в
самом провайдере, а не строкой ниже; что `injectSpy` не требует приведения типа; и что `injectSpy`
[сообщает о токене, который вы забыли передать](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing),
вместо того чтобы вернуть настоящий сервис под типом спая.

## Два дефекта и как их воспроизвести {#the-two-defects-and-how-to-reproduce-them}

Оба сидят в двадцати строках, процитированных выше, и оба воспроизведены 2026-09-04 импортом
опубликованного модуля 19.4.2 с печатью результата. Запустите сами; вывод ниже — это то, что
вернулось, только первая строка перенесена, чтобы влезть.

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

Тринадцать собственных ключей у класса с тремя методами.

**Аксессоры не обрабатываются.** Обход присваивает мок только тогда, когда
`typeof descriptor?.value === 'function'` (строка 14). У дескриптора геттера есть `get`, а не
`value`, поэтому `isLoggedIn` и сеттер `token` молча пропускаются. На дубле их нет, а компилятор —
см. раздел про типизацию ниже — по-прежнему говорит, что они есть. Падение всплывает как `undefined`
в том месте, где читают `session.isLoggedIn`, на кадр-другой в стороне от дубля, который их потерял.

`createSpyFromClass` называет их явно — или находит сам:

```ts
const session = createSpyFromClass(AdminSession, { gettersToSpyOn: ['isLoggedIn'] });
// или { autoSpyAccessors: true }, чтобы взять каждый аксессор по цепочке прототипов

session.accessorSpies.getters.isLoggedIn.mockReturnValue(false);
```

Свойство продолжает читаться и писаться как обычно; `accessorSpies` — отдельный мешок, в котором
живут проверки. См. [Спаи на аксессоры](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).

**Нет защиты от `Object.prototype`.** `mockFunctions(Object.getPrototypeOf(proto))` (строка 18)
рекурсирует, пока прототип не станет `null`, а `Object.prototype` — последняя остановка перед этим,
так что `hasOwnProperty`, `toString`, `valueOf`, `isPrototypeOf`, `propertyIsEnumerable`,
`toLocaleString` и четыре аксессора `__define*` / `__lookup*` заменяются на дубле на `vi.fn()`.
Десять из тринадцати ключей выше — это они.

И это не косметика. Замоканный `toString` возвращает `undefined`, поэтому дубль превращается в
`undefined` в каждом сообщении об ошибке, снапшоте и строке лога, где он встречается. Замоканный
`hasOwnProperty` возвращает `undefined`, поэтому любой код — ваш или библиотечный, — который
проверяет `obj.hasOwnProperty(key)`, уходит в ложную ветку на дубле, у которого этот ключ есть. А
`vi.clearAllMocks()` между тестами теперь ещё и чистит по десять моков на каждый дубль, которых никто
не просил.

`createSpyFromClass` останавливается на один прототип раньше по построению: `walkOwnPrototypes`
(`src/lib/create-spy-from-class.ts:81`) заходит в прототип, только пока у того есть родитель, поэтому
собственные члены `Object.prototype` не собираются вообще. У дубля выше три ключа.

## `Mock` утверждает, что вызвать можно любой член {#mock-says-every-member-is-callable}

```ts
// types/testing-library-angular-vitest-utils.d.ts:4
type Mock<T> = T & {
  [K in keyof T]: T[K] & Mock$1;
};
```

Каждый член `T` пересекается с `Mock` из Vitest — включая те, которые рантайм-фабрика никогда не
присваивала: поля-данные, геттеры, всё, у чьего дескриптора нет функции в `value`. Тип обещает, что
`session.isLoggedIn.mockReturnValue(false)` скомпилируется, — и оно компилируется, и падает в рантайме
на `undefined`. Два дефекта складываются: аксессора нет, а тип — причина, по которой вы узнаёте об
этом только на прогоне.

[`Spy<T>`](/ru/core/spy-typing) отображает каждый член по тому, чем он является на самом деле: метод
становится спаем с хелперами, которые заслужил его возвращаемый тип, поле-данные остаётся
полем-данными, а до аксессора добираются через `accessorSpies` — вместо того чтобы типизировать его
вызываемым и не создавать вовсе.

## Жадно, и выхода нет {#eager-with-no-way-out}

`createMock` строит каждый метод сразу; опции для этого нет, потому что опций нет вообще. На широком
Angular-сервисе это реальная цена, и она [измерена](/ru/core/performance): на классе из 40 методов,
где спека вызывает три, ленивая сборка дубля стоит **6,04 мкс** против **11,50 мкс** у жадной.
Ленивая здесь по умолчанию, `{ lazySpies: false }` отключает её, а `'proxy'` — третья ступень для
очень широких классов.

Вторая половина этого — память, а не время, и именно она решает судьбу большой сюиты: важно, сколько
_удерживает_ нетронутый дубль, а не сколько стоит его собрать. См.
[Производительность](/ru/core/performance).

## Чему здесь нет пары — и не должно быть {#what-has-no-twin-here-and-should-not}

- **`render`, `screen`, запросы, `fireEvent`, `rerender`, `navigate`.** Этот пакет ставит спаи на
  классы; он не рендерит компоненты так, как их видит пользователь. Оставьте их.
  [`renderShallow`](/ru/adapters/angular#shallow-component-rendering) — не замена: это поверхностный
  хелпер над `TestBed` для другого вопроса, «что делает этот компонент», тогда как
  `@testing-library/angular` отвечает на «что видит пользователь».
- **`@testing-library/dom` и `@testing-library/user-event`.** Не тронуты.
- **`aliasedInput`, `configure`, `getConfig`, привязки `componentInputs` / `on`.** Это настройка
  рендеринга; здесь с ней ничто не конкурирует.
- **Точка входа `jest-utils`.** Точки входа для Jest здесь сегодня нет: ядро не зависит от раннера и
  прячется за внутренним `MockAdapter`, адаптеры для Vitest, `bun:test` и `node:test` поставляются, —
  но `registerMockAdapter` не экспортируется ни из одной публичной точки входа, так что у проекта на
  Jest нет поддерживаемого способа подключить свой. Если сюита на Jest и остаётся на Jest,
  `@testing-library/angular/jest-utils` сохраняет оба своих дефекта, а этот переезд вам недоступен.

## Zoneless — где он впереди поля {#zoneless-—-where-it-is-ahead-of-the-field}

`@testing-library/angular` — единственная сторонняя библиотека на странице [сравнения](/ru/comparison)
с историей про zoneless, и история настоящая: точка входа `./zoneless`, отсутствующая в карте
`exports` версии 19.1.1 и присутствующая в 19.2.0, опубликованной **2026-03-17**. Обе карты прочитаны
из опубликованных тарболов.

Прежде чем строить на этом планы, стоит знать, что это за точка входа. `render` там — урезанная
версия основного: его результат — `{ fixture, container, debug }` плюс связанные запросы, а опции —
`queries`, `configureTestBed`, `imports`, `providers`, `bindings`, `importOverrides`, `wrapper`,
`wrapperProperties`, `skipDetectChanges` и `waitForStableOnRender`. Из zoneless-точки входа, по
сравнению с основной, пропали `rerender`, `detectChanges`, `navigate`, `autoDetectChanges`, `routes`,
`componentProperties` и обёртка `fireEvent`, которая перезапускала обнаружение изменений после
каждого события. Zoneless-спека, написанная под неё, гоняет обнаружение изменений сама.

Спай-путь этого пакета `NgZone` тоже нигде не трогает, так что оба сосуществуют без выбора:
[приложения с `provideZonelessChangeDetection`](/ru/adapters/angular#zoneless-waiting) здесь режим по
умолчанию, а `fakeAsync` — которому по-прежнему нужен zone.js — живёт за
[`vitest-auto-spy/zone`](/ru/utilities/zone). Zoneless — не повод оставлять `/vitest-utils`.

## Что вы выигрываете {#what-you-gain}

- **Аксессоры существуют.** `gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors` и мешок
  `accessorSpies`, на котором можно проверять, — против фабрики, которая их пропускает, и типа,
  который утверждает обратное.
- **`Object.prototype` на дубль не попадает.** Никакого замоканного `toString`, никакого замоканного
  `hasOwnProperty`, три ключа вместо тринадцати.
- **Тип, который совпадает с объектом.** [`Spy<T>`](/ru/core/spy-typing) по каждому члену вместо
  `T[K] & Mock` подряд.
- **Хелперы, знающие возвращаемый тип** — `resolveWith` / `rejectWith` у метода с `Promise`,
  `nextWith` / `throwWith` у метода с `Observable`, `calledWith(…)` для разбора по аргументам,
  `mustBeCalledWith`, чтобы падать на несовпадении, а не отвечать на него.
- **[`strict: true`](/ru/core/strict-mode)**, чтобы метод, который никто не настроил, падал на
  вызове, а не возвращал `undefined` в чью-то чужую проверку.
- **Мок по одному типу.** [`createAutoMock<T>()`](/ru/core/auto-mock-by-type) для интерфейса или
  токена внедрения — то, чего фабрика, читающая `type.prototype`, не может структурно.
- **Лениво по умолчанию**, с `lazySpies: false` и `'proxy'` как двумя другими ступенями.
- **[`injectSpy`, который сообщает о забытом провайдере](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing)**,
  а не типизирует настоящий сервис как дубль.
- **То же API вне Angular** — [`bun:test`](/ru/runtimes/bun), [`node:test`](/ru/runtimes/node),
  NestJS, React, Vue, Svelte, а `TestBed` из Angular — [под `bun test`](/ru/runtimes/bun-angular).
- **[Двадцать пять правил линтера](/ru/utilities/eslint-plugin)**, версионируемые вместе с тем API,
  который они советуют.

## Версии, по которым это писалось {#versions-this-was-written-against}

`@testing-library/angular` **19.4.2**, опубликована **2026-08-07** — `latest` на 2026-09-04. Точка
входа `./zoneless` появилась в **19.2.0**, опубликованной **2026-03-17**. Всё написанное выше
прочитано из этих опубликованных тарболов, а вывод `createMock` получен запуском опубликованного
модуля, а не предсказан.

## Смотрите также {#see-also}

- [Сравнение → Angular](/ru/comparison#angular) — эта библиотека рядом с ng-mocks и Spectator, с
  датами последних релизов по всему полю.
- [Angular-адаптер](/ru/adapters/angular) — `provideAutoSpy`, `injectSpy`, ожидание в zoneless,
  ресурсы.
- [`createSpyFromClass`](/ru/core/create-spy-from-class) и
  [`createAutoMock`](/ru/core/auto-mock-by-type) — две фабрики, на которые указывает таблица выше.
- [Миграция с @ngneat/spectator](/ru/migrating-spectator) — если сюита тащит ещё и его.
