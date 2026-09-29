---
title: Переход с jest-auto-spies
description: Пошаговая замена jest-auto-spies или @bugsplat/vitest-auto-spies и подводные камни каждого раннера.
---

# Переход с jest-auto-spies

Эта страница переводит тесты проекта с [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies)
(или [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies)) на
`vitest-auto-spy`. API тот же, поэтому в большинстве спек меняются только импорты:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // один раз, если есть observable-спаи
```

Что переезжает: хелперы для Angular (`provideAutoSpy`, `injectSpy`) берутся из
`vitest-auto-spy/angular`, а observable-хелперам (`nextWith` и другим) нужен один раз
`import 'vitest-auto-spy/rxjs'`. Ядро, `Spy<T>` и `asSpy` остаются в `vitest-auto-spy`. Импорты
перепишет кодмод:

```bash
npx vitest-auto-spy codemod --write
```

Самая частая ошибка компиляции после замены — приведение `TestBed.inject(X) as Spy<X>`. Замените его
на `injectSpy(X)`; см. [Достать спай обратно из контейнера](#reading-a-spy-back-out-of-the-container).

Переходите с `jasmine-auto-spies`? См. раздел [Переход с jasmine-auto-spies](#coming-from-jasmine-auto-spies)
ниже, а затем отдельную страницу [Переход с jasmine-auto-spies](/ru/migrating-jasmine).

## По шагам {#step-by-step}

1. **Установите пакет и удалите старый.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jest-auto-spies   # или @bugsplat/vitest-auto-spies
   ```

