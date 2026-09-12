---
title: Переход с jasmine-auto-spies
description: jasmine-auto-spies и jest-auto-spies — родные братья над одним ядром, и различается ровно одна вещь — пространство имён .and. Точка входа vitest-auto-spy/jasmine возвращает его на место, так что сюита становится зелёной ещё до того, как что-то переписано; дальше кодмод убирает его снова. Внутри — полная таблица соответствия и для API auto-spies, и для собственных глобалов jasmine.
---

# Переход с jasmine-auto-spies

`jasmine-auto-spies` и [`jest-auto-spies`](/ru/migrating) — это одна и та же библиотека дважды. Обе
представляют собой тонкий слой над `@hirez_io/auto-spies-core`, каждый ключ конфигурации пишется
одинаково (`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`), и каждый
хелпер тоже — `calledWith`, `resolveWith`, `nextWith`, `nextWithValues`, `accessorSpies`.

**Различается ровно одна вещь.** Наверху асинхронные хелперы припаркованы в пространстве имён `.and`
спая — потому что именно там jasmine держит собственные стратегии спаев:

```ts
spy.load.and.nextWith(account); // jasmine-auto-spies
spy.load.nextWith(account); // jest-auto-spies и здесь
```

Так что миграция с jasmine — это [миграция с jest](/ru/migrating) плюс удаление `.and.`, а
`vitest-auto-spy/jasmine` существует ровно затем, чтобы делать это не пришлось первым делом.

## Путь в два шага {#the-two-step-path}

Удалить `.and.` в двух тысячах спек и заодно поменять раннер одним коммитом — значит получить первый
красный прогон с двумя возможными причинами и без способа их различить. Поэтому сначала прокладка:

1. **Сделайте зелёным на прокладке.** Поменяйте спецификатор импорта и больше ничего.

   ```diff
   - import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
   + import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
   ```

   Эта точка входа регистрирует адаптер Vitest и ставит `.and`, `.calls` и `.withArgs` на каждый спай,
   построенный после неё, так что `spy.load.and.returnValue(x)` и `spy.load.calls.count()` значат то
   же, что и значили. Всё, что падает теперь, — настоящее различие между раннерами, а не
   переименование.

2. **Запустите кодмод**, который убирает пространство имён `.and` вместе с собственными глобалами
   jasmine:

   ```bash
   npx vitest-auto-spy codemod --from jasmine            # сухой прогон: печатает дифф, ничего не пишет
   npx vitest-auto-spy codemod --from jasmine --write    # применить
   npx vitest-auto-spy codemod --from jasmine --verify   # сопоставить результат, а не дифф
   ```

   `--from jasmine-auto-spies` — то же самое, написанное полностью. `--from auto` стоит по умолчанию и
   читает каждый файл: файл, в котором есть член `jasmine.`, старый импорт, импорт
   `vitest-auto-spy/jasmine` или `.and.`, получает jasmine-трансформы, а файл без всего этого — нет.
   Сюите, у которой единственная jasmine-конструкция — это голый `spyOn(`, нужно сказать
   `--from jasmine` вслух; почему угадывание здесь было бы худшим из возможных исходов — см.
   предупреждение ниже.

