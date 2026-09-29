---
title: Строгий режим
description: strict и onUnstubbedCall - метод спая, который никто не настроил, бросает ошибку с именем класса, метода и аргументами вместо того, чтобы вернуть undefined.
---

# Строгий режим

С `strict: true` метод спая, который тест не настроил, при вызове бросает ошибку, а не возвращает
`undefined`. Включайте его, когда тест падает далеко от настоящей причины или проходит на пустом
ответе.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]); // настроен
users.currentTenant(); // throws: UserService.currentTenant() was called; this strict double has nothing configured for it.
```

Без `strict` вызов `users.currentTenant()` вернёт `undefined`. Код под тестом упадёт через несколько
вызовов, в другом файле: `TypeError: Cannot read properties of undefined (reading 'id')`. Строгий режим
переносит падение на строку с вызовом и называет метод, который вы забыли настроить.

«Настроен» значит, что тест сказал методу, что отвечать: `resolveWith`, `calledWith`, опция `returns` и
так далее. Полный список — в разделе [Что считается настройкой](#what-counts-as-configured).

| Опция                  | Где                           | Тип                                               | По умолчанию                                | Смысл                                                              |
| ---------------------- | ----------------------------- | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `strict`               | любая фабрика, `setupAutoSpy` | `boolean` (`setupAutoSpy` принимает и `'survey'`) | `false`                                     | ненастроенный вызов бросает ошибку                                 |
| `onUnstubbedCall`      | любая фабрика, `setupAutoSpy` | `({ className, method, args }) => unknown`        | нет                                         | вызывается вместо возврата `undefined`; его результат и есть ответ |
| `name`                 | `createAutoMock`              | `string`                                          | нет                                         | имя в сообщении для спая, построенного по типу                     |
| `swallowedStrictCalls` | `setupAutoSpy`                | `'throw' \| 'warn' \| 'off'`                      | `'throw'` при `strict: true`, иначе `'off'` | валить тест, если код под тестом поймал строгую ошибку             |
| `unconfiguredReads`    | `setupAutoSpy`                | `'off' \| 'warn' \| 'throw'`                      | `'off'`                                     | сообщать о прочитанных геттерах и потоках без значений             |
| `onUnstubbedRead`      | любая фабрика, `setupAutoSpy` | `({ className, member, kind, count }) => void`    | нет                                         | получать эти чтения вместо отчёта                                  |

## Как включить на весь набор тестов {#turning-it-on-for-a-whole-suite}

Добавьте одну строку в setup-файл. Каждый спай, созданный после неё, строгий.

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });
```

Setup-файл — тот, что указан в `test.setupFiles` в `vitest.config.ts`; см.
[Установку](./installation).

- **Сначала попробуйте.** `setupAutoSpy({ strict: 'survey' })` ничего не бросает. Он считает каждый
  вызов, который строгий режим отверг бы, и в конце каждого файла печатает список. Для одного прогона
  без правки файла задайте `VITEST_AUTO_SPY_STRICT=survey` (работают и `true`/`1`, `false`/`0`).
- **Исключить один спай** можно через `strict: false` на нём: `createSpyFromClass(Cart, { strict: false })`.
- **Настройка не выходит за свой файл.** `setupAutoSpy` включает умолчание, только если опция
  передана, и выключает его в `afterAll` того файла, который его включил. С `isolate: false` несколько
  файлов делят один модуль, и забытое умолчание уронило бы спеку, которая его не просила.

