---
title: Мост между Spy<T> и T
description: Почему Spy<T> не присваивается в T и какие два именованных представления — asInstance и asSpy — переходят границу без `as`.
---

# Мост между `Spy<T>` и `T`

`Spy<T>` — отображённый тип (mapped type). Он теряет члены `#private` / `private`, поэтому **не**
присваивается в `T` — что правильно (спай не является классом) и постоянно мешает, когда какой-то
API просит именно `T`. Лечится это именованным задокументированным представлением, а не россыпью
`as any` по всей сюите:

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

asInstance(cartSpy); // Spy<CartService> → CartService, для API, типизированных по классу
asSpy(TestBed.inject(CartService)); // CartService → Spy<CartService>, для хелперов
```

В рантайме это один и тот же объект; меняется только представление.

```ts
const store = createSpyFromClass(CartStore);

renderShallow(CartComponent, {
  providers: [{ provide: CartStore, useValue: asInstance(store) }],
});
```

Объявляйте переменную как `Spy<T>` (именно это возвращает `injectSpy(X)`), а не как `T`, — и мосты
останутся на границах, где другое представление навязывает внешний API.

## Спай, который можно позвать через `new` {#a-spy-you-can-call-with-new}

Мок раннера (`vi.fn()`) отказывается работать с `new`, как только несёт `mockReturnValue`, поэтому
тестируемый код, делающий `new Foo()` — `Worker`, `IntersectionObserver`, самописный клиент, — таким
моком не обслужить. `createSpyClass` возвращает настоящую функцию-конструктор, чьи экземпляры
являются полноценными автоспаями:

```ts
import { createSpyClass } from 'vitest-auto-spy';
import { mockValueProp } from 'vitest-auto-spy';

const WorkerSpy = createSpyClass(BackgroundWorker);
mockValueProp(globalThis, 'BackgroundWorker', WorkerSpy);

service.start();