3. **Уберите импорт.** Как только кодмод отработал, `vitest-auto-spy/jasmine` не экспортирует ничего,
   чем сюита ещё пользуется, — кроме `createSpyObj`, у которого больше нигде нет аналога. См.
   [что кодмод оставляет](#what-the-codemod-leaves-on-the-jasmine-entry).

## `spyOn` на двух сторонах означает противоположные вещи {#spyon-means-the-opposite-thing-on-the-two-sides}

::: danger Это то самое переименование — тихое, зелёное и неправильное
`spyOn(obj, 'm')` в jasmine ставит **заглушку**: настоящий метод не выполняется. `vi.spyOn(obj, 'm')`
в Vitest **вызывает оригинал** — выполняется.

```diff
- spyOn(analytics, 'track');            // jasmine: track() не выполняется никогда
+ vi.spyOn(analytics, 'track');         // Vitest: track() выполняется на каждом вызове
+ vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // то, что означала строка на jasmine
```

Среднюю строку не ловит ничто. Она компилируется, проходит проверку типов, и спека по-прежнему
проходит все проверки, которые делает про спай, — изменилось только то, что настоящая реализация
начала выполняться внутри каждой спеки, которая ставила спай как раз затем, чтобы её остановить.
Падает это позже, в другом файле, если настоящий метод пишет в стор, отправляет запрос или бросает.

У `spyOnProperty(obj, 'p', 'get')` умолчание такое же, и уходит он туда же.

Трансформ `jasmine-spy-on` дописывает тот no-op, который jasmine ставила бесплатно, и пропускает
только те места, где выражение уже цепляет стратегию, которая всё равно заменяет реализацию (`.and.…`
или `mock…` от наполовину сделанной ручной миграции). Именно поэтому у этой миграции есть кодмод, а не
строчка на `sed`.
:::

## API auto-spies {#the-auto-spies-api}

Ничто в этой таблице не является изменением поведения на прокладке — средняя колонка описывает, что
делает та же строка после смены спецификатора импорта. Правая колонка — конечное состояние; **✎**
помечает строки, которых не касается ни один трансформ: их и надо искать руками после прогона кодмода.

| `jasmine-auto-spies`                                               | на `vitest-auto-spy/jasmine`                                          | конечное состояние                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `createSpyFromClass(C)`                                            | идентично                                                             | `createSpyFromClass` из `vitest-auto-spy`                     |
| `createSpyFromClass(C, ['load', 'save'])`                          | идентично                                                             | без изменений                                                 |
| `methodsToSpyOn` / `observablePropsToSpyOn`                        | идентично, тот же дополняющий смысл                                   | без изменений                                                 |
| `gettersToSpyOn` / `settersToSpyOn`                                | идентично                                                             | без изменений                                                 |
| `providedMethodNames`                                              | принимается, вливается в `methodsToSpyOn`, предупреждает раз на вызов | ✎ переименуйте в `methodsToSpyOn`                             |
| `createFunctionSpy<F>('name')`                                     | идентично                                                             | `createFunctionSpy` из `vitest-auto-spy`                      |
| `provideAutoSpy(C)`                                                | идентичный `{ provide, useValue }`                                    | `provideAutoSpy` из `/angular` (или `/nestjs`, `/vue`)        |
| `createSpyObj(base, names, props?)`                                | идентично, все четыре формы аргументов                                | **остаётся на `/jasmine`** — больше его никто не экспортирует |
| `type Spy<T>`                                                      | та же форма, **без** `@types/jasmine`                                 | `Spy<T>` из `vitest-auto-spy`                                 |
| `createObservableWithValues`                                       | из `vitest-auto-spy/rxjs`, без изменений                              | без изменений                                                 |
| `spy.m.and.returnValue(v)`                                         | идентично                                                             | `spy.m.mockReturnValue(v)`                                    |
| `spy.m.and.returnValues(a, b)`                                     | идентично                                                             | `.mockReturnValueOnce(a).mockReturnValueOnce(b)`              |
| `spy.m.and.callFake(fn)`                                           | идентично                                                             | `spy.m.mockImplementation(fn)`                                |
| `spy.m.and.stub()`                                                 | идентично                                                             | `spy.m.mockImplementation(() => undefined)`                   |
| `spy.m.and.throwError('boom')`                                     | идентично                                                             | `.mockImplementation(() => { throw new Error('boom'); })`     |
| `spy.m.and.resolveTo(v)`                                           | идентично                                                             | `spy.m.mockResolvedValue(v)`                                  |
| `spy.m.and.callThrough()`                                          | **восстанавливает диспетчеризацию этой библиотеки** — см. ниже        | сообщается, оставляется побайтно как есть                     |
| `spy.m.and.identity`                                               | имя спая                                                              | ✎ Vitest называет переменную, а не спай — уберите чтение      |
| `spy.m.and.resolveWith / rejectWith / resolveWithPerCall`          | идентично                                                             | уберите `.and` — `spy.m.resolveWith(v)`                       |
| `spy.m.and.nextWith / nextOneTimeWith / nextWithValues`            | идентично                                                             | уберите `.and`                                                |
| `spy.m.and.nextWithPerCall / throwWith / complete / returnSubject` | идентично                                                             | уберите `.and`                                                |
| `spy.m.withArgs(1).and.returnValue(v)`                             | идентично                                                             | `spy.m.calledWith(1).mockReturnValue(v)`                      |
| `expect(spy.m.withArgs(1)).toHaveBeenCalled()`                     | **аналога нет** — `withArgs` возвращает цепочку, а не спай            | ✎ `expect(spy.m).toHaveBeenCalledWith(1)`                     |
| `spy.m.calls.count()` / `any()`                                    | идентично                                                             | ✎ `spy.m.mock.calls.length`                                   |
| `spy.m.calls.argsFor(i)` / `allArgs()`                             | идентично                                                             | ✎ `spy.m.mock.calls[i]` / `spy.m.mock.calls`                  |
| `spy.m.calls.all()` / `first()` / `mostRecent()`                   | идентично                                                             | ✎ `spy.m.mock.calls` рядом с `spy.m.mock.results`             |
| `spy.m.calls.thisFor(i)`                                           | идентично                                                             | ✎ `spy.m.mock.instances[i]`                                   |
| `spy.m.calls.reset()`                                              | идентично                                                             | ✎ `spy.m.mockClear()`                                         |
| `spy.m.calls.saveArgumentsByValue()`                               | **задокументированный no-op** — см. ниже                              | ✎ снимайте копию в `mockImplementation`                       |
| `spy.accessorSpies.getters.x.and.returnValue(v)`                   | идентично                                                             | `spy.accessorSpies.getters.x.mockReturnValue(v)`              |

И `@hirez_io/observer-spy` рядом с ним, который заменяет та же точка входа, — см.
[ниже](#hirez-io-observer-spy-comes-along-too). Конечное состояние — это другой **род** проверки, а не
переименование, поэтому ни одна из этих строк не дело кодмода:

| `@hirez_io/observer-spy`                    | на `vitest-auto-spy/observer-spy`             | конечное состояние                                                                    |
| ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `subscribeSpyTo(source$)`                   | идентично                                     | `await expectEmission(source$)` там, где смысл в одном значении                       |
| `subscribeSpyTo(source$, { expectErrors })` | идентично                                     | `await expectError(source$)`                                                          |
| `spy.getFirstValue()`                       | идентично, но **бросает** на пустом спае      | `await expectEmission(source$)`                                                       |
| `spy.getValues()`                           | идентично, но **копия**, типизированная `T[]` | `await expectEmissions(source$, n)`                                                   |
| `spy.getValueAt(i)` / `getLastValue()`      | идентично (`getValueAt` бросает на пустом)    | `await expectEmissions(source$, n)`, затем индекс                                     |
| `spy.receivedComplete()` / `onComplete()`   | идентично                                     | `await expectCompletion(source$)`                                                     |
| `spy.receivedError()` / `getError()`        | идентично                                     | `await expectError(source$)` — он резолвится _с_ ошибкой                              |
| `spy.receivedNext()`                        | идентично                                     | `await expectNoEmission(source$)` для отрицания                                       |
| `autoUnsubscribe()`                         | **не реализовано**                            | `using spy = subscribeSpyTo(source$)`                                                 |
| `queueForAutoUnsubscribe(sub)`              | **не реализовано**                            | то же самое — или ничего, потому что хелперы эмиссий отписываются сами                |
| `fakeTime(fn)`                              | **не реализовано**                            | `setupFakeTimers()` + `await advanceTimers(ms)` либо `TestScheduler` из rxjs напрямую |

Последние три отсутствуют намеренно, а не «пока не сделаны». `fakeTime` построен на виртуальном
времени `TestScheduler` из rxjs _и_ на протоколе колбэка `done`, а ни то ни другое переезд целым не
переживает; `autoUnsubscribe` — это глобальный `afterEach` плюс реестр, и `using` заменяет их областью
видимости блока, которая ошибиться не может.

Строки про `.calls` — длинный хвост этой миграции: пространство имён работает **в рантайме**, поэтому
спека, которая после кодмода всё ещё читает `spy.m.calls.count()`, компилируется, выполняется и
проходит. Переписать её ничто не заставляет — и это аргумент в пользу
[`prefer-native-spy-api`](/ru/utilities/eslint-plugin), правила, которое сообщает о каждой такой
строке.

`.and` у спая на метод несёт тот набор хелперов, который заслуживает **тип возврата**, ровно как и сам
метод: метод, возвращающий `Promise`, получает `resolveWith` / `rejectWith`, возвращающий
`Observable` — `nextWith` и остальные, и только после того, как где-то отработал
`import 'vitest-auto-spy/rxjs'`, как и на любой другой точке входа.

## Собственные глобалы jasmine {#jasmine-s-own-globals}

Они встречаются в файлах, которые к auto-spies отношения не имеют, их никто не импортирует, и после
смены раннера каждый из них падает как `ReferenceError: jasmine is not defined` на первой же строке,
которая его читает. Один импорт возвращает всё пространство имён, так что сюита работает до того, как
хоть что-то из этого переписано:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

На `globalThis` не ставится ничего. Глобал, который появляется оттого, что что-то импортировало
библиотеку, — это то самое действие на расстоянии, из-за которого о миграции невозможно рассуждать, а
явный импорт — одна строка на файл, которую кодмод в конце удаляет.

| jasmine                                                           | под Vitest                                             | примечания                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `spyOn(o, 'm')`                                                   | `vi.spyOn(o, 'm').mockImplementation(() => undefined)` | ⚠️ [умолчание вывернуто](#spyon-means-the-opposite-thing-on-the-two-sides)                       |
| `spyOnProperty(o, 'p', 'get')`                                    | то же самое, с видом аксессора                         | то же вывернутое умолчание                                                                       |
| `jasmine.createSpy('load')`                                       | `vi.fn()`                                              | имя уходит — Vitest сообщает о переменной                                                        |
| `jasmine.createSpy('load', original)`                             | `vi.fn(original)`                                      | оригинал — тот аргумент, который ещё что-то значит                                               |
| `jasmine.createSpyObj(…)`                                         | `createSpyObj` из `vitest-auto-spy/jasmine`            | все формы, что и наверху; где есть класс или тип, лучше брать их                                 |
| `jasmine.any` / `anything` / `objectContaining`                   | `expect.any` / `expect.anything` / …                   | называются одинаково на обеих сторонах                                                           |
| `jasmine.arrayContaining` / `stringMatching` / `stringContaining` | `expect.arrayContaining` / …                           | называются одинаково на обеих сторонах                                                           |
| `jasmine.truthy` / `falsy` / `empty` / `notEmpty`                 | **двойника `expect.*` нет**                            | `registerJasmineMatchers()`, ниже                                                                |
| `jasmine.is` / `mapContaining` / `setContaining`                  | **двойника `expect.*` нет**                            | `registerJasmineMatchers()`, ниже                                                                |
| `jasmine.arrayWithExactContents`                                  | **двойника `expect.*` нет**                            | `registerJasmineMatchers()`, ниже                                                                |
| `jasmine.clock().install()` / `.uninstall()`                      | `vi.useFakeTimers()` / `vi.useRealTimers()`            |                                                                                                  |
| `jasmine.clock().tick(n)`                                         | `vi.advanceTimersByTime(n)`                            | ни то ни другое не досчитывает промис — [`advanceTimers`](/ru/utilities/fake-timers) досчитывает |
| `jasmine.clock().mockDate(d)`                                     | `vi.setSystemTime(d)`                                  |                                                                                                  |
| `jasmine.clock().withMock(fn)`                                    | есть в пространстве имён; **двойника в `vi` нет**      | кодмод сообщает о нём и оставляет как есть                                                       |
| `jasmine.addMatchers(m)`                                          | `expect.extend(m)`                                     |                                                                                                  |
| `jasmine.addCustomEqualityTester(t)`                              | `expect.addEqualityTesters([t])`                       | один тестер, завёрнутый в массив, который принимает Vitest                                       |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL = n`                            | **настройка конфига, а не оператор**                   | `vi.setConfig({ testTimeout: n, hookTimeout: n })` — [оба](#the-timeout-is-two-numbers-here)     |
| `jasmine.getEnv()`                                                | **нет**                                                | порядок и bail — это `vitest.config.ts`, а не рантайм-окружение                                  |
| `jasmine.addSpyStrategy` / `setDefaultSpyStrategy`                | **нет**                                                | опишите поведение как `mockImplementation` там, где строится дубль                               |
| `jasmine.Spy` (тип)                                               | `Mock` из `vitest`                                     | голый mock                                                                                       |
| `jasmine.SpyObj<T>` (тип)                                         | `Spy<T>` из этого пакета                               | дубль целиком — одно слово разницы, две разные вещи                                              |
| `fdescribe` / `fit`                                               | `describe.only` / `it.only`                            |                                                                                                  |
| `xdescribe` / `xit` / `xtest`                                     | `describe.skip` / `it.skip`                            | голое переименование падает как `TS2304: Cannot find name 'xit'`                                 |
| `expect(x).toBeTrue()` / `.toBeFalse()`                           | `.toBe(true)` / `.toBe(false)`                         | ⚠️ **не** `toBeTruthy` / `toBeFalsy`, которые предлагает собственная ошибка Vitest               |
| `expect(x).toHaveSize(n)`                                         | `.toHaveLength(n)`                                     |                                                                                                  |
| `expect(spy).toHaveBeenCalledOnceWith(a)`                         | `.toHaveBeenCalledExactlyOnceWith(a)`                  | один матчер, а не `toHaveBeenCalledTimes(1)` плюс `toHaveBeenCalledWith(a)`                      |
| `expect(el).toHaveClass(c)`                                       | **нет**                                                | вне browser mode; `expect(el.classList.contains(c)).toBe(true)`                                  |
| `expect(x).withContext(msg).toBe(y)`                              | `expect(x, msg).toBe(y)`                               | ⚠️ [сообщение исчезает, ничего не уронив](#withcontext-does-not-throw-it-loses-the-message)      |
| `fail(msg)`                                                       | `expect.fail(msg)`                                     | никакого `vi.fail` не существует                                                                 |
| `it('x', (done) => …)`                                            | `async` + `await`                                      | **не переписывается** — Vitest передаёт `TestContext`, а не `done`                               |

Строку про `done` кодмод не трогает намеренно. Сигнатура с колбэком — это форма управления потоком, а
не имя: превратить её в `async` значит решить, чего именно ждёт тест, а правдоподобная догадка здесь —
это тест, который проходит, ничего не дождавшись. Находит такие семейство правил линтера
[`await-emission`](/ru/utilities/eslint-plugin).

### Восемь матчеров, у которых нет двойника в `expect.*` {#the-eight-matchers-with-no-expect-twin}

Асимметричный матчер — единственное, что может стоять **внутри** `objectContaining({ … })` или
`toHaveBeenCalledWith(…)`; `expect(x).toBeTruthy()` туда не поставить. Поэтому эти восемь реализованы,
а не отображены на что-то другое:

```ts
import { registerJasmineMatchers } from 'vitest-auto-spy/jasmine';

registerJasmineMatchers(); // один раз, в файле настройки

expect({ tags: [] }).toEqual({ tags: expect.jasmineEmpty() });
```

Они регистрируются под именами с префиксом `jasmine` — `expect.jasmineEmpty()`, `expect.jasmineIs()` и
так далее — и переопубликовываются под собственными именами jasmine в пространстве имён `jasmine`, так
что `jasmine.empty()` читается нормально в ещё не переписанной спеке. Префикс не косметический: chai
публикует `.empty` как геттер, а `.is` — как языковую цепочку на объекте утверждения Vitest, поэтому
`expect.extend({ empty })` прямо бросает
`Cannot set property empty of #<Assertion> which has only a getter`.

Всё, что лежит в пространстве имён `jasmine`, регистрирует их при первом же использовании, так что
сюите, которая трогает их только через `jasmine.truthy()`, вызов настройки не нужен вовсе.

### `withContext` не бросает — он теряет сообщение {#withcontext-does-not-throw-it-loses-the-message}

::: danger Второй тихий случай, и он тише, чем `spyOn`
`expect(x).withContext('why this matters').toBe(y)` — это форма, которой jasmine-сюита подписывает свои
проверки, и разумно ожидать, что у Vitest такого метода нет и строка умрёт громко. Не умрёт.
В chai-слое Vitest есть `@internal`-метод ровно с таким именем, предназначенный для **объекта
флагов**:

```js
// @vitest/expect
withContext(context) { for (const key in context) utils.flag(this, key, context[key]); return this; }
```

Получив **строку**, `for…in` обходит её собственные индексы символов, выставляет горстку бессмысленных
флагов chai и возвращает утверждение — так что цепочка продолжается и проверка выполняется. Падение
тогда выглядит так:

```
AssertionError: expected 2 to be 3
```

Сообщения нет. Ни ошибки, ни предупреждения, ни `is not a function`. Миграция через «найти и заменить»,
пропустившая одно такое место, продолжает проходить, а подписи, объяснявшей, _почему_ эта проверка
важна, в выводе просто больше нет. Измерено на Vitest 4.1.9.

Vitest принимает подпись вторым аргументом `expect`, где она становится префиксом падения:

```diff
- expect(sum).withContext('the sum of one and one must be three').toBe(3);
+ expect(sum, 'the sum of one and one must be three').toBe(3);
```

```
AssertionError: the sum of one and one must be three: expected 2 to be 3
```

Трансформ `jasmine-matchers` её переносит, а `--verify` сопоставляет то, что осталось, — и для этого
случая это единственная механическая проверка, какая вообще есть, потому что раннер вам ничего не
скажет.
:::

### Таймаут здесь — это два числа {#the-timeout-is-two-numbers-here}

`jasmine.DEFAULT_TIMEOUT_INTERVAL` — один бюджет и на спеку, и на её хуки. Vitest разрешает два, и по
умолчанию они не равны: `testTimeout` — **5000 мс**, `hookTimeout` — **10 000 мс**. Поэтому
перенесённое один в один число из jasmine оставляет медленный `beforeAll` на другом бюджете, чем у
тестов, которые он кормит:

```ts
// vitest.config.ts
test: {
  testTimeout: 30_000,
  hookTimeout: 30_000, // у jasmine было одно число; Vitest задаёт это отдельно
}
```

Присваивание `jasmine.DEFAULT_TIMEOUT_INTERVAL` в пространстве имён один раз предупреждает, называя обе
настройки, — а не бросает и не проглатывает запись молча: менять в рантайме ему нечего, а сюита,
которая уверена, что подняла себе таймаут, в худшем положении, чем та, которой об этом сказали.
`vi.setConfig({ testTimeout: n, hookTimeout: n })` — форма на файл.

Падение, которое это предотвращает, записывается не на тот счёт: `beforeEach`, вышедший за бюджет,
приписывается **тесту**, длительность теста прибивается к лимиту, и в логе значится
`× should create 10045ms` про тело, которое ни разу не выполнялось.

## Два места, где мы сознательно расходимся с оригиналом {#two-places-where-this-is-deliberately-not-upstream}

### `.and.callThrough()` восстанавливает диспетчеризацию этой библиотеки {#and-callthrough-restores-this-library-s-dispatch}

`callThrough` в jasmine вызывает настоящий метод, который заменил `spyOn`. Auto-spy никогда не
оборачивал настоящий метод, поэтому наверху вызывать было **некого**, и там молча возвращался
`undefined`. Здесь то же слово означает полезное: оно возвращает на место собственную диспетчеризацию
библиотеки, так что значение снова решает цепочка `calledWith`.

```ts
service.load.withArgs(7).and.returnValue('seven');
service.load(7); // 'seven'

service.load.and.returnValue('flat'); // стратегия заменяет реализацию
service.load(7); // 'flat'

service.load.and.callThrough(); // а это путь обратно
service.load(7); // 'seven'
```

Кодмод оставляет `.and.callThrough()` ровно как написано и называет его с `file:line`, потому что нет
выражения, во что он мог бы превратиться. На auto-spy удалите его или замените той цепочкой
`calledWith`, которую вы имели в виду; на `vi.spyOn` настоящего объекта — удалите: `vi.spyOn` и так
вызывает оригинал.

### `.calls.saveArgumentsByValue()` — это no-op {#calls-saveargumentsbyvalue-is-a-no-op}

jasmine защитно копирует аргументы вызова, чтобы спека могла проверять объект, который тестируемый код
потом изменил. Vitest, Bun и `node:test` все держат живую ссылку, а снимать слепок с каждого аргумента
каждого вызова ради соответствия означало бы замедлить каждый спай в сюите ради хелпера, который
встречается в паре спек.

Он остаётся вызываемым, чтобы перевезённая спека всё ещё работала, — и в этом ловушка. **Сюита, которая
на него полагалась, молча начинает проверять состояние после мутации**: вызов на месте, он всё так же
зелёный, а объект, который он читает, — тот, который код с тех пор отредактировал. Проверка состояния
на момент вызова тихо превратилась в проверку состояния на момент утверждения, и по виду строки этого
не скажешь.

Там, где аргумент таков, что тест не смог бы его выписать, добраться до него помогает
[`captureArg`](/ru/core/control-helpers) — типизированно и читаясь в момент проверки, а не через
`mock.calls`:

```ts
import { captureArg } from 'vitest-auto-spy';

const payload = captureArg<Payload>();

expect(service.save).toHaveBeenCalledWith(payload);
expect(payload.value.id).toBe(7);
```

Там, где он действительно **изменяется после вызова**, не поможет и захватчик — он держит ту же живую
ссылку, что и раннер. Копию нужно снимать, пока вызов происходит:

```ts
const seen: Payload[] = [];

service.save.mockImplementation((payload: Payload) => {
  seen.push(structuredClone(payload));
});
```

[`no-save-arguments-by-value`](/ru/utilities/eslint-plugin) сообщает о каждом оставшемся вызове, и это
единственный надёжный способ их найти.

## На Bun и `node:test` {#on-bun-and-node-test}

`vitest-auto-spy/jasmine` регистрирует адаптер Vitest, а регистрация означает импорт `vitest`, который
не может загрузить ни `bun test`, ни `node --test`. Сами пространства имён написаны против
`MockAdapter`, а не против Vitest, так что работают без изменений на всех трёх — просто включаются
вызовом, а не импортом:

```ts
// bun-test-setup.ts
import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';

enableJasmineCompat();
```

Та же точка входа обслуживает `node --test`; адаптеров она не регистрирует, поэтому сочетается с любой
рантайм-точкой входа, которую сюита уже импортирует. Порядок важен только в одну сторону: спаи,
построенные **до** вызова, пространств имён не получают, так что ему место в файле настройки, а не в
`beforeEach`, который выполняется после создания дубля. Вызов идемпотентен.

Observable по-прежнему приходят из `vitest-auto-spy/rxjs`, импортируемого один раз как обычно, —
jasmine-точка входа своего rxjs не добавляет.

::: tip Проект, который никогда не импортирует эту точку входа, ничего из неё не везёт
Ядро обращается к реестру лениво, ровно как это уже делает слой rxjs. Сюита, которая ни разу не
слышала про jasmine, платит одной проверкой на `undefined` на спай и не тащит в свой бандл ни строчки
кода совместимости.
:::

## Что кодмод оставляет на jasmine-точке входа {#what-the-codemod-leaves-on-the-jasmine-entry}

Одно имя: **`createSpyObj`**. Это глобал jasmine, у которого в собственном API этой библиотеки аналога
нет, поэтому кодмод переписывает `jasmine.createSpyObj(…)` в голый `createSpyObj(…)` и добавляет импорт
оттуда, откуда его экспортирует установленный пакет, — а это `/jasmine` и больше нигде.

Это нормальное конечное состояние и одновременно запашок, с которым стоит что-то сделать:
`createSpyObj` не может сверить ни одного имени с типом, потому что сверять не с чем. Там, где класс
есть, его читает [`createSpyFromClass(C)`](/ru/core/create-spy-from-class); там, где есть только
интерфейс, его читает [`createAutoMock<T>()`](/ru/core/auto-mock-by-type). Оба падают на этапе
компиляции на члене с опечаткой, а этот — нет.

## `@hirez_io/observer-spy` едет вместе с ним {#hirez-io-observer-spy-comes-along-too}

У сюиты на `jasmine-auto-spies` почти всегда рядом лежит `@hirez_io/observer-spy` — они одного автора,
и observer-spy заметно крупнее из двух: примерно **112 тыс. загрузок в неделю против 11 тыс.**
Последняя публикация — 2022 год. Без моста миграция означала бы переписывание каждой проверки потока в
тот же момент, что и всего остального, а именно из-за этого такие миграции и застревают. Поэтому
`vitest-auto-spy/rxjs` экспортирует ту же поверхность.

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

`ObserverSpy<T>`, `SubscriberSpy<T>`, `subscribeSpyTo` и конфигурация `{ expectErrors: true }` — всё на
месте, с теми же именами методов: `getValues`, `getValuesLength`, `getValueAt`, `getFirstValue`,
`getLastValue`, `getError`, `receivedNext`, `receivedError`, `receivedComplete`, `onComplete`,
`onError`, `expectErrors`, `unsubscribe`.

Четыре сознательных расхождения, и каждое закрывает дефект, а не добавляет возможность:

- **`getValues()` возвращает копию.** Наверху отдаётся живой внутренний массив, поэтому спека, которая
  сортирует или сплайсит прочитанное, портит спай, который сама же и продолжает читать.
- **`getValues()` типизирован как `T[]`.** Наверху он типизирован `any[]` (их собственный issue #69),
  из-за чего каждый последующий вывод типов в проверке молча превращается в `any`.
- **`getFirstValue()` и `getValueAt(i)` бросают, когда там ничего нет.** Наверху они типизированы `T` и
  возвращают `undefined` — та же ложь, от которой эта библиотека отказывается везде. Сигнатура не
  меняется, так что перевезённая спека всё ещё компилируется; она просто перестаёт молча читать за
  концом потока.
- **Неожиданную ошибку бросают читатели значений** — называя её и неся оригинал в `cause`, — а не
  перебрасывает наружу наблюдатель. Наверху перебрасывание идёт из `error()`, что доходило до
  подписчика на rxjs 6 и не доходит на rxjs 7: всё, что брошено из колбэка наблюдателя, теперь идёт
  через `reportUnhandledError` и сообщается _асинхронно_, так что
  `expect(() => subscribeSpyTo(failing$)).toThrow()` этого не видит, а Vitest сообщает о неприписанном
  падении на весь файл. Откладывание до читателей сохраняет громкость и возвращает ошибку туда, где её
  можно прочитать. `{ expectErrors: true }` — или `.expectErrors()` после создания — держит читателей
  открытыми, ровно как наверху.

`autoUnsubscribe()`, `queueForAutoUnsubscribe()` и `fakeTime()` **не реализованы** и не будут. У
`SubscriberSpy` есть `[Symbol.dispose]`, поэтому `using spy = subscribeSpyTo(source$)` разбирает всё в
конце блока, а не через глобальный `afterEach` и реестр, который обязан быть правильным; а `fakeTime` —
это виртуальное время `TestScheduler` из rxjs, обёрнутое вокруг колбэка `done`, то есть две вещи,
которые этот раннер делает иначе. Замена — `setupFakeTimers()` вместе с `await advanceTimers(ms)` либо
`TestScheduler` напрямую.

::: tip Это мост, и пункт назначения отличается по своей природе
observer-spy — это _синхронный осмотр_: подписаться, дать событиям произойти, потом прочитать спай. Его
режим отказа — **тишина**: поток, который ни разу не эмитит, оставляет спай без значений, поэтому
спека, читающая `getValues()`, получает `[]`, что-то про него утверждает и проходит, не увидев ничего.
[`expectEmission` и родственники](/ru/core/observable-assertions) выворачивают это наизнанку: проверка
_и есть_ ожидание, а тишина — это падение со сторожевым таймером, а не пустой массив. Доведите сюиту до
зелёного на `subscribeSpyTo`, а потом переносите проверки.
:::

## Правила линтера для сюиты, ещё стоящей на прокладке {#lint-rules-for-a-suite-still-on-the-shim}

Четыре правила в [`vitest-auto-spy/eslint-plugin`](/ru/utilities/eslint-plugin) закрывают окно между
шагом 1 и шагом 3:

| Правило                           | Уровень | Сообщает о                                                                                                               |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `error` | `.and` / `.calls` / `.withArgs` на спае библиотеки в файле, который нигде не ставит слой                                 |
| `no-jasmine-globals`              | `error` | `jasmine.*`, голые `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(`            |
| `no-save-arguments-by-value`      | `error` | описанном выше no-op                                                                                                     |
| `prefer-native-spy-api`           | `error` | `.and` / `.calls` там, где собственный API спая говорит то же самое — **`--fix`**, если получается проследить получателя |

Все четыре приходят на `error`; последнее — то самое правило, которое держат в `'off'` на время
переезда, по причине ниже.

`no-done-callback`, который в рекомендованном конфиге и так стоит на `error`, — пятое правило, на
которое опирается эта миграция: кроме параметра `(done) =>` оно сообщает о `done.fail(…)` в месте
вызова. Эта строка бросает `done.fail is not a function` прямо там, где стоит, — почти всегда внутри
колбэка `error` или `.catch()`, которого никто не ждёт, — так что отказ остаётся необработанным, тело
теста давно вернулось, и прогон остаётся **зелёным ровно на том пути, который должен был его уронить**.

Первое правило существует потому, что предотвращаемое им падение не называет ничего полезного: у спая,
построенного до того, как отработал `enableJasmineCompat()`, нет `.and`, и спека умирает на
`Cannot read properties of undefined (reading 'returnValue')` — что не указывает ни на пропущенный
импорт, ни на спай. Правило читает один файл, поэтому проект, который ставит слой из файла настройки,
не импортируемого ни одной спекой, называет этот модуль: `{ setupModules: ['./test-setup'] }`.

`prefer-native-spy-api` стоит включать **после** шага 2, а не до: слой законен ровно столько, сколько
длится миграция, а правило, которое сообщает о каждой строке сюиты, делающей всё правильно, — это
правило, которое выключают. Его фикс применяется только там, где получателя удаётся проследить до одной
из фабрик этой библиотеки; в остальных местах та же правка предлагается как suggestion, потому что
`.calls` на чужом объекте — чужой метод. Оно также отказывается от любой цепочки с опциональным звеном:
`spy?.and.returnValue(1)` вернулось бы как `spy.mockReturnValue(1)`, тот же вызов с молча снятой
защитой, — и у него вообще нет записи для `.and.callThrough`, `.and.returnValues`, `.and.stub`,
`.and.throwError`, `.and.resolveTo`, `.calls.all()` и `.calls.mostRecent()`, потому что ни одно
переименование не говорит того же самого. Эти случаи берёт на себя кодмод.

## Чего оригинал не может {#what-upstream-cannot-do}

`jasmine-auto-spies@8.0.1` последний раз публиковался в **августе 2023**. Он только CJS, без карты
`exports`, прибит к `rxjs <8` и `jasmine-core <6` и несёт дюжину открытых issue, старейший — с февраля 2021. Поддержку Vitest попросили в 2022 году (issue #66); community-пакет `vitest-auto-spies` предложили
как PR #90, и он до сих пор не влит. Ничто из этого не упрёк библиотеке — так и выглядит стабильный
пакет, который перестал двигаться. Но это значит, что следующего не будет, а перевезённая сюита
получает каждый пункт в день переезда:

- **`Spy<T>` без `@types/jasmine`.** Типовая точка входа наверху открывается строкой
  `/// <reference types="jasmine" />`, поэтому импорт `Spy<T>` затаскивает всё глобальное пространство
  имён jasmine в вашу проверку типов — и требует, чтобы пакет был установлен в проекте, которому он
  больше ни для чего не нужен. Наш вместо этого несёт `MockInstance` из Vitest и не ссылается ни на
  что глобальное.
- **Асимметричные матчеры внутри `calledWith`.** Наверху аргументы сравниваются по строковому
  равенству через `javascript-stringify`, поэтому `jasmine.any(String)` и `objectContaining(…)` внутри
  `calledWith` **никогда** не совпадают (issue #61, закрыт без исправления). Здесь `calledWith`
  выполняет матчер.
- **Ложные значения в `nextWithValues`.** Наверху проверяется `if ('value' in cfg && cfg.value)` —
  проверка на истинность, — поэтому `{ value: 0 }`, `{ value: null }` и `{ value: '' }` молча
  выбрасываются из последовательности эмиссий (issue #81, до сих пор открыт). Наш проверяет наличие,
  `'value' in config`, так что поток из нулей эмитит нули.
- **Абстрактные классы без приведения.** `createSpyFromClass(MyAbstractToken as any)` — так это
  пишется наверху. Здесь DI-токен-`abstract class` принимается как есть.
- **Достать дубль обратно типизированным.** Наверху нужен `TestBed.inject<any>(X)`, который
  выбрасывает тип ровно там, где спеке он нужнее всего (issue #86 просил типизированный хелпер; его
  так и не сделали). Здесь [`injectSpy(X)`](/ru/adapters/angular) возвращает `Spy<X>`, а
  [`asSpy`](/ru/core/spy-typing) делает то же самое для контейнера, адаптера к которому у этого пакета
  нет.
- **Выбор перегрузки**, чтобы `nextWith` на сгенерированном API-клиенте перестал требовать
  `HttpEvent<T>` из последней перегрузки (issue #83). `asSpy<Client, { overload: 'first' }>(…)`.
- **[Строгие дубли](/ru/core/strict-mode)**, падающие на методе, который никто не настроил, и
  **`onlyMethodsToSpyOn`** для исчерпывающего белого списка — ни того ни другого наверху нет.

### Дефект, который был общим у двух библиотек {#a-defect-the-two-libraries-shared}

Поиск методов наверху фильтрует только по `descriptor.get`, поэтому прототипный сеттер **только на
запись** выглядит как метод: поверх него ставится функциональный спай, и он затирает спай на сеттер,
который только что построил `settersToSpyOn`. Дальше сеттер не записывает ничего, а спека, которая его
проверяет, падает с пустым списком вызовов и без объяснений.

В этом репозитории был ровно такой же баг, унаследованный тем же путём. Здесь он исправлен.

## Если сюита на Angular {#if-the-suite-is-angular-s}

Большинство сюит на `jasmine-auto-spies` — это Angular-сюиты на Karma, и у Angular есть собственный
инструментарий для той половины переезда, которую эта страница не покрывает, — для смены **раннера**.
Они дополняют друг друга: схематики меняют билдер и синтаксис собственных глобалов раннера, а кодмод
выше меняет дубли. Номера версий здесь важны, поэтому они названы, а не подразумеваются (dist-теги
`@angular/core` на момент написания: `latest` — **22.1.4**, `v21-lts` — **21.2.22**, `v20-lts` —
**20.3.30**):

- **`@angular/build:unit-test` помечен `[EXPERIMENTAL]` во всех версиях**, включая 22. Работать это ему
  никак не мешает; но опции билдера пока не попадают под политику депрекации Angular.
- **`runner` был обязателен в v20** и умолчания не имел. Начиная с **v21** он по умолчанию `"vitest"`,
  так что конфиг на v21+ может его опустить, а на v20 — нет.
- **`ng generate @schematics/angular:refactor-jasmine-vitest` существует только начиная с v21**, и он
  `"hidden": true` — в `ng generate --help` его не видно, так что называть его надо целиком.
- **Схематика `karma-to-vitest` не существует ни в одной версии.** Начиная с **v22** эквивалент — это
  миграция `ng update`, и она `"optional": true`, так что обычный `ng update` её не запустит:

  ```bash
  ng update @angular/cli --migrate-only --name migrate-karma-to-vitest
  ```

Там, где схематика и эта страница расходятся в том, как переписывать, схематика намеренно
консервативнее: для `fail(msg)` она выдаёт `throw new Error(msg)` в v21 (и `expect.fail(msg)` в v22) и
два оператора — `toHaveBeenCalledTimes(1)` плюс `toHaveBeenCalledWith(args)` — там, где
`toHaveBeenCalledExactlyOnceWith(args)` говорит то же самое одним. Верно и то и другое; одиночный
матчер падает с сообщением получше. Что схематика делает с `jasmine.createSpyObj` — объектный литерал
из `vi.fn()` и три TODO-комментария, которые она не может разрешить, — разобрано на
[отдельной странице](/ru/migrating-angular-schematic), где настоящий вывод стоит рядом с однострочником.

## Что ещё вы получаете {#what-else-you-gain}

Всё, что перечисляет [страница про миграцию с jest](/ru/migrating#what-you-gain-by-moving), —
фабрики, работающие от типа, [фикстуры](/ru/utilities/fixtures),
[проверки на observable](/ru/core/observable-assertions), [спаи на консоль](/ru/utilities/console), Bun
и `node:test`, `TestBed` из Angular [под `bun test`](/ru/runtimes/bun-angular) — плюс одна вещь,
специфичная для jasmine-сюиты: она, скорее всего, работала под Karma.
[`npx vitest-auto-spy doctor`](/ru/utilities/cli) сообщает про оставшиеся `karma.conf.*` от раннера,
которого больше нет, и про файлы настройки, на которые ссылался только он.

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Тот же вопрос и тот же ответ, что и на [странице про jest](/ru/migrating#did-the-migration-lose-a-test):
`compareTestRuns` по двум JSON-отчётам сравнивает **множество имён тестов**, потому что два прогона с
одинаковыми итогами могут различаться потерянным `describe` и починившимся нестабильным тестом. Прогон
jasmine, отчитавшийся через Karma, такой JSON вам напрямую не отдаст — берите базовую линию с первого
зелёного прогона Vitest на прокладке, а это ровно тот прогон, ради которого существует шаг 1.
