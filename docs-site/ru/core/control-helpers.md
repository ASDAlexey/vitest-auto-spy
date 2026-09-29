---
title: Управляющие хелперы
description: calledWith, mustBeCalledWith, resolveWith, nextWith и другие хелперы, которые говорят методу спая, что отвечать; набор зависит от типа возврата.
---

# Управляющие хелперы

У каждого метода спая есть хелперы, которые говорят ему, что отвечать. Набор зависит от типа
возврата: метод с `Promise` получает `resolveWith`, метод с `Observable` — `nextWith`, а любой метод —
`calledWith`, чтобы отвечать только на определённые аргументы.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

import 'vitest-auto-spy/rxjs';

// один раз на проект, для хелперов Observable

const users = createSpyFromClass(UserService);

users.isAdmin.calledWith(7).mockReturnValue(true); // boolean isAdmin(id): true для 7, undefined для остальных
users.save.resolveWith(undefined); // Promise<void> save(user)
users.load.nextWith({ id: 7, name: 'Ann' }); // Observable<User> load(id)
```

| Метод возвращает | Хелперы                                                                                                      | Раздел                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| что угодно       | `calledWith`, `mustBeCalledWith`, `failWith` и собственные `mockReturnValue` и др. раннера                   | [Синхронные методы](#synchronous-methods)                      |
| значение         | `returnValue`, `once()`, `times(n)` на цепочке `calledWith`                                                  | [Один вызов или n](#one-call-or-n-—-once-times)                |
| `Promise`        | `resolveWith`, `rejectWith`, `resolveWithPerCall`                                                            | [Методы с Promise](#promise-returning-methods-—-resolvewith)   |
| `Observable`     | `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `throwWith`, `complete`, `returnSubject` | [Observable-методы](#observable-methods-properties-—-nextwith) |

Как сбросить всё, что настроил тест, — в разделе [`clearAutoSpy` / `resetAutoSpy`](#resetting-spies-—-clearautospy-resetautospy).

## Синхронные методы {#synchronous-methods}

API раннера работает как обычно. `calledWith(...args)` отвечает только на эти аргументы, на остальные
вызовы — `undefined`. `mustBeCalledWith(...args)` на любые другие аргументы бросает ошибку.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const users = createSpyFromClass(UserService);

// API раннера: любой вызов отвечает 'Ann'
users.getName.mockReturnValue('Ann');

// только для этих аргументов
users.getName.calledWith(1).mockReturnValue('Ann');
expect(users.getName(1)).toBe('Ann');
expect(users.getName(2)).toBeUndefined();

// ошибка на любые другие аргументы
users.getName.mustBeCalledWith(1).mockReturnValue('Ann');
expect(() => users.getName(2)).toThrow();
```

Аргументы сравниваются по значению, а не по ссылке. Порядок ключей объекта не важен:
`calledWith({ id: 1, name: 'a' })` совпадёт с вызовом `{ name: 'a', id: 1 }`. Порядок элементов в `Map`
и `Set` тоже не важен. Подробнее — [Что считается тем же аргументом](#what-counts-as-the-same-argument).

**Частая ошибка:** смешивать `mockReturnValue` и цепочку `calledWith` на одном методе. Целиком
побеждает то, что написано последним. `mockReturnValue` после цепочки отвечает на все вызовы.
`mockReturnValue` до цепочки делает цепочку бесполезной. Библиотека сообщает об этом как об ошибке настройки
(предупреждение или исключение под [`setupAutoSpy({ misconfiguration: 'throw' })`](/ru/utilities/setup)
и строгим пресетом). Если нужно «это значение для этих аргументов, другое — для всех остальных»,
положите запасное значение в
[`returns`](/ru/core/create-spy-from-class#returns-—-the-value-where-the-spy-is-built) или используйте
`resolveWith` / `nextWith` / `failWith`. Цепочка `calledWith` сильнее них:

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

provideAutoSpy(ProductsService, { returns: { find: FALLBACK } });
injectSpy(ProductsService).find.calledWith(7).mockReturnValue(SPECIFIC); // работают оба
```

`mockReturnValue` уместен, только когда это весь ответ целиком. Смешением не считаются:

- обёртка, которая передаёт вызов дальше в цепочку: `vi.when(spy)` (Vitest 5) или `mockImplementation`,
  собранный из `spy.getMockImplementation()`;
- семейство `Once` (`mockReturnValueOnce` …): его очередь кончается, и цепочка снова отвечает.

Сообщение приходит от собственного движка спаев библиотеки. Оно есть на Vitest и Rstest, но не под
`setSpyEngine('runner')`, не на Bun и не на `node:test`: там раннер ставит реализацию туда, где
библиотека её не видит.

### Цепочка, сохранённая в переменную {#a-chain-kept-in-a-variable}

`calledWith` и `mustBeCalledWith` возвращают объект для **этих** аргументов. Сохранённый в переменную,
он остаётся привязан к своим аргументам, сколько бы цепочек вы ни открыли потом:

```ts
const one = users.getName.calledWith(1);
const two = users.getName.calledWith(2);

one.mockReturnValue('first');
two.mockReturnValue('second');

expect(users.getName(1)).toBe('first');
expect(users.getName(2)).toBe('second');
```

Это удобно, когда один набор аргументов настраивается в двух местах: значение по умолчанию в
`beforeEach` и результат в тесте. Или когда цепочку открывает вспомогательная функция и возвращает её.
Повторный вызов `users.getName.calledWith(1)` возвращает объект для той же записи, что и `one`, поэтому
побеждает тот из двух, который вы настроили последним.

### Один вызов или n — `once` / `times` {#one-call-or-n-—-once-times}

`once()` и `times(n)` ограничивают ответ ближайшими подходящими вызовами. `returnValue(x)` на цепочке —
то же, что `mockReturnValue(x)`. Когда они израсходованы,
вызов получает предыдущий ответ для этих аргументов, а затем значение спая по умолчанию:

```ts
users.load.calledWith(1).mockReturnValue(cached);
users.load.calledWith(1).once().mockReturnValue(fresh);

users.load(1); // fresh
users.load(1); // cached
```

| Правило                         | Поведение                                                        |
| ------------------------------- | ---------------------------------------------------------------- |
| Несколько ограниченных ответов  | складываются в стопку; первым используется последний настроенный |
| Хелперы на ограниченном объекте | только `mockReturnValue`, `returnValue` и `failWith`             |
| Те же аргументы без ограничения | заменяют всю стопку                                              |
| Под `mustBeCalledWith`          | вызов сверх счёта бросает, как любое другое несовпадение         |
| `times(n)`                      | `n` — целое положительное число, иначе `RangeError`              |

### Заставить вызов бросить исключение — `failWith` {#making-a-call-throw-—-failwith}

`failWith(error)` заставляет метод бросать ошибку. Работает на спае с **любым** типом возврата и на
цепочке `calledWith` / `mustBeCalledWith`.

```ts
import { HttpErrorResponse } from '@angular/common/http';

// каждый вызов бросает
cart.checkout.failWith(new HttpErrorResponse({ status: 500 }));
expect(() => cart.checkout(1)).toThrow();

// бросают только эти аргументы; остальные отвечают как обычно
cart.checkout.calledWith(BAD_ID).failWith(new Error('unknown cart'));
cart.checkout.calledWith(GOOD_ID).mockReturnValue(receipt);
```

Побеждает последний настроенный ответ: `failWith` заменяет более ранние `resolveWith`, `nextWith` или
список на каждый вызов, а более поздний из них заменяет `failWith`. `resetAutoSpy` убирает его, как
любую другую настройку.

Чтобы `Promise` отклонился, используйте `rejectWith`. Чтобы `Observable` завершился ошибкой —
`throwWith`.

### Что печатает упавший `mustBeCalledWith` {#what-a-mustbecalledwith-failure-prints}

Первая строка говорит, какой аргумент не совпал. Ниже — ожидаемый и фактический вызов рядом:

```
[vitest-auto-spy] getName is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 1, got 2.
Wanted: getName(1)
Actual: getName(2)
Fix the value the code under test passes, or configure this call too.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints
```

Если настроенных вызовов несколько, перечисляются все, с матчерами, — так видно настройку, которая
ни разу не совпала. Первая строка тогда обходится без части «expected 1, got 2»: сравнивать не с чем:

```
Wanted (3 configured):
  getName(1)
  getName(2,'fast')
  getName(Any<Number>,StringContaining)
Actual: getName(9,'zzz')
```

Матчер внутри объекта печатается на своём месте, `save({id:Any<Number>,name:'a'})`, и строка выглядит
так, как вы написали настройку.

### Асимметричные матчеры в `calledWith` {#asymmetric-matchers-in-calledwith}

`calledWith` и `mustBeCalledWith` принимают те же асимметричные матчеры, что и `expect`: `expect.any`,
`expect.objectContaining`, `expect.stringMatching` и другие. Они работают **на любой глубине**: внутри
объекта, внутри массива, как ключ или значение `Map` или `Set`.

```ts
users.getName.calledWith(expect.any(Number)).mockReturnValue('Ann');
expect(users.getName(1)).toBe('Ann');
expect(users.getName(2)).toBe('Ann');

users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
expect(users.save({ id: 1, name: 'x' })).toBe(true);

// матчер уровнем ниже
users.save.calledWith({ id: expect.any(Number), name: 'x' }).mockReturnValue(true);
users.saveAll.calledWith([expect.any(String)]).mockReturnValue(true);
users.index.calledWith(new Map([['id', expect.any(Number)]])).mockReturnValue(true);
```

- Точный список аргументов проверяется раньше любого матчера.
- Настройки с матчерами проверяются в порядке регистрации, поэтому узкую ставьте перед широкой.
- Повторная регистрация **тех же** аргументов заменяет прежний ответ, как и для точных аргументов:

```ts
users.getName.calledWith(expect.anything()).mockReturnValue('first');
users.getName.calledWith(expect.anything()).mockReturnValue('second');
expect(users.getName(1)).toBe('second');
```

Два матчера считаются одинаковыми, если принимают одни и те же значения: тот же матчер с тем же
аргументом, и оба с отрицанием или оба без (`expect.not.…`). Для вложенных матчеров это тоже верно: второй `calledWith({ id: expect.any(Number) })`
заменяет первый. Исключение — самописный объект `{ asymmetricMatch }`: его логика спрятана в функции,
поэтому два таких объекта — всегда две разные настройки. Заменить ответ может только тот же экземпляр,
зарегистрированный повторно.

### Что считается тем же аргументом {#what-counts-as-the-same-argument}

Всё, что не решает матчер, сравнивается так же, как это делает `equals` самого раннера:

| Аргумент      | Сравнивается по                                                                      |
| ------------- | ------------------------------------------------------------------------------------ |
| `Map`, `Set`  | содержимому, в любом порядке                                                         |
| `Date`        | времени                                                                              |
| `RegExp`      | исходнику и флагам                                                                   |
| `Error`       | имени и сообщению, плюс собственным перечислимым полям, которые добавляет подкласс   |
| функция       | идентичности: тот же объект функции, а не просто то же имя                           |
| всё остальное | собственным перечислимым записям, включая символьные ключи; прототип не сравнивается |

**Частая ошибка:** настраивать аргумент со скрытым состоянием — `URL`, `ArrayBuffer`, компонент. Сравнивать
у него нечего, поэтому два экземпляра одного класса выглядят равными. Используйте матчер
(`expect.any(URL)`) или поле, которое код под тестом действительно меняет.

## Методы, возвращающие Promise, — `resolveWith` {#promise-returning-methods-—-resolvewith}

`resolveWith(value)` заставляет метод вернуть выполненный `Promise`, `rejectWith(error)` — отклонённый.
`resolveWithPerCall` даёт каждому вызову своё значение.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const products = createSpyFromClass(ProductsService);

products.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(products.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

products.getProducts.rejectWith('FAKE ERROR');

// своё значение на каждый вызов и значение только для определённых аргументов
products.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
products.getProducts.calledWith(1).resolveWith(['one']);
```

| Хелпер                     | Аргумент                     | Результат                       |
| -------------------------- | ---------------------------- | ------------------------------- |
| `resolveWith(value?)`      | значение, которым выполнится | каждый вызов выполняется с ним  |
| `rejectWith(error?)`       | причина отклонения           | каждый вызов отклоняется с ней  |
| `resolveWithPerCall(list)` | `{ value, delay? }[]`        | вызов n выполняется с записью n |

**Частая ошибка:** `mockResolvedValue` после цепочки `calledWith`. Он заменяет цепочку, как
`mockReturnValue` (см. [Синхронные методы](#synchronous-methods)). Для значения по умолчанию используйте
`resolveWith`.

### Как посмотреть, чем кончились промисы, — `mock.settledResults` {#settled-results}

У каждого метода спая есть `mock.settledResults`: по записи на вызов, в порядке вызовов, о том, чем
кончился промис этого вызова. Vitest ведёт это сам. На Bun (`bun:test`) и `node:test` это добавляет
библиотека, поэтому на всех трёх раннерах всё одинаково.

```ts
products.getProducts.resolveWith([{ name: 'Product 1' }]);
await products.getProducts();
expect(products.getProducts.mock.settledResults).toEqual([{ type: 'fulfilled', value: [{ name: 'Product 1' }] }]);

products.getProducts.rejectWith('FAKE ERROR');
await products.getProducts().catch(() => undefined);
expect(products.getProducts.mock.settledResults).toContainEqual({ type: 'rejected', value: 'FAKE ERROR' });
```

Каждая запись — `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`. Пока промис не выполнен,
его запись — `incomplete`.

## Observable-методы и свойства — `nextWith` {#observable-methods-properties-—-nextwith}

Этим хелперам нужен слой RxJS. Импортируйте его один раз, например в setup-файле:
`import 'vitest-auto-spy/rxjs';`. См. [Рантаймы → RxJS](/ru/runtimes/rxjs).

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

import 'vitest-auto-spy/rxjs';

const products = createSpyFromClass(ProductsService);

products.getProducts$.nextWith([{ name: 'Product 1' }]); // выдать значение; поток остаётся открытым
products.getProducts$.nextOneTimeWith([{ name: 'X' }]); // выдать один раз и завершить
products.getProducts$.throwWith('FAKE ERROR'); // завершить поток ошибкой
products.getProducts$.complete(); // завершить поток
```

Свойство из `observablePropsToSpyOn` ещё и считает свои открытые подписки: `x$.subscriberCount()`.
Подписка перестаёт считаться, когда от неё отписались или когда поток завершился либо упал с ошибкой.
Поэтому `0` после `fixture.destroy()` значит, что компонент отписался:

```ts
fixture.destroy();
expect(store.items$.subscriberCount()).toBe(0);
```

### Точная последовательность — `nextWithValues` {#a-precise-sequence-—-nextwithvalues}

`nextWithValues(configs)` выдаёт записи **по порядку** и останавливается на первом
`{ complete: true }`. Значения, которые вы тем временем отправите в subject под спаем, подмешиваются,
пока не придёт это завершение.

```ts
products.getProducts$.nextWithValues([
  { value: [{ name: 'Product 1' }] },
  { value: [{ name: 'Product 2' }], delay: 100 },
  { complete: true },
]);
```

#### `ValueConfig` {#valueconfig}

| Форма                    | Что делает                                              |
| ------------------------ | ------------------------------------------------------- |
| `{ value, delay? }`      | выдаёт `value` (через `delay` мс, если задано)          |
| `{ errorValue, delay? }` | завершает поток ошибкой `errorValue` (через `delay` мс) |
| `{ complete?, delay? }`  | завершает поток; `complete: false` ничего не выдаёт     |

Что делает запись, решает её **ключ**, а не истинность значения. `{ value: false }`, `{ value: 0 }`,
`{ value: '' }` и `{ value: null }` выдаются, и ложный `errorValue` тоже срабатывает.

**Частая ошибка:** `delay` на фейковых таймерах. `delay` работает через `delay()` / `timer()` из RxJS,
поэтому значение не придёт, пока вы не сдвинете часы. [`advanceTimers(ms)`](/ru/utilities/fake-timers)
сдвигает их **и** выполняет микрозадачи, которые ставит выдача значения.

### Свой поток на каждый вызов — `nextWithPerCall` {#a-fresh-stream-per-call-—-nextwithpercall}

`nextWithPerCall(configs)` отдаёт **n-му вызову** n-ю запись. Он возвращает по `ReplaySubject` на
запись, чтобы тест мог позже отправить новые значения в поток конкретного вызова.

```ts
import { firstValueFrom } from 'rxjs';

const [first$, second$] = products.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);

expect(await firstValueFrom(products.watch$())).toBe('a');

// поток второго вызова остаётся открытым, в него можно отправлять ещё
second$.next('b2');
```

Каждый такой поток **завершается после первого значения**, если в записи нет `doNotComplete: true`.
`ValueConfigPerCall` — это `{ value, delay?, doNotComplete? }`.

### Ручное управление — `returnSubject` {#manual-control-—-returnsubject}

`returnSubject()` возвращает `ReplaySubject` под спаем — для случаев, которые другие хелперы не
покрывают:

```ts
const subject = products.getProducts$.returnSubject();

subject.next([{ name: 'Product 1' }]);
subject.error(new Error('boom'));
```

Это `ReplaySubject`, поэтому подписчик, пришедший поздно, всё равно увидит уже отправленные значения.

Полный справочник, включая отдельный конструктор `createObservableWithValues`:
[Рантаймы → RxJS](/ru/runtimes/rxjs).

## Сброс спаев — `clearAutoSpy` / `resetAutoSpy` {#resetting-spies-—-clearautospy-resetautospy}

Сбрасывайте все методы спая одним вызовом, а не `mockClear` / `mockReset` на каждом методе. Оба
работают со спаями из `createSpyFromClass` и `createAutoMock` и затрагивают спаи методов **и** спаи
аксессоров (геттеров и сеттеров).

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

clearAutoSpy(users); // забыть записанные вызовы; настроенные ответы остаются

resetAutoSpy(users); // забыть вызовы И настроенные ответы
```

Вызывайте его в `afterEach`, если спай живёт между тестами, или создавайте спай в `beforeEach` и
обходитесь без сброса. Спай, объявленный через `using`, сбрасывается сам
([`using`](./create-spy-from-class#using)).

После `resetAutoSpy` каждый метод снова отвечает `undefined`, пока вы его не настроите. Сброс убирает:

- настройки библиотеки: `calledWith`, `resolveWith`, `nextWith` и остальные;
- значение, заданное API раннера, например `users.getName.mockReturnValue('x')`;
- значение в очереди `mockReturnValueOnce`;
- то, что должен был отвечать спай аксессора (`accessorSpies.getters.theme.mockReturnValue('dark')`).

Это то же, что делает `vi.resetAllMocks()`, но для одного спая.

**Частая ошибка:** поставить `mockReturnValueOnce` в очередь до `resetAutoSpy` и ждать его после.
Сброс его убирает — ставьте значение в очередь после сброса.

## Причина и следствие: почему `calledWith`, а не `mockReturnValue` {#cause-and-effect-why-calledwith-and-not-mockreturnvalue}

Заглушка говорит: «на этот вход зависимость отвечает вот так». `mockReturnValue` оставляет ответ и
теряет вход: ответ приходит, что бы код ни передал. Так тест проходит, когда не должен:

```ts
function priceIn(rates: Rates, amount: number, currency: string): number {
  return amount * rates.rateFor('EUR'); // ошибка: `currency` игнорируется
}

rates.rateFor.mockReturnValue(2);
expect(priceIn(rates, 10, 'USD')).toBe(20); // зелёный
```

Обычно это чинят через `toHaveBeenCalledWith('USD')` в конце теста. Это работает, но ответ настроен
вверху, а его условие проверяется внизу. Если последней проверки нет или она смотрит не на тот спай,
тест остаётся зелёным.

`calledWith` держит оба в одной строке. Ответ существует только для своего входа, поэтому неверный вход
ответа не получает, и тест падает:

```ts
rates.rateFor.calledWith('USD').mockReturnValue(2);
expect(priceIn(rates, 10, 'USD')).toBe(20); // падает: rateFor('EUR') ответил undefined, цена — NaN
```

Когда `calledWith` впервые промахивается мимо вызова с тем же числом аргументов, что у одной из
настроек, на спае без значения по умолчанию, библиотека печатает подсказку с вызовом и настройками:

```text
[vitest-auto-spy] rateFor('EUR') matched none of its calledWith() configs (['USD']) and answered undefined. …
```

Она печатается один раз на файл теста, никогда не бросает и молчит, если у спая есть значение по
умолчанию.

`calledWith` к тому же даёт **более слабую** связь. Проверка вызова фиксирует, как код разговаривает с
зависимостью: сколько раз, в каком порядке, с какими точными аргументами. Ответ, отфильтрованный по
аргументам, говорит лишь, что результат зависит от входа. Код может вызвать один раз или три,
закешировать или переставить вызовы — тест пройдёт, пока правильный вход даёт правильный результат.
Рефакторинг, сохраняющий поведение, оставляет тест зелёным.

Если вызов с любыми другими аргументами — сам по себе ошибка, используйте `mustBeCalledWith`. Тогда
падение назовёт несовпадение прямо на вызове, а не проявится как `NaN` где-то дальше:

```text
[vitest-auto-spy] rateFor is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 'USD', got 'EUR'.
Wanted: rateFor('USD')
Actual: rateFor('EUR')
```

`mockReturnValue` по-прежнему уместен, когда ответ не к чему привязать: метод без аргументов или метод,
чьи аргументы тесту безразличны. `toHaveBeenCalledWith` по-прежнему уместен, когда вызов и есть
поведение: отправленная команда, записанное событие, запрос, ответ на который не читают.

## Подробнее {#in-depth}

### Почему `failWith`, а не `throwWith` {#why-failwith-and-not-throwwith}

`throwWith` уже значит «завершить поток ошибкой» на спае с `Observable`. Во время выполнения у каждого
спая есть все хелперы; какие из них покажет TypeScript, решает только тип возврата в `Spy<T>`. Общее
имя означало бы, что молча побеждает набор хелперов, подключённый последним, — на каждом спае прогона.

### Сравнение с раннерами {#compared-with-the-runners}

В Vitest 4.1 появились `mockThrow` / `mockThrowOnce` — они покрывают случай «каждый вызов бросает». В
Bun и `node:test` их нет, поэтому с `failWith` один и тот же тест работает на всех трёх. Аналога
«бросать только для этих аргументов» нет ни в одном раннере: `mockImplementation` заменяет метод
целиком, а это противоположно настройке одного набора аргументов.
