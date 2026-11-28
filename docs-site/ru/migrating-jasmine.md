---
title: Переход с jasmine-auto-spies
description: Как перенести тесты с Jasmine на Vitest. Сохраните рабочие спаи с помощью импорта для совместимости, а затем перепишите их кодмодом.
---

# Переход с jasmine-auto-spies

Этот гайд поможет перенести на Vitest тесты с `jasmine-auto-spies` или `jasmine.*`. Сначала
запустите тесты с импортом для совместимости. Затем прогоните кодмод, чтобы перейти на API спаев
Vitest. Вот тест на Vitest, который пока использует синтаксис Jasmine:

```ts
import { expect, it } from 'vitest';
import { jasmine } from 'vitest-auto-spy/jasmine';

it('returns the saved name', () => {
  const api = jasmine.createSpyObj('ApiService', ['load']);
  api.load.and.returnValue('Ann');
  expect(api.load()).toBe('Ann');
});
```

Дальше мы называем `vitest-auto-spy/jasmine` **мостом**. Он сохраняет `.and`, `.calls` и
`.withArgs` у спаев, созданных этой библиотекой.

Не заменяйте `spyOn` на `vi.spyOn` вручную: спай Vitest по умолчанию вызывает исходный метод.
См. [как сохранить заглушку](#spyon-means-the-opposite-thing-on-the-two-sides).

## Пошагово {#step-by-step}

1. **Установите пакет и удалите старый.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jasmine-auto-spies
   ```

   Если тесты Angular работают на Karma, [смените раннер](#if-the-suite-is-angular-s) перед запуском тестов.

2. **Перейдите на мост.** Поменяйте путь импорта, не меняя имена.

   ```diff
   - import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
   + import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
   ```

   Если в файле есть `jasmine.createSpyObj`, `jasmine.clock()` или другой вызов через `jasmine.*`, добавьте импорт:

   ```ts
   import { jasmine } from 'vitest-auto-spy/jasmine';
   ```

   Включите глобальные функции Vitest, чтобы `describe`, `it` и `expect` работали без импорта.
   Кодмод тоже добавляет `vi` без импорта:

   ```ts
   // vitest.config.ts
   export default defineConfig({ test: { globals: true } });
   ```

   Импорт `jasmine` не добавляет отдельные глобальные функции вроде `spyOn`. Для этих вызовов
   используйте замены из таблицы глобальных функций Jasmine ниже.

3. **Запустите `npx vitest run`.** Исправьте ошибки до переписывания тестов. Так у вас будет
   успешный прогон на новом раннере ещё до изменений кодмода.

4. **Запустите [кодмод](/ru/utilities/codemod).** Посмотрите изменения, примените их и проверьте, что осталось:

   ```bash
   npx vitest-auto-spy codemod --from jasmine            # dry run: prints a diff, writes nothing
   npx vitest-auto-spy codemod --from jasmine --write    # apply
   npx vitest-auto-spy codemod --from jasmine --verify   # exit 1 if jasmine code is left
   ```

   Кодмод убирает `.and`, где это возможно, заменяет стратегии Jasmine вызовами `mock*` и
   переписывает вызовы `jasmine.*`. Если что-то переписать нельзя, он указывает `file:line`.

   Передайте `--from jasmine` или `--from jasmine-auto-spies`. Режим по умолчанию (`--from auto`)
   пропускает файлы, где из Jasmine есть только вызов `spyOn(`. Если переименовать его вручную,
   [спай может без предупреждения вызвать исходный метод](#spyon-means-the-opposite-thing-on-the-two-sides).

5. **Снова запустите тесты.** Вручную исправьте строки с пометкой **✎** в
   [таблице API auto-spies](#the-auto-spies-api): кодмод их не трогает.

6. **Удалите ненужные импорты моста.** Оставьте `createSpyObj` в файлах, где вы ещё его используете.
   См. [что остаётся на мосту](#what-the-codemod-leaves-on-the-jasmine-entry).

7. **По желанию:** включите [правила линтера на время переезда](#lint-rules-while-you-are-on-the-bridge).

## Пример: одна спека до и после {#example-one-spec-before-and-after}

Этот тест на Jasmine проверяет, что `UserService` обновляет данные раз в минуту:

```ts
// user.service.spec.ts, under Jasmine
import { UserService } from './user.service';

describe('UserService', () => {
  afterEach(() => jasmine.clock().uninstall());

  it('reloads the user every minute', () => {
    jasmine.clock().install();
    const api = jasmine.createSpyObj('ApiService', ['get']);
    api.get.and.returnValue(Promise.resolve({ name: 'Ann' }));
    const users = new UserService(api);

    users.startPolling();
    jasmine.clock().tick(60_000);

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
```

**На мосту** (шаг 2) добавьте этот импорт, чтобы сам тест не менять:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

**После кодмода** (шаг 4) изменения в исходном тесте на Jasmine выглядят так:

```diff
+import { createSpyObj } from 'vitest-auto-spy/jasmine';
+
 import { UserService } from './user.service';

 describe('UserService', () => {
-  afterEach(() => jasmine.clock().uninstall());
+  afterEach(() => vi.useRealTimers());

   it('reloads the user every minute', () => {
-    jasmine.clock().install();
-    const api = jasmine.createSpyObj('ApiService', ['get']);
-    api.get.and.returnValue(Promise.resolve({ name: 'Ann' }));
+    vi.useFakeTimers();
+    const api = createSpyObj('ApiService', ['get']);
+    api.get.mockReturnValue(Promise.resolve({ name: 'Ann' }));
     const users = new UserService(api);

     users.startPolling();
-    jasmine.clock().tick(60_000);
+    vi.advanceTimersByTime(60_000);
```

После переписывания проверьте часы и спай:

- `vi.useFakeTimers()` подменяет и `Date`, а `jasmine.clock().install()` — нет. Тесты, которые
  вызывают `mockDate()` и проверяют подменённый `Date.now()`, продолжат работать. Тесты, которым
  нужно реальное время, поправьте. См. [как подмена таймеров влияет на `Date`](#clock-install-leaves-date-real).
- `createSpyObj` по-прежнему импортируется из моста. Если у вас есть класс, используйте
  типизированный спай: он проверяет имена методов при компиляции:

  ```ts
  import { createSpyFromClass } from 'vitest-auto-spy';

  const api = createSpyFromClass(ApiService);
  api.get.resolveWith({ name: 'Ann' });
  ```

## `spyOn` на двух сторонах означает противоположные вещи {#spyon-means-the-opposite-thing-on-the-two-sides}

::: danger Тест может пройти, даже если сработал исходный метод
В Jasmine `spyOn(obj, 'm')` заменяет метод заглушкой. В Vitest `vi.spyOn(obj, 'm')` вызывает исходный
метод, пока вы не зададите другую реализацию.

```diff
- spyOn(analytics, 'track');            // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');         // Vitest: track() runs on every call
+ vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // what the jasmine line meant
```

Средняя строка компилируется, и проверки спая могут пройти. Но `track()` может записать данные в
хранилище, отправить запрос или выбросить ошибку. Из-за этого иногда падает другой тест.

Со свойствами разница та же. В Jasmine `spyOnProperty` без третьего аргумента ставит спай на
геттер. В Vitest укажите `'get'` явно: `vi.spyOn(obj, 'p')` ждёт метод и может выдать
`can only spy on a function`.

Преобразование `jasmine-spy-on` добавляет `.mockImplementation(() => undefined)` и недостающий
`'get'`. Если в строке уже настроено поведение через `.and.…` или `mock…`, кодмод не добавляет
заглушку.
:::

### `mockReset()` возвращает сквозной вызов {#mockreset-brings-the-call-through-back}

Замените `spy.calls.reset()` из Jasmine на `mockClear()`: он очищает историю вызовов и сохраняет
заглушку. В Jasmine нет `mockReset()`. В Vitest 3 и новее реализации сбрасываются не так, как
описано в документации Jest 29:

| До `mockReset()`                                    | После него, на Vitest                   | После него, по документации Jest 29 |
| --------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| `vi.fn(() => 'impl').mockReturnValue('x')`          | `'impl'`, реализация, переданная в `fn` | `undefined`                         |
| `vi.fn().mockReturnValue('x')`                      | `undefined`                             | `undefined`                         |
| `vi.spyOn(api, 'load').mockImplementation(() => …)` | **настоящий `load`**, всё ещё под спаем | `undefined`                         |

Если вызвать `mockReset()` в `afterEach`, он снимет заглушку, которую кодмод добавил к `vi.spyOn`.
Следующие тесты вызовут исходный метод. Для сброса истории используйте `mockClear()` или снова
задайте `.mockImplementation(() => undefined)` после сброса.

У спая из `createSpyFromClass(Api)` вызов `spy.load.mockReset()` снимает `mockReturnValue` и
`mockImplementation`. Метод возвращает `undefined`, если у него нет настройки через
`calledWith(…)`, `resolveWith(…)` или `nextWith(…)`: они сохраняются. `resetAutoSpy(spy)` сбрасывает
оба вида настроек. `clearAutoSpy(spy)` очищает только историю вызовов во всём объекте. См.
[хелперы для управления спаями](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

## API auto-spies {#the-auto-spies-api}

У `jasmine-auto-spies` и [`jest-auto-spies`](/ru/migrating) общее ядро. У них одинаковые опции
(`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`) и хелперы
(`calledWith`, `resolveWith`, `nextWith`, `nextWithValues`, `accessorSpies`). При переходе на новый API
убирайте `.and` у асинхронных хелперов:

```ts
spy.load.and.nextWith(user); // jasmine-auto-spies
spy.load.nextWith(user); // jest-auto-spies and vitest-auto-spy
```

В средней колонке — что работает на мосту, в правой — что использовать после кодмода. Строки
с пометкой **✎** исправьте вручную.

| `jasmine-auto-spies`                                               | на `vitest-auto-spy/jasmine`                                          | конечное состояние                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `createSpyFromClass(C)`                                            | идентично                                                             | `createSpyFromClass` из `vitest-auto-spy`                    |
| `createSpyFromClass(C, ['load', 'save'])`                          | идентично                                                             | без изменений                                                |
| `methodsToSpyOn` / `observablePropsToSpyOn`                        | идентично: добавляет к найденным методам                              | без изменений                                                |
| `gettersToSpyOn` / `settersToSpyOn`                                | идентично                                                             | без изменений                                                |
| `providedMethodNames`                                              | принимается, вливается в `methodsToSpyOn`, предупреждает раз на вызов | ✎ переименуйте в `methodsToSpyOn`                            |
| `createFunctionSpy<F>('name')`                                     | идентично                                                             | `createFunctionSpy` из `vitest-auto-spy`                     |
| `provideAutoSpy(C)`                                                | идентичный `{ provide, useValue }`                                    | `provideAutoSpy` из `/angular` (или `/nestjs`, `/vue`)       |
| `createSpyObj(base, names, props?)`                                | идентично, все четыре формы аргументов                                | **остаётся на `/jasmine`**; больше его никто не экспортирует |
| `type Spy<T>`                                                      | та же форма, **без** `@types/jasmine`                                 | `Spy<T>` из `vitest-auto-spy`                                |
| `createObservableWithValues`                                       | из `vitest-auto-spy/rxjs`, без изменений                              | без изменений                                                |
| `spy.m.and.returnValue(v)`                                         | идентично                                                             | `spy.m.mockReturnValue(v)`                                   |
| `spy.m.and.returnValues(a, b)`                                     | идентично                                                             | `.mockReturnValueOnce(a).mockReturnValueOnce(b)`             |
| `spy.m.and.callFake(fn)`                                           | идентично                                                             | `spy.m.mockImplementation(fn)`                               |
| `spy.m.and.stub()`                                                 | идентично                                                             | `spy.m.mockImplementation(() => undefined)`                  |
| `spy.m.and.throwError('boom')`                                     | идентично                                                             | `.mockImplementation(() => { throw new Error('boom'); })`    |
| `spy.m.and.resolveTo(v)`                                           | идентично                                                             | `spy.m.mockResolvedValue(v)`                                 |
| `spy.m.and.callThrough()`                                          | **возвращает к ответам, настроенным этой библиотекой**; см. ниже      | сообщается, остаётся как написано                            |
| `spy.m.and.identity`                                               | имя спая                                                              | ✎ у спая в Vitest нет имени для чтения; уберите строку       |
| `spy.m.and.resolveWith / rejectWith / resolveWithPerCall`          | идентично                                                             | уберите `.and`: `spy.m.resolveWith(v)`                       |
| `spy.m.and.nextWith / nextOneTimeWith / nextWithValues`            | идентично                                                             | уберите `.and`                                               |
| `spy.m.and.nextWithPerCall / throwWith / complete / returnSubject` | идентично                                                             | уберите `.and`                                               |
| `spy.m.withArgs(1).and.returnValue(v)`                             | идентично                                                             | `spy.m.calledWith(1).mockReturnValue(v)`                     |
| `spy.m.withArgs(1).and.stub / throwError / resolveTo`              | идентично                                                             | `spy.m.calledWith(1)` + `failWith` / `resolveWith`           |
| `spy.m.withArgs(1).and.callFake / callThrough / returnValues`      | **бросает ошибку и называет замену**; см. ниже                        | ✎ настройте весь спай или значение для этих аргументов       |
| `expect(spy.m.withArgs(1)).toHaveBeenCalled()`                     | **аналога нет**: `withArgs` возвращает цепочку, а не спай             | ✎ `expect(spy.m).toHaveBeenCalledWith(1)`                    |
| `spy.m.calls.count()` / `any()`                                    | идентично                                                             | ✎ `spy.m.mock.calls.length`                                  |
| `spy.m.calls.argsFor(i)` / `allArgs()`                             | идентично                                                             | ✎ `spy.m.mock.calls[i]` / `spy.m.mock.calls`                 |
| `spy.m.calls.all()` / `first()` / `mostRecent()`                   | идентично                                                             | ✎ `spy.m.mock.calls` рядом с `spy.m.mock.results`            |
| `spy.m.calls.thisFor(i)`                                           | идентично                                                             | ✎ `spy.m.mock.instances[i]`                                  |
| `spy.m.calls.reset()`                                              | идентично                                                             | ✎ `spy.m.mockClear()`                                        |
| `spy.m.calls.saveArgumentsByValue()`                               | **ничего не делает**; см. ниже                                        | ✎ снимайте копию в `mockImplementation`                      |
| `spy.accessorSpies.getters.x.and.returnValue(v)`                   | идентично                                                             | `spy.accessorSpies.getters.x.mockReturnValue(v)`             |

Тесты с `.calls` могут и после кодмода компилироваться и проходить на мосту. Найти такие вызовы
поможет [`prefer-native-spy-api`](/ru/utilities/eslint-plugin).

Хелперы на `.and` зависят от типа результата. У методов с `Promise` есть `resolveWith` и
`rejectWith`. У методов с `Observable` появятся `nextWith` и похожие хелперы, когда вы добавите
`import 'vitest-auto-spy/rxjs'` в файл настройки тестов.

Таблица для `@hirez_io/observer-spy` — в [отдельном разделе](#hirez-io-observer-spy-comes-along-too).

### У трёх стратегий `withArgs` нет формы с областью по аргументам {#three-withargs-strategies-have-no-argument-scoped-form}

Используйте `.withArgs(…)`, чтобы задать ответ для конкретных аргументов. Там работают `stub()`,
`throwError(e)` и `resolveTo(v)`. А `callFake(fn)`, `callThrough()` и `returnValues(a, b)` задают
реализацию для всего спая, поэтому в цепочке с `withArgs` выбрасывают ошибку с подсказкой:

```text
[vitest-auto-spy] load.withArgs(…).and.callFake() is not supported: it installs an implementation,
and an implementation answers every call rather than one argument list. Configure the value for
these arguments — `.withArgs(…).and.returnValue(v)`, `.throwError(e)`, `.resolveTo(v)` — or take
the whole spy with `load.and.callFake(…)`, which is what jasmine's own strategy does to every call
anyway.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#three-withargs-strategies-have-no-argument-scoped-form
```

У спаев этой библиотеки есть `withArgs` на мосту и `calledWith` после миграции. У
`vi.spyOn(obj, 'm')` нет `calledWith`, поэтому `spyOn(obj, 'm').withArgs(1)` перепишите вручную.
Проверяйте аргументы внутри `mockImplementation` или создайте спай с `calledWith` через
`createSpyFromClass` или `createAutoMock`.

## Собственные глобалы jasmine {#jasmine-s-own-globals}

Если вызов `jasmine.*` падает с `ReferenceError: jasmine is not defined`, добавьте импорт в этот
тестовый файл. Замены для отдельных функций вроде `spyOn` смотрите в таблице ниже.

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

Мост ничего не добавляет в `globalThis`. Импортируйте `jasmine` в каждом файле, где он нужен.
Кодмод уберёт импорт, когда он больше не нужен.

| jasmine                                                           | под Vitest                                                                     | примечания                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `spyOn(o, 'm')`                                                   | `vi.spyOn(o, 'm').mockImplementation(() => undefined)`                         | ⚠️ [Vitest по умолчанию вызывает исходный метод](#spyon-means-the-opposite-thing-on-the-two-sides)                     |
| `spyOnProperty(o, 'p', 'get')`                                    | та же заглушка, но третьим аргументом укажите вид аксессора                    | Vitest по умолчанию вызывает исходный аксессор                                                                         |
| `jasmine.createSpy('load')`                                       | `vi.fn()`                                                                      | имя уходит; Vitest сообщает имя переменной                                                                             |
| `jasmine.createSpy('load', original)`                             | `vi.fn(original)`                                                              | исходная функция сохраняется                                                                                           |
| `jasmine.createSpyObj(…)`                                         | `createSpyObj` из `vitest-auto-spy/jasmine`                                    | все формы оригинала; где есть класс или тип, лучше брать их                                                            |
| `jasmine.any` / `anything` / `objectContaining`                   | `expect.any` / `expect.anything` / …                                           | называются одинаково на обеих сторонах                                                                                 |
| `jasmine.arrayContaining` / `stringMatching` / `stringContaining` | `expect.arrayContaining` / …                                                   | называются одинаково на обеих сторонах                                                                                 |
| `jasmine.truthy` / `falsy` / `empty` / `notEmpty`                 | **двойника `expect.*` нет**                                                    | `registerJasmineMatchers()`, ниже                                                                                      |
| `jasmine.is` / `mapContaining` / `setContaining`                  | **двойника `expect.*` нет**                                                    | `registerJasmineMatchers()`, ниже                                                                                      |
| `jasmine.arrayWithExactContents`                                  | **двойника `expect.*` нет**                                                    | `registerJasmineMatchers()`, ниже                                                                                      |
| `jasmine.clock().install()` / `.uninstall()`                      | `vi.useFakeTimers()` / `vi.useRealTimers()`                                    | ⚠️ на мосту `install()` оставляет `Date` настоящим, как jasmine; см. ниже                                              |
| `jasmine.clock().tick(n)`                                         | `vi.advanceTimersByTime(n)`                                                    | `tick` и `advanceTimersByTime` не ждут промисы; [`advanceTimers`](/ru/utilities/fake-timers) ждёт                      |
| `jasmine.clock().mockDate(d)`                                     | `vi.setSystemTime(d)`                                                          | именно это подменяет `Date`; см. ниже                                                                                  |
| `jasmine.clock().withMock(fn)`                                    | есть в пространстве имён; **двойника в `vi` нет**                              | кодмод сообщает о нём и оставляет как есть                                                                             |
| `jasmine.addMatchers(m)`                                          | `expect.extend(m)`                                                             | на мосту родная форма фабрик jasmine работает напрямую; [см. ниже](#addmatchers-takes-jasmine-s-factories-as-they-are) |
| `jasmine.addCustomEqualityTester(t)`                              | `expect.addEqualityTesters([t])`                                               | один тестер, завёрнутый в массив, который принимает Vitest                                                             |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL = n`                            | **задайте `testTimeout` и `hookTimeout`**                                      | `vi.setConfig({ testTimeout: n, hookTimeout: n })`; [оба](#the-timeout-is-two-numbers-here)                            |
| `jasmine.getEnv()`                                                | **нет**                                                                        | порядок и bail — это `vitest.config.ts`, а не окружение во время выполнения                                            |
| `jasmine.addSpyStrategy` / `setDefaultSpyStrategy`                | **нет**                                                                        | опишите поведение как `mockImplementation` там, где создаётся спай                                                     |
| `jasmine.Spy` (тип)                                               | `Mock` из `vitest`                                                             | одна мок-функция                                                                                                       |
| `jasmine.SpyObj<T>` (тип)                                         | `Spy<T>` из этого пакета                                                       | объект целиком, а не одна функция                                                                                      |
| `fdescribe` / `fit`                                               | `describe.only` / `it.only`                                                    |                                                                                                                        |
| `xdescribe` / `xit` / `xtest`                                     | `describe.skip` / `it.skip`                                                    | если оставить `xit`, получите `TS2304: Cannot find name 'xit'`                                                         |
| `expect(x).toBeTrue()` / `.toBeFalse()`                           | `.toBe(true)` / `.toBe(false)`                                                 | ⚠️ **не** `toBeTruthy` / `toBeFalsy`, которые предлагает собственная ошибка Vitest                                     |
| `expect(x).toHaveSize(n)`                                         | `.toHaveLength(n)`                                                             |                                                                                                                        |
| `expect(spy).toHaveBeenCalledOnceWith(a)`                         | `expect(spy).toHaveBeenCalledTimes(1)` + `expect(spy).toHaveBeenCalledWith(a)` | работает с минимальной поддерживаемой Vitest 2.1                                                                       |
| `expect(el).toHaveClass(c)`                                       | **нет**                                                                        | вне browser mode; `expect(el.classList.contains(c)).toBe(true)`                                                        |
| `expect(x).withContext(msg).toBe(y)`                              | `expect(x, msg).toBe(y)`                                                       | ⚠️ [Vitest теряет сообщение без предупреждения](#withcontext-does-not-throw-it-loses-the-message)                      |
| `fail(msg)`                                                       | `expect.fail(msg)`                                                             | `vi.fail` не существует                                                                                                |
| `it('x', (done) => …)`                                            | `async` + `await`                                                              | **не переписывается**: Vitest передаёт `TestContext`, а не `done`                                                      |

Перепишите колбэки `done` вручную. Решите, чего должен дождаться тест, иначе он может пройти до
проверки. Найти такие тесты помогают правила линтера [`await-emission`](/ru/utilities/eslint-plugin).

### Восемь матчеров, у которых нет двойника в `expect.*` {#the-eight-matchers-with-no-expect-twin}

В Vitest нет встроенных замен для `jasmine.truthy`, `falsy`, `empty`, `notEmpty`, `is`,
`mapContaining`, `setContaining` и `arrayWithExactContents`. Это асимметричные матчеры: их
передают как ожидаемые значения в `toEqual(…)`, `objectContaining({ … })` или
`toHaveBeenCalledWith(…)`. Зарегистрируйте замены один раз в файле настройки:

```ts
import { registerJasmineMatchers } from 'vitest-auto-spy/jasmine';

registerJasmineMatchers(); // once, in the setup file

expect({ tags: [] }).toEqual({ tags: expect.jasmineEmpty() });
```

В `expect` используйте префикс `jasmine`: `expect.jasmineEmpty()`, `expect.jasmineIs()` и так
далее. Chai уже использует `.empty` и `.is`, поэтому `expect.extend({ empty })` выдаёт ошибку
`Cannot set property empty of #<Assertion> which has only a getter`. Через `jasmine` используйте
старые имена, например `jasmine.empty()`.

Первое обращение к любому `jasmine.*` регистрирует матчеры. Если тест использует только матчеры
из `jasmine`, отдельный вызов для настройки не нужен.

`jasmine.mapContaining` сравнивает **ключи** по равенству, как jasmine, а не через `Map.has`. Поэтому
матчер на месте ключа работает, и объектный ключ, равный по значению, но другой по ссылке, — тоже:

```ts
expect(byUser).toEqual(jasmine.mapContaining(new Map([[{ id: 7 }, 'ada']])));
expect(byName).toEqual(jasmine.mapContaining(new Map([[jasmine.any(String), 'ada']])));
```

### `addMatchers` принимает фабрики jasmine как есть {#addmatchers-takes-jasmine-s-factories-as-they-are}

На мосту оставьте фабрики матчеров Jasmine. Jasmine передаёт каждой фабрике `matchersUtil`, а
фабрика возвращает `{ compare, negativeCompare? }`. Если переходите на `expect.extend` в Vitest,
передайте саму функцию сравнения.

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

jasmine.addMatchers({
  toBeWithin: (matchersUtil, customTesters) => ({
    compare(actual: number, floor: number, ceiling: number) {
      return {
        pass: actual >= floor && actual <= ceiling,
        message: () => `expected ${actual} to be within ${floor}..${ceiling}`,
      };
    },
  }),
});

expect(7).toBeWithin(5, 10);
expect(3).not.toBeWithin(5, 10);
```

Для `.not` мост вызывает `negativeCompare`, если фабрика его задала, и инвертирует `pass` для
Vitest. Иначе он вызывает `compare` и инвертирует результат. В `jasmine.addMatchers` можно
передавать и функции Vitest. Регистрируйте два формата отдельными вызовами: объект с фабрикой и
функцией Vitest не компилируется.

Если фабрика не вернула `message`, мост составит его из имени матчера, как Jasmine:
`Expected 3 not to be within 5, 10.`. `matchersUtil.equals(a, b)` сравнивает значения средствами
раннера и учитывает функции сравнения из `jasmine.addCustomEqualityTester`. `pp` форматирует
значения для вывода.

Если вы объявляете матчеры в отдельном файле, импортируйте типы:

```ts
import type { JasmineCustomMatcherFactories, JasmineMatchersUtil } from 'vitest-auto-spy/jasmine';

const matchers: JasmineCustomMatcherFactories = {
  toBeWithin: (util: JasmineMatchersUtil) => ({ compare: (actual, floor, ceiling) => ({ pass: true }) }),
};
```

`JasmineCustomMatcherFactories`, `JasmineCustomMatcherFactory`, `JasmineCustomMatcher`,
`JasmineCustomMatcherResult`, `JasmineMatchersUtil` и `JasmineCustomEqualityTester` повторяют
собственные интерфейсы jasmine один в один.

### `withContext` не бросает — он теряет сообщение {#withcontext-does-not-throw-it-loses-the-message}

::: danger Vitest теряет сообщение к проверке
У Vitest есть внутренний метод `withContext`. Он принимает строку из Jasmine, но игнорирует её.
Сама проверка выполняется, а при ошибке вы увидите такое сообщение:

```
AssertionError: expected 2 to be 3
```

Раннер об этом не предупреждает. Передайте сообщение вторым аргументом `expect`, чтобы Vitest
напечатал его перед ошибкой:

Vitest принимает подпись вторым аргументом `expect` и печатает её перед текстом падения:

```diff
- expect(sum).withContext('the sum of one and one must be three').toBe(3);
+ expect(sum, 'the sum of one and one must be three').toBe(3);
```

```
AssertionError: the sum of one and one must be three: expected 2 to be 3
```

Преобразование `jasmine-matchers` переносит сообщение. Запустите кодмод с `--verify`, чтобы
найти оставшиеся вызовы. См. [почему Vitest не предупреждает](#why-withcontext-is-silent).
:::

### Таймаут здесь — это два числа {#the-timeout-is-two-numbers-here}

В Jasmine `jasmine.DEFAULT_TIMEOUT_INTERVAL` задаёт лимит и для тестов, и для хуков. В Vitest
значения по умолчанию разные: **5000 мс** для `testTimeout` и **10 000 мс** для `hookTimeout`.
Укажите обе настройки, если нужен общий лимит:

```ts
// vitest.config.ts
test: {
  testTimeout: 30_000,
  hookTimeout: 30_000, // jasmine had one number; Vitest defaults this one separately
}
```

Присваивание `jasmine.DEFAULT_TIMEOUT_INTERVAL` на мосту ничего не меняет. Мост один раз
предупредит и назовёт обе настройки. Для одного файла задайте их через
`vi.setConfig({ testTimeout: n, hookTimeout: n })`.

Если `beforeEach` превысил лимит, Vitest отметит сам тест как упавший. Строка
`× should create 10045ms` может означать, что время вышло в хуке, а тело теста так и не запустилось.

### `clock().install()` оставляет `Date` настоящим {#clock-install-leaves-date-real}

В Jasmine `clock().install()` подменяет таймеры, но не `Date`. В Vitest `useFakeTimers()`
подменяет и `Date`: выражение `Date.now() - start` может остаться равным `0`, а срок действия
кэша, который зависит от реального времени, так и не истечёт.

На мосту `install()` подменяет те же таймеры, что и `vi.useFakeTimers()`, но не трогает `Date`.
Чтобы подменить и `Date`, вызовите `mockDate()`. После этого `tick(ms)` двигает и `Date.now()`:

```ts
jasmine.clock().install();
jasmine.clock().mockDate(new Date('2026-01-01')); // this fakes Date
```

После кодмода `vi.useFakeTimers()` подменяет и `Date`, а `vi.advanceTimersByTime(ms)` двигает
часы вперёд. Проверьте тесты, которым нужно реальное время.

Вызовите `mockDate()` сразу после `install()`, пока ничего не запланировало таймер. Чтобы
подменить `Date`, мост переустанавливает часы. В отличие от Jasmine, он при этом удаляет
запланированные таймеры и выдаёт предупреждение:

```text
[vitest-auto-spy] jasmine.clock().mockDate() took Date over after 2 callbacks had already been
scheduled, and re-installing the fake clock dropped them. Call mockDate() right after install(),
before anything schedules a timer.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#clock-install-leaves-date-real
```

Без `install()` вызов `mockDate()` подменяет только `Date`. В Jasmine это вызывает ошибку
`Mock clock is not installed`, а мост предупреждает один раз. Сначала вызовите `install()` или
используйте [`mockSystemTime()`](/ru/utilities/fake-timers), если нужно подменить только дату.

## Два хелпера, которые на мосту ведут себя иначе {#two-helpers-that-behave-differently-on-the-bridge}

### `.and.callThrough()` возвращает к ответам этой библиотеки {#and-callthrough-restores-this-library-s-dispatch}

В Jasmine `callThrough` возвращает исходный метод, который заменил `spyOn`. У спая из
`createSpyFromClass` нет исходного метода, поэтому `jasmine-auto-spies` возвращал `undefined`.
На мосту `.and.callThrough()` снимает текущую настройку, и ответ снова задаёт `calledWith` или
`withArgs`:

```ts
service.load.withArgs(7).and.returnValue('seven');
service.load(7); // 'seven'

service.load.and.returnValue('flat'); // a strategy replaces the implementation
service.load(7); // 'flat'

service.load.and.callThrough(); // and this is the way back
service.load(7); // 'seven'
```

Кодмод оставляет `.and.callThrough()` и указывает `file:line`. У спая этой библиотеки удалите
вызов или замените его нужной настройкой `calledWith`. У `vi.spyOn` на реальном объекте просто
удалите: спай Vitest по умолчанию и так вызывает исходный метод.

### `.calls.saveArgumentsByValue()` — это no-op {#calls-saveargumentsbyvalue-is-a-no-op}

Jasmine умеет копировать аргументы, чтобы можно было проверить объект на момент вызова. Vitest,
Bun и `node:test` хранят ссылку. На мосту `saveArgumentsByValue()` работает без ошибки, но ничего
не копирует.

Даже если код теста не поменялся, он может пройти, проверив объект **после** изменения.

Если ожидаемый аргумент нельзя задать целиком, получите его с типом через
[`captureArg`](/ru/core/control-helpers) и проверьте нужное поле:

```ts
import { captureArg } from 'vitest-auto-spy';

const payload = captureArg<Payload>();

expect(service.save).toHaveBeenCalledWith(payload);
expect(payload.value.id).toBe(7);
```

`captureArg` тоже хранит ссылку. Если код меняет объект после вызова, скопируйте его внутри
`mockImplementation`:

```ts
const seen: Payload[] = [];

service.save.mockImplementation((payload: Payload) => {
  seen.push(structuredClone(payload));
});
```

Найти все оставшиеся вызовы поможет правило [`no-save-arguments-by-value`](/ru/utilities/eslint-plugin).

## На Bun и `node:test` {#on-bun-and-node-test}

`vitest-auto-spy/jasmine` импортирует Vitest, который `bun test` и `node --test` не могут загрузить.
В этих раннерах включите `.and`, `.calls` и `.withArgs` через `enableJasmineCompat()`:

```ts
// bun-test-setup.ts
import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';

enableJasmineCompat();
```

- Та же точка входа работает и для `node --test`.
- Адаптер раннера она не регистрирует, поэтому спаи по-прежнему берите из точки входа своего раннера
  (`vitest-auto-spy/bun`, `vitest-auto-spy/node`).
- Спаи, созданные **до** вызова, `.and` не получают. Поставьте вызов в файл настройки, а не в
  `beforeEach`, который выполняется после создания спаев.
- Повторный вызов безопасен.

Спаям на observable по-прежнему нужен один `import 'vitest-auto-spy/rxjs'`, как обычно. Точки входа
для jasmine rxjs не импортируют.

## Что кодмод оставляет на jasmine-точке входа {#what-the-codemod-leaves-on-the-jasmine-entry}

`createSpyObj` экспортируется только из `vitest-auto-spy/jasmine`. Кодмод заменяет
`jasmine.createSpyObj(…)` на `createSpyObj(…)` и добавляет этот импорт.

`createSpyObj` можно оставить, но он не сверяет имена методов с типом. Если есть класс,
используйте [`createSpyFromClass(C)`](/ru/core/create-spy-from-class). Если есть только интерфейс,
используйте [`createAutoMock<T>()`](/ru/core/auto-mock-by-type). Оба варианта ловят опечатки при
компиляции.

Третий аргумент создаёт спаи для геттера и сеттера, как в Jasmine. Сначала геттер возвращает
переданное значение. Чтобы обратиться к обоим спаям, возьмите дескриптор свойства:

```ts
import { type JasmineMethodSpy, createSpyObj } from 'vitest-auto-spy/jasmine';

const cart = createSpyObj('cart', ['checkout'], { total: 10 });

expect(cart.total).toBe(10); // the value passed in

const { get, set } = Object.getOwnPropertyDescriptor(cart, 'total')!;

(get as JasmineMethodSpy<() => number>).and.returnValue(7); // change the answer mid-test
cart.total = 3;

expect(cart.total).toBe(7);
expect(set).toHaveBeenCalledWith(3); // assert that the code under test wrote it
```

Приведение типа нужно, потому что `get` у дескриптора типизирован как обычная функция.

## `@hirez_io/observer-spy` едет вместе с ним {#hirez-io-observer-spy-comes-along-too}

Если в тестах есть ещё и `@hirez_io/observer-spy`, замените импорт на `vitest-auto-spy/observer-spy`.
Так вы сможете сменить раннер, не переписывая проверки потоков. API остаётся тем же:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

`ObserverSpy<T>`, `SubscriberSpy<T>`, `subscribeSpyTo` и конфигурация `{ expectErrors: true }` на
месте, с теми же именами методов: `getValues`, `getValuesLength`, `getValueAt`, `getFirstValue`,
`getLastValue`, `getError`, `receivedNext`, `receivedError`, `receivedComplete`, `onComplete`,
`onError`, `expectErrors`, `unsubscribe`.

В средней колонке — что поддерживает замена, в правой — как переписать проверки вручную.
Кодмод их не меняет.

| `@hirez_io/observer-spy`                    | на `vitest-auto-spy/observer-spy`             | конечное состояние                                                                    |
| ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `subscribeSpyTo(source$)`                   | идентично                                     | `await expectEmission(source$)` там, где смысл в одном значении                       |
| `subscribeSpyTo(source$, { expectErrors })` | идентично                                     | `await expectError(source$)`                                                          |
| `spy.getFirstValue()`                       | идентично, но **бросает** на пустом спае      | `await expectEmission(source$)`                                                       |
| `spy.getValues()`                           | идентично, но **копия**, типизированная `T[]` | `await expectEmissions(source$, n)`                                                   |
| `spy.getValueAt(i)` / `getLastValue()`      | идентично (`getValueAt` бросает на пустом)    | `await expectEmissions(source$, n)`, затем индекс                                     |
| `spy.receivedComplete()` / `onComplete()`   | идентично                                     | `await expectCompletion(source$)`                                                     |
| `spy.receivedError()` / `getError()`        | идентично                                     | `await expectError(source$)`; он резолвится _с_ ошибкой                               |
| `spy.receivedNext()`                        | идентично                                     | `await expectNoEmission(source$)` для отрицания                                       |
| `autoUnsubscribe()`                         | **не реализовано**                            | `using spy = subscribeSpyTo(source$)`                                                 |
| `queueForAutoUnsubscribe(sub)`              | **не реализовано**                            | используйте `using` или хелперы проверок, которые отписываются сами                   |
| `fakeTime(fn)`                              | **не реализовано**                            | `setupFakeTimers()` + `await advanceTimers(ms)` либо `TestScheduler` из rxjs напрямую |

Проверьте четыре отличия от `@hirez_io/observer-spy`:

- **`getValues()` возвращает копию.** Оригинал отдаёт свой внутренний массив, и сортировка
  прочитанного портит спай.
- **`getValues()` типизирован как `T[]`**, а не `any[]`, так что типы доходят до ваших проверок.
- **`getFirstValue()` и `getValueAt(i)` бросают, когда значения нет.** Оригинал возвращает
  `undefined`, хотя тип — `T`. Сигнатура та же, так что перенесённые спеки компилируются.
- **Неожиданную ошибку бросают читатели значений** (`getValues()` и остальные), с оригиналом в
  `cause`. Оригинал перебрасывает её из наблюдателя, где rxjs 7 сообщает о ней асинхронно, и
  `expect(…).toThrow()` её не видит. `{ expectErrors: true }` или `.expectErrors()` после создания
  позволяет читателям всё равно вернуть значения, как в оригинале.

`autoUnsubscribe()`, `queueForAutoUnsubscribe()` и `fakeTime()` **не реализованы** и не будут. У
`SubscriberSpy` есть `[Symbol.dispose]`, поэтому `using spy = subscribeSpyTo(source$)` отписывается в
конце блока. Вместо `fakeTime` берите `setupFakeTimers()` с `await advanceTimers(ms)` или
`TestScheduler` из rxjs напрямую.

::: tip Перенесите проверки потоков после смены раннера
С observer-spy вы подписываетесь на поток и позже проверяете, что пришло. Если поток ничего не
выдал, `getValues()` вернёт `[]`, и тест всё равно может пройти.
[`expectEmission` и другие хелперы](/ru/core/observable-assertions) ждут значение и завершают тест
ошибкой, если оно не пришло. Сначала запустите тесты с `subscribeSpyTo`, затем перенесите проверки.
:::

## Правила линтера на время переезда {#lint-rules-while-you-are-on-the-bridge}

Со второго по шестой шаг миграции вам помогут четыре правила из
[`vitest-auto-spy/eslint-plugin`](/ru/utilities/eslint-plugin):

| Правило                           | Уровень | Сообщает о                                                                                                              |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `jasmine-namespace-without-entry` | `error` | `.and` / `.calls` / `.withArgs` на спае библиотеки в файле, который нигде не ставит слой                                |
| `no-jasmine-globals`              | `error` | `jasmine.*`, голые `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(`           |
| `no-save-arguments-by-value`      | `error` | вызовах `saveArgumentsByValue()`                                                                                        |
| `prefer-native-spy-api`           | `error` | `.and` / `.calls` там, где собственный API спая говорит то же самое; **`--fix`**, если получается проследить получателя |

У всех четырёх правил уровень `error`. До прогона кодмода оставьте `prefer-native-spy-api` в
`'off'`: вызовы через мост на этом этапе нужны, а правило будет их отмечать.

- **`jasmine-namespace-without-entry`** ловит спай, созданный до вызова `enableJasmineCompat()`. Иначе
  спека падает с `Cannot read properties of undefined (reading 'returnValue')`, и это не указывает
  ни на импорт, ни на спай. Правило читает по одному файлу. Если слой ставит файл настройки, который
  спеки не импортируют, назовите его: `{ setupModules: ['./test-setup'] }`.
- **`prefer-native-spy-api`** применяет исправление, только если спай явно создан фабрикой этой
  библиотеки. В остальных местах оно предлагает suggestion: `.calls` на чужом объекте может быть его
  собственным методом. Цепочки с `?.` оно пропускает: `spy?.and.returnValue(1)` потерял бы проверку.
  Для `.and.callThrough`, `.and.returnValues`, `.and.stub`, `.and.throwError`, `.and.resolveTo`,
  `.calls.all()` и `.calls.mostRecent()` замены у него нет. Проверьте отчёт кодмода и исправьте оставшиеся вызовы вручную.
- **`no-done-callback`**, включённое на `error` в рекомендованном конфиге, тоже помогает. Кроме
  `(done) =>` оно сообщает о `done.fail(…)`. Этот вызов бросает `done.fail is not a function`, обычно
  внутри колбэка `error` или `.catch()`, которого никто не ждёт. Тест к этому моменту уже закончился,
  и прогон остаётся **зелёным на том пути, который должен был его уронить**.

## Если тесты на Angular {#if-the-suite-is-angular-s}

Если тесты Angular работают на Karma, сначала смените раннер на Vitest миграцией Angular. Спаи
перенесите кодмодом из этого гайда. Это разные задачи, поэтому нужны обе команды.

Выберите команду и настройки для вашей версии Angular:

- **`@angular/build:unit-test`** помечен `[EXPERIMENTAL]` до 22.1.x и стабилен с **22.2.0**. Работать
  пометка не мешает. Она значит, что опции билдера не подпадают под политику депрекации Angular.
- **`runner`** в v20 не имеет значения по умолчанию, его нужно задать. С **v21** по умолчанию —
  `"vitest"`.
- **`ng generate @schematics/angular:refactor-jasmine-vitest`** есть с **v21**. В
  `ng generate --help` его не видно, так что пишите имя целиком.
- **Схематики `karma-to-vitest` для `ng generate` нет.** С **v22** есть необязательная миграция
  `ng update`. Обычный `ng update` её не запускает; назовите её явно:

  ```bash
  ng update @angular/cli --migrate-only --name migrate-karma-to-vitest
  ```

Некоторые вызовы схематика Angular переписывает иначе:

- `fail(msg)` становится `throw new Error(msg)` в v21 и `expect.fail(msg)` в v22.
- `toHaveBeenCalledOnceWith(args)` становится `toHaveBeenCalledTimes(1)` плюс
  `toHaveBeenCalledWith(args)`. Здесь используйте ту же пару для совместимости с минимальной Vitest 2.1.

Для `jasmine.createSpyObj` схематика создаёт объект с `vi.fn()` и добавляет три комментария TODO.
См. [пример вывода схематики](/ru/migrating-angular-schematic).

Если в настройках билдера указать `browsers`, `vi.spyOn` на экспорте модуля выдаст ошибку: в
браузере экспорты ES-модулей доступны только для чтения. Спаи на классах и прототипах, в том числе
спаи этой библиотеки, продолжат работать. См. [браузерный режим Vitest](/ru/runtimes/vitest#browser-mode-module-exports-are-read-only).

## Что ещё вы получаете {#what-else-you-gain}

В [гайде по переходу с Jest](/ru/migrating#what-you-gain-by-moving) перечислено то, что получите
и вы: фабрики на основе типов, [фикстуры](/ru/utilities/fixtures),
[проверки `Observable`](/ru/core/observable-assertions), [спаи для консоли](/ru/utilities/console),
Bun, `node:test` и `TestBed` Angular [под `bun test`](/ru/runtimes/bun-angular). Если вы использовали
Karma, [`npx vitest-auto-spy doctor`](/ru/utilities/cli) найдёт оставшиеся `karma.conf.*` и файлы
настройки, нужные только Karma.

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Воспользуйтесь [проверкой из гайда по переходу с Jest](/ru/migrating#did-the-migration-lose-a-test).
`compareTestRuns` сверяет имена тестов в двух JSON-отчётах, а не только итоговые числа. За
одинаковыми числами могут скрываться пропавший `describe` и нестабильный тест, который прошёл.
Karma не выдаёт такой отчёт, поэтому за исходный возьмите первый успешный прогон Vitest на мосту
(шаг 3).

## Подробнее {#in-depth}

### Зачем нужен мост {#why-the-bridge-exists}

Если одновременно сменить раннер и убрать `.and` из тестов, причиной падения может быть любая
из этих правок. С мостом вы проверяете смену раннера на шаге 3, а тесты переписываете на шаге 4.

### Почему `withContext` молчит {#why-withcontext-is-silent}

В chai-слое Vitest есть `@internal`-метод `withContext`, рассчитанный на объект флагов:

```js
// @vitest/expect
withContext(context) { for (const key in context) utils.flag(this, key, context[key]); return this; }
```

Если передать строку, `for…in` примет индексы символов за имена флагов Chai и вернёт объект
проверки. Проверка выполнится, но без сообщения. Проверено на Vitest 4.1.9.

### Почему `saveArgumentsByValue()` ничего не делает {#why-saveargumentsbyvalue-does-nothing}

Копирование каждого аргумента замедлило бы все спаи, даже в проектах, где этот хелпер не нужен.

### Проект, который не импортирует эту точку входа, ничего из неё не везёт {#a-project-that-never-imports-the-entry-carries-none-of-it}

Ядро ищет слой совместимости с Jasmine только при создании спая, как и интеграцию с RxJS. Без
импорта для Jasmine код совместимости не попадает в сборку. На каждый спай остаётся одна проверка
на `undefined`.

### Как `mapContaining` ищет ключи {#how-mapcontaining-finds-keys}

`Map.has` сравнивает ключи-объекты по ссылке. Поэтому он не находит ключ-матчер и другой объект
с теми же значениями. Как и `MapContaining` в Jasmine, `jasmine.mapContaining` ищет пару, где
совпадают и ключ, и значение. Сначала он пробует прямой поиск на случай, если ссылки совпадают.

### Откуда дефекты observer-spy {#where-observer-spy-s-defects-came-from}

`@hirez_io/observer-spy` заметно популярнее: примерно **112 тыс. загрузок в неделю против 11 тыс.** у
`jasmine-auto-spies`. Последняя публикация — 2022 год.

- В оригинале `getValues()` типизирован `any[]` (их собственный issue #69), из-за чего каждый вывод
  типов в проверке превращается в `any`.
- Оригинал перебрасывает неожиданную ошибку из `error()` наблюдателя. На rxjs 6 это доходило до
  подписчика. На rxjs 7 всё, что брошено из колбэка наблюдателя, идёт через `reportUnhandledError` и
  сообщается асинхронно. Поэтому `expect(() => subscribeSpyTo(failing$)).toThrow()` этого не видит,
  а Vitest сообщает о падении без привязки к тесту, на весь файл. Бросок из читателей значений
  сохраняет громкость и возвращает ошибку туда, где спека может её прочитать.
- `autoUnsubscribe` — это глобальный `afterEach` плюс реестр; `using` заменяет их областью видимости
  блока. `fakeTime` построен на виртуальном времени `TestScheduler` из rxjs и на колбэке `done`, и ни
  то ни другое не переносится как есть.

### Чего оригинал не может {#what-upstream-cannot-do}

`jasmine-auto-spies@8.0.1` вышел в **августе 2023**. Пакет поставляется только в CommonJS, без
карты `exports`, и требует `rxjs <8` и `jasmine-core <6`. У него около дюжины открытых задач, самая
старая — с февраля 2021 года. Поддержка Vitest, которую просили в 2022 году (issue #66), и
предложенный сообществом `vitest-auto-spies` (PR #90) в пакет не вошли. Что даёт переход:

- **`Spy<T>` без `@types/jasmine`.** Типы оригинала начинаются со строки
  `/// <reference types="jasmine" />`. Импорт `Spy<T>` затаскивает глобальное пространство имён jasmine
  в вашу проверку типов и требует установленного пакета. `Spy<T>` этой библиотеки опирается на
  `MockInstance` из Vitest и не ссылается ни на что глобальное.
- **Асимметричные матчеры внутри `calledWith`.** Оригинал сравнивает аргументы как строки
  (`javascript-stringify`), поэтому `jasmine.any(String)` и `objectContaining(…)` внутри `calledWith`
  **никогда** не совпадают (issue #61, закрыт без исправления). Здесь `calledWith` выполняет матчер.
- **Ложные значения в `nextWithValues`.** Оригинал проверяет `if ('value' in cfg && cfg.value)`,
  поэтому `{ value: 0 }`, `{ value: null }` и `{ value: '' }` молча выпадают (issue #81, до сих пор
  открыт). Эта библиотека проверяет `'value' in config`, так что поток из нулей выпускает нули.
- **Абстрактные классы без приведения.** В оригинале нужен `createSpyFromClass(MyAbstractToken as any)`.
  Здесь DI-токен `abstract class` принимается как есть.
- **Типизированный спай из контейнера.** В оригинале нужен `TestBed.inject<any>(X)`, который теряет
  тип там, где он нужнее всего (issue #86 так и не сделали). Здесь
  [`injectSpy(X)`](/ru/adapters/angular) возвращает `Spy<X>`, а [`asSpy`](/ru/core/spy-typing) делает
  то же самое для контейнера, адаптера к которому у пакета нет.
- **Выбор перегрузки**, чтобы `nextWith` на сгенерированном API-клиенте перестал требовать
  `HttpEvent<T>` из последней перегрузки (issue #83): `asSpy<Client, { overload: 'first' }>(…)`.
- **[Строгие спаи](/ru/core/strict-mode)**, которые падают на ненастроенном методе, и
  **`onlyMethodsToSpyOn`** для точного списка методов. В оригинале нет ни того ни другого.

#### Дефект, который был общим у двух библиотек {#a-defect-the-two-libraries-shared}

При поиске методов оригинал проверяет только `descriptor.get`. Он принимает сеттер без геттера
в прототипе за метод и перезаписывает спай, созданный `settersToSpyOn`. Сеттер перестаёт
записывать вызовы, и проверка падает с пустым списком. У этой библиотеки был тот же баг, но
теперь она сохраняет спай сеттера.

### Версии Angular на момент написания {#angular-versions-at-the-time-of-writing}

dist-теги `@angular/core` на 2026-09-26: `latest` — **22.2.0**, `v21-lts` — **21.2.24**, `v20-lts` —
**20.3.32**. Пометку `[EXPERIMENTAL]` у `@angular/build:unit-test` сняли в angular-cli PR #34095.
`refactor-jasmine-vitest` помечен `"hidden": true` в своей коллекции схематик, а
`migrate-karma-to-vitest` — `"optional": true`.