Другие переключатели: [Гигиена прогона → строгие спаи](/ru/utilities/setup#_10-strict-doubles-for-the-whole-suite).

### Ошибка, которая не дошла до теста {#a-throw-that-never-reached-the-test}

Код под тестом может проглотить строгую ошибку. `try`/`catch` превращает её в ветку обработки ошибки.
Оператор RxJS без обработчика ошибок пробрасывает её в `setTimeout`. Под фейковыми часами этот таймер
не срабатывает, и ошибка теряется. Тест идёт дальше без нужного ответа и может пройти.

Поэтому `setupAutoSpy({ strict: true })` запоминает каждую строгую ошибку. После каждого теста он
валит тест теми ошибками, которые раннер так и не увидел. Опция — `swallowedStrictCalls`: `'throw'`
(по умолчанию при `strict: true` и строгом пресете), `'warn'` или `'off'`.

Если тест вызывает строгую ошибку намеренно, заберите её через `takeStrictViolations()`. Это заодно и
проверка:

```ts
import { takeStrictViolations } from 'vitest-auto-spy/setup';

expect(() => cart.total()).toThrow('Cart.total() was called');
expect(takeStrictViolations()).toHaveLength(1);
```

### Приоритет {#precedence}

Побеждает самая точная настройка. Библиотека проверяет их в этом порядке и останавливается на первой
заданной:

1. собственный `onUnstubbedCall` спая
2. собственный `strict: false` спая (единственный способ исключить один спай из общего умолчания)
3. глобальный `onUnstubbedCall` из `setupAutoSpy`
4. собственный `strict: true` спая
5. глобальный `strict`

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });

createSpyFromClass(Cart).total(); // throws
createSpyFromClass(Cart, { strict: false }).total(); // undefined: этот спай отказался
```

Коротко: обработчик, глобальный или собственный, всегда сильнее `strict: true`. Поэтому
`{ strict: true, onUnstubbedCall: record }` на одном спае записывает вызов и не бросает. А собственный
`strict: false` спая сильнее глобального обработчика.

### `passthrough` стоит выше всех пяти {#passthrough}

[`createSpyFromInstance(obj, { passthrough: true })`](./create-spy-from-class#passthrough) даёт
ненастроенному вызову третий ответ: вызвать настоящий метод. Для каждого члена с настоящим методом
`passthrough` побеждает весь список выше: общий `strict: true`, глобальный обработчик и строгий
`registerAutoSpyDefaults` для класса. Иначе строгий режим на весь набор тестов молча превратил бы
каждый passthrough-спай в бросающий.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });

createSpyFromInstance(new Cart(), { passthrough: true }).total(); // настоящий total
createSpyFromInstance(new Cart()).total(); // throws: Cart.total() was called; …
```

Два правила делают это явным:

- **Нельзя указать оба в одном вызове.** `{ passthrough: true, strict: true }` и
  `{ passthrough: true, onUnstubbedCall }` бросают ошибку при создании спая. Оба решают, что делает
  ненастроенный вызов, и один из них никогда бы не сработал. `strict: false` рядом с `passthrough`
  допустим: он говорит то же самое.
- **Член без настоящего метода остаётся строгим.** Имя из `methodsToSpyOn`, которого у объекта нет,
  вызвать нечем, поэтому общий `strict` для него по-прежнему бросает.

## Сообщение {#the-message}

Вот точный текст для `Cart`, у которого никто не настроил `checkout(id, when)`, вызванный из
`cart.component.ts`:

```
[vitest-auto-spy] Cart.checkout(1, 'now') was called; this strict double has nothing configured for it.
Called from src/app/cart.component.ts:41:12
Configure it in the test: cart.checkout.calledWith(1, 'now').mockReturnValue(…) for these arguments, or .mockReturnValue(…) for any — .resolveWith(…) / .nextWith(…) when it returns a Promise / Observable.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#the-message
```

Как его читать:

- **Первая строка показывает весь вызов с аргументами.** Сервис часто вызывает один метод несколько
  раз, и по аргументам видно, какого именно вызова не хватает.
- **`Called from`** — первая строка вашего кода в стеке. Спай, библиотека и `node_modules` пропускаются,
  путь — относительно корня проекта. Если такой строки нет, сообщение её не печатает.
- **Предложенный `calledWith(…)` повторяет аргументы вызова**, его можно вставить как есть. Для вызова
  без аргументов предлагается только `.mockReturnValue(…)`.
