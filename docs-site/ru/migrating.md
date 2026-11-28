---
title: Переход с jest-auto-spies
description: Пошаговая замена jest-auto-spies или @bugsplat/vitest-auto-spies и подводные камни каждого раннера.
---

# Переход с jest-auto-spies

Чтобы перейти на `vitest-auto-spy` с [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies)
или [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies),
можно запустить кодмод или поправить импорты вручную. В большинстве тестов изменения выглядят так:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // add once in test setup if you use observable spies
```

Импортируйте `provideAutoSpy` и `injectSpy` из `vitest-auto-spy/angular`. Если используете
хелперы для Observable, например `nextWith`, один раз добавьте `import 'vitest-auto-spy/rxjs'`
в файл настройки тестов. `Spy<T>`, `asSpy` и другие основные хелперы берите из `vitest-auto-spy`.
После установки пакета просмотрите и примените изменения кодмодом, как показано в шаге 2.

После смены импортов компиляция чаще всего ломается на `TestBed.inject(X) as Spy<X>`.
Кодмод подставляет `asSpy<X>(…)`. Если правите тест вручную, используйте `injectSpy(X)`;
см. [Достать спай обратно из контейнера](#reading-a-spy-back-out-of-the-container).

Переходите с `jasmine-auto-spies`? См. раздел [Переход с jasmine-auto-spies](#coming-from-jasmine-auto-spies)
ниже, а затем отдельную страницу [Переход с jasmine-auto-spies](/ru/migrating-jasmine).

## По шагам {#step-by-step}

1. **Установите пакет и удалите старый.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jest-auto-spies   # или @bugsplat/vitest-auto-spies
   ```

