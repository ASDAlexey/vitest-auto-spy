---
title: RxJS
description: Спай метода или свойства возвращает Observable, которым управляет тест - nextWith, nextWithValues, nextWithPerCall, returnSubject, задержки и сброс.
---

# RxJS

С `vitest-auto-spy/rxjs` вы задаёте в тесте, что выдаст `Observable`. Здесь `ProductList.load()`
подписывается на `ProductService.getProducts()`, который возвращает `Observable<Product[]>`.
Задайте список товаров через `nextWith` на спае, не вызывая настоящий сервис. Так же можно управлять
свойствами вроде `items$`.

```ts
// product-list.spec.ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import 'vitest-auto-spy/rxjs';

import { ProductList } from './product-list';
import { ProductService } from './product.service';

it('shows the products the service returns', () => {
  const products: Spy<ProductService> = createSpyFromClass(ProductService);
  const list = new ProductList(products);

  products.getProducts.nextWith([{ name: 'Tea' }]);
  list.load();

  expect(list.names).toEqual(['Tea']);
});
```

Если хелперы нужны в нескольких тестах, перенесите `import 'vitest-auto-spy/rxjs';` в общий
файл настройки:

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

Без этого импорта первый вызов хелпера для `Observable` выдаст ошибку
`Observable spies require rxjs` с нужным импортом. В проектах без RxJS остальная библиотека
работает и без него.

## Observable-свойства {#observable-properties}

Укажите свойство вроде `items$` в `observablePropsToSpyOn`, чтобы получить те же хелперы, что и
для методов.

```ts
const store = createSpyFromClass(CartStore, { observablePropsToSpyOn: ['items$'] });

store.items$.nextWith([{ id: 1 }]);
```

## Хелперы {#helpers}

Эти хелперы работают на спае метода, который возвращает `Observable`, и на свойствах из
`observablePropsToSpyOn`.

| Хелпер                    | Что делает                                                                        |
| ------------------------- | --------------------------------------------------------------------------------- |
| `nextWith(value)`         | выдаёт `value`; поток остаётся открытым                                           |
| `nextOneTimeWith(value)`  | выдаёт `value` и завершает поток                                                  |
| `throwWith(error)`        | завершает поток ошибкой                                                           |
| `complete()`              | завершает поток                                                                   |
| `nextWithValues(configs)` | задаёт последовательность значений, ошибку или завершение; можно указать задержки |
| `nextWithPerCall(list)`   | даёт каждому вызову свой поток; возвращает `Subject` каждого                      |
| `returnSubject()`         | возвращает `Subject` для ручного управления потоком                               |
| `subscriberCount()`       | число открытых подписок (только у свойств)                                        |

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

Что можно указать в каждом элементе списка:

| Тип                                      | Форма                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `ValueConfig` (для `nextWithValues`)     | `{ value, delay? }`, `{ errorValue, delay? }` или `{ complete?, delay? }`               |
| `ValueConfigPerCall` (`nextWithPerCall`) | `{ value, delay?, doNotComplete? }`; каждый поток завершается, если нет `doNotComplete` |

## `nextWith` пишет в текущий поток; `nextWithValues` подменяет поток {#nextwith-pushes-nextwithvalues-republishes}

Если на свойство уже подписались, используйте `nextWith`. Чтобы задать последовательность до
подписки, используйте `nextWithValues`. Метод при каждом вызове возвращает текущий поток.

| Хелпер                                                    | Что делает с потоком      | Кто уже подписан   |
| --------------------------------------------------------- | ------------------------- | ------------------ |
| `nextWith` / `nextOneTimeWith` / `throwWith` / `complete` | обновляет общий `Subject` | видит обновление   |
| `nextWithValues` (на свойстве-спае)                       | заменяет поток в свойстве | остаётся на старом |

Если компонент подписался в `ngOnInit`, он продолжает слушать тот же поток. Вызов
`nextWithValues` заменит поток в свойстве, и компонент не увидит новых значений. Библиотека
предупредит об этом один раз:

```text
[vitest-auto-spy] Feed.items$.nextWithValues() ran after something subscribed to Feed.items$, and it
publishes a new stream that subscriber never sees — these values will not reach it. Call
nextWithValues() before the code under test subscribes, or push into the stream it holds with nextWith().
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs#nextwith-pushes-nextwithvalues-republishes
```