- **`cart` — догадка об имени вашей переменной**: имя класса в lowerCamelCase. Если имя класса не
  годится как идентификатор, в сообщении будет `double`.

Простые данные печатаются целиком, до 200 символов на аргумент. Экземпляр класса или DOM-узел
печатается как имя класса: `[HTMLDivElement]`, `[Session]`. Полная печать таких объектов могла бы
исчерпать память воркера, если в прогоне сотни строгих падений.

**У спая, построенного по типу, нет имени класса.** Его называют по строке, где он создан:
`createAutoMock(users.spec.ts:12).getName(1) was called`. Так два безымянных спая в одном файле не
путаются. Чтобы задать имя самому, передайте `name`:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const users = createAutoMock<UserApi>(undefined, { strict: true, name: 'USERS' });
```

`provideAutoSpyForToken` сам берёт описание токена:
`InjectionToken CAROUSEL_RESIZE_OBSERVER.observe(…) was called`.

`createSpyFromClass` для **полностью абстрактного класса** (все члены `abstract`) строит спай по типу.
Имя класса он всё равно печатает, `Storage.read('k') was called`, и строгий режим тоже работает.

## Что считается настройкой {#what-counts-as-configured}

Метод считается настроенным, если тест настроил его **хоть как-то**. Проверка спрашивает про метод, а
не про аргументы, и срабатывает до сравнения аргументов.

| Чем настроен                                                                   | Проверка ненастроенного вызова |
| ------------------------------------------------------------------------------ | ------------------------------ |
| `calledWith(…)` / `mustBeCalledWith(…)`: **любая** цепочка, любые аргументы    | не срабатывает                 |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                            | не срабатывает                 |
| `nextWith` / `throwWith` / `complete` / `returnSubject`                        | не срабатывает                 |
| опция `returns:` (значение по умолчанию внутри спая)                           | не срабатывает                 |
| списки `selfReturning:` / `returnsUndefined:` (такое же значение по умолчанию) | не срабатывает                 |
| `mockReturnValue` / `mockImplementation` вашего раннера                        | не срабатывает (см. ниже)      |
| `overrides` в `createAutoMock` (член — обычное значение, не спай)              | не срабатывает (см. ниже)      |
| функция в `overrides` для метода `createSpyFromClass` (спай её вызывает)       | не срабатывает                 |
| ничего                                                                         | **срабатывает**                |

**`mockReturnValue` и `mockImplementation` заменяют собственную обработку вызова библиотекой.**
Проверка живёт в этой обработке, поэтому для такого метода строгий режим не срабатывает. `calledWith`,
добавленный к тому же методу позже, тоже игнорируется.

**`vi.when` (Vitest 5) работает вместе с библиотекой.** Он оборачивает реализацию спая: вызовы,
подходящие под строку `vi.when`, получают её ответ, остальные доходят до библиотеки. Поэтому
`calledWith` на том же методе продолжает работать, в любом порядке и без предупреждений. После
`vi.when(spy)[Symbol.dispose]()` или `mockReset()` снова отвечает только библиотека. `vi.when` поверх
`mockReturnValue` всё равно попадает в отчёт: `mockReturnValue` уже заменил обработку библиотеки.
`vi.when(spy, { onUnmatched: 'throw' })` — вариант `strict: true` для одного метода.

**Частая ошибка:** закончилась последовательность `mockReturnValueOnce`. Каждое `Once`-значение
используется один раз. Когда очередь пуста, следующий вызов доходит до проверки и бросает:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const cart = createSpyFromClass(Cart, { strict: true });

cart.total.mockReturnValueOnce(5);
cart.total(); // 5
cart.total(); // throws: Cart.total() was called; this strict double has nothing configured for it.
```

Если последовательность должна закончиться, задайте и постоянное значение: `cart.total.mockReturnValue(0)`.

