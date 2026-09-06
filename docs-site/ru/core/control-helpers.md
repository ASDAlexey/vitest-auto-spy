---
title: Управляющие хелперы
description: calledWith, mustBeCalledWith, resolveWith, nextWith и остальные — хелперы, которые каждый метод-спай получает по своему типу возврата.
---

# Управляющие хелперы

Каждый метод-спай получает хелперы, выбранные по типу возвращаемого значения. `calledWith` /
`mustBeCalledWith` разводят вызовы по аргументам, а хелперы под конкретный тип настраивают результат.

::: tip Порядок ключей не важен
Аргументы сопоставляются по сериализованному ключу, а ключи объектов перед его сборкой сортируются —
поэтому `calledWith({ id: 1, name: 'a' })` совпадёт с вызовом, сделанным как `{ name: 'a', id: 1 }`.
Это один и тот же аргумент, а порядок, в котором литерал случайно записали, — не то, от чего должен
зависеть тест.
:::

## Синхронные методы {#synchronous-methods}

```ts
// стандартный API vi.fn() работает как есть
myService.getName.mockReturnValue('Fake Name');

// вернуть значение только для конкретных аргументов
myService.getName.calledWith(1).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBeUndefined();

// бросить исключение, если вызвали с «неправильными» аргументами
myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
expect(() => myService.getName(2)).toThrow();
```

### Заставить вызов бросить исключение — `failWith` {#making-a-call-throw-—-failwith}

```ts
// бросает любой вызов
cart.checkout.failWith(new HttpErrorResponse({ status: 500 }));
expect(() => cart.checkout(1)).toThrow();

// бросают только эти аргументы; остальные отвечают как обычно
cart.checkout.calledWith(BAD_ID).failWith(new Error('unknown cart'));
cart.checkout.calledWith(GOOD_ID).mockReturnValue(receipt);
```

`failWith` доступен на спае с **любым** типом возврата, а также в цепочке `calledWith` /
`mustBeCalledWith`. Он перекрывает `resolveWith`, `nextWith` или пакет значений по вызовам, настроенные
до него, и сам перекрывается тем, что настроили после, — так что поведение вызова никогда не зависит от
порядка, в котором случайно написана спека. `resetAutoSpy` снимает его, как любую другую настройку.

::: tip Почему не `throwWith`
`throwWith` уже означает _завершить поток ошибкой_ на спае-observable. В рантайме каждый спай несёт все
наборы хелперов сразу — различает их только тип возврата в `Spy<T>`, — поэтому общее имя означало бы, что
молча побеждает набор, прицепленный последним, и так на каждом спае за весь прогон.
:::

::: info В сравнении с раннерами
Vitest 4.1 добавил `mockThrow` / `mockThrowOnce` — это половина задачи, та, что на уровне спая. В Bun и
`node:test` нет и её, поэтому именно `failWith` позволяет одной и той же спеке идти на всех трёх. А аналога
второго примера выше нет ни в одном рантайме: `mockImplementation` подменяет диспетчеризацию целиком, что
прямо противоположно настройке одного набора аргументов.
:::

### Что печатает упавший `mustBeCalledWith` {#what-a-mustbecalledwith-failure-prints}

Обе стороны сразу, как это делают `td.explain` и sinon, — потому что диагноз и есть сравнение, а не одна из
его половин:

```
The function 'getName' was configured with 'mustBeCalledWith' and expects to be called with specific arguments.
Wanted: getName(1)
Actual: getName(2)
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers
```

Когда настроен не один вызов, печатаются все, вместе с матчерами, — так конфиг, который ни разу не совпал,
виден глазами, а не выводится по догадке:

```
Wanted (3 configured):
  getName(1)
  getName(2,'fast')
  getName(Any<Number>,StringContaining)
Actual: getName(9,'zzz')
```

### Асимметричные матчеры в `calledWith` {#asymmetric-matchers-in-calledwith}

`calledWith` / `mustBeCalledWith` принимают те же асимметричные матчеры, что и `expect`
(`expect.any`, `expect.objectContaining`, `expect.stringMatching`, …). Конфиг, в котором есть хотя бы
один матчер, сохраняется как предикат и сверяется с фактическими аргументами в момент вызова, а не
по точной сериализации.

```ts
myService.getName.calledWith(expect.any(Number)).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBe('Fake Name');

myService.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
expect(myService.save({ id: 1, name: 'x' })).toBe(true);
```

Точный список аргументов проверяется раньше любого из них, а конфиги с матчерами перебираются в порядке
регистрации — узкий конфиг, записанный раньше широкого, сохраняет свои вызовы.

Повторная регистрация **того же** списка аргументов заменяет прежний ответ ровно так же, как это
происходит для точных аргументов:

```ts
myService.getName.calledWith(expect.anything()).mockReturnValue('first');
myService.getName.calledWith(expect.anything()).mockReturnValue('second');
expect(myService.getName(1)).toBe('second');
```

Каждый вызов `expect.anything()` создаёт новый объект, поэтому «тот же аргумент» не может означать тот же
экземпляр: два матчера одинаковы, когда принимают одни и те же значения, — тот же класс матчера, тот же
образец, та же инверсия. Исключение — самодельный объект `{ asymmetricMatch }`. Его вердикт живёт в
замыкании, куда не заглянет никакое сравнение, поэтому два таких объекта — всегда два конфига, и перекрыть
может только тот же самый экземпляр, зарегистрированный повторно.

## Методы, возвращающие Promise, — `resolveWith` {#promise-returning-methods-—-resolvewith}

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');

// значения по вызовам и ответ в зависимости от аргументов
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