2. **Запустите [кодмод](/ru/utilities/codemod).** Просмотрите изменения перед записью.

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

   Ещё шесть преобразований работают с [файлами Jasmine](/ru/migrating-jasmine). По умолчанию
   `--from auto` распознаёт формат каждого файла. Чтобы явно выбрать Jest, передайте
   `--from jest-auto-spies`.

   Кодмод оставляет без изменений вызовы [без аналога в `vi.*`](#the-jest-calls-that-have-no-vi-twin).
   Он указывает для каждого `path:line` и завершается с кодом 1. Исправьте эти вызовы вручную.
   Сверьтесь с шагами ниже, даже если переносите тесты без кодмода.

3. **Перепишите импорты.** Основные хелперы берите из корня пакета. Для Angular и Observable
   используйте отдельные пути импорта.

   ```diff
   - import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
   + import { createSpyFromClass } from 'vitest-auto-spy';
   + import { provideAutoSpy } from 'vitest-auto-spy/angular';
   ```

   Кодмод читает карту `exports` установленного пакета. Команда
   `npx vitest-auto-spy codemod --list` выводит все соответствия.

   Проверьте импорты из корня старого пакета, особенно `provideAutoSpy`. Команда
   `npx vitest-auto-spy doctor` отмечает неверные импорты как `helper-from-wrong-entry`
   ([CLI → doctor](/ru/utilities/cli)).

4. **Добавьте импорт rxjs один раз**, в setup-файле, если какой-нибудь спай использует `nextWith`,
   `nextWithValues` или `observablePropsToSpyOn`:

   ```ts
   // vitest.setup.ts
   import 'vitest-auto-spy/rxjs';
   ```

   Укажите `test: { setupFiles: ['./vitest.setup.ts'] }` в `vitest.config.ts`. Vitest запустит
   файл настройки перед каждым файлом тестов. Если пропустить импорт RxJS, первый вызов хелпера
   для Observable выдаст ошибку с этим импортом.

5. **Проверьте путь импорта для своего раннера.** Для Vitest оставьте импорт из корня пакета.
   Для других раннеров используйте свой путь:
   - `vitest-auto-spy` для Vitest;
   - `vitest-auto-spy/bun` для `bun:test`;
   - `vitest-auto-spy/node` для `node:test`.

6. **Объявляйте переменные как `Spy<T>`.** Пишите `let service: Spy<MyService>`. У спая нет
   членов `#private` и `private`. Если они есть в `MyService`, присвоить спай переменной типа
   `MyService` не получится. Если нужно передать спай туда, где ожидается тип самого класса,
   см. [`asInstance` / `asSpy`](/ru/core/spy-typing).

7. **Запустите тесты.** Оставьте прежние вызовы хелперов и исправьте ошибки, если они появятся.

8. **По желанию, когда тесты пройдут:** добавьте [`setupAutoSpy()`](/ru/utilities/setup) в файл
   настройки и включите [правила ESLint](/ru/utilities/eslint-plugin). Они подскажут новые хелперы.

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

В тестах Angular используйте `injectSpy` из `vitest-auto-spy/angular`. Он вызывает `TestBed.inject`
и возвращает результат с типом `Spy<T>`. Если экземпляр уже есть, `asSpy` из `vitest-auto-spy`
меняет только его тип. Найдите старые приведения типа до первого запуска или запустите
[`prefer-as-spy`](/ru/utilities/eslint-plugin) с `--fix`, чтобы исправить их вместе с импортами.

### Имена типов {#the-type-names}

С `test: { globals: true }` импортировать `vi` не нужно. Билдер Angular включает эту настройку,
поэтому в таких тестах из `vitest` импортируются только типы. Если у `jest.Mock` есть параметры
типа, поменяйте не только имя, но и сам тип:

| Jest                  | Vitest              | Импорт                                         |
| --------------------- | ------------------- | ---------------------------------------------- |
| `jest.Mocked<T>`      | `Mocked<T>`         | `import type { Mocked } from 'vitest'`         |
| `jest.MockedFunction` | `MockedFunction`    | `import type { MockedFunction } from 'vitest'` |
| `jest.SpyInstance`    | `MockInstance`      | `import type { MockInstance } from 'vitest'`   |
| `jest.Mock<R, [A]>`   | `Mock<(a: A) => R>` | `import type { Mock } from 'vitest'`           |

::: warning `jest.Mock` переставляет свои дженерики
`Mock` в Jest принимает сначала тип результата, потом типы аргументов. `Mock` в Vitest принимает
один тип функции. Простая замена `jest.Mock<void, [A]>` на `Mock<void, [A]>` меняет смысл типа.
Разницу можно не заметить, пока тип не разойдётся с вызовом:

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

Не заменяйте `jest.` на `vi.` во всех вызовах: для некоторых нужен другой подход. Например,
`vi.requireMock` выдаст `TypeError: vi.requireMock is not a function`.

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

В Jest `testTimeout` действует и на хуки, и на тела тестов. В Vitest у хуков свой лимит,
`hookTimeout`: по умолчанию 10 секунд. Чтобы сохранить таймаут Jest, задайте оба значения:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

Если `beforeEach` не уложится в лимит, Vitest отметит ошибкой сам тест, хотя его тело даже не
запускалось. В отчёте может появиться `× should create 10045ms`. [`setupAutoSpy()`](/ru/utilities/setup)
может добавить подсказку к ошибке, если `hookTimeout` меньше `testTimeout`.

В Jest `slowTestThreshold` задаётся в секундах (`5`), а в Vitest — в миллисекундах (`300`).
От этого зависит, какие тесты отчёт пометит как медленные, но не то, как они запустятся.

#### Покрытие {#coverage}

Перенесите шаблоны `collectCoverageFrom` из Jest в `test.coverage.include` в `vitest.config.ts`.
Начиная с Vitest 4 вместо `coverage.all` используйте `include`. Без `include` в отчёт попадут
только файлы, подключённые во время тестов.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { coverage: { include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'] } },
});
```

Подставьте шаблоны вашего проекта. Для провайдера по умолчанию (`v8`) установите `@vitest/coverage-v8` той же версии,
что и Vitest. Запустите `npx vitest run --coverage`.
Проверьте порог покрытия функций: при переходе с Istanbul в Jest на `v8` в Vitest этот процент
может измениться, даже если покрытие строк и веток осталось прежним.

#### Моки модулей под бандлером {#module-mocks-under-a-bundling-builder}

Если билдер собирает тесты в бандл, у `vi.mock()` может не остаться отдельного модуля для подмены.
С `isolate: false` воркер может уже загрузить этот модуль. В обоих случаях мок файла реэкспортов
(barrel), `@angular/core` или относительного импорта может не сработать без ошибки. При запуске
меньшего числа тестов тот же мок может работать.

[Замените мок модуля провайдером или аргументом](/ru/utilities/module-mocks#provide-a-real-seam).
Если всё же нужно подменить пакет, используйте `vi.hoisted()`. На экспорте из бандла `vi.spyOn`
выдаёт `Cannot redefine property`. Спаи аксессоров из этой библиотеки указывают свойство и объект,
а также подсказывают, как исправить ошибку.

#### Порядок вызовов между видами спаев {#call-order-across-spy-families}

При проверке порядка вызовов сравнивайте спаи одного вида. `toHaveBeenCalledBefore` и
`toHaveBeenCalledAfter` сравнивают `mock.invocationCallOrder`, но автоспаи и `vi.fn()` нумеруют
вызовы разными счётчиками. К счётчику Vitest нет доступа извне. В `jest-auto-spies` оба вида
использовали `jest.fn()` и общий счётчик.

Если смешать спаи, проверка может дать обратный результат без ошибки. В одном проекте она прошла,
хотя в том же тесте автоспай показал `[164, 165, 167, 168, 169]`, а `vi.fn()` — `[28]`. Чтобы
исказить результат, может хватить трёх более ранних вызовов одного вида.

Если нужно сравнить автоспай с `vi.fn()`, переключите весь прогон на спаи Vitest:

```ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // спаи методов снова vi.fn(), оба вида делят один счётчик
```

Счётчик вызовов — единственное, что два движка не делят, и единственная причина, по которой этот
переключатель существует.

## Подводные камни по раннерам {#per-runner-gotchas}

**Vitest.** Используйте новые импорты. Если запускаете тесты с `isolate: false` или в общем
окружении, добавьте `setupAutoSpy()`. Jest изолировал файлы, а в общем окружении подмена через
`mock*Prop` может сохраниться после теста.

**Ожидание асинхронной работы.** В Jest `import()` компилировался в `require()`, а фейковые таймеры
обычно были глобальными. В Vitest у тестов четыре отдельные очереди: обнаружение изменений,
эффекты, таймеры и динамические импорты. Из ошибки не всегда ясно, какая очередь ещё не обработана.
[Ожидание и часы](/ru/utilities/event-loop#four-queues) подскажет, какой хелпер взять для каждой.

**Замена `vi.fn(() => x)`.** Если `x` может измениться, используйте `mockImplementation(() => x)`.
Для литералов подходит `mockReturnValue(x)`.

- Фабрика `() => x` читает `x` при каждом **вызове** спая.
- `mockReturnValue(x)` запоминает значение `x` в момент **настройки** спая.

Это важно, если тест заменяет `Subject`, который завершился или упал с ошибкой. Ниже два
варианта настройки: первый запоминает старый `Subject`, второй возвращает новый.

```ts
let source$ = new Subject<Page>();

const api = createSpyFromClass(Api);

api.load.mockReturnValue(source$); // ❌ привязан к subject, который существовал на этой строке
api.load.mockImplementation(() => source$); // ✅ читается заново при каждом вызове

source$.error(new Error('boom'));
source$ = new Subject<Page>(); // спай всё ещё возвращает мёртвый subject сверху
```

При одной миграции сервис получил завершённый `Subject` и не показал модальное окно. Тест при этом
прошёл. Если пишете свой кодмод, обрабатывайте такие переприсваивания отдельно.

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

**Angular.** `provideAutoSpy` создаёт спаи при первом обращении, а `jest-auto-spies` создавал их
сразу. Вызовы и проверки работают так же. По умолчанию классы с восемью и более методами получают
`Proxy`, а классы поменьше — объект с геттерами. Чтобы всегда использовать объект с геттерами,
задайте `{ lazySpies: true }`. Чтобы создать все спаи сразу, задайте `{ lazySpies: false }`.

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

Кроме смены раннера, вы получаете:

- [`createAutoMock` / `mockDeep` / `createMock`](/ru/core/auto-mock-by-type);
- [`createFixture` / `createFixtureFactory`](/ru/utilities/fixtures) для общих тестовых данных.
  В одной партии миграции копии моделей вызвали 28 ошибок `TS1117` (26 пар повторяющихся ключей
  в восьми фикстурах) и половину ошибок `TS2741`;
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

Сравнивайте имена тестов, а не их число. С `isolate: false` файл может потерять целый блок
`describe`, если его импортирует соседний файл. Число тестов может остаться прежним, если
одновременно начнёт проходить нестабильный тест в другом файле.

::: tip Что это поймало на деле
При одной миграции правки вносили семью партиями параллельно. Сравнение имён нашло ровно один
пропавший тест: он проверял ключ конфига, удалённый полгода назад в несвязанном коммите.
:::

## Кодмод, который правит глобы, проверяется совпадением, а не диффом {#a-codemod-that-edits-globs-is-verified-by-matching-not-by-diffing}

После правки шаблона пути (глоба) проверьте, что он находит хотя бы один существующий файл.
Правильного на вид диффа мало. Пустой `include` допустим в `tsconfig.json`, поэтому TypeScript
может не найти ошибок просто потому, что не проверил ни одного тестового файла.

При одной миграции шаблон удалил из `include` и `jest.config.ts`, и `/**/*`. Вместо
`src/**/*.spec.ts` получилось `src*.spec.ts`, который не находил ни одного файла. Только девять
из 152 конфигов по-прежнему находили свои тесты. `tsc --noEmit` не сообщил об ошибках: сообщение
`Cannot find name 'vi'` появилось только в редакторе при открытии файла теста. Выводите каждый
получившийся `include` целиком: за счётчиком `fixed: 152` скрылись два неверных шаблона после первой
попытки исправления.

[`npx vitest-auto-spy codemod --verify`](/ru/utilities/codemod#verifying-by-matching-not-by-diffing)
проверяет, какие файлы подходят под шаблоны. Кроме того, каждое из тринадцати преобразований
задаёт шаблон, который должно убрать. `--verify` ничего не меняет: он ищет остатки в результате
и выводит их в формате `file:line`. С ним можно:

- проверять и правки вручную, и места, оставленные из-за `--skip`; запускайте его в CI после
  миграции;
- находить оставшиеся упоминания `jest.` даже при правильном диффе, например внутри шаблонной
  строки или после непарной скобки.

По той же причине отчёт печатает получившиеся **строки импорта целиком**, а не «6 правок».