`returns:` задаёт значение по умолчанию. Более поздний `calledWith` побеждает для своих аргументов, а
более поздний `resolveWith` или `failWith` заменяет значение по умолчанию. Чтобы сказать, что вызов
`void` ожидается, напишите `returns: { save: undefined }`.

Бывает, что у кода под тестом есть защитная ветка для `undefined`, например
`camera.translate(…) ?? of(null)`, а метод по типу возвращает `Observable`. Там
`mockReturnValue(undefined)` — ошибка типов. Используйте `returns: { translate: undefined }` или после
создания `camera.translate.mockReturnValue(outOfType(undefined))`: так видно, что значение вне типа
намеренно. Оба варианта считаются настройкой, и спай может оставаться строгим.

Сброс снова делает метод ненастроенным. После `resetAutoSpy(users)` или в конце
[блока `using`](./create-spy-from-class#using) проверка снова срабатывает, потому что настройки
действительно больше нет.

## Чего он намеренно не делает {#what-it-deliberately-does-not-do}

**`calledWith` для других аргументов не приводит к ошибке.**

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const cart = createSpyFromClass(Cart, { strict: true });

cart.checkout.calledWith(1, 'now').mockReturnValue('one');

cart.checkout(9, 'later'); // undefined, без ошибки
```

Строгий режим отвечает на «этот метод никто не настроил», а не на «этот вызов никто не настроил».
Чтобы падать на неожиданных аргументах, используйте
[`mustBeCalledWith`](./control-helpers#what-a-mustbecalledwith-failure-prints): он бросает ошибку и
печатает ожидаемые аргументы рядом с фактическими.

**Хуки жизненного цикла Angular никогда не бросают.** `ngOnInit`, `ngOnChanges`, `ngDoCheck`,
`ngOnDestroy` и четыре хука `ngAfter…` отвечают `undefined` на строгом спае, настроены они или нет.
Angular сам вызывает `ngOnDestroy` у каждого предоставленного значения, когда `TestBed` разбирается, и
ни один тест этого вызова не просил. Ошибка там сломала бы разборку и уронила бы следующие тесты.
Вызовы при этом записываются: `expect(spy.ngOnDestroy).toHaveBeenCalled()` работает.

## `onUnstubbedCall` — общая форма {#onunstubbedcall-—-the-general-form}

`strict: true` — сокращение для обработчика, который бросает ошибку. С `onUnstubbedCall` вы пишете
обработчик сами. То, что он вернёт, станет результатом вызова.

```ts
type UnstubbedCallHandler = (call: { className: string | undefined; method: string; args: unknown[] }) => unknown;
```

**Записывать вместо того, чтобы падать.** Так можно узнать, сколько вызовов не настроено, прежде чем
включать строгий режим на весь набор тестов:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const unstubbed: string[] = [];

const users = createSpyFromClass(UserService, {
  onUnstubbedCall: ({ className, method }) => void unstubbed.push(`${className}.${method}`),
});
```

**Одно запасное значение для всех ненастроенных вызовов** (та же идея, что
`fallbackMockImplementation` в `vitest-mock-extended`):

```ts
import { createAutoMock } from 'vitest-auto-spy';

createAutoMock<Api>(undefined, { onUnstubbedCall: () => null }); // никогда не undefined и не ошибка
```

У спая, построенного по типу, `className` — то же имя, что печатает сообщение: его `name` или
`createAutoMock(file:line)`, если имени нет.

## Чтения, которые никто не настроил {#reads-nobody-configured}

Проверка выше срабатывает на **вызове**. Два вида членов строгого спая — не вызовы:

- геттер-спай (из `gettersToSpyOn`), который никто не настроил, по-прежнему отвечает `undefined`;
- observable-свойство (из `observablePropsToSpyOn`), в которое ничего не подали, — поток, который
  никогда не эмитит.

В обоих случаях код под тестом уходит в ветку «данных нет», а тест остаётся зелёным. Чтение не может
бросить ошибку на месте: когда спай попадает в дифф падения, дифф читает его геттеры, и ошибка там
сломала бы сообщение. Поэтому `setupAutoSpy` считает такие чтения во время теста и сообщает о них
после:

```ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true, unconfiguredReads: 'throw' }); // 'off' (по умолчанию) | 'warn' | 'throw'
```

```
[vitest-auto-spy] Router.url was read 3 times on a strict double and nothing configured it, so the code under test got undefined.
Configure it in the test: accessorSpies.getters.url.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.
[vitest-auto-spy] Router.events was subscribed to 1 time on a strict double and never emitted.
Feed it in the test: events.nextWith(…), or seed overrides: { events: new Subject() } and drive that Subject; overrides: { events: NEVER } when this test never fires it.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#reads-nobody-configured
```

Подробности:

- **Что считается.** Чтение геттера из `gettersToSpyOn`, `settersToSpyOn` или `autoSpyAccessors`,
  который никто не настроил. Подписка на поток из `observablePropsToSpyOn`, в который ничего не подали
  **к концу теста**. Подписаться в `beforeEach` и вызвать `nextWith` в тесте — обычный способ, он не
  считается находкой. Чтение геттера оценивается в момент чтения: если настроить геттер после того,
  как код его прочитал, чтение не отменится.
- **Когда.** От `beforeEach` из `setupAutoSpy`, который запускается раньше хуков спеки, до его
  `afterEach`, который запускается после них. Собственный `beforeEach` спеки входит в окно: многие
  тесты запускают код под тестом именно там. Сбор тестов, `beforeAll` и `afterAll` в окно не входят.
- **Как настроить геттер:** `accessorSpies.getters.x.mockReturnValue(…)` или `mockImplementation(…)`,
  `overrides: { x: … }` (в вызове или в записи `registerAutoSpyDefaults`), либо
  `mockReadonlyProp(spy, 'x', …)`. `mockReturnValueOnce` считается, пока не кончится очередь. Если
  `undefined` — задуманный ответ, скажите это явно: `accessorSpies.getters.x.mockReturnValue(undefined)`.
- **Как подать значения в поток:** `nextWith`, `nextOneTimeWith`, `nextWithValues` хотя бы с одним
  значением, `throwWith`, `complete`, `returnSubject` или настоящий поток в `overrides`. Само имя в
  списке зарегистрированных умолчаний ничего не настраивает.
- **Какие спаи.** Строгие (`strict: true` на спае или на весь набор тестов), созданные через
  `createSpyFromClass`, `provideAutoSpy`, `createSpyFromInstance`, а для observable-свойств — ещё
  `createAutoMock` и `provideAutoSpyForToken`. `strict: false` на спае его исключает. Узлы `mockDeep`
  не охвачены ([Куда он не дотягивается](#where-it-does-not-reach)).
- **Под `test.concurrent`.** У каждого параллельного теста своё окно. По чтению не видно, какой тест
  его сделал. Чтение, сделанное, пока шёл один тест, достаётся этому тесту. Чтение, сделанное, пока
  шли несколько, ждёт последнего из них, оценивается один раз и называет их всех:

  ```text
  [vitest-auto-spy] Router.url was read 1 time on a strict double and nothing configured it, so the code under test got undefined.
  Configure it in the test: accessorSpies.getters.url.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.
  It happened while 2 concurrent tests were in flight ("Cart > loads", "Cart > saves"), and a read does not say which test made it; it is reported once, as the last of them finishes.
  ```

  С `'throw'` падает тот из них, который закончился последним.

- **Не входит в `preset: 'strict'`.** Это расширение самого `strict`, и на существующем наборе тестов
  сначала стоит провести обследование (следующий раздел).

### Сначала обследовать — `onUnstubbedRead` {#surveying-first-—-onunstubbedread}

`onUnstubbedRead` получает те же находки, что напечатал бы отчёт, вместо отчёта. Он видит каждый спай,
созданный не с `strict: false`, строгий или нет, поэтому цифры заранее показывают, что уронит отчёт,
когда вы его включите.

```ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

const unread = new Map<string, number>();

setupAutoSpy({
  onUnstubbedRead: ({ className, member, kind, count }) => {
    const key = `${className}.${member} (${kind})`;

    unread.set(key, (unread.get(key) ?? 0) + count);
  },
});
```

- Вызывается после каждого теста, по разу на член. Само чтение по-прежнему отвечает `undefined`.
- У одного спая может быть свой обработчик: `createSpyFromClass(X, { onUnstubbedRead })`.
- Порядок тот же, что у `onUnstubbedCall`: обработчик спая, `strict: false` спая, общий обработчик,
  затем `strict`.
- Обоим обработчикам нужен `setupAutoSpy` в setup-файле: он отмечает, где начинается и кончается
  каждый тест.

## Куда он не дотягивается {#where-it-does-not-reach}

Проверка ненастроенного вызова живёт в спаях методов, которые строят `createSpyFromClass` и
`createAutoMock`. Спаи, созданные в другом месте, **никогда** не строгие, что бы вы ни настроили:

| Спай                                                  | Почему                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **спаи аксессоров** (`gettersToSpyOn`, …)             | чтение не может бросить ошибку; о нём сообщают после теста, [выше](#reads-nobody-configured) |
| **спаи observable-свойств**                           | то же: о подписке без значений сообщают после теста                                          |
| **узлы `mockDeep<T>()`**                              | `mockDeep` вообще не принимает опцию strict                                                  |
| **`console-spy`** и **`reload` у `mockResourceProp`** | собственные спаи библиотеки, а не спаи вашей зависимости                                     |
| **отдельный `createFunctionSpy(name)`**               | проверка — его необязательный второй аргумент, и его никто не передаёт                       |

**Члены `fillMissing` строгие.** Член, который класс не объявил, по определению никто не настроил.
Поэтому `createSpyFromClass(X, { strict: true, fillMissing: true })` бросает для добавленного члена так
же, как для объявленного.

**Первые две строки действуют и на строгом спае.**
`createSpyFromClass(X, { strict: true, gettersToSpyOn: ['theme'], observablePropsToSpyOn: ['items$'] })`
бросает для ненастроенного **метода**, но для `theme` и `items$` по-прежнему отвечает `undefined`.
`setupAutoSpy({ unconfiguredReads })` сообщит о них после теста.

## Подробнее {#in-depth}

### Почему не `onlyMethodsToSpyOn` {#why-not-onlymethodstospyon}

[`onlyMethodsToSpyOn`](/ru/core/create-spy-from-class#configuration) отвечает на другой вопрос. Он
_убирает_ все методы не из списка, и падение выглядит как `users.currentTenant is not a function` —
виноватым кажется спай, а не тест. Строгий режим оставляет метод и говорит, что его никто не настроил.

### Почему чтения важны {#why-reads-matter}

Зарегистрированное умолчание делает ненастроенные чтения частыми. `registerAutoSpyDefaults(Router, {
gettersToSpyOn: ['url'], observablePropsToSpyOn: ['events'] })` добавляет оба члена в каждый спай
`Router` в наборе тестов. В одном реальном наборе примерно из 1 760 спек 77 из 119 файлов, где был спай
`Router`, ни разу не настроили `url`, а 100 не подали ни одного значения в `events`.

### Как это сделано у других {#prior-art}

В `vitest-mock-extended` есть `fallbackMockImplementation`, в `@golevelup` — `{ strict: true }`, а
testdouble строгий по умолчанию. Здесь строгий режим по умолчанию выключен. Набор тестов, написанный под
спаи, возвращающие `undefined`, упал бы целиком в день обновления, а метод часто не настроен просто
потому, что код под тестом его не вызывает.
