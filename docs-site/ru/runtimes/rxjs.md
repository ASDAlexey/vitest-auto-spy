---
title: RxJS
description: Спай метода или свойства возвращает Observable, которым управляет тест - nextWith, nextWithValues, nextWithPerCall, returnSubject, задержки и сброс.
---

# RxJS

Точка входа `vitest-auto-spy/rxjs` даёт спаю возвращать `Observable`, которым управляет тест. Она
нужна, когда проверяемый код подписывается на метод сервиса или на свойство с `$`.

Импортируйте её один раз в setup-файле и укажите этот файл в конфиге Vitest:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['./vitest.setup.ts'] },
});
```

Дальше спека создаёт спай, передаёт его проверяемому классу и задаёт, что выдаст поток:

```ts
// product-list.spec.ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import { ProductList } from './product-list';
// в load() вызывает products.getProducts().subscribe(...)
import { ProductService } from './product.service';

// getProducts(): Observable<Product[]>

it('shows the products the service returns', () => {
  const products: Spy<ProductService> = createSpyFromClass(ProductService);
  const list = new ProductList(products);

  products.getProducts.nextWith([{ name: 'Tea' }]);
  list.load();

  expect(list.names).toEqual(['Tea']);
});
```

Если импорта в setup-файле нет, первый же observable-хелпер бросает ошибку
`Observable spies require rxjs` и называет нужный импорт. Остальная библиотека rxjs не импортирует,
так что проектам без rxjs ставить его не нужно.

## Observable-свойства {#observable-properties}

Свойство вроде `items$` — не метод, поэтому его перечисляют в `observablePropsToSpyOn`. После этого у
него те же хелперы, что у метода.

```ts
const store = createSpyFromClass(CartStore, { observablePropsToSpyOn: ['items$'] });

store.items$.nextWith([{ id: 1 }]);
```

## Хелперы {#helpers}

Эти хелперы есть у каждого метода-спая, который возвращает `Observable`, и у каждого свойства из
`observablePropsToSpyOn`.

| Хелпер                    | Что делает                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `nextWith(value)`         | выдаёт `value`; поток остаётся открытым                           |
| `nextOneTimeWith(value)`  | выдаёт `value` и завершает поток                                  |
| `throwWith(error)`        | завершает поток ошибкой                                           |
| `complete()`              | завершает поток                                                   |
| `nextWithValues(configs)` | выдаёт последовательность: значения, ошибку, завершение, задержки |
| `nextWithPerCall(list)`   | даёт каждому вызову свой поток; возвращает `Subject` каждого      |
| `returnSubject()`         | возвращает `Subject` за спаем — для полного ручного управления    |
| `subscriberCount()`       | число открытых подписок (только у свойств)                        |

```ts
products.getProducts.nextWith([{ name: 'Tea' }]); // значение, поток открыт
products.getProducts.nextOneTimeWith([{ name: 'Tea' }]); // одно значение, затем завершение
products.getProducts.throwWith(new Error('offline')); // ошибка в потоке
products.getProducts.complete(); // завершение

// точная последовательность
products.getProducts.nextWithValues([{ value: [{ name: 'Tea' }] }, { errorValue: 'offline' }, { complete: true }]);

