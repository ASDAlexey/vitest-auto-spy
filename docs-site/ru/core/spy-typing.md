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

| Член        | Что в нём лежит                                             |
| ----------- | ----------------------------------------------------------- |
| `calls`     | Аргументы каждого `new` (и обычного вызова), по порядку     |
| `instances` | `Spy<T>`, полученный при каждом конструировании, по порядку |

Он принимает тот же необязательный второй аргумент, что и
[`createSpyFromClass`](./create-spy-from-class), так что каждый экземпляр настраивается обычным
способом.

## Какая ошибка про какое направление {#which-error-means-which-direction}

Компилятор сообщает о несовпадении `Spy<T>` / `T` четырьмя разными способами, и ни в одном из них нет
одновременно слов «spy» и «instance» — поэтому по сообщению трудно догадаться, что чинить, и поэтому
же обычным лечением оказывается двойное приведение, которое заодно прячет настоящие расхождения.

| Сообщение                                                                            | Направление | Как чинить                          |
| ------------------------------------------------------------------------------------ | ----------- | ----------------------------------- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'`                              | `T` → спай  | `asSpy(TestBed.inject(Router))`     |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | спай → `T`  | `asInstance(spy)`                   |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`       | спай → `T`  | `asInstance(spy)`                   |
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

То же касается `createSpyFromClass` с конфигурацией, в одном сочетании: список аксессоров (или
`overrides`) рядом с `returns` у обобщённого класса. TypeScript проверяет обобщённый класс-аргумент
**после** конфигурации, выводит `T` обратно из `gettersToSpyOn: ['remoteConfig']` как
`{ remoteConfig: any }` и отвергает ключ `returns`, так и не посмотрев на класс:

```text
'isKeyEnabled' does not exist in type 'MethodReturns<{ remoteConfig: any; }>'
```

```ts
createSpyFromClass(RemoteConfigService, { gettersToSpyOn: ['remoteConfig'], returns: { isKeyEnabled: false } }); // ❌
createSpyFromClass<RemoteConfigService>(RemoteConfigService, { gettersToSpyOn: ['remoteConfig'], returns: { isKeyEnabled: false } }); // ✅
```

Любая половина по отдельности выводит объявленное умолчание. `provideAutoSpy`, `overrideAutoSpy` и
`overrideComponentProvider` из `/angular` берут `T` только из класса (`NoInfer`), поэтому там первая
строка компилируется как есть. Фабрики ядра его не используют: `NoInfer` требует TypeScript 5.4 —
выше границы, которую документирует ядро, а любой Angular, поддерживаемый `/angular`, её уже прошёл.

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
Значение, которое принимает опция, экспортируется как `OverloadChoice` — для хелпера, который
пробрасывает его дальше.

### Заглушка перестала подходить к настоящему ответу {#the-stub-stops-fitting-the-real-response}

```
TS2345: Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'.
```

Это сообщение — про этот раздел, и ни слова об этом в нём нет; поэтому по одной ошибке ручку и не
находят. Оно вылезает везде, где хелпер читает возвращаемый тип метода: и `nextWith(body)`, и
`resolveWith(body)`, и `calledWith(…).returnValue(body)`, и голый `mockReturnValue(of(body))`. Ни
дубль, ни заглушка не сломаны — их обоих проверяют по сигнатуре, которую никто не вызывает.

Чинится аргументом типа на **объявлении**, не кастом и не подавлением:

```ts
let venues: Spy<VenuesService, { overload: { getVenues: 'first' } }>;

venues = createSpyFromClass(VenuesService); // второй аргумент типа здесь не нужен
venues.getVenues.nextWith(page); // снова `Page`
```

`@ts-expect-error` на красной строке — обходной путь, который эта ошибка исправно к себе притягивает
(на одной миграции их набралось шестьдесят в двадцати пяти файлах, прежде чем кто-то нашёл ручку), и
стоит он дороже самой заглушки: строка целиком перестаёт проверяться, так что будущая правка `Page`
пройдёт незамеченной ровно там, где описывают форму ответа.

### Называйте метод, а не весь дубль {#name-the-method-not-the-whole-double}

`'first'`, поставленный на тип, двигает **все** перегруженные члены разом, и на широком типе это
ломает ровно тех, кого никто не чинил: `Spy<Response, { overload: 'first' }>` ради одного метода
собрал пять `TS2769` на `download` в том же файле. Передавайте карту:

```ts
let perf: Spy<Performance, { overload: { getEntriesByType: 'first' } }>;
```

Имя, которого у типа нет, просто не совпадает ни с чем, так что переименование оставляет мёртвую
запись, а не красную сборку, — тот же размен, что у `instanceMethodsToSpyOn`, и по той же причине.

### Почему умолчание остаётся `'last'` {#why-the-default-stays-last}

Потому что «полезная перегрузка» из типа не выводится. У сгенерированного `observe`-клиента брать
надо первую, у четырёхперегрузочного клиента `api-mgw` — последнюю, и обе живут в одной сюите.
Структурного признака, который их разделяет, нет — если не называть ангуляровский `HttpEvent`, а
этого ни одна декларация пакета делать не имеет права.

