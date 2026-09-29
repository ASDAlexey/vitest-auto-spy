---
title: Переход с jasmine-auto-spies
description: Как перевести тесты на Jasmine или Karma с jasmine-auto-spies на Vitest. Поменяйте один импорт, и спеки работают без правок; дальше кодмод переписывает их. Внутри таблицы соответствия для API auto-spies и глобалов jasmine.
---

# Переход с jasmine-auto-spies

Эта страница переводит тесты на Jasmine (часто это Angular на Karma), которые используют
`jasmine-auto-spies` или глобалы `jasmine.*`, на Vitest и `vitest-auto-spy`. Переход идёт в два шага.
Сначала вы меняете импорт, и спеки работают без правок. Потом кодмод переписывает их на обычный
Vitest:

```diff
- import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
+ import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
```

```bash
npx vitest-auto-spy codemod --from jasmine --write
```

Ниже `vitest-auto-spy/jasmine` называется **мостом**. Он возвращает каждому спаю `.and`, `.calls` и
`.withArgs` из jasmine, так что `spy.load.and.returnValue(x)` продолжает работать.

Одно переименование опасно: `spyOn` в jasmine подменяет метод, а `vi.spyOn` в Vitest вызывает
настоящий. См. [`spyOn` на двух сторонах означает противоположное](#spyon-means-the-opposite-thing-on-the-two-sides).

## Пошагово {#step-by-step}

1. **Установите пакет и удалите старый.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jasmine-auto-spies
   ```

   Как заменить Karma на Vitest в Angular-проекте — в разделе
   [Если тесты на Angular](#if-the-suite-is-angular-s).

2. **Переведите импорты на мост.** Поменяйте путь импорта и больше ничего.

   ```diff
   - import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
   + import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
   ```

   Файлу, который использует `jasmine.createSpyObj`, `jasmine.clock()` или другой глобал
   `jasmine.*`, нужна ещё одна строка:

   ```ts
   import { jasmine } from 'vitest-auto-spy/jasmine';
   ```

   Спеки на Jasmine вызывают `describe`, `it` и `expect` без импорта, и кодмод пишет `vi` так же.
   Включите глобалы Vitest, чтобы все четыре находились:

   ```ts
   // vitest.config.ts
   export default defineConfig({ test: { globals: true } });
   ```

3. **Запустите тесты** (`npx vitest run`). Спаи ведут себя так же, как под jasmine. Всё, что падает сейчас, — настоящее
   различие раннеров, а не пропущенное переименование. Почините это до следующего шага, чтобы у
   красного прогона была только одна причина.

4. **Запустите [кодмод](/ru/utilities/codemod).** Без `--write` он только печатает дифф:

   ```bash
   npx vitest-auto-spy codemod --from jasmine            # сухой прогон: печатает дифф, ничего не пишет
   npx vitest-auto-spy codemod --from jasmine --write    # применить
   npx vitest-auto-spy codemod --from jasmine --verify   # код 1, если остался jasmine-код
   ```

   Он убирает `.and`, превращает стратегии jasmine в вызовы `mock*` и переписывает глобалы
   `jasmine.*`. Каждое место, которое переписать не может, он называет с `file:line`.

   Всегда передавайте `--from jasmine` (или полную форму `--from jasmine-auto-spies`). Режим по
   умолчанию, `--from auto`, пропускает файл, где единственный jasmine-код — голый `spyOn(`, а
   пропущенный `spyOn` превращается в [тихий вызов оригинала](#spyon-means-the-opposite-thing-on-the-two-sides).

5. **Снова запустите тесты** и поправьте строки с пометкой **✎** в
   [таблице API auto-spies](#the-auto-spies-api): их не трогает ни один трансформ.

6. **Уберите оставшиеся импорты `vitest-auto-spy/jasmine`.** Оставьте только
   `import { createSpyObj } from 'vitest-auto-spy/jasmine'` в файлах, которые его ещё вызывают. См. [Что кодмод оставляет на jasmine-точке входа](#what-the-codemod-leaves-on-the-jasmine-entry).

7. **По желанию:** включите [правила линтера на время переезда](#lint-rules-while-you-are-on-the-bridge).

## Пример: одна спека до и после {#example-one-spec-before-and-after}

Спека на `UserService` с `jasmine.createSpyObj`, `and.returnValue` и `jasmine.clock()`:

```ts
// user.service.spec.ts, под Jasmine
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

**На мосту** (шаг 2) в файле появляется один импорт, и он работает под Vitest как есть:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

**После кодмода** (шаг 4) он печатает такой дифф для исходного файла на Jasmine:

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

Что проверить в результате:

- `vi.useFakeTimers()` подменяет и `Date`, а `jasmine.clock().install()` его не трогал. Спека, которая
  вызвала `mockDate()` и сверяет `Date.now()` с фейковыми часами, продолжает проходить. Спеку, которой нужно настоящее
  время, придётся поправить. См. [`clock().install()` оставляет `Date` настоящим](#clock-install-leaves-date-real).
- `createSpyObj` по-прежнему приходит из моста. Если класс есть, лучше типизированный спай: он
  проверяет каждое имя метода.

  ```ts
  import { createSpyFromClass } from 'vitest-auto-spy';

  const api = createSpyFromClass(ApiService);
  api.get.resolveWith({ name: 'Ann' });
  ```

## `spyOn` на двух сторонах означает противоположные вещи {#spyon-means-the-opposite-thing-on-the-two-sides}

::: danger Это переименование тихое, зелёное и неправильное
`spyOn(obj, 'm')` в jasmine ставит **заглушку**: настоящий метод не выполняется. `vi.spyOn(obj, 'm')`
в Vitest **вызывает оригинал**: настоящий метод выполняется.

```diff
- spyOn(analytics, 'track');            // jasmine: track() не выполняется никогда
+ vi.spyOn(analytics, 'track');         // Vitest: track() выполняется на каждом вызове
+ vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // то, что означала строка на jasmine
```

Среднюю строку не ловит ничто. Она компилируется, и все проверки спая по-прежнему проходят. Но
настоящий `track()` теперь выполняется в каждой спеке, которая хотела его остановить. Падение
случается позже, в другом файле, когда настоящий метод пишет в стор, шлёт запрос или бросает ошибку.

У `spyOnProperty(obj, 'p', 'get')` то же вывернутое умолчание. И ещё одно отличие: в jasmine третий
аргумент необязателен и по умолчанию означает геттер. `vi.spyOn(obj, 'p')` с двумя аргументами
ставит спай на метод и бросает «can only spy on a function». Поэтому голому
`spyOnProperty(obj, 'p')` нужно явно дописать `'get'`.

Трансформ кодмода `jasmine-spy-on` делает и то и другое. Он дописывает
`.mockImplementation(() => undefined)`, а там, где нет третьего аргумента, — `'get'`. Заглушку он не
ставит, если строка уже задаёт реализацию (`.and.…` или `mock…` от наполовину ручной миграции). Из-за
этого миграции нужен кодмод, а не строчка на `sed`.
:::

### `mockReset()` возвращает сквозной вызов {#mockreset-brings-the-call-through-back}

В jasmine нет `mockReset`. `spy.calls.reset()` забывает вызовы и сохраняет заглушку, поэтому таблица
ниже переводит его в `mockClear()`. По документации Jest 29 после `mockReset()` остаётся реализация,
которая возвращает `undefined`. На Vitest 3 и новее получается другое:

| До `mockReset()`                                    | После него, на Vitest                   | После него, по документации Jest 29 |
| --------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| `vi.fn(() => 'impl').mockReturnValue('x')`          | `'impl'`, реализация, переданная в `fn` | `undefined`                         |
| `vi.fn().mockReturnValue('x')`                      | `undefined`                             | `undefined`                         |
| `vi.spyOn(api, 'load').mockImplementation(() => …)` | **настоящий `load`**, всё ещё под спаем | `undefined`                         |

Последняя строка — снова ловушка `spyOn`. Кодмод превратил `spyOn(api, 'load')` в
`vi.spyOn(api, 'load').mockImplementation(() => undefined)`. `mockReset()` в `afterEach` снимает эту
заглушку, и настоящий метод выполняется во всех следующих тестах. Чтобы забыть вызовы, берите
`mockClear()`. Если заглушка должна остаться, снова задайте `mockImplementation(() => undefined)`.

У спаев этой библиотеки два слоя настройки, и `mockReset()` сбрасывает только один. На `createSpyFromClass(Api)` вызов
`spy.load.mockReset()` снимает `mockReturnValue` и `mockImplementation`, и метод снова отвечает
`undefined`. Настройка `calledWith(…)`, `resolveWith(…)` или `nextWith(…)` сброс переживает.
`resetAutoSpy(spy)` сбрасывает обе половины. `clearAutoSpy(spy)` — это `calls.reset()` для всего
объекта. См. [Управляющие хелперы](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

## API auto-spies {#the-auto-spies-api}

`jasmine-auto-spies` и [`jest-auto-spies`](/ru/migrating) построены на одном ядре. У них одинаковые
ключи конфигурации (`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`) и
хелперы (`calledWith`, `resolveWith`, `nextWith`, `nextWithValues`, `accessorSpies`). Различается
только то, где живут асинхронные хелперы:

```ts
spy.load.and.nextWith(user); // jasmine-auto-spies
spy.load.nextWith(user); // jest-auto-spies и vitest-auto-spy
```

Как читать таблицу: средняя колонка — мост, и «идентично» значит, что строка ведёт себя как раньше. Правая колонка — конечное состояние после кодмода. **✎** помечает строки, которых не
касается ни один трансформ: их ищите руками.

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

Строки про `.calls` пропустить легче всего. Мост добавляет `.calls` во время выполнения, поэтому
спека, которая после кодмода всё ещё читает `spy.m.calls.count()`, компилируется и проходит. Правило
линтера [`prefer-native-spy-api`](/ru/utilities/eslint-plugin) сообщает о каждой такой строке.

`.and` предлагает те хелперы, которые подходят **типу возврата** метода. Метод,
который возвращает `Promise`, получает `resolveWith` / `rejectWith`. Метод, который возвращает
`Observable`, получает `nextWith` и остальные — если в файле настройки есть
`import 'vitest-auto-spy/rxjs'`.

Таблица для `@hirez_io/observer-spy` — в [отдельном разделе](#hirez-io-observer-spy-comes-along-too).

### У трёх стратегий `withArgs` нет формы с областью по аргументам {#three-withargs-strategies-have-no-argument-scoped-form}

`.withArgs(…)` ограничивает настройку одним списком аргументов. `stub()`, `throwError(e)` и
`resolveTo(v)` задают ответ, поэтому их можно так ограничить. `callFake(fn)`, `callThrough()` и
`returnValues(a, b)` ставят _реализацию_, а реализация отвечает на любой вызов. Поэтому в цепочке
`withArgs` эти три бросают ошибку, и она говорит, что написать вместо них:

```text
[vitest-auto-spy] load.withArgs(…).and.callFake() is not supported: it installs an implementation,
and an implementation answers every call rather than one argument list. Configure the value for
these arguments — `.withArgs(…).and.returnValue(v)`, `.throwError(e)`, `.resolveTo(v)` — or take
the whole spy with `load.and.callFake(…)`, which is what jasmine's own strategy does to every call
anyway.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#three-withargs-strategies-have-no-argument-scoped-form
```

`withArgs` есть только у спаев этой библиотеки — и на мосту, и после него. У `vi.spyOn(obj, 'm')`
нет `calledWith`, поэтому `spyOn(obj, 'm').withArgs(1)` перепишите руками. Либо разветвитесь по
аргументам внутри одного `mockImplementation`, либо создайте спай через `createSpyFromClass` /
`createAutoMock`: у их методов `calledWith` есть.

## Собственные глобалы jasmine {#jasmine-s-own-globals}

Спеки используют `jasmine.*`, `spyOn` и похожие функции без импорта. Под Vitest каждая из них падает с
`ReferenceError: jasmine is not defined`. Один импорт возвращает всё пространство имён, и спека
работает, пока вы ничего не переписали:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

В `globalThis` ничего не добавляется: вы явно импортируете `jasmine` в каждом файле, а кодмод в конце
удаляет эту строку.

| jasmine                                                           | под Vitest                                             | примечания                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `spyOn(o, 'm')`                                                   | `vi.spyOn(o, 'm').mockImplementation(() => undefined)` | ⚠️ [умолчание вывернуто](#spyon-means-the-opposite-thing-on-the-two-sides)                        |
| `spyOnProperty(o, 'p', 'get')`                                    | то же самое, с видом аксессора                         | то же вывернутое умолчание                                                                        |
| `jasmine.createSpy('load')`                                       | `vi.fn()`                                              | имя уходит; Vitest сообщает имя переменной                                                        |
| `jasmine.createSpy('load', original)`                             | `vi.fn(original)`                                      | исходная функция сохраняется                                                                      |
| `jasmine.createSpyObj(…)`                                         | `createSpyObj` из `vitest-auto-spy/jasmine`            | все формы оригинала; где есть класс или тип, лучше брать их                                       |
| `jasmine.any` / `anything` / `objectContaining`                   | `expect.any` / `expect.anything` / …                   | называются одинаково на обеих сторонах                                                            |
| `jasmine.arrayContaining` / `stringMatching` / `stringContaining` | `expect.arrayContaining` / …                           | называются одинаково на обеих сторонах                                                            |
| `jasmine.truthy` / `falsy` / `empty` / `notEmpty`                 | **двойника `expect.*` нет**                            | `registerJasmineMatchers()`, ниже                                                                 |
| `jasmine.is` / `mapContaining` / `setContaining`                  | **двойника `expect.*` нет**                            | `registerJasmineMatchers()`, ниже                                                                 |
| `jasmine.arrayWithExactContents`                                  | **двойника `expect.*` нет**                            | `registerJasmineMatchers()`, ниже                                                                 |
| `jasmine.clock().install()` / `.uninstall()`                      | `vi.useFakeTimers()` / `vi.useRealTimers()`            | ⚠️ на мосту `install()` оставляет `Date` настоящим, как jasmine; см. ниже                         |
| `jasmine.clock().tick(n)`                                         | `vi.advanceTimersByTime(n)`                            | `tick` и `advanceTimersByTime` не ждут промисы; [`advanceTimers`](/ru/utilities/fake-timers) ждёт |
| `jasmine.clock().mockDate(d)`                                     | `vi.setSystemTime(d)`                                  | именно это подменяет `Date`; см. ниже                                                             |
| `jasmine.clock().withMock(fn)`                                    | есть в пространстве имён; **двойника в `vi` нет**      | кодмод сообщает о нём и оставляет как есть                                                        |
| `jasmine.addMatchers(m)`                                          | `expect.extend(m)`                                     |                                                                                                   |
| `jasmine.addCustomEqualityTester(t)`                              | `expect.addEqualityTesters([t])`                       | один тестер, завёрнутый в массив, который принимает Vitest                                        |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL = n`                            | **настройка конфига, а не оператор**                   | `vi.setConfig({ testTimeout: n, hookTimeout: n })`; [оба](#the-timeout-is-two-numbers-here)       |
| `jasmine.getEnv()`                                                | **нет**                                                | порядок и bail — это `vitest.config.ts`, а не окружение во время выполнения                       |
| `jasmine.addSpyStrategy` / `setDefaultSpyStrategy`                | **нет**                                                | опишите поведение как `mockImplementation` там, где создаётся спай                                |
| `jasmine.Spy` (тип)                                               | `Mock` из `vitest`                                     | одна мок-функция                                                                                  |
| `jasmine.SpyObj<T>` (тип)                                         | `Spy<T>` из этого пакета                               | объект целиком; одно слово разницы, две разные вещи                                               |
| `fdescribe` / `fit`                                               | `describe.only` / `it.only`                            |                                                                                                   |
| `xdescribe` / `xit` / `xtest`                                     | `describe.skip` / `it.skip`                            | голое переименование падает как `TS2304: Cannot find name 'xit'`                                  |
| `expect(x).toBeTrue()` / `.toBeFalse()`                           | `.toBe(true)` / `.toBe(false)`                         | ⚠️ **не** `toBeTruthy` / `toBeFalsy`, которые предлагает собственная ошибка Vitest                |
| `expect(x).toHaveSize(n)`                                         | `.toHaveLength(n)`                                     |                                                                                                   |
| `expect(spy).toHaveBeenCalledOnceWith(a)`                         | `.toHaveBeenCalledExactlyOnceWith(a)`                  | один матчер, а не `toHaveBeenCalledTimes(1)` плюс `toHaveBeenCalledWith(a)`                       |
| `expect(el).toHaveClass(c)`                                       | **нет**                                                | вне browser mode; `expect(el.classList.contains(c)).toBe(true)`                                   |
| `expect(x).withContext(msg).toBe(y)`                              | `expect(x, msg).toBe(y)`                               | ⚠️ [сообщение исчезает, ничего не уронив](#withcontext-does-not-throw-it-loses-the-message)       |
| `fail(msg)`                                                       | `expect.fail(msg)`                                     | `vi.fail` не существует                                                                           |
| `it('x', (done) => …)`                                            | `async` + `await`                                      | **не переписывается**: Vitest передаёт `TestContext`, а не `done`                                 |

Колбэки `done` кодмод не трогает намеренно. Чтобы превратить такой тест в `async`, кто-то должен
решить, чего он ждёт. Догадка здесь даёт тест, который проходит, ничего не дождавшись. Такие тесты
находит семейство правил линтера [`await-emission`](/ru/utilities/eslint-plugin).

### Восемь матчеров, у которых нет двойника в `expect.*` {#the-eight-matchers-with-no-expect-twin}

`jasmine.truthy`, `falsy`, `empty`, `notEmpty`, `is`, `mapContaining`, `setContaining` и
`arrayWithExactContents` — асимметричные матчеры: они стоят **внутри** `toEqual(…)`,
`objectContaining({ … })` или `toHaveBeenCalledWith(…)`. В Vitest их нет, поэтому библиотека
реализует их сама:

```ts
import { registerJasmineMatchers } from 'vitest-auto-spy/jasmine';

registerJasmineMatchers(); // один раз, в файле настройки

expect({ tags: [] }).toEqual({ tags: expect.jasmineEmpty() });
```

На `expect` у них префикс `jasmine`: `expect.jasmineEmpty()`, `expect.jasmineIs()` и так далее. В
пространстве имён `jasmine` они есть и под своими именами, так что `jasmine.empty()` работает в спеке,
которую вы ещё не переписали. Без префикса нельзя: chai уже занимает `.empty` и `.is` на объекте
проверки Vitest, и `expect.extend({ empty })` бросает
`Cannot set property empty of #<Assertion> which has only a getter`.

Первое же обращение к любому члену `jasmine.*` регистрирует их. Спеке, которая использует только
`jasmine.truthy()` и подобные, вызов настройки не нужен.

`jasmine.mapContaining` сравнивает **ключи** по равенству, как jasmine, а не через `Map.has`. Поэтому
матчер на месте ключа работает, и объектный ключ, равный по значению, но другой по ссылке, — тоже:

```ts
expect(byUser).toEqual(jasmine.mapContaining(new Map([[{ id: 7 }, 'ada']])));
expect(byName).toEqual(jasmine.mapContaining(new Map([[jasmine.any(String), 'ada']])));
```

### `withContext` не бросает — он теряет сообщение {#withcontext-does-not-throw-it-loses-the-message}

::: danger Тише, чем `spyOn`
Спеки на jasmine подписывают проверки так: `expect(x).withContext('why this matters').toBe(y)`.
Кажется, что Vitest громко упадёт на незнакомом методе. Не упадёт. У Vitest есть внутренний метод с
тем же именем. Он принимает строку, игнорирует её, и проверка выполняется. Падение выглядит так:

```
AssertionError: expected 2 to be 3
```

Подписи нет — ни ошибки, ни предупреждения. Миграция через «найти и заменить», пропустившая одно такое
место, продолжает проходить.

Vitest принимает подпись вторым аргументом `expect` и печатает её перед текстом падения:

```diff
- expect(sum).withContext('the sum of one and one must be three').toBe(3);
+ expect(sum, 'the sum of one and one must be three').toBe(3);
```

```
AssertionError: the sum of one and one must be three: expected 2 to be 3
```

Трансформ кодмода `jasmine-matchers` её переносит. Потом `--verify` проверяет, что таких мест не
осталось. Другой проверки нет: раннер не пожалуется. Почему он молчит —
[Подробнее](#why-withcontext-is-silent).
:::

### Таймаут здесь — это два числа {#the-timeout-is-two-numbers-here}

В jasmine `jasmine.DEFAULT_TIMEOUT_INTERVAL` действует и на спеку, и на её хуки. В Vitest две
настройки с разными значениями по умолчанию: `testTimeout` — **5000 мс**, `hookTimeout` —
**10 000 мс**. Задайте обе, иначе медленный `beforeAll` получит другой лимит, чем его тесты:

```ts
// vitest.config.ts
test: {
  testTimeout: 30_000,
  hookTimeout: 30_000, // у jasmine было одно число; Vitest задаёт это отдельно
}
```

На мосту присваивание `jasmine.DEFAULT_TIMEOUT_INTERVAL` ничего не меняет. Оно один раз
предупреждает и называет обе настройки, чтобы спека не осталась молча со старым таймаутом.
`vi.setConfig({ testTimeout: n, hookTimeout: n })` задаёт их для одного файла.

Таймаут в хуке легко прочитать неправильно. Когда `beforeEach` не укладывается в лимит, Vitest винит
**тест**. В логе стоит `× should create 10045ms`, хотя тело теста не выполнялось.

### `clock().install()` оставляет `Date` настоящим {#clock-install-leaves-date-real}

В jasmine `clock().install()` подменяет только таймеры. `Date` подменяется отдельно, через
`mockDate()`. `useFakeTimers()` в Vitest подменяет и `Date`. Спека, которая ставит часы и потом меряет
реальное прошедшее время, видит замёрзший `Date.now()`: кэш, который никогда не истекает, или
`Date.now() - start`, равный `0`.

Поэтому на мосту `jasmine.clock().install()` оставляет `Date` настоящим, как jasmine. Кроме
`Date`, `install()` подменяет те же таймеры, что и обычный `vi.useFakeTimers()`. Чтобы подменить `Date`,
вызовите `mockDate()`. С этого момента `tick(ms)` двигает вперёд и `Date.now()`:

```ts
jasmine.clock().install();
jasmine.clock().mockDate(new Date('2026-01-01')); // именно это подменяет Date
```

После кодмода `install()` становится `vi.useFakeTimers()`, а он подменяет и `Date`, и
`vi.advanceTimersByTime(ms)` его двигает. Если спека
полагается на настоящий `Date`, проверьте её после переписывания.

Вызывайте `mockDate()` сразу после `install()`, пока никто не поставил таймер. Чтобы подменить
`Date`, `mockDate()` заново ставит фейковые часы, и уже запланированные таймеры теряются. Собственный `mockDate` в jasmine их сохраняет, поэтому
мост об этом сообщает:

```text
[vitest-auto-spy] jasmine.clock().mockDate() took Date over after 2 callbacks had already been
scheduled, and re-installing the fake clock dropped them. Call mockDate() right after install(),
before anything schedules a timer.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#clock-install-leaves-date-real
```

`mockDate()` без `install()` подменяет только `Date`, а таймеры оставляет настоящими. jasmine в этом
месте бросает ошибку (`Mock clock is not installed`), мост вместо этого один раз предупреждает.
Сначала вызовите `install()` или возьмите [`mockSystemTime()`](/ru/utilities/fake-timers), если
подменить нужно только дату.

## Два хелпера, которые на мосту ведут себя иначе {#two-helpers-that-behave-differently-on-the-bridge}

### `.and.callThrough()` возвращает к ответам этой библиотеки {#and-callthrough-restores-this-library-s-dispatch}

В jasmine `callThrough` вызывает настоящий метод, который заменил `spyOn`. Спай из
`createSpyFromClass` никогда не оборачивает настоящий метод, поэтому в `jasmine-auto-spies` он просто
возвращал `undefined`. На мосту он делает полезное: снимает заданную стратегию, и значение снова
решают `calledWith` / `withArgs`.

```ts
service.load.withArgs(7).and.returnValue('seven');
service.load(7); // 'seven'

service.load.and.returnValue('flat'); // стратегия заменяет реализацию
service.load(7); // 'flat'

service.load.and.callThrough(); // а это путь обратно
service.load(7); // 'seven'
```

Кодмод не может переписать `.and.callThrough()`, поэтому оставляет строку и сообщает о ней с
`file:line`. На спае этой библиотеки удалите его или замените нужной цепочкой `calledWith`. На
`vi.spyOn` настоящего объекта просто удалите: `vi.spyOn` и так вызывает оригинал.

### `.calls.saveArgumentsByValue()` — это no-op {#calls-saveargumentsbyvalue-is-a-no-op}

jasmine умеет копировать аргументы вызова, и спека может проверить объект таким, каким он был в
момент вызова, даже если код потом его изменил. Vitest, Bun и `node:test` хранят ссылку на живой
объект. На мосту `saveArgumentsByValue()` есть, чтобы спека запускалась, но ничего не делает.

В этом ловушка. **Спека, которая на него полагалась, теперь проверяет объект уже после изменения.** Она
остаётся зелёной, и строка выглядит так же.

Если аргумент нельзя выписать в тесте, [`captureArg`](/ru/core/control-helpers) захватывает его с
типом, а прочитать его можно в проверке:

```ts
import { captureArg } from 'vitest-auto-spy';

const payload = captureArg<Payload>();

expect(service.save).toHaveBeenCalledWith(payload);
expect(payload.value.id).toBe(7);
```

`captureArg` держит ту же живую ссылку. Если код **меняет объект после вызова**, снимайте копию во
время вызова:

```ts
const seen: Payload[] = [];

service.save.mockImplementation((payload: Payload) => {
  seen.push(structuredClone(payload));
});
```

Правило линтера [`no-save-arguments-by-value`](/ru/utilities/eslint-plugin) сообщает о каждом
оставшемся вызове. Это единственный надёжный способ их найти.

## На Bun и `node:test` {#on-bun-and-node-test}

`vitest-auto-spy/jasmine` импортирует `vitest`, а `bun test` и `node --test` его загрузить не могут.
На этих раннерах слой `.and` / `.calls` / `.withArgs` включается вызовом:

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

Одно имя: **`createSpyObj`**. Другого такого экспорта в библиотеке нет. Поэтому кодмод переписывает
`jasmine.createSpyObj(…)` в `createSpyObj(…)` и импортирует его из `vitest-auto-spy/jasmine`.

Так можно и оставить, но замену стоит обдумать. `createSpyObj` не может сверить имя метода с типом:
типа у него нет. Если есть класс, берите [`createSpyFromClass(C)`](/ru/core/create-spy-from-class).
Если есть только интерфейс — [`createAutoMock<T>()`](/ru/core/auto-mock-by-type). Оба падают при
компиляции на опечатке в имени.

Третий аргумент создаёт **свойства под спаем**, как в jasmine, а не простые значения. Чтение свойства
возвращает переданное значение, так что перенесённая спека разницы не заметит. Как и в jasmine, спаи
на геттер и сеттер доступны только через дескриптор свойства:

```ts
import { type JasmineMethodSpy, createSpyObj } from 'vitest-auto-spy/jasmine';

const cart = createSpyObj('cart', ['checkout'], { total: 10 });

expect(cart.total).toBe(10); // переданное значение

const { get, set } = Object.getOwnPropertyDescriptor(cart, 'total')!;

(get as JasmineMethodSpy<() => number>).and.returnValue(7); // поменять ответ посреди теста
cart.total = 3;

expect(cart.total).toBe(7);
expect(set).toHaveBeenCalledWith(3); // проверить, что тестируемый код записал значение
```

Приведение типа нужно, потому что `get` у дескриптора типизирован как обычная функция.

## `@hirez_io/observer-spy` едет вместе с ним {#hirez-io-observer-spy-comes-along-too}

Проект на `jasmine-auto-spies` обычно использует и `@hirez_io/observer-spy`. Переписывать каждую
проверку потока вместе со всем остальным — то, из-за чего такие миграции застревают. Поэтому
`vitest-auto-spy/observer-spy` даёт тот же API:

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

Средняя колонка — мост. Правая — куда двигаться дальше: это другой **вид** проверки, а не
переименование, поэтому кодмод этого не делает.

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
| `queueForAutoUnsubscribe(sub)`              | **не реализовано**                            | то же самое или ничего: хелперы эмиссий отписываются сами                             |
| `fakeTime(fn)`                              | **не реализовано**                            | `setupFakeTimers()` + `await advanceTimers(ms)` либо `TestScheduler` из rxjs напрямую |

Четыре отличия от `@hirez_io/observer-spy`, и каждое исправляет дефект:

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

::: tip Мост, а не пункт назначения
С observer-spy вы подписываетесь, даёте событиям случиться и потом читаете спай. Если поток ничего не
выпустил, `getValues()` вернёт `[]`, и спека может пройти, ничего не увидев.
[`expectEmission` и соседние хелперы](/ru/core/observable-assertions) ждут значение и падают, если оно
не пришло. Сначала доведите тесты до зелёного на `subscribeSpyTo`, потом переносите проверки.
:::

## Правила линтера на время переезда {#lint-rules-while-you-are-on-the-bridge}

Четыре правила в [`vitest-auto-spy/eslint-plugin`](/ru/utilities/eslint-plugin) закрывают время между
шагом 2 и шагом 6:

| Правило                           | Уровень | Сообщает о                                                                                                              |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `jasmine-namespace-without-entry` | `error` | `.and` / `.calls` / `.withArgs` на спае библиотеки в файле, который нигде не ставит слой                                |
| `no-jasmine-globals`              | `error` | `jasmine.*`, голые `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(`           |
| `no-save-arguments-by-value`      | `error` | описанном выше no-op                                                                                                    |
| `prefer-native-spy-api`           | `error` | `.and` / `.calls` там, где собственный API спая говорит то же самое; **`--fix`**, если получается проследить получателя |

Все четыре включены на `error`. Выключите `prefer-native-spy-api` (`'off'`) до прогона кодмода: до
него правило сообщает о каждом вызове моста, а на время миграции эти вызовы правильные.

- **`jasmine-namespace-without-entry`** ловит спай, созданный до вызова `enableJasmineCompat()`. Иначе
  спека падает с `Cannot read properties of undefined (reading 'returnValue')`, и это не указывает
  ни на импорт, ни на спай. Правило читает по одному файлу. Если слой ставит файл настройки, который
  спеки не импортируют, назовите его: `{ setupModules: ['./test-setup'] }`.
- **`prefer-native-spy-api`** применяет исправление, только если спай явно создан фабрикой этой
  библиотеки. В остальных местах оно предлагает suggestion: `.calls` на чужом объекте может быть его
  собственным методом. Цепочки с `?.` оно пропускает: `spy?.and.returnValue(1)` потерял бы проверку.
  Для `.and.callThrough`, `.and.returnValues`, `.and.stub`, `.and.throwError`, `.and.resolveTo`,
  `.calls.all()` и `.calls.mostRecent()` замены у него нет; их переписывает кодмод.
- **`no-done-callback`**, включённое на `error` в рекомендованном конфиге, тоже помогает. Кроме
  `(done) =>` оно сообщает о `done.fail(…)`. Этот вызов бросает `done.fail is not a function`, обычно
  внутри колбэка `error` или `.catch()`, которого никто не ждёт. Тест к этому моменту уже закончился,
  и прогон остаётся **зелёным на том пути, который должен был его уронить**.

## Если тесты на Angular {#if-the-suite-is-angular-s}

Большинство проектов на `jasmine-auto-spies` — это Angular на Karma. Раннер с Karma на Vitest
переключает собственная миграция Angular (команда ниже), а спаи меняет кодмод выше. Нужны обе.

Что есть в какой версии Angular:

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

Там, где схематика и эта страница переписывают по-разному, схематика осторожнее:

- `fail(msg)` становится `throw new Error(msg)` в v21 и `expect.fail(msg)` в v22.
- `toHaveBeenCalledOnceWith(args)` становится `toHaveBeenCalledTimes(1)` плюс
  `toHaveBeenCalledWith(args)`. Здесь — `toHaveBeenCalledExactlyOnceWith(args)`. Верно и то и другое;
  один матчер даёт сообщение о падении понятнее.

Из `jasmine.createSpyObj` схематика делает объект из `vi.fn()` и три TODO-комментария. Настоящий
вывод — на [отдельной странице](/ru/migrating-angular-schematic).

Если тесты ещё и запускаются в настоящем браузере (опция `browsers` у `@angular/build:unit-test`),
появляется ещё одно отличие. `vi.spyOn` на экспорте модуля там бросает ошибку: браузер запечатывает
экспорты ES-модулей. Спаи на классах и прототипах, включая все спаи этой библиотеки, это не задевает.
См. [Vitest → Browser mode](/ru/runtimes/vitest#browser-mode-module-exports-are-read-only).

## Что ещё вы получаете {#what-else-you-gain}

Всё, что перечисляет [страница про миграцию с jest](/ru/migrating#what-you-gain-by-moving): фабрики,
работающие от типа, [фикстуры](/ru/utilities/fixtures), [проверки на observable](/ru/core/observable-assertions),
[спаи на консоль](/ru/utilities/console), Bun и `node:test`, `TestBed` из Angular
[под `bun test`](/ru/runtimes/bun-angular). Проект на jasmine, скорее всего, работал ещё и под Karma.
[`npx vitest-auto-spy doctor`](/ru/utilities/cli) находит оставшиеся `karma.conf.*` и файлы настройки,
которые использовала только Karma.

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Проверьте так же, как на [странице про jest](/ru/migrating#did-the-migration-lose-a-test).
`compareTestRuns` сравнивает **имена** тестов в двух JSON-отчётах, а не только итоги: два прогона с
одинаковыми итогами могут различаться потерянным `describe` и починившимся нестабильным тестом. Karma
такого JSON-отчёта не даёт. Поэтому базу берите с первого зелёного прогона Vitest на мосту: шаг 3
даёт ровно его.

## Подробнее {#in-depth}

### Зачем нужен мост {#why-the-bridge-exists}

Если сделать обе работы одним коммитом (убрать `.and.` в тысячах спек и сменить раннер), у первого
красного прогона будет две возможные причины и нет способа их различить. Мост их разделяет: шаг 3
проверяет раннер, шаг 4 — переписывание.

### Почему `withContext` молчит {#why-withcontext-is-silent}

В chai-слое Vitest есть `@internal`-метод `withContext`, рассчитанный на объект флагов:

```js
// @vitest/expect
withContext(context) { for (const key in context) utils.flag(this, key, context[key]); return this; }
```

Получив строку, `for…in` обходит индексы её символов, выставляет несколько бессмысленных флагов chai и
возвращает проверку. Цепочка продолжается, а сообщение теряется. Проверено на Vitest 4.1.9.

### Почему `saveArgumentsByValue()` ничего не делает {#why-saveargumentsbyvalue-does-nothing}

Копировать каждый аргумент каждого вызова значило бы замедлить каждый спай в каждом проекте ради
хелпера, который встречается в паре спек.

### Проект, который не импортирует эту точку входа, ничего из неё не везёт {#a-project-that-never-imports-the-entry-carries-none-of-it}

Ядро ищет jasmine-слой лениво, как и слой rxjs. Проект, который ни разу не импортировал
jasmine-точку входа, платит одной проверкой на `undefined` на спай, и код совместимости в его бандл не
попадает.

### Как `mapContaining` ищет ключи {#how-mapcontaining-finds-keys}

`Map.has` сравнивает по ссылке, поэтому не находит ни матчер на месте ключа, ни равный по значению
объектный ключ. `jasmine.mapContaining` ищет пару, у которой совпадают и ключ, и значение, как
`MapContaining` в самом jasmine. Прямой поиск по ключу всё равно пробуется первым — для обычного
случая, когда ключ тот же по ссылке.

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

`jasmine-auto-spies@8.0.1` последний раз публиковался в **августе 2023**. Он только CJS, без карты
`exports`, прибит к `rxjs <8` и `jasmine-core <6` и несёт дюжину открытых issue, старейший — с
февраля 2021. Поддержку Vitest просили в 2022 году (issue #66). Community-пакет `vitest-auto-spies`
предложили как PR #90, и он до сих пор не влит. Так выглядит стабильный пакет, который перестал
развиваться. Это значит, что следующего в оригинале не будет, а перенесённый проект получает каждый
пункт сразу:

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

Оригинал ищет методы, проверяя только `descriptor.get`. Поэтому сеттер на прототипе **только на
запись** выглядит как метод: поверх него ставится спай-функция и затирает спай на сеттер, который
только что создал `settersToSpyOn`. Дальше сеттер ничего не записывает, а спека, которая его
проверяет, падает с пустым списком вызовов и без объяснений. В этой библиотеке был ровно такой же баг,
унаследованный тем же путём. Здесь он исправлен.

### Версии Angular на момент написания {#angular-versions-at-the-time-of-writing}

dist-теги `@angular/core` на 2026-09-26: `latest` — **22.2.0**, `v21-lts` — **21.2.24**, `v20-lts` —
**20.3.32**. Пометку `[EXPERIMENTAL]` у `@angular/build:unit-test` сняли в angular-cli PR #34095.
`refactor-jasmine-vitest` помечен `"hidden": true` в своей коллекции схематик, а
`migrate-karma-to-vitest` — `"optional": true`.