// свой поток на каждый вызов: первый вызов получит ['a'], второй — ['b']
products.getProducts.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// сам Subject
const subject = products.getProducts.returnSubject();
subject.next([{ name: 'Coffee' }]);
```

Элементы списков для двух хелперов:

| Тип                                      | Форма                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `ValueConfig` (для `nextWithValues`)     | `{ value, delay? }`, `{ errorValue, delay? }` или `{ complete?, delay? }`               |
| `ValueConfigPerCall` (`nextWithPerCall`) | `{ value, delay?, doNotComplete? }`; каждый поток завершается, если нет `doNotComplete` |

## `nextWith` пишет в текущий поток; `nextWithValues` подменяет поток {#nextwith-pushes-nextwithvalues-republishes}

С виду они взаимозаменяемы. На observable-**свойстве** — нет. На спае **метода** они ведут себя
одинаково: каждый вызов читает текущий поток.

| Хелпер                                                    | Что делает с потоком                 | Кто уже подписан   |
| --------------------------------------------------------- | ------------------------------------ | ------------------ |
| `nextWith` / `nextOneTimeWith` / `throwWith` / `complete` | пишет в поток, общий для всех        | получает значение  |
| `nextWithValues` (на свойстве-спае)                       | подменяет свойство **новым** потоком | остаётся на старом |

Компонент обычно подписывается на свойство один раз, в `ngOnInit`, и держит поток, полученный тогда.
Если вызвать `nextWithValues` после этого, компонент значений не увидит. Библиотека один раз
предупредит:

```text
[vitest-auto-spy] Feed.items$.nextWithValues() ran after something subscribed to Feed.items$, and it
publishes a new stream that subscriber never sees — these values will not reach it. Call
nextWithValues() before the code under test subscribes, or push into the stream it holds with nextWith().
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs#nextwith-pushes-nextwithvalues-republishes
```

Починить можно двумя способами:

- Вызвать `nextWithValues` на этапе подготовки, до создания компонента.
- Или писать в живой поток:

```ts
service.items$.nextWith(['a']); // дойдёт до компонента, подписанного в ngOnInit
service.items$.returnSubject().error(new Error('offline')); // это тоже
```

## Метод-запрос отвечает один раз: `nextOneTimeWith` {#a-request-method-answers-once-nextonetimewith}

HTTP-вызов, `invoke` в Tauri, запрос к базе: каждый выдаёт одно значение и завершается. Такой метод
настраивайте через `nextOneTimeWith`. Он выдаёт значение и завершает поток — так же, как настоящий
запрос.

Если тесты запускает билдер Angular CLI `@angular/build:unit-test`, добавьте
`import 'vitest-auto-spy/rxjs';` в файл из `setupFiles` в `angular.json` (см.
[Билдер unit-test в Angular](/ru/guides/angular-unit-test-builder)):

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

Полный пример на Angular. Компонент один раз вызывает `OrderService.load()` и хранит результат или
текст ошибки в сигналах:

```ts
// order-list.component.ts
import { Component, type OnInit, inject, signal } from '@angular/core';

import { type Order, OrderService } from './order.service';

@Component({ selector: 'app-order-list', template: '' })
export class OrderListComponent implements OnInit {
  private readonly orderService = inject(OrderService);
  readonly orders = signal<Order[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.orderService.load().subscribe({
      next: (orders) => this.orders.set(orders),
      error: (err: Error) => this.error.set(err.message),
    });
  }
}
```

```ts
// order-list.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/angular';

import { OrderListComponent } from './order-list.component';
// load(): Observable<Order[]>, один HTTP-запрос
import { OrderService } from './order.service';