Важное для полноты, и это сильнейший довод в пользу того, чтобы называть метод, а не полагаться на
умолчание: **порядок перегрузок не всегда принадлежит автору кода**. `declare global` в чужом пакете
дописывает сигнатуру в глобальный интерфейс, и дописанная становится последней —

```ts
// web-vitals
declare global {
  interface Performance {
    getEntriesByType<K>(type: K): PerformanceEntryMap[K][];
  }
}
```

— то есть какую сигнатуру прочитает `ReturnType`, зависит от набора пакетов в программе и может
поменяться на обновлении зависимости, ничем себя не обозначив в диффе.

И подсказку не получается положить в само сообщение — это пробовали до того, как написали раздел
выше. Назвать полезную нагрузку так, чтобы компилятор напечатал имя, действительно выходит:
`nextWith(value?: OverloadCollapsed_UseSpyOverloadOption<HttpEvent<Page>>)` — псевдоним, тело
которого строит объединение, сохраняет своё имя в `TS2345`, тогда как сквозной псевдоним стирается.
Отказались по трём измеренным причинам. Приём съедает весь бюджет типов: флаг приходится решать для
каждого члена, а флаг на член лишает пакеты хелперов общего кэша между членами, и даже флаг с телом
из константы `false` уводит `types:budget` с дельты 9 665 на 11 769 при потолке 11 000 — ещё до
всякого распознавания перегрузок, которое добавляет сверху ~840. Приём промахивается: на
четырёхперегрузочном клиенте `api-mgw`, где `'last'` и так правильная сигнатура, честно неверная
заглушка получает `OverloadCollapsed_UseSpyOverloadOption<Movie[]>` и ссылку на ручку, которая
ничего бы не изменила. И он не достаёт до пути, где нужен больше всего: `mockReturnValue`
типизирован через `MockInstance<Method>`, собственную поверхность раннера, до которой обёртки этого
пакета не дотягиваются.

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

## `readonly` доезжает до дубля, и ответ на это — `mockValueProp` {#readonly-survives-onto-the-double-and-mockvalueprop-is-the-answer}

`Spy<T>` и `DeepMockProxy<T>` — гомоморфные отображённые типы, поэтому член, объявленный в исходном
типе как `readonly`, остаётся `readonly` и на дубле, а обычное присваивание — это `TS2540`:

```ts
interface Session {
  readonly accessToken: string;
}

const session = createAutoMock<Session>({ accessToken: 'first' });

session.accessToken = 'second'; // ❌ TS2540
mockValueProp(session, 'accessToken', 'second'); // ✅ ретрай читает то, что подменил refresh
```

Засев этого второго значения выразить не может — засев читается один раз, при создании, — так что
записать его чем-то надо, и то, **чем именно**, важнее, чем кажется.

Снять модификатор пробовали, и это откатили. Присваивание после этого компилировалось везде — в том
числе у члена, заменённого **заспаенным аксессором** (`gettersToSpyOn: ['accessToken']`), где запись
уходит в шпиона-сеттер, а шпион-геттер продолжает отвечать `undefined`. Громкая ошибка типа,
чинящаяся одной строкой, менялась на молчаливый no-op в рантайме — ровно тот класс дефектов, ради
которого существует типизированная поверхность мока выше.

**`Reflect.set` — не тот запасной выход, каким выглядит.** Он вызывает тот же `[[Set]]`, поэтому на
заспаенном аксессоре так же бесполезен, и вдобавок возвращает `true` — что вводит в заблуждение
вызывающего, который проверяет результат. Проверено на заспаенном аксессоре, чей геттер отвечает
`undefined`:

| Запись                                                   | Геттер после | Шпион-сеттер | Вернулось |
| -------------------------------------------------------- | ------------ | ------------ | --------- |
| `double.token = 'x'`                                     | `undefined`  | записал      | —         |
| `Reflect.set(double, 'token', 'x')`                      | `undefined`  | записал      | `true`    |
| `Object.defineProperty` — то, что делает `mockValueProp` | `'x'`        | —            | —         |

Так что [`mockValueProp` / `mockReadonlyProp`](/ru/utilities/setup) — ответ в обоих случаях, и
никакого типа для него не нужно: `readonly` не убирает ключ из `keyof T`, поэтому проверяющая
перегрузка `mockValueProp<T, K extends keyof T>(object, property, value)` принимает член как есть, а
`restoreMockedProps()` откатывает патч.

`Mutable<T>` — вторичный ответ, по желанию, для спеки, которая предпочитает обычные присваивания
обычным **полям-данным** и не хочет возиться с откатом:

```ts
const session: Mutable<Spy<SessionService>> = createSpyFromClass(SessionService);

session.accessToken = 'second';
```

На заспаенном аксессоре он не помогает: это тот же `[[Set]]`, а значит тот же no-op.

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