2. **Запустите [кодмод](/ru/utilities/codemod).** По умолчанию он ничего не пишет: первая команда
   только печатает дифф.

   ```bash
   npx vitest-auto-spy codemod            # прочитать дифф
   npx vitest-auto-spy codemod --write    # применить
   npx vitest-auto-spy codemod --verify   # проверить результат, а не дифф
   ```

   На Jest-файле он выполняет семь преобразований:
   - разделение импортов из шага 3;
   - `TestBed.inject(X) as Spy<X>` → `asSpy<X>(…)`;
   - `@jest/globals` → `vitest`;
   - вызовы `jest.*`, у которых есть двойник в `vi.*`;
   - перестановку в `jest.Mock<R, [A]>` из раздела [Имена типов](#the-type-names);
   - алиасы jasmine;
   - `mockImplementation()` без аргумента.

   Ещё шесть преобразований — для [диалекта jasmine](/ru/migrating-jasmine). `--from` выбирает диалект
   для каждого файла и по умолчанию равен `auto`; чтобы закрепить, передайте `--from jest-auto-spies`.

   Вызовы, [у которых нет двойника в `vi.*`](#the-jest-calls-that-have-no-vi-twin), остаются как
   есть. Кодмод называет каждый через `path:line` и завершается с кодом 1. Так и задумано: в этих
   местах нужно решение, а не переименование.

   Шаги ниже — что делает кодмод и что он оставляет вам. Прочитайте их в любом случае: отчёт на них
   ссылается.

3. **Перепишите импорты.** Ядро называется так же. Хелперы для Angular и observable-хелперы переехали
   на свои пути импорта.

   ```diff
   - import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
   + import { createSpyFromClass } from 'vitest-auto-spy';
   + import { provideAutoSpy } from 'vitest-auto-spy/angular';
   ```

   Какое имя где лежит, кодмод читает из карты `exports` установленного пакета.
   `npx vitest-auto-spy codemod --list` печатает всю таблицу.

   Самая частая ошибка — импорт хелпера не из той точки входа: `jest-auto-spies` экспортирует
   `provideAutoSpy` из корня. `npx vitest-auto-spy doctor` находит все такие импорты сразу и
   сообщает о них как `helper-from-wrong-entry` ([CLI → doctor](/ru/utilities/cli)).

4. **Добавьте импорт rxjs один раз**, в setup-файле, если какой-нибудь спай использует `nextWith`,
   `nextWithValues` или `observablePropsToSpyOn`:

   ```ts
   // vitest.setup.ts
   import 'vitest-auto-spy/rxjs';
   ```

   Vitest выполняет этот файл перед каждым файлом спеки, если он указан в `vitest.config.ts`:
   `test: { setupFiles: ['./vitest.setup.ts'] }`.

   Если забыть, первый же observable-хелпер бросит ошибку, в которой назван этот импорт.

5. **Проверьте точку входа своего раннера.** На Vitest вы уже импортируете `vitest-auto-spy`, делать
   ничего не нужно. На другом раннере импортируйте его точку входа вместо корня:
   - `vitest-auto-spy` для Vitest;
   - `vitest-auto-spy/bun` для `bun:test`;
   - `vitest-auto-spy/node` для `node:test`.

6. **Объявляйте переменные как `Spy<T>`.** `let service: MyService = createSpyFromClass(...)` не
   скомпилируется, если у класса есть члены `#private` или `private`: `Spy<T>` их отбрасывает.
   Пишите `let service: Spy<MyService>`. Если спай нужно передать туда, где ждут сам класс,
   используйте [`asInstance` / `asSpy`](/ru/core/spy-typing).

7. **Запустите тесты.** API хелперов тот же, так что всё, что упало, — настоящие проблемы.

8. **По желанию, когда всё зелёное:** добавьте [`setupAutoSpy()`](/ru/utilities/setup) в setup-файл
   и включите [правила ESLint](/ru/utilities/eslint-plugin), которые подсказывают более новые
   хелперы.

## Таблица соответствия {#mapping-table}

Таблица подходит и для [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies):
он реэкспортирует API `jest-auto-spies`. Кроме того, вы получаете Bun и `node:test`, `createAutoMock`,
хелперы для фреймворков и спаи консоли.

| jest-auto-spies                                                       | vitest-auto-spy                                                | Статус       |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| `createSpyFromClass`                                                  | `createSpyFromClass`                                           | ✅ одинаково |
| `methodsToSpyOn`                                                      | `methodsToSpyOn`: добавляет методы в обеих библиотеках         | ✅ одинаково |
| `provideAutoSpy`                                                      | `provideAutoSpy` (из `/angular`)                               | ✅ одинаково |
| `calledWith` / `mustBeCalledWith`                                     | то же                                                          | ✅ одинаково |
| `calledWith(...).returnValue(v)`                                      | то же; работают **и** `.returnValue`, **и** `.mockReturnValue` | ✅ одинаково |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                   | то же                                                          | ✅ одинаково |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | то же                                                          | ✅ одинаково |
| `throwWith` / `complete` / `returnSubject`                            | то же                                                          | ✅ одинаково |
| `accessorSpies.getters/setters`                                       | то же                                                          | ✅ одинаково |
| `createObservableWithValues`                                          | то же (из `/rxjs`)                                             | ✅ одинаково |
| мок под капотом                                                       | `jest.fn()` → `vi.fn()`                                        | 🔁 заменён   |

Тесты должны запускаться под Vitest (или под Bun / `node:test` через свою точку входа). Для Angular
нужен настроенный `TestBed`.

Если спаями должны стать **только** перечисленные методы, используйте `onlyMethodsToSpyOn`.
`methodsToSpyOn` добавляет методы к найденным на классе — как в `jest-auto-spies`. До версии 2.0 этой
библиотеки было иначе; см. [Переход на 2.0](/ru/upgrading-2).

### Достать спай обратно из контейнера {#reading-a-spy-back-out-of-the-container}

`Spy<T>` здесь строже, чем в `jest-auto-spies`, поэтому привычное приведение типа перестаёт
компилироваться:

```ts
// jest-auto-spies
hardwareService = TestBed.inject(DeviceListService) as Spy<DeviceListService>;
// TS2352: Conversion of type 'DeviceListService' to type 'Spy<DeviceListService>'
//         may be a mistake because neither type sufficiently overlaps with the other.

// vitest-auto-spy
hardwareService = asSpy(TestBed.inject(DeviceListService));
// или сразу с TestBed.inject внутри:
hardwareService = injectSpy(DeviceListService);
```

`asSpy` (из `vitest-auto-spy`) — только хелпер для типов: он возвращает аргумент без изменений, но с
типом `Spy<T>`. `injectSpy` (из `vitest-auto-spy/angular`) делает то же самое, сразу вызывая
`TestBed.inject`. Это самая частая ошибка компиляции в
перенесённом Angular-проекте — по одной на каждый полученный из DI спай. Поищите такие приведения до
первого запуска. В Angular-спеках берите `injectSpy`. Правило ESLint [`prefer-as-spy`](/ru/utilities/eslint-plugin) находит каждое и
исправляет через `--fix` вместе с импортом.

### Имена типов {#the-type-names}

`vi` — глобальный объект, когда Vitest запущен с `test: { globals: true }` (билдер Angular включает
это сам), поэтому перенесённая спека импортирует из `vitest` только типы. Три
переименования простые. Четвёртое молча меняет смысл на обратный:

| Jest                  | Vitest              | Импорт                                         |
| --------------------- | ------------------- | ---------------------------------------------- |
| `jest.Mocked<T>`      | `Mocked<T>`         | `import type { Mocked } from 'vitest'`         |
| `jest.MockedFunction` | `MockedFunction`    | `import type { MockedFunction } from 'vitest'` |
| `jest.SpyInstance`    | `MockInstance`      | `import type { MockInstance } from 'vitest'`   |
| `jest.Mock<R, [A]>`   | `Mock<(a: A) => R>` | `import type { Mock } from 'vitest'`           |

::: warning `jest.Mock` переставляет свои дженерики
`Mock` в Jest принимает **сначала тип результата, потом аргументы**. `Mock` в Vitest принимает одну
сигнатуру вызова. Если переименовать и оставить аргументы на месте, получится тип с обратным смыслом.
Он компилируется, и ничего не падает, пока с ним не разойдётся место вызова:

```ts
// jest: возвращает void, принимает один AdjustedPlanDetails
let callBack: jest.Mock<void, [AdjustedPlanDetails]>;

// vitest: то же намерение, записанное сигнатурой вызова
let callBack: Mock<(details: AdjustedPlanDetails) => void>;
```

Голый `jest.Mock` без дженериков безопасен: просто `Mock` значит то же самое.
:::

Для всего, что создаёт эта библиотека, объявляйте `Spy<T>`, а не `Mocked<T>`. Правило
[`no-mocked-for-spy`](/ru/utilities/eslint-plugin) объясняет почему и исправляет это автоматически.

Импорт типов из `vitest` ставьте рядом с остальными импортами npm-пакетов (после `@angular/*`). Если
поставить его над импортами фреймворка, `eslint-plugin-import` пожалуется на каждую спеку:

```
error  There should be at least one empty line between import groups        import/order
error  `vitest` type import should occur after import of `@angular/router`  import/order
```

### Вызовы `jest.*`, которые codemod переименовывает {#the-jest-calls-the-codemod-renames}

Эти 26 членов `jest` codemod переименовывает в тот же член `vi`. Имя меняется только у одного:
`jest.dontMock` становится `vi.doUnmock`.

- моки: `fn`, `spyOn`, `mocked`, `isMockFunction`, `clearAllMocks`, `resetAllMocks`,
  `restoreAllMocks`;
- модули: `mock`, `doMock`, `unmock`, `dontMock`, `resetModules`;
- таймеры: `useFakeTimers`, `useRealTimers`, `runAllTimers`, `runAllTimersAsync`,
  `runOnlyPendingTimers`, `runOnlyPendingTimersAsync`, `advanceTimersByTime`,
  `advanceTimersByTimeAsync`, `advanceTimersToNextTimer`, `advanceTimersToNextTimerAsync`,
  `clearAllTimers`, `getTimerCount`;
- часы: `setSystemTime`, `getRealSystemTime`.

Любой другой член `jest.*` остаётся как есть, и отчёт его называет. Те, у которых нет двойника в
`vi.*`, перечислены в следующем разделе.

### Вызовы `jest.*`, у которых нет двойника в `vi.*` {#the-jest-calls-that-have-no-vi-twin}

Механическая замена `jest.` → `vi.` даёт вызовы, которых не существует, например
`TypeError: vi.requireMock is not a function`. Для каждого вызова ниже нужен другой подход, а не
другое имя.

| Jest                                                             | Vitest                         | Что делать вместо этого                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jest.requireMock(id)`                                           | **нет**                        | передать спай через TestBed / DI-контейнер или аргументом                                                                                                          |
| `jest.requireActual(id)`                                         | `vi.importActual(id)`          | с `await` и только внутри фабрики `vi.mock`                                                                                                                        |
| `jest.fn().mockImplementation(() => o)` с `new`                  | **нельзя вызвать через `new`** | [`mockConstructor` / `stubConstructor`](/ru/utilities/constructor-doubles)                                                                                         |
| `jest.spyOn(global, 'Date')`                                     | **бросает ошибку**             | `mockSystemTime(iso)`; `Date` уже под управлением фейковых таймеров                                                                                                |
| `jest.replaceProperty(obj, key, value)`                          | **нет**                        | `mockValueProp(obj, key, value)`; откатывается сам                                                                                                                 |
| `fakeTimers: { enableGlobally: true }`                           | **нет настройки**              | `setupAutoSpy({ globalFakeTimers: true })`                                                                                                                         |
| `jest.mock('some-barrel')`                                       | `vi.mock(…)`                   | **молча ничего не делает**, когда спеки собраны бандлером: модуля, который он подменял бы, больше нет как отдельного модуля                                        |
| `jest.spyOn(barrel, 'exported')`                                 | **бросает ошибку**             | `TypeError: Cannot redefine property`: экспорт из бандла нельзя переопределить; [сделайте настоящую точку подмены](/ru/utilities/module-mocks#provide-a-real-seam) |
| `jest.fn().mockImplementation()` без аргумента                   | **аргумент обязателен**        | `mockImplementation(() => undefined)`; Jest подставлял пустую функцию сам                                                                                          |
| `xit` / `xdescribe`                                              | **нет**                        | `it.skip` / `describe.skip`; простое переименование падает с `TS2304: Cannot find name 'xit'`                                                                      |
| `testTimeout: 30000` (один бюджет)                               | **два поля**                   | задайте `hookTimeout` тем же числом; в Vitest он по умолчанию 10 000 мс                                                                                            |
| `expect(a).toHaveBeenCalledBefore(b)` между разными видами спаев | **неверный ответ без ошибки**  | сравнивайте два автоспая или включите `setSpyEngine('runner')`; см. [порядок вызовов](#call-order-across-spy-families) ниже                                        |
| `collectCoverageFrom: [...]`                                     | `coverage.include`             | и **не** `coverage.all`: в Vitest 4 этот ключ удалён, теперь `include` сам покрывает файлы, которые не импортировал ни один тест                                   |

#### Таймауты {#timeouts}

В Jest один `testTimeout` на хуки и тела тестов. В Vitest есть отдельный `hookTimeout`, по
умолчанию 10 000 мс. Если перенести только число из Jest, все хуки останутся на 10 секундах.

Ошибка при этом указывает не туда. Таймаут `beforeEach` записывается на **тест**, и длительность
теста равна лимиту: `× should create 10045ms`, хотя тело теста так и не запускалось.
[`setupAutoSpy()`](/ru/utilities/setup) говорит об этом в тексте ошибки. Исправление — одна строка:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

У `slowTestThreshold` меняются единицы: `5` в Jest — это **секунды**, `300` в Vitest —
**миллисекунды**. Перенесённый проект может начать помечать большинство файлов медленными; меняется
только отчёт.

#### Покрытие {#coverage}

Отчёт о покрытии меняется в двух местах:

- `coverage.all` больше нет. Конфиг, в котором остался `all: true`, ничего не задаёт, и отчёт молча
  сужается до файлов, которые импортировал прогон. Объявите `coverage.include`.
- Jest считает покрытие через istanbul, а провайдер Vitest по умолчанию — `v8`. `v8` считает каждую
  функцию, которую создал движок, а не только те, что есть в source map. Поэтому процент функций
  меняется на том же коде, а строки и ветки остаются прежними. Порог покрытия функций перемерьте;
  не переносите старое число.

#### Моки модулей под бандлером {#module-mocks-under-a-bundling-builder}

Эта строка обходится дороже всех, потому что о ней ничто не сообщает. Проблема возникает:

- под тестовым билдером, который собирает спеки бандлером;
- под `isolate: false`, где модуль может быть уже загружен в воркере.

В этих условиях `vi.mock()` для barrel-файла проекта, для `@angular/core` или для относительного
пути ничего не делает или срабатывает только в части прогонов. Если мок «работает в узком прогоне и не
работает в широком», причина здесь.
[Замените мок настоящей точкой подмены](/ru/utilities/module-mocks#provide-a-real-seam): провайдером,
аргументом или `vi.hoisted()` для пакета, который действительно нужно подменить.

`vi.spyOn` на barrel-файле — та же проблема, только громкая: он бросает `Cannot redefine property`.
Спай аксессора, созданный этим пакетом, перебрасывает эту ошибку и называет свойство, объект и
выход.

#### Порядок вызовов между видами спаев {#call-order-across-spy-families}

Эта строка даёт неверный ответ вместо ошибки, поэтому прочитайте её до переименования.
`toHaveBeenCalledBefore` и `toHaveBeenCalledAfter` сравнивают `mock.invocationCallOrder`.

- Спаи методов из этого пакета — его собственные мок-функции («движок спаев» по умолчанию), и они
  нумеруют вызовы своим счётчиком.
- Спаи `vi.fn()` используют отдельный счётчик внутри Vitest, который никто снаружи не может ни
  прочитать, ни сдвинуть.

`jest-auto-spies` строил спаи через `jest.fn()`, и оба вида делили один счётчик. Здесь — нет, и
счётчики расходятся по ходу прогона. В одном перенесённом проекте автоспай показал
`[164, 165, 167, 168, 169]`, а `vi.fn()` — `[28]` **в том же тесте**, и проверка при этом проходила.
Трёх более ранних вызовов одного вида достаточно, чтобы ответ перевернулся.

Два исправления в одну строку:

- сравнивайте два спая одного вида. Обе стороны проверки порядка обычно и так зависимости
  тестируемого кода;
- или переключите весь прогон на спаи раннера:

```ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // спаи методов снова vi.fn(), оба вида делят один счётчик
```

Счётчик вызовов — единственное, что два движка не делят, и единственная причина, по которой этот
переключатель существует.

## Подводные камни по раннерам {#per-runner-gotchas}

**Vitest.** Ничего, кроме замены импортов. Если проект запускается с `isolate: false` или с общим
окружением, добавьте `setupAutoSpy()`. Jest изолировал каждый файл, и патч `mock*Prop` там был
безвреден; здесь он может пережить свою спеку.

**Ожидание асинхронной работы.** В Jest `import()` компилировался в `require()`, а фейковые таймеры
обычно были глобальными, поэтому разные виды отложенной работы выглядели одинаково. В Vitest это
четыре отдельные очереди: обнаружение изменений, эффекты, таймеры и динамические импорты. Тест,
который ждёт не ту очередь, падает с сообщением, где ни одна из них не названа. Какой хелпер
продвигает какую очередь — в разделе [Ожидание и часы](/ru/utilities/event-loop#four-queues).

**`vi.fn(() => x)` — не то же самое, что `mockReturnValue(x)`.** Это переименование выглядит
безопасным, но не является им.

- Фабрика `() => x` читает `x` при каждом **вызове** спая.
- `mockReturnValue(x)` запоминает значение `x` в момент **настройки** спая.

Разница видна, когда тест переприсваивает `x`. Частый случай — новый `Subject` после того, как
старый завершился или упал с ошибкой:

```ts
let source$ = new Subject<Page>();

const api = createSpyFromClass(Api);

api.load.mockReturnValue(source$); // ❌ привязан к subject, который существовал на этой строке
api.load.mockImplementation(() => source$); // ✅ читается заново при каждом вызове

source$.error(new Error('boom'));
source$ = new Subject<Page>(); // спай всё ещё возвращает мёртвый subject сверху
```

В одной спеке сервис получил завершённый subject и молча не показал модальное окно, а тест оставался
зелёным. Переносите `vi.fn(() => x)` как `mockImplementation(() => x)`, а `mockReturnValue`
оставляйте для литералов. Если пишете свой кодмод, обработайте этот случай отдельно.

**Bun (`bun:test`).**

- В Bun `mockReset()` сбрасывает и реализацию (Vitest её сохраняет). Адаптер её восстанавливает,
  поэтому автоспаи работают, но самописный `mock()` в той же спеке поведёт себя иначе.
- `spyOn` в Bun отказывается работать с геттерами и сеттерами. Спаи аксессоров здесь переопределяют
  свойство, поэтому работают.
- Тестам на Angular нужен [`vitest-auto-spy/bun-angular`](/ru/runtimes/bun-angular).

**`node:test`.**

- `expect` нет; используйте `node:assert`.
- `spy.method.mockReturnValue` — метод Vitest и Bun, в `node:test` его нет. Используйте
  `spy.method.calledWith(...).mockReturnValue(...)`: это работает везде.
- Записанные вызовы читаются как `mock.calls[0].arguments`, а не `mock.calls[0]`.

См. [node:test](/ru/runtimes/node).

**Angular.** `provideAutoSpy` здесь создаёт **ленивые** спаи (`jest-auto-spies` всегда создавал их
сразу). Вызовы и проверки работают так же. По умолчанию класс с 8 и более методами получает спай на основе
`Proxy`, а класс поменьше — обычный объект с геттерами. `{ lazySpies: true }` даёт обычный объект при
любом размере; `{ lazySpies: false }` создаёт все спаи сразу, до первого обращения.

## Переход с jasmine-auto-spies {#coming-from-jasmine-auto-spies}

У `jasmine-auto-spies` и `jest-auto-spies` общее ядро, поэтому всё на этой странице применимо. Два
отличия:

- Асинхронные хелперы там лежат на `.and`: `spy.load.and.nextWith(v)` здесь пишется как
  `spy.load.nextWith(v)`. [`vitest-auto-spy/jasmine`](/ru/migrating-jasmine) возвращает `.and`,
  чтобы тесты проходили ещё до правок.
- `spyOn` в Jasmine **заменяет** метод, а `vi.spyOn` **вызывает** настоящий. Простое переименование
  молча переворачивает поведение.

[Переход с jasmine-auto-spies](/ru/migrating-jasmine) сопоставляет и API auto-spies, и собственные
глобальные функции Jasmine: `createSpyObj`, асимметричные матчеры, `clock()`, `withContext`,
`DEFAULT_TIMEOUT_INTERVAL`, `fdescribe`/`xit` и колбэки `done`.

## Что вы получаете от переезда {#what-you-gain-by-moving}

Кроме смены раннера — всё, чего не было в старом API:

- [`createAutoMock` / `mockDeep` / `createMock`](/ru/core/auto-mock-by-type);
- [`createFixture` / `createFixtureFactory`](/ru/utilities/fixtures) для общих тестовых данных.
  Копии одной модели в каждой спеке обходятся дорого: в одной партии миграции только они дали
  **28 диагностик `TS1117`** (повторяющийся ключ в литерале) на 26 пар ключей в восьми фикстурах и ещё
  половину `TS2741` этой партии;
- [`renderShallow` и `createWithAutoSpies`](/ru/adapters/angular);
- [проверки observable](/ru/core/observable-assertions);
- [фейковые таймеры, которые дожидаются результата](/ru/utilities/fake-timers);
- [спаи консоли](/ru/utilities/console) и [правила ESLint](/ru/utilities/eslint-plugin);
- поддержка Bun и `node:test`, и [`TestBed` Angular под `bun test`](/ru/runtimes/bun-angular).

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Сравните списки тестов до и после миграции:

```ts
import { compareTestRuns, formatTestRunComparison } from 'vitest-auto-spy/diagnostics';

const diff = compareTestRuns(JSON.parse(before), JSON.parse(after), '/my-repo/');

expect(diff.missing).toEqual([]);
process.stdout.write(formatTestRunComparison(diff));
```

- `before` и `after` — JSON-отчёты (`--reporter=json`). Jest и Vitest пишут их в одном формате,
  поэтому базовый прогон может быть из Jest.
- Третий аргумент отрезает общий префикс путей, так что отчёт из CI сравнивается с локальным.
- Переименованный тест попадает и в `missing`, и в `added`: снаружи переименование выглядит как
  удаление плюс добавление.

Почему не сравнивать итоговые числа: под `isolate: false` файл может потерять целый блок `describe`
(например, файл спеки, который импортирует соседний). В том же прогоне где-то ещё может начать
проходить нестабильный тест. Итоги совпадут, а блок тестов молча пропадёт.

::: tip Что это поймало на деле
В миграции, из которой взят этот хелпер, правки делались семью параллельными партиями. Сравнение
показало ровно один пропавший тест: он проверял ключ конфига, удалённый полгода назад в несвязанном
коммите. Больше ничего не потерялось. Доказать это можно только сравнением списков.
:::

## Кодмод, который правит глобы, проверяется совпадением, а не диффом {#a-codemod-that-edits-globs-is-verified-by-matching-not-by-diffing}

Очевидная проверка кодмода — «файл изменился так, как я хотел?». Для кодмода, который переписывает
**глобы**, эта проверка проходит, даже когда результат сломан. Пустой `include` — допустимый
`tsconfig.json`, и TypeScript о нём молчит.

Реальный случай: кодмод миграции убирал `jest.config.ts` из `include` жадным шаблоном, который
съел и `/**/*`. `src/**/*.spec.ts` превратился в `src*.spec.ts`: синтаксически верно, но не
совпадает ни с одним файлом. Из 152 tsconfig для спек свои спеки покрывали только **девять**.
`tsc --noEmit` показал ноль ошибок — проверять было нечего. Узнали об этом, только когда кто-то открыл
спеку в редакторе и увидел `Cannot find name 'vi'`.

Поэтому проверка такая: **совпадает ли новый шаблон хотя бы с одним существующим файлом?** Печатайте
получившийся `include` целиком, а не число. «fixed: 152» скрыл случай, когда первая починка дала два
разных неправильных варианта.

[`npx vitest-auto-spy codemod --verify`](/ru/utilities/codemod#verifying-by-matching-not-by-diffing)
выполняет эту проверку. Каждое из тринадцати преобразований объявляет шаблон, который должно убрать.
`--verify` ничего не меняет: он ищет эти шаблоны в **результате** и называет каждый остаток через
`file:line`. Так как он ищет совпадения, а не сравнивает дифф:

- он работает и на коде, которого кодмод не касался: на файлах, перенесённых вручную, или на местах,
  где преобразование выключено через `--skip`. Поэтому его место — в CI уже перенесённого проекта;
- он ловит правильный дифф, после которого в файле всё ещё есть `jest.`, например внутри шаблонной
  строки или за несбалансированной скобкой.

По той же причине отчёт печатает получившиеся **строки импорта целиком**, а не «6 правок».