describe('OrderListComponent', () => {
  let orderService: Spy<OrderService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderListComponent],
      providers: [provideAutoSpy(OrderService)], // TestBed внедряет спай вместо настоящего сервиса
    });
    orderService = injectSpy(OrderService); // тот же спай, что получит компонент
    orderService.load.nextOneTimeWith([{ id: 1 }]); // выдаёт один список и завершается
  });

  it('shows the orders', async () => {
    const fixture = TestBed.createComponent(OrderListComponent);
    await stable(fixture); // запускает ngOnInit и обнаружение изменений

    expect(fixture.componentInstance.orders()).toEqual([{ id: 1 }]);
  });

  it('shows the error', async () => {
    orderService.load.throwWith(new Error('offline')); // заменяет завершённый поток из beforeEach
    const fixture = TestBed.createComponent(OrderListComponent);
    await stable(fixture);

    expect(fixture.componentInstance.error()).toBe('offline');
  });
});
```

Подробнее о `provideAutoSpy` и `injectSpy`: [Angular](/ru/adapters/angular#replace-a-service-provideautospy-and-injectspy).

Поток, который завершил `nextOneTimeWith`, заменяется новым в тот момент, когда вы вызываете
следующий хелпер потока на этом методе. Поэтому `throwWith` во втором тесте начинает новый поток, в
котором только ошибка, а списка из `beforeEach` там уже нет. См.
[Сбрасывать потоки между тестами](#reset-streams-between-tests).

**Почему не `nextWith`.** `nextWith` выдаёт значение, но оставляет поток открытым. Любой поток спая
повторяет последнее значение тем, кто подпишется позже, а открытый делает это, пока вы его не
сбросите. Для метода-запроса это
ломает две вещи:

- **Операторы, которые ждут завершения, так и не отвечают.** `forkJoin`, `lastValueFrom`, `toArray()`
  и `expectAllEmissions` выдают результат только после того, как источник завершится. С потоком из
  `nextWith` они не выдают ничего и не падают. Компонент на их основе так и остаётся в состоянии
  загрузки (например, его сигнал `loading` всё ещё `true`), и ничто не подсказывает почему.
- **Значение из `beforeEach` приходит раньше ошибки.** Если тест потом вызывает `throwWith`,
  следующий подписчик получает сначала старое значение, а затем ошибку. Код идёт по успешной ветке
  на устаревших данных.

`nextWith` нужен для потока, который и в настоящем коде остаётся открытым: `state$` стора, websocket,
поток событий роутера.

**Библиотека предупреждает о `throwWith` после `nextWith`.** Если метод настроен через
`nextOneTimeWith`, это предупреждение вас не касается. Оно срабатывает, когда вызван `throwWith` и
выполнено всё сразу:

- метод настроен через `nextWith`;
- поток с тех пор не завершился и не упал с ошибкой;
- в этот момент на поток никто не подписан.

По умолчанию библиотека выводит предупреждение, один раз для каждого спая. С
[`setupAutoSpy({ misconfiguration: 'throw' })`](/ru/utilities/setup#misconfiguration-reports-that-fail-at-the-call)
каждый такой вызов `throwWith` вместо этого бросает ошибку:

```text
[vitest-auto-spy] BondApi.getBonds.throwWith() ran on a stream that still holds a value from an
earlier nextWith() and has no subscriber, so the next one gets that value first and the error after
it — the code under test runs its success branch on stale data. …
```

Три выхода:

- настроить метод через `nextOneTimeWith` вместо `nextWith`;
- вызвать `resetAutoSpy(api.getBonds)` (из `vitest-auto-spy`) перед `throwWith`;
- если тест как раз про «выдать, потом упасть», сказать это одним вызовом:
  `nextWithValues([{ value: BONDS }, { errorValue: error }])`.

Если проверяемый код уже подписан, когда вызывается `throwWith`, предупреждения нет. Этот подписчик
получил значение в момент `nextWith`, а теперь получает ошибку.

**Как оставить вызов без ответа.** Чтобы проверить состояние загрузки, метод должен вернуть поток,
который ничего не выдаёт. Если метод настроен через `nextWith`, `returnSubject()` такого потока не
даст: он возвращает тот же поток, и следующий подписчик получит из него сохранённое значение.
Сбросьте спай и верните `NEVER` из rxjs:

```ts
import { NEVER } from 'rxjs';
import { resetAutoSpy } from 'vitest-auto-spy';