expect(WorkerSpy.calls[0]).toEqual(['./task.js']);
WorkerSpy.instances[0].postMessage.mockReturnValue(undefined);
```

| Член        | Что в нём лежит                                              |
| ----------- | ------------------------------------------------------------ |
| `calls`     | Аргументы каждого `new` (и обычного вызова), по порядку       |
| `instances` | `Spy<T>`, полученный при каждом конструировании, по порядку   |

Он принимает тот же необязательный второй аргумент, что и
[`createSpyFromClass`](./create-spy-from-class), так что каждый экземпляр настраивается обычным
способом.

## Какая ошибка про какое направление {#which-error-means-which-direction}

Компилятор сообщает о несовпадении `Spy<T>` / `T` четырьмя разными способами, и ни в одном из них нет
одновременно слов «spy» и «instance» — поэтому по сообщению трудно догадаться, что чинить, и поэтому
же обычным лечением оказывается двойное приведение, которое заодно прячет настоящие расхождения.

| Сообщение                                                                            | Направление | Как чинить                        |
| ------------------------------------------------------------------------------------ | ----------- | --------------------------------- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'`                              | `T` → спай | `asSpy(TestBed.inject(Router))`   |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | спай → `T` | `asInstance(spy)`                 |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`       | спай → `T` | `asInstance(spy)`                 |
| `is missing the following properties: _modalOpened, body, …` (приватные имена)       | —           | объявить `Spy<T>`, а не `Mocked<T>` |

`TS2352` — та, в которую перенесённая сюита упирается сразу и повсюду: `TestBed.inject(X) as Spy<X>`
это идиома `jest-auto-spies`, она есть в каждом руководстве, и падать она начинает только тогда,
когда спеки компилирует тот же тулчейн, что и продакшен-код, — под `ts-jest` с семантикой
изолированных модулей это никогда не проверялось типами.

Последняя строка — отдельная ловушка. Собственный `Mocked<T>` из Vitest сохраняет **приватные** члены
`T`, поэтому ошибка перечисляет имена приватных полей и читается как «дубль неполный». Он полный;
неверно объявление. `Spy<T>` покрывает публичную поверхность намеренно.

## Обобщённому классу нужен его аргумент типа {#a-generic-class-needs-its-type-argument}

`TestBed.inject` выводит тип по конструктору, поэтому `FeatureFlagService<T = FeatureFlagDefaults>`
возвращается как `FeatureFlagService<any>`. Этот `any` дальше расползается через `Spy<>` и всплывает
как несовпадение `AddPromiseSpyMethods<unknown>` с `WithMockReturnValue<…>` на восьмом уровне
вложенности, и ни слова в сообщении про недостающий параметр типа.

```ts
const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService));
const config = injectSpy<FeatureFlagService>(FeatureFlagService); // то же самое, в Angular
```

## `asInstances(...)` — весь список аргументов разом {#asinstances-—-a-whole-argument-list-at-once}

```ts
factory = webSsoAuthCheckFactory(...asInstances(account, authCheck, domainEvents, storage), document);
```

По обёртке на аргумент — это не просто длиннее, это ещё и _обнаруживается_ по одному аргументу за
раз: TypeScript прекращает проверять вызов на первом же не подошедшем аргументе, поэтому фабрика с
пятью спаями сообщает об одном `TS2345`, а следующий появляется только после того, как предыдущий
починен и `tsc` запущен снова. Не-спай в списке проходит насквозь без изменений, так что вызов,
смешивающий спаев с настоящими значениями, разбивать не приходится.

## Перегрузки: `Parameters` читает **последнюю** сигнатуру {#overloads-parameters-reads-the-last-signature}

```ts
const cinemas = asSpy<VenuesService, { overload: 'first' }>(TestBed.inject(VenuesService));
const client = createSpyFromClass<VenuesService, { overload: 'first' }>(VenuesService);
```

`Parameters<F>` и `ReturnType<F>` — а значит, и хелперы, которые вешает спай, — читают последнюю
перегрузку метода. У сгенерированного API-клиента (`ng-openapi-gen`, `openapi-generator`) это
`observe: 'events'`, сигнатура, которую никто не зовёт: `nextWith(body)` перестаёт компилироваться и
требует `HttpEvent<T>`, и ни слова в сообщении про порядок перегрузок.

`{ overload: 'first' }` типизирует спая по первой сигнатуре. Для отдельного метода есть ещё
`Overload<Client['get'], 0>` — то, что кладут в `MockInstance<…>` или в `vi.fn<…>()`.

## Единственная сигнатура вызова — собственная сигнатура метода {#the-only-call-signature-is-the-method-s-own}

Поверхность мока на каждом подменённом методе — это `MockInstance`: те же хелперы (`mockReturnValue`,
`mockImplementation`, `calls`, …) **без** собственной сигнатуры вызова. До 3.12.1 там был `Mock`,
который без аргумента типа означает `Mock<Procedure>` — `(...args: any[]) => any`, — а пересечение
принимает вызов, подходящий _любому_ из членов: на дубле `read(key: string)` компилировались и
`read(1)`, и `read('ok', 'extra')`, и `read()`, тогда как на настоящем экземпляре не компилируется ни
один из них, — так что спека могла звать дубль способом, который продакшен-коду недоступен, и
оставаться зелёной.

Теперь единственная оставшаяся сигнатура вызова — собственная сигнатура метода, и вызов, который
настоящий метод отвергает, на дубле тоже не компилируется. Настройка не изменилась — `MockInstance`
тоже по умолчанию берёт `Procedure`, поэтому `mockReturnValue` / `mockImplementation` остались такими
же нестрогими, — а побочный эффект оказался полезным: `expectTypeOf(spy.method).parameters` и
`.returns` теперь разрешаются, а не схлопываются в `never` между двумя конкурирующими сигнатурами.

## `Spy`, а не `Mocked` {#spy-not-mocked}

```ts
let modal: Spy<KdsModalService>; // ✅
let modal: Mocked<KdsModalService>; // ❌
```

`Mocked<T>` — собственный тип Vitest, и он пересекается с `T` _полностью_, включая приватные члены.
Присваивание спая в него падает с `Type 'Spy<…>' is missing the following properties: _modalOpened,
body, rendererFactory, …` — списком имён приватных полей, по которому невозможно догадаться, что
неверно **объявление**, а не спай. Правило
[`no-mocked-for-spy`](/ru/utilities/eslint-plugin) ловит это механически.