Вызовите `nextWithValues` до создания компонента или обновите поток, на который он уже подписан:

```ts
service.items$.nextWith(['a']); // дойдёт до компонента, подписанного в ngOnInit
service.items$.returnSubject().error(new Error('offline')); // это тоже
```

## Метод-запрос отвечает один раз: `nextOneTimeWith` {#a-request-method-answers-once-nextonetimewith}

Используйте `nextOneTimeWith` для запроса, который выдаёт одно значение и завершается. Например,
это может быть HTTP-запрос, `invoke` в Tauri или запрос к базе.

Если тесты запускает билдер Angular CLI `@angular/build:unit-test`, добавьте
`import 'vitest-auto-spy/rxjs';` в файл из `setupFiles` в `angular.json` (см.
[Билдер unit-test в Angular](/ru/guides/angular-unit-test-builder)):

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

В этом примере на Angular компонент один раз вызывает `OrderService.load()`. Он сохраняет
результат или текст ошибки в сигналах:

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

После завершения потока через `nextOneTimeWith` следующий хелпер создаёт новый поток. Поэтому
`throwWith` во втором тесте даёт только ошибку, без списка из `beforeEach`. См.
[Сбрасывать потоки между тестами](#reset-streams-between-tests).

**Почему не `nextWith`.** Он оставляет поток открытым. Поток повторяет последнее значение новым
подписчикам, пока вы не сбросите спай. Для запросов это создаёт две проблемы:

- **Загрузка не заканчивается.** `forkJoin`, `lastValueFrom`, `toArray()` и `expectAllEmissions`
  ждут завершения потока. Без него они не возвращают результат и не выдают ошибку. Например,
  сигнал `loading` у компонента может остаться `true`.
- **Старые данные приходят раньше ошибки.** Если после `nextWith` в `beforeEach` вызвать
  `throwWith`, новый подписчик сначала получит старое значение. Код обработает его как успешный
  ответ и только потом получит ошибку.

Используйте `nextWith` для потоков, которые в приложении остаются открытыми: например, `state$`
стора, WebSocket или события роутера.

**Библиотека предупреждает о `throwWith` после `nextWith`.** После `nextOneTimeWith` предупреждения
нет. Оно появляется, только если выполнены все три условия:

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

Чтобы избежать предупреждения:

- настроить метод через `nextOneTimeWith` вместо `nextWith`;
- вызвать `resetAutoSpy(api.getBonds)` (из `vitest-auto-spy`) перед `throwWith`;
- чтобы проверить «выдать значение, затем ошибку», задайте оба события одним вызовом:
  `nextWithValues([{ value: BONDS }, { errorValue: error }])`.

Если проверяемый код уже подписан, когда вызывается `throwWith`, предупреждения нет. Этот подписчик
получил значение в момент `nextWith`, а теперь получает ошибку.

**Как оставить вызов без ответа.** Чтобы проверить состояние загрузки, верните поток, который
ничего не выдаёт. После `nextWith` хелпер `returnSubject()` вернёт тот же поток, а он повторит
последнее значение. Сбросьте спай и верните `NEVER` из RxJS:

```ts
import { NEVER } from 'rxjs';
import { resetAutoSpy } from 'vitest-auto-spy';

resetAutoSpy(api.getBonds); // убирает значение из beforeEach
api.getBonds.mockReturnValue(NEVER); // каждый вызов остаётся без ответа
```

`mockReturnValue` отключает хелперы потоков у этого спая (см. конец раздела
[Куда уходит ошибка `throwWith`](#where-a-throwwith-error-goes)). Чтобы снова пользоваться `nextWith`
или `throwWith`, сначала вызовите `api.getBonds.mockReset()`.

Если у спая ещё нет заданного значения, подойдёт и `returnSubject()`. Поток ничего не выдаст,
пока вы не вызовете `next`.

## Куда уходит ошибка `throwWith` {#where-a-throwwith-error-goes}

`throwWith` завершает поток ошибкой, даже если никто не подписан. Те, кто подпишется позже, тоже
получат ошибку. В Angular `toSignal` и `rxResource` сохраняют её, а не передают сразу в
`ErrorHandler`. Проверяйте результат там, где ваш код обрабатывает ошибку:

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

Если сигнал читает `effect` или шаблон, ошибка возникает во время проверки изменений. Одного
получения сервиса или создания компонента недостаточно. Запустите проверку изменений и убедитесь,
что она завершается ошибкой:

```ts
expect(() => TestBed.tick()).toThrow('offline');
// или через фикстуру
await expect(fixture.whenStable()).rejects.toThrow('offline');
```

**После `mockImplementation` или `mockReturnValue` хелперы потоков перестают работать.** Эти
методы заменяют часть спая, которая возвращает поток (в предупреждении она называется `dispatch`).
Следующий `throwWith` уже не изменит то, что возвращает спай. Библиотека предупредит об этом
(`throwWith() was configured on 'load' after mockImplementation() had replaced its dispatch`), а с
`misconfiguration: 'throw'` выдаст ошибку. Сначала вызовите `api.load.mockReset()` или задайте ответ
по умолчанию через `nextOneTimeWith` вместо `mockReturnValue`.

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

**Отменил ли второй запрос первый?** Оберните Observable, который возвращает `load`, в `log.track(key, source$)`.
Проверьте `log.events` до вызова `view.unsubscribe()`, чтобы очистка теста не скрыла пропущенную отмену.
С `mergeMap` вместо `switchMap` подписка A останется открытой и проверка упадёт.

```ts
import { NEVER, Subject, switchMap } from 'rxjs';
import { expect, vi } from 'vitest';
import { createSubscriptionLog } from 'vitest-auto-spy/rxjs';

const log = createSubscriptionLog<string>();
const load = vi.fn((id: string) => log.track(id, NEVER));
const ids = new Subject<string>();
const view = ids.pipe(switchMap(load)).subscribe();
ids.next('A');
ids.next('B');

expect(log.events.map(({ type, key }) => `${type}:${key}`)).toEqual(['subscribe:A', 'unsubscribe:A', 'subscribe:B']);
view.unsubscribe();
```

Сам вызов метода ничего не пишет в журнал. Каждая подписка получает свой числовой `subscription`, начиная с 1.
Событие `unsubscribe` с тем же номером означает, что подписка закрылась: по отмене, завершению потока или ошибке. Журнал не создаёт таймеров и не подписывается на поток отдельно.

## Сбрасывать потоки между тестами {#reset-streams-between-tests}

Если тесты используют общий спай, сбрасывайте его перед каждым тестом. У каждого метода или
свойства со спаем один `ReplaySubject(1)`: он повторяет последнее значение новым подписчикам.
Без сброса следующий тест может получить старое значение первым:

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

Если тесты используют `@hirez_io/observer-spy`, замените импорт на `vitest-auto-spy/observer-spy`.
При переходе можно оставить существующие проверки:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

В новых тестах используйте [`expectEmission`](/ru/core/observable-assertions) и другие проверки
потоков. С `subscribeSpyTo` поток без значений даёт `getValues() === []`, и тест может пройти,
не получив ни одного значения. `expectEmission` ждёт значение, а при таймауте указывает поток.

Отличия от `@hirez_io/observer-spy`:

- `getValues()` возвращает копию с типом `T[]`, а не `any[]`.
- `getFirstValue()` и `getValueAt(i)` бросают ошибку, если значения нет, а не возвращают `undefined`.
- Если поток неожиданно завершается ошибкой, следующий вызов `getValues()` или другого метода
  чтения значения бросает ошибку. Исходная ошибка доступна в `cause`. Чтобы проверить ошибку,
  передайте `{ expectErrors: true }` или вызовите `.expectErrors()`, затем прочитайте `getError()`.
- Промис от `onComplete()` отклоняется, если поток завершился ошибкой. Промис от `onError()`
  отклоняется, если поток завершился без ошибки. Так тест не ждёт таймаута файла, независимо от
  того, закончился поток до вызова или после. Форма с колбэком (`onComplete(() => …)`) работает
  как раньше: в этом случае колбэк не вызывается.

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
