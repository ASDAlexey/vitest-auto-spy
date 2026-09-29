---
title: Мост между Spy<T> и T
description: Почему Spy<T> нельзя присвоить T, два хелпера asInstance и asSpy, которые переводят одно в другое без приведения типов, и как читать ошибки TypeScript о спаях.
---

# Мост между `Spy<T>` и `T`

Спай `UserService` имеет тип `Spy<UserService>`: каждый метод сохраняет сигнатуру и получает хелперы
спая (`resolveWith`, `calledWith`, …). В `Spy<T>` нет приватных членов, а класс с приватными членами TypeScript сравнивает по объявлению, а не
по форме. Поэтому TypeScript не принимает
его там, где ждут `UserService`. Два хелпера переводят один тип в другой:

- `asInstance(spy)`: `Spy<T>` → `T`, чтобы передать спай в код, который ждёт настоящий тип;
- `asSpy(value)`: `T` → `Spy<T>`, чтобы настроить спай, полученный как `T` (например, из `TestBed.inject`).

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { type Spy, asInstance, asSpy, createSpyFromClass } from 'vitest-auto-spy';

let users: Spy<UserService>;
let store: ProfileStore;

beforeEach(() => {
  users = createSpyFromClass(UserService);
  users.load.mockReturnValue(of({ id: 1, name: 'Ann' })); // проверяется по Observable<User>
  store = new ProfileStore(asInstance(users)); // Spy<UserService> → UserService
});

