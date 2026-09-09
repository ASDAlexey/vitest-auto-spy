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

Поверхность мока на каждом подменённом методе — это `MockInstance<Method>`: те же хелперы
(`mockReturnValue`, `mockImplementation`, `calls`, …) **без** собственной сигнатуры вызова. До 3.12.1
там был `Mock`, который без аргумента типа означает `Mock<Procedure>` — `(...args: any[]) => any`, —
а пересечение принимает вызов, подходящий _любому_ из членов: на дубле `read(key: string)`
компилировались и `read(1)`, и `read('ok', 'extra')`, и `read()`, тогда как на настоящем экземпляре
не компилируется ни один из них, — так что спека могла звать дубль способом, который продакшен-коду
недоступен, и оставаться зелёной.

Теперь единственная оставшаяся сигнатура вызова — собственная сигнатура метода, и вызов, который
настоящий метод отвергает, на дубле тоже не компилируется. Побочный эффект оказался полезным:
`expectTypeOf(spy.method).parameters` и `.returns` теперь разрешаются, а не схлопываются в `never`
между двумя конкурирующими сигнатурами.

## Заглушка тоже проверяется, а не только вызов {#the-stub-is-checked-too-not-only-the-call}

Тот самый аргумент типа в `MockInstance<Method>` — это вторая половина, и какое-то время её не было:
без аргумента параметр снова берёт по умолчанию `Procedure`, и каждый хелпер, который _настраивает_
дубль, принимал `any`.

```ts
const posters = createSpyFromClass(PosterService); // getPosters(shelfId: string): Poster[][]

posters.getPosters.mockReturnValue(42); // ❌ TS2345 — раньше компилировалось
posters.getPosters.mockReturnValue(undefined); // ❌ TS2345 — раньше компилировалось
posters.getPosters.mockImplementation(() => of(null)); // ❌ TS2345 — раньше компилировалось
posters.getPosters.mockReturnValue([[poster]]); // ✅
```

Задать возвращаемое значение — самое частое, что вообще делают со шпионом, так что шпион, который не
мог это проверить, не делал работы, ради которой существует. И асимметрия была видна строкой рядом:
продолжение `calledWith(…)` типизировано всегда:

```ts
posters.getPosters.calledWith('shelf-1').mockReturnValue(42); // ❌ — это падало всегда
```

Что проверяется теперь: `mockReturnValue` / `mockReturnValueOnce` — против `ReturnType<Method>`,
`mockImplementation` / `mockImplementationOnce` / `withImplementation` — против
`(...args: Parameters<Method>) => ReturnType<Method>`, `mockResolvedValue` / `mockResolvedValueOnce`
— против развёрнутого возвращаемого типа. `mock.calls`, `mock.lastCall` и `getMockImplementation()`
возвращаются типизированными, а не как `any[]`. У перегруженного метода это та сигнатура, которую
выбрал `{ overload: … }`, — обе настройки согласованы.

Две вещи сознательно **не** изменились. `mockReturnValue()` вообще без аргумента по-прежнему
компилируется у `void`-метода: эта перегрузка — собственная у пакета, она появилась потому, что
раннер требует аргумент у метода, весь смысл которого в том, что он ничего не возвращает. И
`mockRejectedValue` по-прежнему принимает `unknown`, потому что отказ — это не возвращаемый тип
метода.

## `readonly` из исходного типа до дубля не доходит {#readonly-on-the-source-type-does-not-reach-the-double}

`Spy<T>` и `DeepMockProxy<T>` отображаются с `-readonly`. Модификатор — это утверждение о
продакшен-объекте, и рантайм никогда не применял его к заместителю: `overrides` засевает через
`Reflect.set`, а у прокси `createAutoMock` есть ловушка записи. Так что спека может сказать то, что
имеет в виду:

```ts
interface Session {
  readonly accessToken: string;
}

const session = createAutoMock<Session>({ accessToken: 'first' });

session.accessToken = 'second'; // ✅ ретрай обязан прочитать значение, которое подменил refresh
```

Засев этого выразить не может — засев читается один раз, при создании. Раньше ответом было
`Mutable<Spy<T>>`, теперь он не нужен; `Mutable<T>` остаётся экспортируемым для всего остального.

Один случай присваивание не покрывает: у члена, заменённого **заспаенным аксессором**
(`gettersToSpyOn: ['size']`), запись уходит в шпиона-сеттер, а шпион-геттер продолжает отвечать
`undefined`. Там, как и раньше, [`mockValueProp` / `mockReadonlyProp`](/ru/utilities/setup).

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
