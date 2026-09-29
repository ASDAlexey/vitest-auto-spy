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
| `nextWithPerCall(list)`   | даёт каждому вызову свой поток; возвращает их subject'ы           |
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

## `nextWith` пишет в общий subject; `nextWithValues` публикует новый {#nextwith-pushes-nextwithvalues-republishes}

С виду они взаимозаменяемы. На observable-**свойстве** — нет. На спае **метода** они ведут себя
одинаково: каждый вызов читает текущий поток.

| Хелпер                                                    | Что делает с потоком                 | Подписчик, который уже на нём |
| --------------------------------------------------------- | ------------------------------------ | ----------------------------- |
| `nextWith` / `nextOneTimeWith` / `throwWith` / `complete` | пишет в subject, общий для всех      | получает значение             |
| `nextWithValues` (на свойстве-спае)                       | подменяет свойство **новым** потоком | остаётся на старом            |

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

У каждого члена-спая один `ReplaySubject(1)`. Сохранённое в нём значение — это настройка, как правило
`calledWith` (ответ, заданный для конкретных аргументов). Если спай живёт дольше одного теста,
сбрасывайте его, иначе следующий тест первым получит старое значение.

```ts
import { beforeEach } from 'vitest';
import { resetAutoSpy } from 'vitest-auto-spy';

beforeEach(() => {
  resetAutoSpy(service); // TestBed собран в beforeAll, спай общий
});
```

- **`vi.clearAllMocks()` и `clearMocks: true` поток не сбрасывают.** Поток — состояние библиотеки, а не
  часть мока раннера. Вызывайте `resetAutoSpy(spy)`.
- **Завершённый поток заменяется.** Поток завершён после `throwWith()` или `complete()` на спае либо
  после `complete()` или `error()` на subject из `returnSubject()`. Тогда следующий `nextWith` начинает
  новый поток:

```ts
const subject = service.load$.returnSubject();

subject.complete(); // спека закрывает его руками

service.load$.nextWith(page); // новый поток, а не значение, которое никто не получит
```

- **В одном тесте вызовы складываются.** `nextWith(a)`, затем `throwWith(e)` — это «выдать `a`, потом
  упасть». Поток, который падает сразу при подписке, что бы ни было до этого, даёт
  `nextWithValues([{ errorValue: e }])`. На свойстве-спае вызывайте его до подписки: см.
  [`nextWith` пишет в общий subject; `nextWithValues` публикует новый](#nextwith-pushes-nextwithvalues-republishes).

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
тестов, которые уже на нём: они запускаются до того, как вы перепишете проверки потоков.

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