### Как посмотреть, чем кончились промисы, — `mock.settledResults` {#settled-results}

У каждого метода-спая есть `mock.settledResults`: по одной записи на вызов, в том же порядке, и в
записи — чем в итоге завершился промис, который этот вызов вернул. Vitest ведёт такой учёт сам; в
Bun (`bun:test`) и `node:test` его даёт встроенный полифил, так что поверхность одинакова во всех
трёх рантаймах.

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await myService.getProducts();
expect(myService.getProducts.mock.settledResults).toEqual([{ type: 'fulfilled', value: [{ name: 'Product 1' }] }]);

myService.getProducts.rejectWith('FAKE ERROR');
await myService.getProducts().catch(() => undefined);
expect(myService.getProducts.mock.settledResults).toContainEqual({ type: 'rejected', value: 'FAKE ERROR' });
```

Каждая запись — это `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`. Вызов, чей промис
ещё не завершился, записан как `incomplete` — до тех пор, пока не завершится.

## Сброс спаев — `clearAutoSpy` / `resetAutoSpy` {#resetting-spies-—-clearautospy-resetautospy}

Сбросить все спаи внутри собранного дубля одним вызовом, а не дёргать руками `mockClear` /
`mockReset` на каждом методе. Оба работают и со спаями `createSpyFromClass`, и с прокси
`createAutoMock`, и покрывают как спаи методов, так **и** спаи аксессоров.

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

// чистит только записанные вызовы — настроенные ответы остаются
clearAutoSpy(myService);

// чистит вызовы И возвращает настройку к исходному состоянию
resetAutoSpy(myService);
```

`resetAutoSpy` отменяет и конфигурацию библиотеки (`calledWith` / `resolveWith` / `nextWith` / …), **и**
голое возвращаемое значение, выставленное прямо на спае (`myService.getName.mockReturnValue('x')`), —
после сброса метод снова возвращает `undefined`, пока его не настроят заново.

## Observable-методы и свойства — `nextWith` {#observable-methods-properties-—-nextwith}

Включается однократным импортом rxjs-слоя (`import 'vitest-auto-spy/rxjs';`). См.
[Рантаймы → RxJS](/ru/runtimes/rxjs).

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // отдать значение, поток остаётся открытым
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]); // отдать одно значение и завершить
myService.getProducts$.throwWith('FAKE ERROR'); // завершить поток ошибкой
myService.getProducts$.complete(); // завершить поток
```

### Точная последовательность — `nextWithValues` {#a-precise-sequence-—-nextwithvalues}

`nextWithValues(configs)` отдаёт записи **по порядку** и останавливается на первой `{ complete: true }`.
Всё, что положат в лежащий под спаем subject позже, подмешивается в поток, пока это завершение не наступит.

```ts
myService.getProducts$.nextWithValues([
  { value: [{ name: 'Product 1' }] },
  { value: [{ name: 'Product 2' }], delay: 100 },
  { complete: true },
]);
```

#### `ValueConfig` {#valueconfig}

| Форма                    | Что делает                                               |
| ------------------------ | -------------------------------------------------------- |
| `{ value, delay? }`      | отдать `value` (через `delay` мс, если задержка указана) |
| `{ errorValue, delay? }` | завершить поток ошибкой `errorValue` (через `delay` мс)  |
| `{ complete?, delay? }`  | завершить поток — `complete: false` не отдаёт ничего     |

Запись выбирается по **ключу, который в ней есть**, а не по тому, истинно ли её значение: `{ value: false }`,
`{ value: 0 }`, `{ value: '' }` и `{ value: null }` — отдают все, и ложный `errorValue` тоже срабатывает.
До 3.12.1 сверху сидела проверка на истинность, из-за чего обычный поток булевых значений или счётчик не
отдавал вообще ничего, — а симптом всплывал в другом месте: `expectEmission` по таймауту или компонент,
всё ещё сидящий в начальном состоянии, при зелёной проверке на значение по умолчанию.

`delay` считается в миллисекундах и применяется через собственные `delay()` / `timer()` из RxJS, поэтому
на фейковых таймерах часы придётся двигать: [`advanceTimers(ms)`](/ru/utilities/fake-timers) делает это **и**
дочищает микрозадачи, которые ставит в очередь эмиссия.

### Свой поток на каждый вызов — `nextWithPerCall` {#a-fresh-stream-per-call-—-nextwithpercall}

`nextWithPerCall(configs)` отдаёт **n-му вызову** n-ю запись и возвращает по одному `ReplaySubject`
на запись, чтобы тест мог позже дослать значения в конкретный вызов.

```ts
const [first$, second$] = myService.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);

expect(await firstValueFrom(myService.watch$())).toBe('a');

// поток второго вызова остаётся открытым, его можно вести дальше
second$.next('b2');
```

Каждый поток на вызов **завершается после первого же значения**, если в записи не указано
`doNotComplete: true`. `ValueConfigPerCall` — это `{ value, delay?, doNotComplete? }`.

### Ручное управление — `returnSubject` {#manual-control-—-returnsubject}

`returnSubject()` отдаёт `ReplaySubject`, который стоит за спаем, — для случаев, которые хелперы
не покрывают:

```ts
const subject = myService.getProducts$.returnSubject();

subject.next([{ name: 'Product 1' }]);
subject.error(new Error('boom'));
```

Это `ReplaySubject`, поэтому подписчик, пришедший с опозданием, всё равно увидит уже отданные значения.

Полный справочник и отдельный билдер `createObservableWithValues`:
[Рантаймы → RxJS](/ru/runtimes/rxjs).