it('reads a spy back from DI', () => {
  const cart = asSpy(TestBed.inject(CartService)); // CartService → Spy<CartService>
  cart.total.mockReturnValue(0);
});
```

Оба хелпера возвращают тот же объект; меняется только тип. Объявляйте переменные как `Spy<T>`
(`injectSpy(X)` в Angular тоже возвращает `Spy<T>`) и вызывайте `asInstance` только там, где API
требует настоящий тип.

**Частая ошибка:** `TestBed.inject(X) as Spy<X>` или `as unknown as X`. Двойное приведение
компилируется, но прячет и настоящие ошибки типов. Используйте `asSpy` / `asInstance`.

## Какая ошибка про какое направление {#which-error-means-which-direction}

Ищите ошибку по **тексту сообщения**, а не только по коду: у `TS2345`, например, несколько причин.
Ни в одном из этих сообщений нет слова «спай».

| Сообщение                                                                            | Направление | Что делать                                                                                           |
| ------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'`                              | `T` → спай  | `asSpy(TestBed.inject(Router))`                                                                      |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | спай → `T`  | `asInstance(spy)`                                                                                    |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`       | спай → `T`  | `asInstance(spy)`                                                                                    |
| `is missing the following properties: _modalOpened, body, …` (приватные имена)       | —           | объявите `Spy<T>`, а не `Mocked<T>`                                                                  |
| `TS2345` на `mockReturnValue(…)`: значение не совпадает с типом возврата метода      | —           | [Заглушка тоже проверяется](#the-stub-is-checked-too-not-only-the-call)                              |
| `Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'`   | —           | [Заглушка перестала подходить к настоящему ответу](#the-stub-stops-fitting-the-real-response)        |
| несовпадение `AddPromiseSpyMethods<unknown>` и `WithMockReturnValue<…>`              | —           | [Обобщённому классу нужен аргумент типа](#a-generic-class-needs-its-type-argument)                   |
| `'x' does not exist in type 'MethodReturns<{ …: any; }>'`                            | —           | [Обобщённому классу нужен аргумент типа](#a-generic-class-needs-its-type-argument)                   |
| `TS2540` при присваивании члену спая                                                 | —           | [`readonly` сохраняется на спае](#readonly-survives-onto-the-double-and-mockvalueprop-is-the-answer) |

`TS2352` часто появляется во многих файлах сразу после миграции с `jest-auto-spies`, где принято
писать `TestBed.inject(X) as Spy<X>`. Замените каждое такое место на `asSpy(TestBed.inject(X))`.

Число ошибок не всегда уменьшается по одной. TypeScript перестаёт проверять вызов на первом неверном
аргументе, поэтому «осталась одна ошибка» может скрывать ещё несколько (в одном файле было
40 → 1 → 1 → 1 → 0). Если файлу уже понадобился один `asInstance`, поищите в нём и другие места.

## Заглушка тоже проверяется, а не только вызов {#the-stub-is-checked-too-not-only-the-call}

Хелперы настройки типизированы по методу, поэтому неверная заглушка — ошибка компиляции:

```ts
const posters = createSpyFromClass(PosterService); // getPosters(shelfId: string): Poster[][]

posters.getPosters.mockReturnValue(42); // ❌ TS2345
posters.getPosters.mockReturnValue(undefined); // ❌ TS2345
posters.getPosters.mockImplementation(() => of(null)); // ❌ TS2345
posters.getPosters.mockReturnValue([[poster]]); // ✅
posters.getPosters.calledWith('shelf-1').mockReturnValue(42); // ❌
```

| Хелпер                                                               | Проверяется по                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `mockReturnValue`, `mockReturnValueOnce`                             | `ReturnType<Method>`                                  |
| `mockImplementation`, `mockImplementationOnce`, `withImplementation` | `(...args: Parameters<Method>) => ReturnType<Method>` |
| `mockResolvedValue`, `mockResolvedValueOnce`                         | тип после `await`                                     |
| `mockRejectedValue`                                                  | `unknown` (отказ — не тип возврата)                   |
| `mockReturnValue()` без аргумента                                    | разрешён на методе `void`                             |
| `mock.calls`, `mock.lastCall`, `getMockImplementation()`             | типизированы, а не `any[]`                            |

У перегруженного метода проверка идёт по сигнатуре, выбранной через `{ overload: … }`.

Если код под тестом действительно обрабатывает значение вне типа (например, `undefined` от метода с
типом `Observable`), про `outOfType` см.
[Строгий режим → Что считается настройкой](./strict-mode#what-counts-as-configured).

## Перегрузки: `Parameters` читает **последнюю** сигнатуру {#overloads-parameters-reads-the-last-signature}

Для перегруженного метода `Parameters<F>` и `ReturnType<F>` в TypeScript читают **последнюю**
перегрузку, и хелперы спая тоже. Так по умолчанию. Передайте `{ overload: 'first' }`, чтобы
типизировать спай по первой сигнатуре:

```ts
import { TestBed } from '@angular/core/testing';
import { asSpy, createSpyFromClass } from 'vitest-auto-spy';

const cinemas = asSpy<VenuesService, { overload: 'first' }>(TestBed.inject(VenuesService));
const client = createSpyFromClass<VenuesService, { overload: 'first' }>(VenuesService);
```

Сильнее всего это заметно на сгенерированном API-клиенте (`ng-openapi-gen`, `openapi-generator`). Там
последняя перегрузка — `observe: 'events'`, которую никто не вызывает, поэтому `nextWith(body)`
перестаёт компилироваться и требует `HttpEvent<T>`.

| Опция / тип                         | Где                                          | Смысл                                          |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `{ overload: 'first' }`             | второй аргумент типа фабрики или `Spy<T, …>` | все перегруженные методы — по первой сигнатуре |
| `{ overload: { method: 'first' } }` | там же                                       | только названные методы                        |
| `Overload<Client['get'], 0>`        | `MockInstance<…>` или `vi.fn<…>()`           | одна сигнатура одного метода (индекс 0–3)      |
| `OverloadChoice`                    | тип параметра вашего собственного хелпера    | тип опции `overload`                           |

### Заглушка перестала подходить к настоящему ответу {#the-stub-stops-fitting-the-real-response}

```
TS2345: Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'.
```

Это та самая проблема с перегрузками: хелпер типизирован по последней сигнатуре. Она появляется везде, где хелпер читает
тип возврата метода: `nextWith(body)`, `resolveWith(body)`, `calledWith(…).returnValue(body)` и
обычный `mockReturnValue(of(body))`. Ни спай, ни заглушка не ошибочны: оба проверяются по сигнатуре,
которую никто не вызывает.

Исправляйте аргументом типа в **объявлении**, а не приведением:

```ts
let venues: Spy<VenuesService, { overload: { getVenues: 'first' } }>;

venues = createSpyFromClass(VenuesService); // здесь второй аргумент типа не нужен
venues.getVenues.nextWith(page); // снова `Page`
```

**Частая ошибка:** `@ts-expect-error` на упавшей строке. Строка перестаёт проверяться, и будущее
изменение `Page` останется незамеченным ровно там, где тест описывает ответ.

### Называйте метод, а не весь спай {#name-the-method-not-the-whole-double}

`'first'` на весь тип меняет **все** перегруженные методы, и на широком типе ломает те, которые вы не
чинили (например, пять ошибок `TS2769` на `Response.download`). Назовите метод:

```ts
let perf: Spy<Performance, { overload: { getEntriesByType: 'first' } }>;
```

Имя, которого у типа нет, ни с чем не совпадает, поэтому после переименования запись молча перестаёт
действовать, а сборка не падает. `instanceMethodsToSpyOn` устроен так же.

## Обобщённому классу нужен его аргумент типа {#a-generic-class-needs-its-type-argument}

`TestBed.inject` выводит тип из конструктора, поэтому `FeatureFlagService<T = FeatureFlagDefaults>`
возвращается как `FeatureFlagService<any>`. Тогда ошибка показывает несовпадение
`AddPromiseSpyMethods<unknown>` и `WithMockReturnValue<…>` глубоко в сообщении. Причина — не хватает
аргумента типа, так что передайте его сами:

```ts
const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService));
const config = injectSpy<FeatureFlagService>(FeatureFlagService); // то же самое в Angular
```

`createSpyFromClass` он тоже нужен в одном сочетании: список аксессоров (или `overrides`) вместе с
`returns` на обобщённом классе. TypeScript тогда выводит `T` из `gettersToSpyOn: ['flagsConfig']` как
`{ flagsConfig: any }` и отвергает ключ из `returns`:

```text
'isKeyEnabled' does not exist in type 'MethodReturns<{ flagsConfig: any; }>'
```

```ts
createSpyFromClass(FlagsConfigService, { gettersToSpyOn: ['flagsConfig'], returns: { isKeyEnabled: false } }); // ❌
createSpyFromClass<FlagsConfigService>(FlagsConfigService, { gettersToSpyOn: ['flagsConfig'], returns: { isKeyEnabled: false } }); // ✅
```

- Любая из двух опций по отдельности выводит объявленное умолчание, аргумент типа не нужен.
- В `vitest-auto-spy/angular` функции `provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider` и
  классовая перегрузка `registerAutoSpyDefaults` берут `T` только из класса, поэтому там первая строка
  компилируется как есть.
- Фабрики ядра и `registerAutoSpyDefaults` из ядра так не делают, поэтому там аргумент типа передаёте
  вы. Больше ничего делать не нужно.

## `Spy`, а не `Mocked` {#spy-t-not-mocked-t}

```ts
let modal: Spy<ModalService>; // ✅
let modal: Mocked<ModalService>; // ❌
```

`Mocked<T>` — тип самого Vitest, и он сохраняет весь `T`, включая приватные члены. Присвоить ему спай
не получится: `Type 'Spy<…>' is missing the following properties: _modalOpened, body,
rendererFactory, …`. По списку приватных полей кажется, что спай неполный, но ошибка в **объявлении**.
`Spy<T>` намеренно описывает только публичные члены. Правило линтера
[`no-mocked-for-spy`](/ru/utilities/eslint-plugin) это ловит.

## `asInstances(...)` — весь список аргументов разом {#asinstances-—-a-whole-argument-list-at-once}

`asInstances` переводит несколько спаев сразу — для вызова, который принимает их много:

```ts
import { asInstances } from 'vitest-auto-spy';

factory = authCheckFactory(...asInstances(account, authCheck, appEvents, storage), document);
```

Обёртка на каждый аргумент не просто длиннее. TypeScript перестаёт проверять вызов на первом
неподходящем аргументе, поэтому фабрика с пятью спаями выдаёт по одной ошибке `TS2345` за раз. Значение
в списке, которое не спай, проходит без изменений, так что вызов со спаями и настоящими значениями не
нужно разбивать.

## Единственная сигнатура вызова — собственная сигнатура метода {#the-only-call-signature-is-the-method-s-own}

Каждый метод спая типизирован как сам метод плюс `MockInstance<Method>`: `mockReturnValue`,
`mockImplementation`, `mock.calls` и остальное, **без** второй сигнатуры вызова. Поэтому вызов, который
отверг бы настоящий метод, не компилируется и на спае:

```ts
const cache = createSpyFromClass(CacheService); // read(key: string): string

cache.read(1); // ❌ TS2345, как на настоящем CacheService
cache.read('ok', 'extra'); // ❌
```

Побочная польза: `expectTypeOf(spy.method).parameters` и `.returns` дают настоящие типы.

## Метод, возвращающий `any`, сохраняет все наборы хелперов {#a-method-returning-any-keeps-every-bundle}

Член с типом `any` (старый сервис, обёртка над JavaScript-пакетом) сохраняет все хелперы:
`mockReturnValue` на цепочке `calledWith`, а также хелперы `Promise` и `Observable`. Это соответствует
тому, что он умеет во время выполнения:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const legacy = createAutoMock<LegacyApi>(); // request(id: number): any

legacy.request.calledWith(1).mockReturnValue({ ok: true }); // ✅
legacy.request.calledWith(2).resolveWith({ ok: false }); // ✅ тоже доступен
```

Ничего не сужается: член с типом `any` настраивается так, как позволяет его тип. Если это слишком
свободно, исправьте объявление члена, а не спай.

## `accessorSpies` типизирован по члену, который замещает {#accessorspies-is-typed-against-the-member-it-stands-for}

Спаи геттеров и сеттеров лежат в `spy.accessorSpies`. У каждого — тип члена, который он замещает:
`Mock<() => T[K]>` для геттера, `Mock<(value: T[K]) => void>` для сеттера.

```ts
const settings = createSpyFromClass(SettingsService, { gettersToSpyOn: ['count'] }); // get count(): number

settings.accessorSpies.getters.count.mockReturnValue(3); // ✅
settings.accessorSpies.getters.count.mockReturnValue('three'); // ❌ TS2345
```

Это `Mock<…>`, а не `MockInstance<…>`, поэтому их можно вызывать: `accessorSpies.setters.theme('dark')`
и `accessorSpies.getters.theme()` компилируются.

## `accessorSpies` по настроенным спискам {#accessorspies-keyed-by-the-configured-lists}

По умолчанию в `accessorSpies` есть ключ для каждого члена `T`: TypeScript не знает, какие имена вы
передали в `gettersToSpyOn` во время выполнения. Поэтому `spy.accessorSpies.setters.name` компилируется, даже если сеттер не настроен, а во
время выполнения читает `undefined`. Повторите списки в аргументе типа, и в `accessorSpies` будут ровно
эти ключи:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const thermo = createSpyFromClass<Thermo, { gettersToSpyOn: ['level'] }>(Thermo, {
  gettersToSpyOn: ['level'],
});

thermo.accessorSpies.getters.level.mockReturnValue(3); // ✅
thermo.accessorSpies.setters.level(3); // ✅ пара геттер/сеттер отражается в обе стороны
thermo.accessorSpies.getters.unit; // ❌ TS2339: `unit` нет ни в одном списке
```

- И `getters`, и `setters` получают объединение двух списков: во время выполнения спаится и вторая
  половина пары геттер/сеттер, объявленной в классе.
- Это по желанию. Без списка в типе (обычный `Spy<T>`) или с нелитеральным `string[]` остаются все
  ключи.
- Тот же `Spy<Thermo, { gettersToSpyOn: ['level'] }>` работает как объявленный тип переменной.

## `readonly` сохраняется на спае, и ответ на это — `mockValueProp` {#readonly-survives-onto-the-double-and-mockvalueprop-is-the-answer}

Член, объявленный в исходном типе как `readonly`, остаётся `readonly` и на спае, поэтому обычное
присваивание падает с `TS2540`. Используйте `mockValueProp`:

```ts
import { createAutoMock, mockValueProp } from 'vitest-auto-spy';

interface Session {
  readonly accessToken: string;
}

const session = createAutoMock<Session>({ accessToken: 'first' });

session.accessToken = 'second'; // ❌ TS2540
mockValueProp(session, 'accessToken', 'second'); // ✅ повторный запрос читает обновлённый токен
```

Через `overrides` второе значение не задать: `overrides` читается один раз, при создании спая.
[`mockValueProp` / `mockReadonlyProp`](/ru/utilities/setup) принимают член с `readonly` как есть, а
`restoreMockedProps()` отменяет патч.

**Частая ошибка:** `Reflect.set(spy, 'token', 'x')` в обход. Геттер-спай он не меняет: запись
уходит в спай сеттера, а геттер отвечает по-прежнему. Работает только `mockValueProp`:

| Запись                                               | Геттер после | Спай сеттера | Вернул |
| ---------------------------------------------------- | ------------ | ------------ | ------ |
| `double.token = 'x'`                                 | `undefined`  | записал      | —      |
| `Reflect.set(double, 'token', 'x')`                  | `undefined`  | записал      | `true` |
| `Object.defineProperty` (так делает `mockValueProp`) | `'x'`        | —            | —      |

`Mutable<T>` — запасной вариант по желанию, для теста, который предпочитает обычные присваивания
обычным **полям данных**:

```ts
import { type Mutable, type Spy, createSpyFromClass } from 'vitest-auto-spy';

const session: Mutable<Spy<SessionService>> = createSpyFromClass(SessionService);

session.accessToken = 'second';
```

На спае аксессора он не помогает: присваивание попадает в спай сеттера, а геттер продолжает отвечать
`undefined`.

## Спай, который можно позвать через `new` {#a-spy-you-can-call-with-new}

`createSpyClass(Class)` возвращает настоящий конструктор. Каждый `new` создаёт полноценный спай класса.
Он нужен, когда код под тестом вызывает `new Foo()`: `Worker`, `IntersectionObserver`, класс клиента.
Мок раннера (`vi.fn()`) нельзя вызвать через `new`, как только у него есть `mockReturnValue`.

```ts
import { createSpyClass, mockValueProp } from 'vitest-auto-spy';

const WorkerSpy = createSpyClass(BackgroundWorker);
mockValueProp(globalThis, 'BackgroundWorker', WorkerSpy);

service.start();

expect(WorkerSpy.calls[0]).toEqual(['./task.js']);
WorkerSpy.instances[0].postMessage.mockReturnValue(undefined);
```

| Член        | Что хранит                                              |
| ----------- | ------------------------------------------------------- |
| `calls`     | аргументы каждого `new` (и обычного вызова), по порядку |
| `instances` | `Spy<T>`, созданный каждым `new`, по порядку            |

Второй аргумент — та же конфигурация, что у [`createSpyFromClass`](./create-spy-from-class); она
применяется к каждому экземпляру.

Спай **метода** тоже отвечает на `new`. Например, если `sdk` — спай, а его тип объявляет `sdk.Client`
классом, `new sdk.Client()` возвращает экземпляр или объект, настроенный через
`calledWith(…).mockReturnValue(…)`. Но он не типизирует член как
конструктор, и экземпляр — не `Spy<T>`. Если спай должен быть полноценным классом, используйте
`createSpyClass`; см. [Подмены конструкторов](/ru/utilities/constructor-doubles).

### Статика класса — `{ statics: true }` {#the-class-s-statics-—-statics-true}

Код часто читает статические члены класса, который создаёт: проверку `Worker.isSupported()`, фабрику
`Client.create()`, константу `VERSION`. Без них подмена падает внутри рабочего кода с
`SpyClass.isSupported is not a function`. Третий аргумент их переносит:

```ts
const SdkSpy = createSpyClass(Sdk, undefined, { statics: true }) as unknown as typeof Sdk;

expect(SdkSpy.VERSION).toBe('2.1.0'); // данные, скопированы как есть
expect(vi.isMockFunction(SdkSpy.create)).toBe(true); // статика базового класса, спай как у своей
```

| Статический член                   | Становится                                                       |
| ---------------------------------- | ---------------------------------------------------------------- |
| функция (своя или базового класса) | спаем                                                            |
| данные (`VERSION`)                 | копией как есть                                                  |
| аксессор                           | пропускается: запуск геттера при сборке спая — побочный эффект   |
| с именем `calls` или `instances`   | пропускается: собственные `calls` и `instances` спая сохраняются |

`statics` по умолчанию выключен, потому что добавляет спаю члены. Тип опций экспортируется как
`SpyClassOptions`.

**У статики пока нет типов.** `ConstructorSpy<T>` описывает экземпляры, поэтому чтение статики требует
приведения, а настройка — второго:

```ts
(SdkSpy.isSupported as unknown as { mockReturnValue(value: boolean): void }).mockReturnValue(false);

expect(SdkSpy.isSupported()).toBe(false);
```

## Подробнее {#in-depth}

### Почему умолчание остаётся `'last'` {#why-the-default-stays-last}

Полезную сигнатуру нельзя определить по типу. У сгенерированного клиента с `observe` это первая, у
клиента API-шлюза с четырьмя перегрузками — последняя, и оба могут жить в одном проекте. Чтобы их
различить, пришлось бы упомянуть `HttpEvent` из Angular, а типы этого пакета так делать не могут.
Самому делать что-то с `HttpEvent` не нужно: просто назовите метод.

Поэтому же лучше называть метод, чем полагаться на умолчание: **порядок перегрузок не всегда задаёт
автор**. `declare global` в стороннем пакете дописывает сигнатуру в глобальный интерфейс, и дописанная
оказывается последней:

```ts
// web-vitals
declare global {
  interface Performance {
    getEntriesByType<K>(type: K): PerformanceEntryMap[K][];
  }
}
```

Поэтому то, какую сигнатуру прочитает `ReturnType`, зависит от установленных пакетов и может
поменяться при обновлении зависимости без единого изменения в вашем коде.

### Почему отказались убирать `readonly` {#why-removing-readonly-was-reverted}

Снятие модификатора `readonly` со `Spy<T>` пробовали и откатили. Присваивание компилировалось везде,
в том числе на члене, заменённом **спаем аксессора** (`gettersToSpyOn: ['accessToken']`). Там запись
попадает в спай сеттера, а геттер продолжает отвечать `undefined`. Понятная ошибка типов, которая
чинится одной строкой, превращалась в тихое бездействие во время выполнения.