resetAutoSpy(api.getBonds); // убирает значение из beforeEach
api.getBonds.mockReturnValue(NEVER); // каждый вызов остаётся без ответа
```

`mockReturnValue` отключает хелперы потоков у этого спая (см. конец раздела
[Куда уходит ошибка `throwWith`](#where-a-throwwith-error-goes)). Чтобы снова пользоваться `nextWith`
или `throwWith`, сначала вызовите `api.getBonds.mockReset()`.

У спая, которого никто не настраивал, подойдёт и `returnSubject()`: его поток молчит, пока вы не
вызовете на нём `next`.

## Куда уходит ошибка `throwWith` {#where-a-throwwith-error-goes}

`throwWith` завершает поток ошибкой, даже если на него ещё никто не подписан. Каждый, кто подпишется
позже, всё равно получит эту ошибку. Что с ней будет дальше, зависит от того, как проверяемый код
подписывается. Два API Angular, `toSignal` и `rxResource`, сохраняют ошибку у себя и не передают её
в `ErrorHandler`. Это ловушка: ничего не падает, и тест остаётся зелёным, пока сам не
прочитает ошибку из сигнала или ресурса:

| Код под тестом                                                              | Где оказывается ошибка                                                     | Как проверить                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.subscribe({ next, error })` или `catchError`, пишет в состояние           | в вашем обработчике ошибки, синхронно, в момент подписки                   | прочитать записанное состояние: `expect(component.error()).toBe('offline')`                                                                                                                                |
| `toSignal(api.load())`, и тест сам читает сигнал                            | в сигнале: он бросает её при чтении, и только тогда                        | `expect(() => service.bonds()).toThrow('offline')`                                                                                                                                                         |
| `rxResource({ stream: () => api.load() })`                                  | в ресурсе: `status()` равен `'error'`, `value()` бросает                   | [`await settleResource(service.bonds)`](/ru/adapters/angular#resources-httpresource-and-resource) (из `vitest-auto-spy/angular`), затем прочитать `error()`                                                |
| любой сигнал, прочитанный в `effect` или шаблоне, в том числе из `toSignal` | в `ErrorHandler`, во время обнаружения изменений; TestBed бросает её снова | `expect(() => TestBed.tick()).toThrow('offline')`                                                                                                                                                          |
| `.subscribe(next)` без обработчика ошибки                                   | rxjs бросает её из `setTimeout`, когда тест уже закончился                 | опция [`strayTimers`](/ru/utilities/setup#an-observable-error-nothing-handled) в `setupAutoSpy` роняет тест. Чтобы ожидать ошибку, вызовите `expectUnhandledObservableErrors()` из `vitest-auto-spy/setup` |

Первая строка — это [полный пример выше](#a-request-method-answers-once-nextonetimewith). Случай с
`toSignal`:

```ts
it('shows the error', () => {
  api.load.throwWith(new Error('offline'));
  const service = TestBed.inject(BondsService); // bonds = toSignal(api.load())

  expect(() => service.bonds()).toThrow('offline'); // пока сигнал никто не читает, ничего не падает
});
```

Сигнал из `toSignal`, который выводит шаблон, относится к строке про `effect` и шаблон: ошибка
вылетает из обнаружения изменений, а не из чтения в вашем тесте. `effect` и шаблон не выполняются,
пока не запущено обнаружение изменений, поэтому тест, который только получает сервис или создаёт
компонент, ничего не увидит. Запустите обнаружение изменений и ожидайте, что этот шаг упадёт:

```ts
expect(() => TestBed.tick()).toThrow('offline');
// или через фикстуру
await expect(fixture.whenStable()).rejects.toThrow('offline');
```

**После `mockImplementation` или `mockReturnValue` хелперы потоков перестают работать.** Эти два
метода заменяют собственную реализацию спая (в предупреждении ниже она названа «dispatch»), а именно
она возвращает поток, настроенный хелперами. Поэтому последующий `throwWith` ничего не меняет:
каждый вызов по-прежнему возвращает то, что задали `mockReturnValue` или `mockImplementation`. Такой порядок библиотека сообщает
(`throwWith() was configured on 'load' after mockImplementation() had replaced its dispatch`):
предупреждением или, под `misconfiguration: 'throw'`, ошибкой. Сначала вызовите `api.load.mockReset()`
или задайте значение по умолчанию через `nextOneTimeWith` вместо `mockReturnValue`.

## Как читать последовательность как marble-диаграмму {#reading-a-sequence-as-a-marble}

`nextWithValues` выдаёт элементы по порядку. Время между ними задаёт только `delay`. В комментариях
каждый пример записан marble-диаграммой (`|` — завершение, `#` — ошибка).

```ts
products.getProducts.nextWithValues([{ value: 'a' }, { value: 'b' }, { complete: true }]);
// (ab|)   оба значения сразу, затем завершение
```

```ts
products.getProducts.nextWithValues([{ value: 'a' }, { value: 'b', delay: 20 }, { complete: true, delay: 10 }]);
// a 20ms b 10ms |
```

```ts
products.getProducts.nextWithValues([{ value: 'a' }, { errorValue: 'boom', delay: 20 }]);
// a 20ms #
```

- `{ complete: false }` ничего не выдаёт и оставляет поток открытым.
- Всё после первого `{ complete: true }` отбрасывается.

## Тайминги {#timing}

- **`delay` — в миллисекундах реального времени.** Для значений и завершения работает `delay()` из
  RxJS, для ошибок — `timer()`. Виртуального планировщика нет.
- **Без задержки значение приходит синхронно**, в том же тике.
- **Поздний подписчик тоже получит последнее значение.** За спаем стоит `ReplaySubject(1)`. Поэтому
  `nextWith(v)` работает, подписался ли проверяемый код до вызова или после.
- **С фейковыми таймерами задержку нужно промотать.** Используйте
  [`advanceTimers(ms)`](/ru/utilities/fake-timers): он ещё и выполняет отложенные колбэки промисов.
  Голый `vi.advanceTimersByTime()` этого не делает, и проверка может сработать слишком рано.

```ts
import { expect, it } from 'vitest';
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();

it('emits after 100 ms', async () => {
  products.getProducts.nextWithValues([{ value: 'a', delay: 100 }]);

  const seen: string[] = [];
  products.getProducts().subscribe((value) => seen.push(value));

  await advanceTimers(100);

  expect(seen).toEqual(['a']);
});
```

## Отдельный конструктор observable {#standalone-observable-builder}

`createObservableWithValues` строит такой же поток без спая. Элементы — те же, что у
`nextWithValues`.

```ts
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

const fake$ = createObservableWithValues([{ value: 1 }, { value: 2 }, { complete: true }]);

// вместе с Subject
const { values$, subject } = createObservableWithValues([{ value: 1 }], { returnSubject: true });
```

## Проверить, что никто не забыл отписаться: `subscriberCount()` {#check-for-a-missing-unsubscribe-subscribercount}

`items$.subscriberCount()` возвращает, сколько подписок на свойство-спай открыто сейчас. Подписка
перестаёт считаться, когда от неё отписались или когда поток завершился либо упал с ошибкой.
Проверьте `0` после уничтожения компонента — так ловится утечка подписки:

```ts
fixture.destroy();
expect(store.items$.subscriberCount()).toBe(0);
```

## Сбрасывать потоки между тестами {#reset-streams-between-tests}

У каждого члена-спая один `ReplaySubject(1)` — поток, который повторяет последнее значение каждому
новому подписчику. Это значение хранится, пока вы не сбросите спай, как и любой другой ответ, заданный
спаю. Если спай живёт дольше одного теста, сбрасывайте его, иначе следующий тест первым получит
старое значение.

```ts
import { beforeEach } from 'vitest';
import { resetAutoSpy } from 'vitest-auto-spy';

beforeEach(() => {
  resetAutoSpy(service); // TestBed собран в beforeAll, спай общий
});
```

- **`vi.clearAllMocks()` и `clearMocks: true` поток не сбрасывают.** Поток — состояние библиотеки, а не
  часть мока раннера. Вызывайте `resetAutoSpy(spy)`.
- **Завершённый поток заменяется.** Поток завершён после `nextOneTimeWith()`, `throwWith()` или
  `complete()` на спае либо после `complete()` или `error()` на `Subject` из `returnSubject()`. Тогда
  следующий хелпер потока (`nextWith`, `throwWith` и остальные) начинает новый поток:

```ts
const subject = service.load$.returnSubject();

subject.complete(); // спека закрывает его руками

service.load$.nextWith(page); // новый поток, а не значение, которое никто не получит
```

- **В одном тесте вызовы складываются.** `nextWith(a)`, затем `throwWith(e)` — это «выдать `a`, потом
  упасть». Если между ними никто не подписан, библиотека об этом сообщает: см.
  [Метод-запрос отвечает один раз](#a-request-method-answers-once-nextonetimewith). Поток, который
  падает сразу при подписке, что бы ни было до этого, даёт
  `nextWithValues([{ errorValue: e }])`. На свойстве-спае вызывайте его до подписки: см.
  [`nextWith` пишет в текущий поток; `nextWithValues` подменяет поток](#nextwith-pushes-nextwithvalues-republishes).

## Проверять вместо того, чтобы подписываться {#asserting-instead-of-subscribing}

Чтобы проверить, что выдаёт поток («выдаёт», «выдаёт эти три», «молчит»), используйте
[проверки observable](/ru/core/observable-assertions). Они работают с любым объектом, у которого есть
`subscribe`, и rxjs им не нужен:

```ts
import { expectEmission } from 'vitest-auto-spy';

const emitted = expectEmission(products.getProducts());

products.getProducts.nextWith(['x']);

expect(await emitted).toEqual(['x']);
```

## rxjs в типах {#rxjs-in-the-types}

Объявления типов ядра не импортируют rxjs. Проекты на React, Vue, Svelte и Node без rxjs проходят
проверку типов с `skipLibCheck: false` и не загружают ни одного `.d.ts` из rxjs. rxjs упоминают только
объявления `vitest-auto-spy/rxjs` и `vitest-auto-spy/observer-spy`.

Ни одна из этих двух не упоминает `vitest`, поэтому проект на Bun или `node:test` проходит с ними
проверку типов при `skipLibCheck: false` и без установленного Vitest. На Bun и `node:test`
`returnSubject()` получает тип `Subject` из rxjs, как только эта точка входа импортирована, — так же,
как на Vitest.

Observable-хелперы получает любой `Observable` или `Subject` из rxjs, а также `EventEmitter` из
Angular. Как определяется тип — в разделе [Подробнее](#in-depth).

### Как назвать тип subject {#naming-the-subject-type}

`returnSubject()` возвращает `SubjectOf<T>`:

- собственный `Subject<T>` из rxjs, если `vitest-auto-spy/rxjs` импортирован там, где его видит ваша
  программа TypeScript;
- иначе `SubjectLike<T>` — обычный интерфейс со всем, для чего нужен хелпер.

```ts
import type { Subject } from 'rxjs';

import 'vitest-auto-spy/rxjs';

const subject: Subject<Product[]> = products.getProducts.returnSubject(); // ✔ компилируется
```

**Частая ошибка:** аннотация выше перестаёт компилироваться, потому что единственный
`import 'vitest-auto-spy/rxjs'` лежит в setup-файле, которого нет в `tsconfig` спек. Положите импорт
в файл, который проверяет компилятор:

- работает: спека, файл из `setupFiles`, файл `.d.ts`, а с `@angular/build:unit-test` — ещё и
  `providersFile`;
- не работает: обычный `.ts`, который только указан в `include` файла `tsconfig.spec.json`. Это
  касается `@angular/build:unit-test` 22.2 и новее.

Все четыре типа экспортируются из ядра, спека может назвать любой:

```ts
interface ObservableLike<T> {
  subscribe(...args: never[]): { unsubscribe(): void };
  forEach(next: (value: T) => void, ...rest: never[]): Promise<void>;
}

interface SubjectLike<T> extends ObservableLike<T> {
  next(value: T): void;
  error(err: unknown): void;
  complete(): void;
  unsubscribe(): void;
  asObservable(): ObservableLike<T>;
  readonly closed: boolean;
}

// здесь пустой, заполняется из `vitest-auto-spy/rxjs`
interface AutoSpyRxjsTypes<T> {}

type SubjectOf<T> = AutoSpyRxjsTypes<T> extends { subject: infer S } ? S : SubjectLike<T>;
```

Если в проекте свой класс `Subject`, направьте на него `SubjectOf` расширением типов
(`declare module`):

```ts
declare module 'vitest-auto-spy' {
  interface AutoSpyRxjsTypes<T> {
    subject: MyOwnSubject<T>;
  }
}
```

Положите его в файл `.d.ts` (с `import` или `export {}`, чтобы он остался расширением), в спеку или в
setup-файл. Правило то же, что выше. Обычный `.ts`, указанный только в `include`, не работает с
`@angular/build:unit-test` 22.2 и новее.

## `subscribeSpyTo` — для набора, пришедшего с observer-spy {#subscribespyto-for-a-suite-arriving-with-observer-spy}

`vitest-auto-spy/observer-spy` повторяет API пакета `@hirez_io/observer-spy`. Он нужен при переезде
тестов, которые уже используют этот пакет: они запускаются до того, как вы перепишете проверки потоков.

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

Это мост. В новых тестах используйте [`expectEmission`](/ru/core/observable-assertions) и соседние
проверки. С `subscribeSpyTo` поток, который ничего не выдал, даёт `getValues() === []`, и тест может
пройти, ничего не увидев. `expectEmission` ждёт значение, и молчание превращается в таймаут с именем
потока.

Отличия от `@hirez_io/observer-spy`:

- `getValues()` возвращает копию с типом `T[]`, а не `any[]`.
- `getFirstValue()` и `getValueAt(i)` бросают ошибку, если значения нет, а не возвращают `undefined`.
- Неожиданную ошибку потока бросает следующий читатель значений (`getValues()` и другие), исходная
  ошибка лежит в `cause`. Если ошибка и есть предмет теста, передайте `{ expectErrors: true }` (или
  вызовите `.expectErrors()`) и читайте `getError()`.
- `await onComplete()` отклоняется, если поток упал с ошибкой, а `await onError()` — если поток
  завершился. Иначе тест висел бы до таймаута файла. Не важно, завершился поток до вызова `onComplete()` / `onError()` или после. Форма с колбэком
  (`onComplete(() => …)`) работает как в оригинале: колбэк просто не вызывается.

```text
[vitest-auto-spy] this spy's observable errored (Error: offline), so the promise from onComplete() can never resolve:
completion is not coming. Read receivedComplete() / receivedError(), or await
`expectCompletion(source$)` / `expectError(source$)`, which fail with a message naming the stream.
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs
```

`SubscriberSpy` поддерживает `using`, так что подписку можно ограничить блоком, а не общим
`afterEach`:

```ts
using spy = subscribeSpyTo(service.load());
```

`fakeTime()` нет: он построен на `TestScheduler` из rxjs и колбэке `done`. Используйте
[фейковые таймеры](/ru/utilities/fake-timers) или `TestScheduler` напрямую.

## Подробнее {#in-depth}

Член класса считается observable, если в его типе есть `subscribe` и `forEach(next)`, возвращающий
промис. Подходят `Observable` из rxjs, любой `Subject` и `EventEmitter` из Angular. Не подходят
`Promise`, массивы, `Signal` и `OutputEmitterRef` из Angular. `Observable` из второй копии rxjs в
`node_modules` тоже подходит и получает `nextWith`.
