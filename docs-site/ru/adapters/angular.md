---
title: Angular
description: Тесты компонентов и сервисов Angular в TestBed со спаями, собранными из настоящих классов - provideAutoSpy, injectSpy, renderShallow, stable, хелперы для сигналов и ресурсов.
---

# Angular

`vitest-auto-spy/angular` подменяет сервис в `TestBed` объектом со спаями, собранным из его класса.
Каждый метод — типизированный [спай](/ru/glossary): запоминает вызовы и отвечает тем, что вы задали.
Пригодится, когда тестируемый компонент или сервис зависит от других сервисов и вы хотите управлять
их ответами.

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

describe('ProfileComponent', () => {
  let users: Spy<UserService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideAutoSpy(UserService, { returns: { load: of({ id: 1, name: 'Ada' }) } })],
    });
    users = injectSpy(UserService);
  });

  it('shows the user name', async () => {
    const fixture = TestBed.createComponent(ProfileComponent);
    await stable(fixture); // обнаружение изменений и эффекты, затем ожидание

    expect(fixture.nativeElement.textContent).toContain('Ada');
    expect(users.load).toHaveBeenCalledTimes(1);
  });
});
```

Обычная настройка Angular + Vitest в проекте всё равно нужна: билдер `@angular/build:unit-test` или
Vite-плагин Analog с setup-файлом для `TestBed`. См. [Установка](/ru/core/installation). Спаи
одинаково работают в zoneless-проектах и с zone.js. Если тест падает раньше вашей первой проверки,
загляните в [Angular: решение проблем](/ru/adapters/angular-troubleshooting).

Что обычно нужно дальше:

- задать ответ метода или значение поля заранее: [Ответы прямо в провайдере](#seeding-the-double-in-the-provider);
- управлять полем-`signal()` подменённого сервиса: [Управление сигналом](#driving-a-signal);
- дождаться компонента после изменения: [Ожидание в zoneless-режиме](#zoneless-waiting);
- отрендерить без дочерних компонентов: [Поверхностный рендер](#shallow-component-rendering).

## Импорты {#imports}

| Импорт                                | Что даёт                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/angular`             | `provideAutoSpy`, `provideAutoSpyForToken`, `injectSpy`, тип `Spy<T>`, `extendWithAutoSpies`, `renderShallow`, `setInputs`, `stable`, `settleResource`, моки сигналов и свойств и всё остальное с этой страницы |
| `vitest-auto-spy/angular/matchers`    | `registerSignalMatchers`, `registerResourceMatchers`, `registerDirectiveMatchers` (только Vitest)                                                                                                               |
| `vitest-auto-spy/angular/doubles`     | готовые подмены `window`, `document`, диалога Material, платформы, санитайзера, детектора изменений и оверлея CDK                                                                                               |
| `vitest-auto-spy/angular/diagnostics` | `enableTestBedDiagnostics` и `enableAngularDiagnostics` (только Vitest)                                                                                                                                         |
| `vitest-auto-spy/angular-http`        | `expectRequest`, `provideHttpTesting` — см. [Angular HTTP](/ru/adapters/angular-http)                                                                                                                           |
| `vitest-auto-spy`                     | `createSpyFromClass`, `createMock`, `createAutoMock`, `createSpyFromInstance`, `spyOnVoidMethod`, `spyOnOwnMethod`, `stubConstructor`, `asInstance`                                                             |
| `vitest-auto-spy/setup`               | `setupAutoSpy`, `registerFocusMatchers`                                                                                                                                                                         |

`vitest-auto-spy/angular` ещё реэкспортирует несколько вещей из корневой точки входа: тип `Spy<T>`,
хелперы `mock*Prop` вместе с `restoreMockedProps` и `countMockedProps`, семейство `expectEmission`,
а также `registerAutoSpyDefaults` / `clearAutoSpyDefaults`. Фабрики спаев остаются в
`vitest-auto-spy`, поэтому спеке, которой нужен ещё и `createSpyFromClass`, понадобятся две строки
импорта.

Чтобы запускать те же спеки в Bun, возьмите [`vitest-auto-spy/bun-angular`](/ru/runtimes/bun-angular).
Она экспортирует всё с этой страницы, кроме трёх `register*Matchers`, и добавляет DOM и поддержку
`templateUrl`, которых нет в `bun test`.

## Подменить сервис: `provideAutoSpy` и `injectSpy` {#replace-a-service-provideautospy-and-injectspy}

`provideAutoSpy(Service)` — провайдер, который отдаёт объект со спаями вместо настоящего сервиса.
`injectSpy(Service)` получает этот объект из `TestBed` с типом `Spy<Service>`.

```ts
TestBed.configureTestingModule({
  providers: [provideAutoSpy(UserService), provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] })],
});

const users = injectSpy(UserService);
users.load.nextWith({ id: 1, name: 'Ada' });
```

Второй аргумент — тот же объект настроек, что принимает `createSpyFromClass`. Чаще всего в
Angular-спеках нужны эти:

| Опция                    | Тип                  | По умолчанию | Смысл                                                                                |
| ------------------------ | -------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `returns`                | `{ method: value }`  | —            | что метод отвечает с самого начала; метод остаётся спаем                             |
| `overrides`              | `{ member: value }`  | —            | заменяет член обычным значением (поле, свойство-Observable, сигнал)                  |
| `observablePropsToSpyOn` | `string[]`           | —            | свойства-Observable, которые получают `nextWith` и другие хелперы                    |
| `onlyMethodsToSpyOn`     | `string[]`           | все          | спаи только на эти методы                                                            |
| `fillMissing`            | `boolean`            | `false`      | добавить спаи для членов, которых нет на прототипе, например `abstract`-методов      |
| `lazySpies`              | `boolean \| 'proxy'` | по размеру   | когда создаётся спай метода; см. [Ленивые спаи по умолчанию](#lazy-spies-by-default) |
| `strict`                 | `boolean`            | `false`      | ненастроенный метод бросает ошибку, а не возвращает `undefined`                      |

Все опции: [`createSpyFromClass`](/ru/core/create-spy-from-class).

**Частая ошибка:** `injectSpy` для класса, который никто не подменил. Он предупреждает и возвращает
настоящий сервис; см. [`injectSpy` говорит, когда получил настоящий объект](#injectspy-says-when-it-got-the-real-thing).

## Ответы прямо в провайдере {#seeding-the-double-in-the-provider}

Задавайте ответы там же, где подменяете сервис, а не в отдельном `beforeEach` ниже. `returns`
задаёт, что отвечает **метод**. `overrides` задаёт член, который не является результатом метода:
свойство-Observable, обычное поле, сигнал.

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]) },
  overrides: { savedItemsChanged$: of(undefined), favoriteItems: [] },
});

provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
```

Поле-сигнал тоже кладётся в `overrides`. Сохраните сигнал в переменную, чтобы менять его потом:

```ts
const isAdmin = signal(false); // WritableSignal<boolean>

provideAutoSpy(SessionService, { overrides: { isAdmin } });
// позже, в тесте
isAdmin.set(true);
```

Если спай уже у вас в руках (из `injectSpy`), то же делает [`mockSignalProp`](#driving-a-signal).
В обоих случаях поставьте сигнал на место до первого рендера; менять его значение через `set()`
можно когда угодно.

Член из `overrides` хранится как есть, спаем он не становится. Сигнал там — настоящий записываемый
сигнал. Кладите туда данные. Метод, вызовы
которого вы хотите проверять, называйте в `returns`. Сравнение обеих опций —
на странице [returns или overrides](/ru/core/returns-vs-overrides).

**Частая ошибка:** экспортированный `const`-провайдер со значениями, общий для нескольких файлов
тестов. Под [`isolate: false`](/ru/glossary) все файлы, которые его импортируют, делят один набор спаев. Задавайте
значения в каждом тесте.

### Свойства-Observable за токеном {#observable-properties-behind-a-token}

У токена есть тип, но нет класса, поэтому фабрика не отличит метод от свойства. Каждый ключ,
который вы не назвали, становится **функцией**-спаем, и свойство-Observable тоже. Тестируемый код
подписывается на функцию, а ошибка всплывает далеко от подмены. Назовите свойства-Observable:

```ts
provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });

injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
```

Если член есть и в `overrides`, и в `observablePropsToSpyOn`, побеждает значение из `overrides`.
Положите в `overrides` настоящий `Subject`, когда спека сама ведёт поток. Назовите член в
`observablePropsToSpyOn`, когда нужен `nextWith`.

## Фикстуры вместо `let` + `beforeEach` — `extendWithAutoSpies` {#fixtures-instead-of-let-beforeeach-—-extendwithautospies}

`extendWithAutoSpies` превращает спаи в [фикстуры теста](https://vitest.dev/guide/test-context)
Vitest. Тест называет нужные спаи в своих аргументах, и между тестами нет `let`, равного
`undefined`. Нужен Vitest 4.1 или новее.

```ts
import { of } from 'rxjs';
import { test as base, expect } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(base, {
  cart: CartService,
  api: [ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }],
  passcode: PASSCODE_TOKEN,
});

test('checks out', async ({ cart }) => {
  cart.checkout.resolveWith(true);

  await expect(cart.checkout(1)).resolves.toBe(true);
});

test('builds only what it names', ({ api }) => {
  api.get.mockReturnValue(of([])); // `cart` и `passcode` в этом тесте не создаются
});
```

Каждая запись — одно из трёх:

- класс;
- пара `[Class, config]`, где `config` — то же, что принимает `provideAutoSpy`;
- `InjectionToken`: подмена строится по типу токена, как в `provideAutoSpyForToken`.

Третий аргумент принимает остальные провайдеры и импорты модуля. Они регистрируются после
сгенерированных, поэтому токен, названный там, побеждает:

```ts
const test = extendWithAutoSpies(base, { cart: CartService }, { providers: [provideHttpClient(), CartComponent] });
```

Если этот список сам даёт токен фикстуры (`{ provide: CartService, useValue: real }` или просто
класс), фикстура получает это значение через `TestBed.inject`. Оставить настоящий сервис — ваш
выбор, поэтому под `misconfiguration: 'throw'` и `preset: 'strict'` это тоже проходит молча.

Каждый спай создаётся при первом получении через DI: тестом, который его назвал, или настоящим
провайдером, который от него зависит. Тест, которому нужна одна фикстура из десяти, создаёт один
спай.

**Частые ошибки:**

- Цепочка вызовов `.extend` вместо одной карты. Первая фикстура получит сервис через DI, этим
  создаст тестовый модуль, и следующая упадёт с ошибкой Angular _«Cannot configure the test module
  when the test module has already been instantiated»_. `TestBed` должен знать все провайдеры до
  первого получения через DI.
- `beforeEach`, который **получает** что-то через DI. Эффект тот же. `beforeEach`, который только
  вызывает `configureTestingModule`, в порядке: он выполняется до любой фикстуры.
- На Vitest старше 4.1 вызов бросает `extendWithAutoSpies needs Vitest 4.1 or newer`. До
  обновления пользуйтесь формой `let` + `beforeEach` из начала страницы.

## DI-токен из `abstract class` {#an-abstract-class-di-token}

Абстрактный класс — частый DI-токен в Angular-приложениях:
`{ provide: LocalStorage, useClass: BrowserLocalStorage }`. `provideAutoSpy` его принимает.

```ts
abstract class LocalStorage extends AbstractStorage {
  abstract read(key: string): string | null;
  abstract write(key: string, value: string): void;
}

TestBed.configureTestingModule({ providers: [provideAutoSpy(LocalStorage)] });

const storage = injectSpy(LocalStorage);
storage.read.calledWith('token').mockReturnValue('abc');
```

TypeScript убирает `abstract`-члены до запуска, поэтому на прототипе искать нечего. Если у класса
нет ни одного метода, вы получите объект [`createAutoMock`](/ru/core/auto-mock-by-type), который
отвечает на любой метод типа.

**Частая ошибка:** один конкретный член это выключает. Тогда спаем становится только он, а
абстрактных членов нет:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {}
}

const storage = injectSpy(LocalStorage);
storage.clear; // спай
storage.read; // undefined, хотя Spy<T> говорит, что он есть
```

Компонент тогда падает с `storage.read is not a function`. Во время выполнения это не обнаружить,
поэтому попросите недостающие члены явно:

```ts
providers: [provideAutoSpy(LocalStorage, { fillMissing: true })];
```

Что именно добавляет опция — в [`fillMissing`](/ru/core/create-spy-from-class#fill-missing).

## Зависимость за `InjectionToken` {#a-dependency-behind-an-injectiontoken}

Для токена, типизированного интерфейсом, берите `provideAutoSpyForToken`. Он читает тип с токена.
`provideAutoSpy` нужен класс, поэтому здесь он не подходит.

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)] });

const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
```

Сигнатура: `provideAutoSpyForToken(token, overrides?, config?)`. Второй аргумент значит то же, что
ключ `overrides`: обычные значения для членов. Если нужен только `config`, передайте `undefined`.

Спай отвечает `undefined`, пока вы его не настроите. Это ломает код, который строит **цепочку** от
результата: конструктор с `inject(LOGGER).channel('auth').debug('…')` падает на `.debug` ещё до
начала теста. Назовите метод, который возвращает сам объект:

```ts
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

[`selfReturning`](/ru/core/create-spy-from-class#self-returning) оставляет `channel` спаем, который
можно проверять, и заставляет его возвращать объект со спаями. Чтобы задать это один раз для всех
файлов, вызовите `registerAutoSpyDefaults(LOGGER, { … })` из `vitest-auto-spy/angular` в
setup-файле. Каждый следующий `provideAutoSpyForToken(LOGGER)` его прочитает
([настройки по умолчанию для токена](/ru/core/create-spy-from-class#token-defaults)).

Для цепочки длиннее одного звена возьмите
[`mockDeep<T>()`](/ru/core/auto-mock-by-type#recursive-deep-mocks-%E2%80%94-mockdeep): он отвечает на
любом уровне.

## `injectSpy` и токены {#injectspy-and-tokens}

`injectSpy` принимает класс, абстрактный класс или `InjectionToken`.

Для **обобщённого** класса укажите аргумент типа:

```ts
const flags = injectSpy<FeatureFlagService>(FeatureFlagService);
const modal = injectSpy<ModalRef<PurchaseOptions>>(ModalRef);
```

Без аргумента результат зависит от конструктора:

- Если конструктор не использует параметр типа, вы получите объявленное значение по умолчанию.
- Если использует (`constructor(public data: T)`, как у большинства ref'ов модалок), вы получите
  **ограничение**. `ModalRef<T = unknown>` даёт `Spy<ModalRef<unknown>>`, а
  `ConfigService<T extends Config = Defaults>` даёт `Spy<ConfigService<Config>>`. Указывайте аргумент,
  когда имеете в виду значение по умолчанию или конкретный тип.

**Частая ошибка:** `TestBed.inject(X) as Spy<X>` для обобщённого класса. Он выводит `X<any>`, и
ошибка всплывает гораздо позже, глубоко в типах спая, без слова о параметрах типа.

## `injectSpy` говорит, когда получил настоящий объект {#injectspy-says-when-it-got-the-real-thing}

Если в тестовом модуле нет подмены, `injectSpy` возвращает то, что создал Angular, и один раз на
токен предупреждает:

```text
[vitest-auto-spy] injectSpy(DeviceRegistryService): got a real DeviceRegistryService — nothing in the testing module provides a double, so Angular built it (providedIn: 'root').
Add provideAutoSpy(DeviceRegistryService) to providers.
```

Причина в сообщении соответствует тому, что вернул инжектор: класс с `providedIn: 'root'`, который
Angular создал сам; класс, который тестовый модуль даёт настоящим; или `InjectionToken`. Для токена
сообщение предлагает `{ provide: TOKEN, useValue: createAutoMock<T>() }`.

Без предупреждения забытый провайдер обнаруживается позже, когда `.mockReturnValue(…)` вызывают на
настоящем методе. Или никогда, если типы нигде не расходятся.

## Не пишите свой локальный `injectSpy` {#do-not-write-a-local-injectspy}

Во многих проектах уже есть хелпер вида `TestBed.inject(token as never) as Spy<T>`. Удалите его или
реэкспортируйте этот под тем же именем. Этот принимает класс, `InjectionToken` и абстрактный класс,
предупреждает, когда получил настоящий сервис, и не требует приведения типа. Когда две функции с
одним именем и разными сигнатурами, какая из них сработает, решает порядок импортов в каждом файле.

## Компонент — не провайдер {#a-component-is-not-a-provider}

`provideAutoSpy(SomeComponent)` бросает ошибку, и для директивы тоже. Angular объявляет или
импортирует компонент, но никогда не получает его через DI, так что такой провайдер ничего бы не
сделал.

```text
[vitest-auto-spy] provideAutoSpy(ChartComponent): ChartComponent is a component. Angular declares or imports a component, it never injects one, so this provider is never read and the double replaces nothing.
```

Чтобы убрать дочерний компонент из рендера, возьмите
[`createComponentStub`](#a-stand-in-for-a-child-createcomponentstub) или
[`renderShallow`](#shallow-component-rendering). Чтобы протестировать сам компонент, создайте его
через `TestBed`. Сервис, который наследует класс компонента без собственного декоратора, принимается.

## Ленивые спаи по умолчанию {#lazy-spies-by-default}

Спай каждого метода создаётся, когда тест впервые к нему обращается. Широкие сервисы остаются
дешёвыми, и `provideAutoSpy` можно вызывать в каждом `beforeEach`: это пара микросекунд.

```ts
provideAutoSpy(WideService); // лениво, по умолчанию
provideAutoSpy(WideService, { lazySpies: false }); // создать все спаи сразу
```

Для теста ничего не меняется: `Object.keys`, `vi.isMockFunction`, `calledWith`, `resetAutoSpy` и
`clearAutoSpy` работают так же. У `createSpyFromClass` такое же поведение по умолчанию.

| Опция              | Тип                  | По умолчанию          | Смысл                                                              |
| ------------------ | -------------------- | --------------------- | ------------------------------------------------------------------ |
| `lazySpies`        | `boolean \| 'proxy'` | выбирается по размеру | `false` создаёт все спаи сразу                                     |
| `autoSpyAccessors` | `boolean`            | `false`               | спай на каждый геттер и сеттер; обходит прототип при каждом вызове |

Три настройки стоят дороже, и нужны они редко:

- `lazySpies: false` отключает ленивость. Нужна, только если спека перечисляет ключи самого спая
  (`Object.keys(spy)`).
- Явный `lazySpies: true` на классе с 8 и более методами отменяет выбор по размеру и делает каждый
  спай тяжелее и медленнее в создании. Не указывайте опцию.
- `autoSpyAccessors: true` обходит цепочку прототипов при каждом вызове, без кеша. Если класс
  подменяется в каждом тесте, назовите нужные геттеры и сеттеры явно.

Если спека медленная, время почти всегда уходит в `TestBed`, а не в спаи.
[`enableTestBedDiagnostics()`](#where-a-spec-spends-its-time) это измеряет, а
[`renderShallow`](#shallow-component-rendering) обычно исправляет. Цифры:
[Производительность](/ru/core/performance#memory-not-just-time).

## Спай на настоящий сервис без подмены {#spying-a-real-service-without-replacing-it}

Когда тесту нужен настоящий сервис (его зависимости, сигналы и побочные эффекты), а проверить надо
только то, что вызвал компонент, возьмите сервис из инжектора и поставьте на него спаи на месте:

```ts
import { TestBed } from '@angular/core/testing';
import { createSpyFromInstance } from 'vitest-auto-spy';

const cart = createSpyFromInstance(TestBed.inject(CartService), { passthrough: true });
const fixture = TestBed.createComponent(CartComponent);

fixture.componentInstance.addOne();

expect(cart.add).toHaveBeenCalledWith(5); // выполнился настоящий CartService
cart.checkout.resolveWith('declined'); // дальше подменён только checkout
```

С `passthrough` каждый вызов записывается и выполняет настоящий метод, пока вы его не настроите. DI
остаётся настоящим, у полей `signal()` сохраняются `set` и `update`, а `ngOnDestroy` при очистке
выполняется по-настоящему. Хуки жизненного цикла спаями не становятся. `setupAutoSpy()` восстанавливает
экземпляр после теста. Подробнее: [`passthrough`](/ru/core/create-spy-from-class#passthrough).

## Сборка класса с auto-spy вместо зависимостей {#building-a-class-with-auto-spied-dependencies}

`createWithAutoSpies` создаёт класс через DI Angular и отвечает спаем на каждую зависимость, которую
вы не передали. Спека называет только то, чем хочет управлять.

```ts
import { createWithAutoSpies } from 'vitest-auto-spy/angular';

const { instance, spies } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // ваши провайдеры побеждают
});

spies.get(PricingService).total.mockReturnValue(100);
expect(instance.checkout()).toBe(100);
```

| Что возвращается          | Что это                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `instance`                | экземпляр класса, созданный его собственной фабрикой Angular                 |
| `spies.get(token)`        | что экземпляр получил для `token`: ваш провайдер или созданный для него спай |
| `spies.autoSpiedTokens()` | токены, получившие спай                                                      |
| `injector`                | инжектор, который создал экземпляр                                           |

Работают и параметры конструктора, и инициализаторы полей через `inject()`. Недостающий токен-класс
получает спай `createSpyFromClass`, недостающий `InjectionToken` — объект `createAutoMock`.
`inject(X, { optional: true })` по-прежнему возвращает `null`, как в приложении.

**Частая ошибка:** `spies.get(X)` для токена, который экземпляр не запрашивал: базовый класс вместо
реализации или сервис, который класс больше не получает через DI. Вызов бросает ошибку, называет
токен и перечисляет подменённые. Токен, запрошенный как необязательный и получивший `null`, бросает
по той же причине.

::: warning Только обычные провайдеры
Здесь используется `Injector.create()`, который не принимает `EnvironmentProviders` вроде
`provideHttpClient()`. Классу, которому они нужны, место в `TestBed`:
[`renderShallow`](#shallow-component-rendering) или обычный `configureTestingModule`.
:::

## Поверхностный рендер компонента {#shallow-component-rendering}

`renderShallow` рендерит компонент без дочерних компонентов. Он сам выполняет обычные шаги:
`configureTestingModule`, `NO_ERRORS_SCHEMA` и `overrideComponent` с пустыми `imports` и пустым
шаблоном. Берите его, когда спека проверяет состояние компонента в TypeScript, а не его детей.

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService), provideHttpClient()],
  inputs: { projectId: 42 }, // через componentRef.setInput, до первого обнаружения изменений
});
```

`fixture` — настоящий `ComponentFixture`. Хуки жизненного цикла, входы, сигналы и DI работают; пуст
только шаблон.

| Опция                | По умолчанию | Что делает                                                                                                                               |
| -------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`          | `[]`         | провайдеры тестового модуля; `EnvironmentProviders` вроде `provideHttpClient()` подходят                                                 |
| `imports`            | `[]`         | дополнительные импорты тестового модуля (модуль-заглушка, обвязка роутинга)                                                              |
| `inputs`             | —            | значения входов; сигнальный вход получает **значение**, а не сигнал; ключ — поле класса или публичное имя                                |
| `keepTemplate`       | `false`      | оставить настоящий шаблон (для `viewChild`, проекции контента, host-привязок); дочерние компоненты всё равно убираются                   |
| `keepChildren`       | `[]`         | дочерние компоненты, директивы и пайпы, которые надо оставить                                                                            |
| `keepModules`        | `[]`         | `NgModule`, которые под `keepTemplate` надо вернуть целиком, например `ReactiveFormsModule`                                              |
| `keepHostDirectives` | `true`       | `false` убирает `hostDirectives` компонента и все сервисы, которые они получают через DI                                                 |
| `template`           | `''`         | шаблон-замена вместо пустого                                                                                                             |
| `beforeCreate`       | —            | выполняется после настройки модуля, до создания компонента; читать инжектор нужно здесь                                                  |
| `detectChanges`      | `true`       | выполнить первое обнаружение изменений, а значит и `ngOnInit`                                                                            |
| `testBed`            | —            | остальное из `configureTestingModule`: `deferBlockBehavior`, `errorOnUnknownElements`, `errorOnUnknownProperties`, `teardown`, `schemas` |

```ts
renderShallow(CardComponent, { testBed: { deferBlockBehavior: DeferBlockBehavior.Playthrough } });
```

Несколько деталей:

- У компонента со `standalone: false` оставленный standalone-потомок импортируется в тестовый
  модуль, а потомок со `standalone: false` там объявляется.
- `testBed.schemas` добавляются к `NO_ERRORS_SCHEMA`, который получает компонент со
  `standalone: false`. Standalone-компонент получает ровно те схемы, что вы передали; по умолчанию
  никаких.
- `inputs` разбирает имена так же, как [`setInputs`](#changing-an-input-mid-test). Вход с
  псевдонимом принимает любое из двух имён. Имя, которого компонент не объявляет, бросает ошибку
  сразу при вызове.
- `keepHostDirectives: false` — поддерживаемая форма
  `TestBed.overrideComponent(X, { set: { hostDirectives: [] } })`.

**Читайте инжектор в `beforeCreate`, а не до рендера.** `TestBed.inject` или `injectSpy` в
`beforeEach` создают тестовый модуль, а созданный модуль заново настроить нельзя. Тогда
`renderShallow` бросает:

```text
[vitest-auto-spy] renderShallow(TaskListComponent): the testing module was already instantiated, so it can no longer be configured. Something read the injector first — TestBed.inject or injectSpy in a beforeEach, or an earlier render in the same test.
```

Перенесите чтение в `beforeCreate`. Внутри него ставьте
[`overrideComponentProvider`](#overriding-a-provider-the-component-declares-for-itself) раньше
первого `injectSpy`. Неправильный порядок ловит правило линтера
[`no-inject-before-override`](/ru/utilities/eslint-rules#no-inject-before-override).

```ts
renderShallow(ProfileComponent, {
  beforeCreate: () => {
    overrideComponentProvider(ProfileComponent, DeleteAccountService); // сначала
    injectSpy(SessionService).user.mockReturnValue(ada); // потом чтение
  },
});
```

**Покрытие:** `renderShallow` перекомпилирует компонент в JIT до конца файла спеки. Ветки,
скомпилированные сборкой в шаблоне, выпадают из покрытия, даже с `keepTemplate: true`. Обычный
рендер позже в том же файле их не вернёт. Если ваш порог покрытия эти ветки учитывает, оставьте на
каждый компонент один настоящий рендер через `TestBed.createComponent` и поставьте его в файле
**раньше** любого `renderShallow` этого компонента. Компонент, объявленный в модуле, под
`keepTemplate: true` перекомпиляции не требует.

Поверхностный рендер окупается на компонентах с настоящим деревом потомков. На маленьком листовом
компоненте подмена может стоить дороже, чем экономит. Какие файлы стоит переводить, покажет
[диагностика](#where-a-spec-spends-its-time). Цифры:
[Производительность](/ru/core/performance#the-middle-rung-keeptemplate-true).

### `keepTemplate` и объявление, которым владеет `NgModule` {#keeptemplate-and-a-declaration-an-ngmodule-owns}

`keepTemplate: true` сохраняет всё, чем пользуется шаблон. Но пайп или директиву со
`standalone: false`, которую объявляет `NgModule`, он не восстановит, если сборка AOT: компилятор
заменил модуль его объявлениями. `renderShallow` бросает ошибку и, когда может, называет модуль:

```text
[vitest-auto-spy] renderShallow(ReportComponent, { keepTemplate: true }): WhisperPipe is declared by WhisperModule, not standalone, and Angular takes only standalone declarations and NgModules in `imports`.
An AOT build flattened that module away, so name it and it is put back whole: keepModules: [WhisperModule].
```

Что делать, от лучшего к худшему:

1. Назвать модуль: `renderShallow(FormComponent, { keepTemplate: true, keepModules: [ReactiveFormsModule] })`.
   Все объявления, которые модуль экспортирует, убираются, а сам модуль импортируется целиком.
2. Убрать `keepTemplate`, если спека читает только состояние в TypeScript.
3. Создать компонент через `TestBed` напрямую и задать заранее сервисы, которые получают его
   потомки.

Без этой проверки собственная ошибка Angular говорит, что пайп «is not standalone», и отправляет
вас править пайп, с которым всё в порядке. Под JIT тот же вызов работает: там модуль остаётся в
списке.

### Смена входа посреди теста {#changing-an-input-mid-test}

`setInputs` задаёт один или несколько входов и ждёт, пока компонент обновится. Это
`componentRef.setInput` для каждого имени плюс [`stable`](#zoneless-waiting).

```ts
import { setInputs } from 'vitest-auto-spy/angular';

await setInputs(fixture, { projectId: 7, filter: 'open' });
expect(component.visible()).toEqual([openTask]);
```

Третий аргумент — опции `stable`: `{ timeout, label }`.

- Имена проверяются до того, как задан первый вход. Имя, которого компонент не объявляет, бросает
  ошибку, и компонент остаётся как был. Голый `setInput` вывел бы `NG0303` и ничего не поменял.
- Вход с псевдонимом принимает любое имя: поле класса или публичное.
- Вход, который открывает **host-директива**, считается объявленным, потому что `setInput` его
  принимает; вложенные host-директивы тоже учитываются.
- Фикстура класса без скомпилированного определения компонента (`@Directive`, `@Pipe`, обычный
  класс) бросает ошибку и говорит, что это за класс.

```ts
@Component({ selector: 'app-badge', hostDirectives: [{ directive: TooltipDirective, inputs: ['text: tip'] }], template: '…' })
export class BadgeComponent {}

await setInputs(fixture, { tip: 'Archived' }); // имя, которое открывает хост
```

`model()` задаётся как любой другой вход. Его выход срабатывает, когда значение меняет сам
компонент, поэтому подпишитесь до вызова и ждите после:

```ts
const emitted = expectEmission(component.total); // сначала подписка

await setInputs(fixture, { step: 3 });

await expect(emitted).resolves.toBe(30);
```

**Частая ошибка:** проверка сразу после голого `componentRef.setInput`. В zoneless-приложении ничего
не пересчитывается, пока кто-то не попросит, поэтому проверка читает состояние от **прошлого**
значения.

### Одни и те же опции в каждом тесте — `prepareShallow` {#the-same-options-in-every-test-—-prepareshallow}

`prepareShallow` один раз связывает компонент с опциями. Потом `create()` рендерит его для текущего
теста, с поправками на этот тест.

```ts
import { prepareShallow, provideAutoSpy } from 'vitest-auto-spy/angular';

const prepare = prepareShallow(TaskListComponent, { providers: [provideAutoSpy(TaskService)] });

it.each([{ filter: 'open' }, { filter: 'done' }])('renders the $filter tasks', ({ filter }) => {
  const { fixture } = prepare.create({ inputs: { filter } });
  // …
});
```

Ключ, переданный в `create()`, заменяет подготовленный целиком, списки не сливаются.
`create({ providers: [...] })` отбрасывает подготовленные провайдеры. Чтобы добавить к ним, передайте `extraProviders` или `extraImports`. Они
идут после подготовленных списков, поэтому для одного токена побеждает провайдер теста:

```ts
it('reads the feature flag', () => {
  prepare.create({ extraProviders: [provideAutoSpy(FlagService)] });
});
```

`extraProviders` и `extraImports` есть только у `create()`. Вызывайте `create()` один раз на тест:
второму вызову в том же тесте нужен сначала `TestBed.resetTestingModule()`.

**Когда он окупается.** Только когда тесты повторяют одни и те же непустые `providers` или `imports`.
Если каждый `renderShallow` передаёт свои `inputs` или не передаёт ничего, `prepareShallow(X)` лишь
переименует вызов, и `renderShallow` проще. Считать нужно общие опции, а не число вызовов.

## Заглушка вместо дочернего компонента — `createComponentStub` {#a-stand-in-for-a-child-createcomponentstub}

`createComponentStub` строит заглушку дочернего компонента, директивы или пайпа по настоящему
классу. Селектор, входы и выходы копируются, поэтому заглушка не разойдётся с настоящим потомком.

```ts
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { createComponentStub } from 'vitest-auto-spy/angular';

const ChartStub = createComponentStub(ChartComponent);

TestBed.configureTestingModule({ imports: [DashboardComponent] });
TestBed.overrideComponent(DashboardComponent, {
  remove: { imports: [ChartComponent] },
  add: { imports: [ChartStub] },
});

const fixture = TestBed.createComponent(DashboardComponent);
fixture.detectChanges();

const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;
expect(chart.series()).toEqual([1, 2, 3]); // сигнальный вход остаётся сигнальным
chart.pointSelected.emit(2); // выход, который слушает родитель
```

| Копируется из настоящего класса                                                 | Не копируется                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| селектор                                                                        | шаблон: заглушка рендерит по одному `<ng-content>` на слот |
| каждый вход под публичным именем, с псевдонимом и transform                     | host-привязки и host-директивы                             |
| `input()` как сигнальный вход, `model()` как model, вход-декоратор как свойство | провайдеры                                                 |
| каждый выход, как `EventEmitter`                                                | хуки жизненного цикла и запросы                            |
| `exportAs`; у пайпа — имя и чистота                                             | всё, что не задано вторым аргументом                       |

Второй аргумент задаёт члены каждого экземпляра: метод, который родитель вызывает через
`viewChild`, или `transform` пайпа (по умолчанию возвращает вход как есть):
`createComponentStub(TranslatePipe, { transform: (key) => key })`. Третий аргумент принимает
`{ template }`, чтобы рендерить что-то кроме проецируемого контента.

Чтобы оставить шаблон и заменить одного потомка, совместите с `renderShallow`:

```ts
const { fixture } = renderShallow(DashboardComponent, { keepTemplate: true, keepChildren: [ChartStub] });
```

Настоящий `ChartComponent` убирается вместе с другими потомками, а его место занимает заглушка.

**Частая ошибка:** заглушка для потомка, чьи входы приходят из `hostDirectives`. На заглушке этих
входов нет, и привязка родителя отвечает `NG0303`. Такого потомка оставьте:
`keepChildren: [TheChild]` или фикстура напрямую через `TestBed`.

## Типизированные элементы под строгим линтом {#typed-elements-under-a-strict-lint}

`hostElement` и `queryElement` возвращают типизированные DOM-элементы вместо `any`. Пригодятся,
когда `@typescript-eslint/strict-type-checked` ругается на каждое чтение `fixture.nativeElement`, а
линтер запрещает `as HTMLElement`.

```ts
import { hostElement, queryElement } from 'vitest-auto-spy/angular';

const host = hostElement(fixture); // HTMLElement
queryElement(fixture, '.close').click(); // HTMLElement
expect(queryElement(fixture, 'input[name=q]', HTMLInputElement).value).toBe('');
expect(queryElement(fixture.debugElement, 'circle', SVGCircleElement).getAttribute('r')).toBe('4');
```

- Оба принимают `ComponentFixture`, `DirectiveFixture` (от `TestBed.createDirective`, Angular 22.2)
  или `DebugElement`. `queryElement` принимает ещё и элемент, так что поиск можно начать внутри
  строки.
- Последний аргумент — тип элемента: его проверяют через `instanceof` и его же возвращают. По
  умолчанию `HTMLElement`; для разметки не на HTML передайте `SVGElement` или `Element`.
- Селектор без совпадений бросает ошибку с селектором и хостом в сообщении. Совпадение другого типа
  тоже: `'.close' matched <a.close> (HTMLAnchorElement), not HTMLButtonElement`.
- Источник `null` (так `debugElement.query()` отвечает, когда ничего не нашёл) бросает ошибку и
  говорит об этом.
- Оба есть и в `vitest-auto-spy/bun-angular`.

Раз промах бросает ошибку, `queryElement` — для элемента, который обязан быть. Чтобы проверить, что
элемента **нет**, используйте `querySelector` на типизированном хосте:

```ts
expect(queryElement(fixture, '.title').textContent.trim()).toBe('Orders'); // промах бросит здесь
expect(host.querySelector('.empty-state')).toBeNull(); // элемента нет
```

**Частая ошибка:** `host.querySelector('.title')?.textContent.trim()`. Промах превращается в
`undefined`, который принимают `toBeFalsy()` и `not.toContain()`, и тест проходит на пустом
шаблоне.

## Проверки фокуса {#focus-assertions}

`toHaveFocus` проверяет, у какого элемента фокус, и при провале объясняет, что пошло не так.

```ts
import { registerFocusMatchers } from 'vitest-auto-spy/setup';

registerFocusMatchers(); // один раз, в setup-файле

expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
```

Провал называет одну из трёх причин: элемента нет, фокус всё ещё на `<body>` или фокус на другом
элементе. Оба элемента описаны тегом, id и классом, без дампа DOM.

Отсутствующий элемент бросает ошибку, а не проваливает проверку, поэтому `.not` не превратит её в
успех. Сравните с `expect(document.activeElement).toBe(button)`, который печатает два огромных дампа
DOM, и с `expect(a === b).toEqual(true)`, который падает с `expected false to deeply equal true`.

## Ожидание в zoneless-режиме {#zoneless-waiting}

После изменения сигнала `await stable(fixture)` выполняет обнаружение изменений и отложенные
эффекты, а затем ждёт фикстуру. Ставьте его перед каждой проверкой, которая читает результат
изменения.

```ts
import { flushEffects, stable } from 'vitest-auto-spy/angular';

component.filter.set('open');
await stable(fixture); // выполнить эффекты, затем дождаться фикстуры
expect(component.visible()).toEqual([openTask]);

flushEffects(); // без фикстуры: сервисы, сторы, код в runInInjectionContext
```

| Хелпер                      | Что делает                                                                  |
| --------------------------- | --------------------------------------------------------------------------- |
| `stable(fixture, options?)` | `flushEffects()`, затем `fixture.whenStable()`, с ограничением по времени   |
| `flushEffects()`            | `TestBed.tick()` внутри `NgZone`: обнаружение изменений и «грязные» эффекты |

| Опция `stable` | Тип      | По умолчанию | Смысл                                                         |
| -------------- | -------- | ------------ | ------------------------------------------------------------- |
| `timeout`      | `number` | `2000`       | сколько мс ждать до ошибки с причиной; `0` — ждать бесконечно |
| `label`        | `string` | —            | имя в тексте ошибки, например `'the products fixture'`        |

`stable` принимает любую фикстуру с `whenStable()`, в том числе `DirectiveFixture` от
`TestBed.createDirective(Dir, { tagName })` в Angular 22.2.

**Частая ошибка:** `fixture.detectChanges()` перед проверкой. Он выполняет один проход обнаружения
изменений и **не** выполняет эффекты, поэтому проверка читает недосчитанное состояние.

Каждый вызов запускает полный проход обнаружения изменений, а это время. Вызывайте его один раз после группы
связанных записей, а не после каждой.

### Работает и под zone.js {#both-work-under-zone-js-and-the-zone-is-why-the-tick-is-wrapped}

`stable`, `flushEffects` и `setInputs` работают и в проектах на zone.js, тем же кодом. Тик идёт
внутри `NgZone`, и это спасает от ошибки Angular `NG0101: ApplicationRef.tick is called recursively`;
см. [Angular: решение проблем](/ru/adapters/angular-troubleshooting#ng0101-applicationref-tick-is-called-recursively).
Под zone.js один `flushEffects()` делает два тика приложения вместо одного. Второй ничего не
обновляет, делать с этим ничего не нужно.

### В zoneless-режиме `autoDetect` уже включён {#autodetect-is-already-on-under-zoneless}

В zoneless-приложении фикстура по умолчанию сама обнаруживает изменения (Angular 19 и новее).
`ComponentFixtureAutoDetect` и `autoDetectChanges()` не нужны.

Автоматическое обнаружение срабатывает **позже**, а не в момент записи в сигнал. Проверка на
следующей строке всё ещё читает старое состояние. `await stable(fixture)` выполняет проход и
эффекты до проверки; ещё один `detectChanges()` — нет.

`flushEffects()` из этого пакета — это `TestBed.tick()`, вызов, который Angular рекомендует вместо
устаревшего `TestBed.flushEffects()`.

### У ожидания есть предел {#the-wait-is-bounded}

`stable` ждёт **2000 мс**, а потом бросает ошибку с вероятной причиной. Без предела фикстура,
которая никак не успокоится, висит до тайм-аута всего файла в Vitest, а тот не называет ни хелпер,
ни фикстуру.

```ts
await stable(fixture, { timeout: 5000, label: 'the products fixture' });
```

Что обычно держит фикстуру занятой:

- колбэк, который ждёт фейковые таймеры: сначала продвиньте их через `await advanceTimers(ms)`;
- запрос `HttpClient`, который никто не завершил через `HttpTestingController`;
- запись `PendingTasks`, которую ничто не сняло;
- настоящий `setInterval`, запущенный компонентом.

Передавайте `label`, когда спека ждёт больше одной фикстуры. `{ timeout: 0 }` означает ждать
бесконечно; это нужно только для намеренно долгого теста на настоящих таймерах.
`vi.useFakeTimers()` и `fakeAsync` предел не остановят: он идёт по настоящим часам.

## Ресурсы: `httpResource()` и `resource()` {#resources-httpresource-and-resource}

`settleResource` ждёт, пока ресурс закончит загрузку. Ставьте его перед проверкой `value()`. Иначе
проверка может прочитать значение ресурса по умолчанию и пройти не по той причине.

```ts
import { httpResource, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { flushEffects, settleResource } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // запрос уходит здесь, а не при создании ресурса
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

Разным ресурсам нужно разное ожидание:

| Ресурс                                 | Что нужно, чтобы значение появилось  |
| -------------------------------------- | ------------------------------------ |
| только что созданный `httpResource()`  | тик, иначе он **не отправит запрос** |
| `httpResource()` после `flush` ответа  | один тик и одна микрозадача          |
| `resource()` с асинхронным загрузчиком | два таких круга                      |

`settleResource` покрывает две последние строки. Первая — это строка `flushEffects()` выше:
`httpResource` ничего не отправит, пока что-то не сделает тик, и `expectOne` ничего не найдёт.
Обычному `resource()` `flush` не нужен: достаточно `await settleResource(data)`.

| Опция       | Тип       | По умолчанию | Смысл                                                        |
| ----------- | --------- | ------------ | ------------------------------------------------------------ |
| `turns`     | `number`  | `20`         | сколько кругов пробовать до ошибки; `0` — проверить один раз |
| `label`     | `string`  | —            | имя в тексте ошибки                                          |
| `allowIdle` | `boolean` | `false`      | считать `idle` завершённым состоянием                        |

- Ожидание заканчивается на `resolved` и на `error`. Ошибку проверяйте через `toHaveResourceError`.
- Каждый круг — тик плюс микрозадача. С третьего круга добавляется ещё оборот цикла событий, так
  что загрузчик на настоящем таймере или `rxResource` поверх `timer(0)` тоже дождутся.
- По истечении ошибка называет ресурс и недостающий `flush`.

`idle` проваливает ожидание, а не проходит: загрузчик так и не запустился, обычно потому что
`params()` вернул `undefined`. Если `idle` — это то, что вы проверяете, передайте
`{ allowIdle: true }`.

```ts
const productId = signal<string | undefined>(undefined); // спека его так и не задала
const product = TestBed.runInInjectionContext(() =>
  resource({ params: () => productId(), loader: loadProduct, defaultValue: EMPTY_PRODUCT }),
);

await settleResource(product, { label: 'the product resource' });
// [vitest-auto-spy] settleResource: the product resource never started — its status is 'idle', so
// the loader has not run and `value()` is still the default every assertion below is about to read.
```

::: tip Одна строка на HTTP-запрос: `vitest-auto-spy/angular-http`
Когда ожидание привязано к одному запросу, [`expectRequest()`](/ru/adapters/angular-http) делает
тик, `expectOne`, `flush` и ожидание одной строкой:

```ts
import { expectRequest } from 'vitest-auto-spy/angular-http';

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]);
```

Это отдельная точка входа, потому что ей нужен `@angular/common` — необязательная
peer-зависимость. `settleResource` остаётся инструментом для `resource()`, `rxResource()`,
перезагрузок и всего, что не идёт через HTTP.
:::

**Частая ошибка:** ждать через `flushEventLoopUntil`. Он крутит настоящие обороты цикла событий и
никогда не делает тик, так что `httpResource` не отправит запрос и ожидание провалится.

### `httpResource()`, который живёт на компоненте {#an-httpresource-that-lives-on-a-component}

В приложении ресурс обычно — поле компонента. `renderShallow` даёт ему контекст внедрения, а первое
обнаружение изменений отправляет запрос. Ожидание то же самое.

```ts
@Component({
  selector: 'app-product-list',
  template: `
    @for (product of products.value(); track product.id) {
      <li class="product">{{ product.name }}</li>
    }
  `,
})
export class ProductListComponent {
  readonly query = signal('');
  readonly products = httpResource<Product[]>(() => `/api/products?q=${this.query()}`, { defaultValue: [] });
}
```

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { flushEffects, renderShallow, settleResource, stable } from 'vitest-auto-spy/angular';
import { registerResourceMatchers } from 'vitest-auto-spy/angular/matchers';

registerResourceMatchers(); // один раз, в setup-файле

it('renders what it loaded, and re-requests when the query changes', async () => {
  const { fixture, component } = renderShallow(ProductListComponent, {
    providers: [provideHttpClient(), provideHttpClientTesting()],
    keepTemplate: true,
  });
  const httpTesting = TestBed.inject(HttpTestingController);

  // первое обнаружение изменений в renderShallow уже отправило запрос
  expect(component.products).toBeLoading();

  httpTesting.expectOne('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);

  await stable(fixture); // до этого представление отстаёт от значения на кадр
  expect(fixture.nativeElement.querySelectorAll('.product')).toHaveLength(1);

  component.query.set('anv');
  flushEffects(); // здесь читается новый params(), и уходит второй запрос

  httpTesting.expectOne('/api/products?q=anv').flush([]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([]);
});
```

Каждому изменению сигнала, который читает `params()`, нужен свой `flushEffects()` перед следующим
`expectOne`. Запрос отправляет обнаружение изменений, а не `set()`. С
[`expectRequest()`](/ru/adapters/angular-http) каждая такая пара становится одной строкой:

```ts
await expectRequest('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);

expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);
```

### Пропустить запрос целиком — `mockResourceProp` {#skipping-the-request-entirely-—-mockresourceprop}

`mockResourceProp` заменяет свойство-ресурс подменой, которую вы двигаете руками. Берите его, когда
спека проверяет собственную логику компонента, а запрос ей не важен.

```ts
import { injectSpy, mockResourceProp } from 'vitest-auto-spy/angular';

const service = injectSpy(ProductService);
const products = mockResourceProp(service, 'products', []);

expect(component.emptyState()).toBe(true);

products.set([product]); // статус → 'resolved'
expect(component.emptyState()).toBe(false);

products.loading(); // статус → 'loading', значение остаётся
expect(component.spinner()).toBe(true);

products.fail('offline'); // статус → 'error', error() → Error('offline'), hasValue() → false
expect(component.errorMessage()).toBe('offline');

products.idle(); // статус → 'idle', снова начальное значение
expect(component.placeholder()).toBe(true);
```

Ничего не летит по сети, так что ждать нечего. Подмена стартует в статусе `'resolved'` с начальным
значением. Чтобы начать с другого статуса, передайте его:
`mockResourceProp(service, 'products', [], { status: 'idle' })`. Подходит любой статус, кроме
`'error'`; для ошибки вызовите `fail()`, он принимает причину.

Подмена построена на настоящих `signal()`, поэтому `computed()`, читающий `products.value()`,
пересчитывается, а `effect()`, следящий за `products.status()`, выполняется.

| Член хендла   | Что делает                                                         |
| ------------- | ------------------------------------------------------------------ |
| `set(value)`  | завершить со значением; сбрасывает ошибку                          |
| `fail(error)` | упасть с `Error` или строкой-сообщением                            |
| `loading()`   | снова в полёт, значение не трогается                               |
| `idle()`      | назад, как до первого запуска, с начальным значением               |
| `reload`      | спай `reload()`: проверяйте вызов; повторно ничего не отправляется |
| `resource`    | установленная подмена, чтобы проверять её напрямую                 |

В свойстве лежит целый `ResourceRef`, потому что тестируемый код пользуется обеими половинами
(например `asReadonly()` или оптимистичным обновлением через ресурс). Каждый член ведёт себя как у
Angular:

| У подмены                | Что делает                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `value`                  | записываемый сигнал; `value.set` / `value.update` переводят статус в `'local'`               |
| `set(v)` / `update(fn)`  | та же запись, в написании Angular                                                            |
| `hasValue()`             | `true`, кроме статуса `'error'` и значения `undefined`                                       |
| `snapshot()`             | `{ status, value }` или `{ status: 'error', error }` — то, что читает `@switch`              |
| `asReadonly()`           | та же подмена                                                                                |
| `destroy()`              | назад в `'idle'` с начальным значением; дальнейшие записи тестируемого кода ничего не делают |
| `value()` после `fail()` | бросает ошибку, как настоящий упавший ресурс                                                 |
| `reload()`               | спай: `false` в `'idle'` и `'loading'`, иначе `true`; повторно ничего не отправляется        |

```ts
products.fail('offline');

expect(() => products.resource.value()).toThrow(); // как у настоящего ресурса
expect(component.errorMessage()).toBe('offline'); // код, который сначала проверяет hasValue(), работает
```

Чтобы задать результат `reload()`, используйте `reload.mockReturnValue(…)`.

**Частая ошибка:** ждать, что `hasValue()` следует за статусом. Он следует за значением: у ресурса с
`defaultValue` значение есть и в `loading`, и в `reloading`, и в `idle`. Поэтому шаблон
`@if (products.hasValue()) { … } @else { <spinner/> }` показывает список, пока грузится следующая
страница.

`restoreMockedProps()` снимает подмену, как любую другую заплатку свойства, так что проекту с
`setupAutoSpy()` своя очистка не нужна.

## Проверки на ресурсе {#asserting-a-resource}

`registerResourceMatchers()` добавляет три матчера, которые проверяют значение **и** статус вместе.

```ts
import { registerResourceMatchers } from 'vitest-auto-spy/angular/matchers';

registerResourceMatchers(); // один раз, в setup-файле

expect(component.products).toBeLoading();

httpTesting.expectOne('/api/products').flush([product]);
await settleResource(component.products);

expect(component.products).toHaveResourceValue([product]);
expect(other.products).toHaveResourceError(/503/);
```

`toHaveResourceValue` **проваливает ресурс, который не завершился, даже если значение по умолчанию
совпадает**. `expect(products.value()).toEqual([])` проходит и для ресурса, который ещё грузится со
значением по умолчанию `[]`, и для ресурса, который действительно вернул пустой список. Провал
называет настоящий статус и недостающий `flush`.

Матчеры принимают всё, что похоже на `{ status, value, error? }`: `httpResource`, `resource`,
`rxResource` и подмену `mockResourceProp`.

**Частая ошибка:** передать `products.value()` вместо `products` или свойство, которое не ресурс.
Матчер **бросает** ошибку и называет, что получил. Он бросает, а не проваливает проверку, потому
что `.not` превратил бы провал в успех:

```ts
expect(products.value()).not.toBeLoading(); // прошло бы и ничего не проверило
```

[`toHaveFocus`](#focus-assertions) и [`toHaveDirectiveApplied`](#tohavedirectiveapplied) по той же
причине бросают на неверном аргументе.

## Проверка сигнала {#asserting-a-signal}

`toHaveSignalValue` читает сигнал и сравнивает его значение.

```ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';

registerSignalMatchers(); // один раз, в setup-файле

expect(component.total).toHaveSignalValue(3);
expect(component.items).toHaveSignalValue([{ id: 1 }]);
expect(component.buttonConfig).toHaveSignalValue({ label: 'Save', color: undefined }, { strict: true });
```

Сравнение как у `toEqual`: свойство `undefined`, дырка в массиве и класс объекта не учитываются.
`{ strict: true }` сравнивает как `toStrictEqual`. Чтобы все `toHaveSignalValue` сравнивали строго,
вызовите `registerSignalMatchers({ strict: true })`; отдельная проверка может отказаться через
`{ strict: false }`.

Правило ESLint [`prefer-to-have-signal-value`](/ru/utilities/eslint-rules#prefer-to-have-signal-value)
переписывает `expect(component.total()).toBe(3)` на матчер.

**Частые ошибки:**

- `expect(component.total).toBeTruthy()`. Сигнал — функция, поэтому это проходит для любого
  сигнала. Матчер отвергает всё, что не геттер без аргументов.
- Передать спай, например `expect(service.load).toHaveSignalValue(undefined)`. Матчер бросает
  ошибку, не вызывая его, поэтому лишний вызов не записывается. Поставьте на свойство настоящий
  сигнал через [`mockSignalProp`](#driving-a-signal).
- Компонент при создании копирует член подмены в своё поле
  (`readonly count = inject(Store).count`). Он навсегда держит то, что было у подмены в тот момент,
  и поздняя заплатка до него не дотянется. Задайте сигнал до рендера:

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(Store, { overrides: { count: signal(3) } })] });
```

## Мокирование свойств-сигналов и readonly-свойств {#signal-readonly-property-mocking}

Эти хелперы заменяют свойство объекта на время одного теста. Они работают на readonly-свойстве,
геттере или поле-сигнале, где обычное присваивание не компилируется или не срабатывает.

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true); // фиксированное значение, сигналы тоже
mockReadonlyPropGetter(service, 'label', () => 'A'); // геттер, вычисляется при каждом чтении
mockValueProp(service, 'retries', 3); // обычное записываемое значение
mockAccessorsProp(service, 'theme'); // спаи на get и set
```

| Хелпер                                  | Что делает                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `mockReadonlyProp(obj, key, value)`     | фиксированное значение, сигналы тоже                                        |
| `mockReadonlyPropGetter(obj, key, get)` | геттер, который вызывается при каждом чтении                                |
| `mockValueProp(obj, key, value)`        | обычное записываемое значение                                               |
| `mockAccessorsProp(obj, key, impls?)`   | спаи на геттер и сеттер                                                     |
| `mockSignalProp(obj, key, initial)`     | настоящий записываемый сигнал; см. [Управление сигналом](#driving-a-signal) |
| `restoreMockedProps()`                  | снять все заплатки                                                          |
| `countMockedProps()`                    | сколько заплаток ещё стоит                                                  |

`mockReadonlyProp`, `mockReadonlyPropGetter`, `mockValueProp` и `mockAccessorsProp` ещё и
возвращают отмену своей заплатки — для заглушки, которую надо снять внутри одного теста. [`setupAutoSpy()`](/ru/utilities/setup) сам вызывает `restoreMockedProps()` после
каждого теста. Это важно, когда объект живёт дольше файла спеки (глобальный объект, прототип,
синглтон), а под `isolate: false` так всегда.

**Частая ошибка:** пропустить `restoreMockedProps()` под `isolate: false`. Заплатки остаются, и
каждый изменённый объект держится в памяти весь прогон.

В этих хелперах нет ничего специфичного для Angular: их экспортирует и корневая точка входа
`vitest-auto-spy`.

### Управление сигналом {#driving-a-signal}

`mockSignalProp` ставит на свойство настоящий записываемый сигнал и возвращает его хендл
(`WritableSignal`). Нужен для поля `signal()` или `computed()` у подменённого сервиса:
`createSpyFromClass` читает прототип, а поля-сигналы там не лежат. У спая такого поля нет, поэтому
вызывайте `mockSignalProp` **до** первого рендера или `stable(fixture)`.

```ts
import { injectSpy, mockSignalProp, stable } from 'vitest-auto-spy/angular';

const service = injectSpy(CounterService);
const count = mockSignalProp(service, 'count', 0);

expect(component.label()).toBe('0 items');

count.set(42);
await stable(fixture);

expect(component.label()).toBe('42 items');
```

Сигнал из `@angular/core`, поэтому `computed()` ниже по цепочке пересчитывается, `effect()`
выполняется, шаблон обновляется. Это то же самое, что пара строк ниже, только хендл возвращается:

```ts
const count = signal(0);
mockReadonlyProp(service, 'count', count);
```

Для подмены `signalStore` с несколькими сигналами `mockSignalProps` задаёт их одним вызовом и
возвращает хендл на каждый ключ. Неизвестный ключ или значение не того типа не скомпилируются.

```ts
import { mockSignalProps } from 'vitest-auto-spy/angular';

const { items, loading } = mockSignalProps(injectSpy(CartStore), { items: [], total: 0, loading: false });

loading.set(true);
```

Что происходит с каждым видом члена:

| Член                                                                                                | Что происходит                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| настоящий `signal()`, `model()`, `linkedSignal()` или их `.asReadonly()`                            | запись на месте; порядок неважен, у `model()` сохраняется выход     |
| поле-сигнал на спае (у спая его нет, пока вы его не добавите) или `computed()`, объявленный классом | добавляется или заменяется; сделать это нужно **до** первого чтения |
| `computed()`, который уже кто-то прочитал                                                           | ошибка; управляйте сигналом, который читает этот `computed()`       |
| `input()`                                                                                           | ошибка; используйте `setInputs` или `inputs` у `renderShallow`      |

Сервис обычно публикует readonly-представление приватного сигнала. Его тоже пишут на месте:

```ts
export class CounterService {
  readonly #count = signal(0);
  readonly count = this.#count.asReadonly(); // mockSignalProp пишет в приватный сигнал
}
```

Angular связывает потребителя с сигналом, который тот прочитал, а не со свойством. Запись на месте
держит в актуальном состоянии все `computed()`, `effect()` и привязки, которые уже прочитали сигнал.
Для сигнала, записанного на месте, `restoreMockedProps()` возвращать нечего: значение остаётся там,
где его оставила спека. Добавленный или заменённый сигнал `restoreMockedProps()` снимает, как любую
другую заплатку.

**Частая ошибка:** `service.count.set(1)` на спае. У `Signal<T>` нет `set`, поэтому это
компилируется только с приведением типа. Пользуйтесь хендлом от `mockSignalProp`.

## Заплата на свойство спая {#patching-a-property-of-a-spy}

Хелперы `mock*Prop` принимают `Spy<T>`, который возвращает `injectSpy`. Значение проверяется по
собственному типу члена, поэтому настоящий сигнал подходит члену-сигналу.

```ts
const playback = injectSpy(PlaybackStateService);

mockSignalProp(playback, 'navigationState', 'idle'); // настоящий записываемый сигнал
mockReadonlyProp(playback, 'currentItem', signal(item));
```

Для геттера, который возвращает сигнал, берите `mockSignalProp`, а не `gettersToSpyOn`. Спай-геттер
возвращает `undefined`, пока его не настроят; настоящий сигнал сохраняет реактивность всех
`computed()` и `effect()` ниже по цепочке.

## Запуск одного эффекта по требованию {#running-one-effect-on-demand}

`runEffect` выполняет один конкретный эффект прямо сейчас. Нужен, когда триггер эффекта заменили
статичным сигналом: сам он никогда не станет «грязным», и `flushEffects()` его пропустит.

```ts
import { signal } from '@angular/core';
import { mockReadonlyProp, runEffect } from 'vitest-auto-spy/angular';

mockReadonlyProp(component, 'state', signal(State.Selected));

runEffect(component.highlightEffect);

expect(component.icon()).toBe('starFilled');
```

- Тело выполняется с текущими значениями сигналов, эффект не помечается чистым. Следующий `flush`
  ведёт себя как обычно.
- Сначала выполняется очистка прошлого запуска, там же, где её выполняет Angular. Так спека
  проверяет колбэк `onCleanup`:

```ts
runEffect(component.subscription); // здесь срабатывает очистка от прошлого запуска

expect(component.unsubscribed).toBe(true);
```

- Уничтоженный эффект (после `fixture.destroy()` или `effectRef.destroy()`) бросает ошибку. Angular
  его больше никогда не выполнит, поэтому запуск там проверяет то, чего не бывает в продакшене.
  Поднимите вызов выше `destroy()`.

Если новая версия Angular поменяет внутренности, которые читает `runEffect`, он бросит ошибку и
предложит проверять **результат** эффекта: задать сигналы, которые он читает,
`await stable(fixture)`, проверить итог. Такая форма и так надёжнее.

**Частая ошибка:** `vi.mock('@angular/core')`, чтобы заменить `effect()`. Под unit-test билдером это
может работать, но только без спреда объекта в фабрике и никогда — с относительным путём. См.
[моки модулей под unit-test билдером](/ru/guides/angular-unit-test-builder#module-mocks-under-the-unit-test-builder).

## Подсчёт пересчётов и прогонов эффекта {#counting-recomputations-and-effect-runs}

`trackRecomputations` и `trackEffectRuns` считают, сколько раз пересчитался `computed()` или
выполнился эффект. С ними можно проверить «это не пересчиталось», чего проверка значения не покажет.

```ts
import { stable, trackEffectRuns, trackRecomputations } from 'vitest-auto-spy/angular';

const recomputed = trackRecomputations(component.total);
const synced = trackEffectRuns(component.syncEffect);

component.unrelatedFilter.set('open');
await stable(fixture);

expect(component.total()).toBe(42);
expect(recomputed.count).toBe(0);
expect(synced.count).toBe(0);
```

- Оба возвращают `{ count, stop() }`. `count` живой. `stop()` снимает подсчёт; то же делают
  `restoreMockedProps()` и `setupAutoSpy()`.
- `trackRecomputations` считает вычисления, а не чтения. Принимает `computed()` или `linkedSignal()`;
  на обычном `signal()` бросает ошибку и называет подходящий хелпер.
- `trackEffectRuns` считает каждый запуск: `flush` планировщика, `stable(fixture)`, `runEffect()`.

## Подмена провайдера, который компонент объявляет сам {#overriding-a-provider-the-component-declares-for-itself}

Провайдер из `@Component({ providers: [...] })` побеждает `provideAutoSpy` тестового модуля.
Компонент получает настоящий сервис, и никто об этом не сообщает. Чтобы поставить спай на сам
компонент, возьмите `overrideComponentProvider`:

```ts
import { TestBed } from '@angular/core/testing';
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

// компонент создаётся из шаблона родителя, поэтому его нет в `imports`
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // Spy<NavigationBuilderService>

// или, когда компонент уже есть в тестовом модуле
TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(
  PaymentMethodService,
  overrideAutoSpy(PaymentMethodService),
);
```

Симптом далеко от причины. В одном известном случае логгер настоящего сервиса падал с
`TypeError: Cannot read properties of undefined (reading 'pipe')`, и ни компонент, ни спай в
сообщении не упоминались.

Что выбрать:

- `overrideComponentProvider(Component, Service)`, когда спеке нужен спай на уровне компонента. Он
  же добавляет компонент в тестовый модуль (импортом, если он standalone, иначе объявлением). Сам
  по себе `overrideProvider` не дотягивается до standalone-компонента, созданного из шаблона
  родителя.
- `TestBed.overrideComponent(X, { remove: { providers: [Service] } })`, когда модуль уже даёт спай,
  а собственная запись компонента мешает.
- `overrideProvider(X, overrideAutoSpy(X))` для компонента, который уже есть в тестовом модуле.
  `overrideProvider(X, provideAutoSpy(X))` тоже работает; `overrideAutoSpy` просто прямо говорит,
  что делает, и возвращает спай.

При следующем `TestBed.createComponent` `overrideComponentProvider` проверяет, что инжектор
компонента действительно отдаёт спай. См. [Подмена провайдеров компонента](/ru/adapters/angular-overrides).

**Частая ошибка:** `TestBed.overrideComponent`, чтобы поменять здесь другие метаданные. Он запускает
перекомпиляцию в JIT, и в AOT-сборке тестов перекомпилированный компонент теряет свои директивы и
пайпы; см. [NgModule, который ничего не привносит](/ru/adapters/angular-troubleshooting#an-ngmodule-that-contributes-nothing).

## Хост для директивы под тестом {#a-host-for-a-directive-under-test}

`createDirectiveHost` строит standalone-компонент-хост для директивы с типизированными свойствами.

```ts
import { TestBed } from '@angular/core/testing';
import { createDirectiveHost } from 'vitest-auto-spy/angular';

const Host = createDirectiveHost({
  template: `<div [appTruncate]="enabled" [truncateText]="text"></div>`,
  scope: [DirectivesModule],
  props: { enabled: false, text: 'hello' },
});

TestBed.configureTestingModule({ imports: [Host] });

const fixture = TestBed.createComponent(Host);
fixture.componentInstance.enabled = true; // тип берётся из `props`
```

| Опция      | Что это                                                        |
| ---------- | -------------------------------------------------------------- |
| `template` | шаблон хоста                                                   |
| `scope`    | собственные `imports` хоста: директива или её `NgModule`       |
| `props`    | свойства хоста; из них берётся тип `fixture.componentInstance` |

Хост всегда standalone и держит модуль в собственных `imports`. Под unit-test билдером это важно:
`NgModule` в `TestBed.configureTestingModule({ imports })` там ничего не привносит, а в
`@Component({ imports })` работает. Хост со `standalone: false`, написанный в спеке, ещё хуже: он
компилируется вообще без области видимости, даже без `NgClass` и `AsyncPipe`.

В Angular 22.2 и новее директиве, которой не нужны статичный атрибут хоста, `TemplateRef` и соседняя
разметка, хост не нужен вовсе: `TestBed.createDirective(Dir, { tagName, bindings })` сам создаёт
элемент. `stable`, `hostElement` и `toHaveDirectiveApplied` принимают его `DirectiveFixture`.
`setInputs` не принимает, потому что `componentRef` нет: привяжите сигнал через `inputBinding` и
меняйте сигнал.

### `toHaveDirectiveApplied` {#tohavedirectiveapplied}

`toHaveDirectiveApplied` проверяет, что директива действительно работает на элементе.

```ts
import { registerDirectiveMatchers } from 'vitest-auto-spy/angular/matchers';

registerDirectiveMatchers(); // один раз, в setup-файле

expect(fixture).toHaveDirectiveApplied(TruncateDirective, 'div');
```

Angular плохо сообщает о директиве вне области видимости: `NG0303` указывает на правильный
`@NgModule`, `NG0304` называет директиву компонентом, а атрибутная директива без привязки не
сообщает ничего. Провал матчера называет причину и исправление.

- Принимает `ComponentFixture`, `DirectiveFixture` или `DebugElement`. На всём остальном бросает
  ошибку.
- Ищет в корневом элементе фикстуры и во всём, что под ним. Запись `hostDirectives` тестируемого
  компонента учитывается.
- Структурная директива (`*dir`, `<ng-template dir>`) тоже учитывается. Проверяйте её **без**
  селектора: элемент, который она рендерит, её не несёт.
- Подсказка зависит от фикстуры. Для тестируемого компонента — добавить директиву в его
  `hostDirectives` или `imports`. Для хоста от `createDirectiveHost` или `TestBed.createDirective` —
  `createDirectiveHost({ template, scope })`. Если директива уже в области видимости, матчер печатает
  её селектор: не совпадает именно он.
- `schemas: [NO_ERRORS_SCHEMA]` рядом со standalone-компонентом ничего не делает; провал об этом
  скажет.

Им удобно охранять атрибут, который даёт запись `hostDirectives`. Проверка только атрибута остаётся
зелёной, если запись убрали, а атрибут пишется где-то ещё:

```ts
const fixture = TestBed.createComponent(CardComponent); // hostDirectives: [TestIdDirective]

expect(fixture).toHaveDirectiveApplied(TestIdDirective); // без селектора: считается корневой элемент
expect(hostElement(fixture).getAttribute('data-testid')).toBe('card');
```

## `window` и `document`, не теряя настоящих {#window-and-document-without-losing-the-real-one}

`provideWindowDouble` и `provideDocumentDouble` переопределяют несколько членов `window` или
`document` и оставляют остальное от настоящего объекта jsdom. Самописная подмена знает только те
члены, о которых подумал её автор, и чтение `screen.colorDepth` или вызов `document.createElement`
получают `undefined`.

```ts
import { TestBed } from '@angular/core/testing';
import { provideDocumentDouble, provideWindowDouble } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 } }), provideDocumentDouble({ visibilityState: 'hidden' })],
});
```

| Вызов                                                                 | Что делает                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `provideWindowDouble(token, overrides?)`                              | `FactoryProvider` под токеном window вашего приложения                      |
| `provideDocumentDouble(overrides?, token?)`                           | то же под `DOCUMENT` из Angular или под вашим токеном                       |
| `createWindowDouble(overrides?)` / `createDocumentDouble(overrides?)` | те же подмены без `TestBed`, для `new LayoutProbe(win)` или обычной функции |

- **Хелпер для window принимает ваш токен.** В Angular есть `DOCUMENT`, но нет `WINDOW`, поэтому
  каждое приложение объявляет свой `InjectionToken<Window>`. Переопределения проверяются по типу
  токена.
- **Обычный объект сливается, всё остальное заменяет.** `{ screen: { width: 1920 } }` оставляет
  `screen.colorDepth` настоящим. `vi.fn()`, массив, `URL` или экземпляр класса заменяют член целиком.
  Слияние идёт на три уровня вглубь.
- **Восстанавливать нечего.** Настоящие `window` и `document` не меняются. Подмена — представление
  поверх них, и каждая запись попадает в представление. Чтобы поменять значение посреди теста,
  используйте `Object.assign(TestBed.inject(WINDOW), { scrollY: 40 })` (lib.dom помечает большинство
  членов `readonly`).
- **Фабрика, а не `useValue`.** Каждый инжектор строит свою подмену, так что записи одного теста не
  доходят до следующего.
- **Методы сохраняют свой `this`; конструкторы возвращаются как есть.** `win.Date.now()`,
  `win.Promise.resolve()` и `new win.Event('resize')` работают, и `win.Event === window.Event`, так
  что проверки `instanceof` выполняются.
- **`location` принимает переопределения, как любой член.**

```ts
const win = TestBed.inject(WINDOW); // provideWindowDouble(WINDOW, { location: { reload } })

win.location.href = '/checkout'; // двигает подмену, а не адресную строку
expect(reload).toHaveBeenCalled(); // location.origin по-прежнему от jsdom
```

`createWindowSpies` создаёт типизированные спаи для выбранных `void`-методов, включая вложенные члены window. Они возвращают `undefined`.

```ts
import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { createWindowSpies, provideWindowDouble } from 'vitest-auto-spy/angular/doubles';

const WINDOW = new InjectionToken<Window>('WINDOW');
const spies = createWindowSpies({ location: ['reload'], parent: ['postMessage'] });
TestBed.configureTestingModule({
  providers: [provideWindowDouble(WINDOW, { ...spies, location: { ...spies.location, hostname: 'tv.kion.ru' } })],
});
const win = TestBed.inject(WINDOW);
win.location.reload();
win.parent.postMessage('ready', '*');
expect(spies.location.reload).toHaveBeenCalledOnce();
expect(spies.parent.postMessage).toHaveBeenCalledWith('ready', '*');
```

Для методов самого window передайте массив: `createWindowSpies(['close', 'focus'])`. Каждый вызов создаёт новые спаи.
Объект, возвращаемый `createWindowSpies`, содержит только выбранные методы. Типы параметров и хелперы спаев сохраняются.
Для методов, возвращающих значение, используйте `createFunctionSpy` и настройте ответ явно.
При добавлении значений location скопируйте и `spies.location`; иначе потеряете спай reload.

`mockValueProp(win, 'innerWidth', 800)` тоже работает на подмене и не трогает глобальный объект.

Чтобы **заменить** глобальный класс, передайте [`mockConstructor`](/ru/utilities/constructor-doubles)
со статическими полями, которые объявляет класс. Тип их требует, потому что код вида
`source.readyState === EventSource.OPEN` иначе сравнивал бы с `undefined`:

```ts
import { createMock, mockConstructor } from 'vitest-auto-spy';

const FakeSource = Object.assign(
  mockConstructor((url: string | URL) => createMock<EventSource>({ url: String(url) })),
  { CONNECTING: 0, OPEN: 1, CLOSED: 2 } as const,
);

provideDocumentDouble({ defaultView: { EventSource: FakeSource } });
```

::: warning `provideDocumentDouble` доходит и до рендерера Angular
Рендерер тоже получает `DOCUMENT` через DI. Замена `createElement` или `body` меняет то, как
строится фикстура, а не только то, что читает компонент. Переопределяйте их, только когда вы этого
хотите.
:::

## Диалог Material — без Material в зависимостях {#the-material-dialog-without-material-as-a-dependency}

Три хелпера заменяют провайдеры, которые спека диалога пишет руками: данные в `MAT_DIALOG_DATA`,
подмену `MatDialogRef` и спай на `MatDialog`. У подмены ref рабочий `afterClosed()`, так что
компонент, который на него подписан, не падает.

```ts
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { expectEmission } from 'vitest-auto-spy/angular';
import { injectMatDialogRef, provideMatDialogData, provideMatDialogRef } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }), provideMatDialogRef(MatDialogRef)],
});

const dialog = injectMatDialogRef(MatDialogRef);

TestBed.createComponent(EditUserDialog).componentInstance.save();

expect(dialog.close).toHaveBeenCalledWith('saved');
await expect(expectEmission(dialog.ref.afterClosed())).resolves.toBe('saved');
```

`@angular/material` не входит в зависимости этого пакета. Токен и класс ref вы передаёте
аргументами, поэтому Material импортирует только ваша спека.

| Вызов                                     | Что делает                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `provideMatDialogData(token, data)`       | типизированный `{ provide, useValue }`; укажите аргумент типа, и данные проверятся по нему                 |
| `provideMatDialogRef(RefClass, init?)`    | `FactoryProvider`, новый ref на каждый инжектор; `init`: `closedWith`, `disableClose`, `componentInstance` |
| `injectMatDialogRef(RefClass, injector?)` | хендл: `.ref`, `.close` (спай), `emitClose(result?)`                                                       |
| `createMatDialogRef(RefClass, init?)`     | тот же хендл без `TestBed`; и ref, который возвращает подменённый `MatDialog.open()`                       |

### Как его открыть: `MatDialog` не нужна отдельная обёртка {#opening-one-matdialog-needs-no-helper-of-its-own}

`provideAutoSpy(MatDialog)` уже подменяет `MatDialog`. Пусть его `open()` возвращает подмену ref с
заранее заданным результатом, который выберет пользователь:

```ts
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { createMatDialogRef } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({ providers: [provideAutoSpy(MatDialog)] });

injectSpy(MatDialog).open.mockReturnValue(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).ref);

fixture.componentInstance.edit(); // открывает, подписывается на afterClosed(), получает 'saved'
```

Что знать о подмене ref:

- **`close` — это спай, и это та же функция, что у ref.** `expect(dialog.close)` и
  `expect(TestBed.inject(MatDialogRef).close)` — одна и та же проверка. `emitClose(result?)`
  закрывает диалог снаружи, как пользователь: потоки срабатывают, а спай ничего не записывает. Это
  единственный способ закрыть с `undefined`, а именно так выглядит отмена.
- **`afterClosed()` повторяет своё значение**, в отличие от обычного `Subject` у Material. Проверка,
  которая подписывается после того, как компонент закрыл диалог, всё равно его получит.
  `beforeClosed()` — тот же поток, а `afterOpened()` уже сработал и завершился.
- **Указывайте тип данных.** Material типизирует `MAT_DIALOG_DATA` как `InjectionToken<any>`, поэтому
  `useValue: null` компилируется для компонента, который читает `data.name`.
  `provideMatDialogData<EditUserData>(…)` проверяет данные. Не убирайте аргумент типа, даже если
  ругается `no-unsafe-argument`: без него данные снова станут `any`. Создавайте данные в каждом тесте,
  а не в константе модуля.
- **Тип ref указывайте аргументом типа**, а не выражением инстанцирования:
  `injectMatDialogRef<MatDialogRef<NameInputDialog, string>>(MatDialogRef)`. Форма
  `injectMatDialogRef(MatDialogRef<NameInputDialog, string>)` вернёт хендл с типом `any`. То же для
  `createMatDialogRef` и `provideMatDialogRef`.
- **Передавайте `componentInstance`, когда открывающий код управляет диалогом.** Он проверяется по
  компоненту диалога, который назван в типе ref:

  ```ts
  const save = new EventEmitter<string>();
  const dialog = createMatDialogRef<MatDialogRef<NameInputDialog, string>>(MatDialogRef, {
    componentInstance: { save, isSaving: signal(false) },
  });

  injectSpy(MatDialog).open.mockReturnValue(dialog.ref);

  component.rename(); // подписывается на componentInstance.save
  save.emit('Grace');

  expect(dialog.close).toHaveBeenCalledWith('Grace');
  ```

- **Остальные члены бросают ошибку с именем.** `backdropClick`, `keydownEvents`, `updateSize`,
  `updatePosition`, `getState`, `componentRef` и `id` — дело настоящего диалога: для них берите
  `MatDialogModule` с настоящим `MatDialog`. Незаданный `componentInstance` тоже бросает ошибку и
  называет поле `init`.

Другие подмены, которые собственные спеки Material пишут руками (`ScrollStrategy`,
`MAT_ICON_LOCATION`, `MATERIAL_ANIMATIONS`, `ScrollDispatcher`), отдельных хелперов не требуют; см.
[Идиомы Material](/ru/guides/angular-material-idioms).

## Подмены платформы, санитайзера, детектора изменений и оверлея CDK {#platform-sanitizer-change-detector-and-cdk-overlay-doubles}

Ещё четыре провайдера из `vitest-auto-spy/angular/doubles`, которые большие проекты пишут руками:

```ts
import { TestBed } from '@angular/core/testing';
import {
  provideChangeDetectorRefDouble,
  provideDomSanitizerDouble,
  provideOverlayDouble,
  providePlatform,
} from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [
    providePlatform('server', { isBrowser: IS_BROWSER }), // PLATFORM_ID и ваш флаг, согласованные
    provideDomSanitizerDouble(), // injectSpy(DomSanitizer): спаи bypass возвращают настоящие безопасные значения
    provideChangeDetectorRefDouble(), // injectSpy(ChangeDetectorRef): четыре спая, отвечающих undefined
    provideOverlayDouble(Overlay), // injectOverlayDouble(Overlay).lastRef().emitBackdropClick()
  ],
});
```

| Вызов                                                                          | Что делает                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `providePlatform('browser' \| 'server', { isBrowser?, isServer? })`            | `PLATFORM_ID` и ваши булевы токены, выставленные так, чтобы не противоречить ему         |
| `provideDomSanitizerDouble()` / `createDomSanitizerDouble()`                   | `Spy<DomSanitizer>`; `injectSpy(DomSanitizer)` его читает                                |
| `provideChangeDetectorRefDouble()` / `createChangeDetectorRefDouble()`         | `Spy<ChangeDetectorRef>`: `markForCheck`, `detach`, `detectChanges`, `reattach`          |
| `provideOverlayDouble(Overlay, init?)` / `createOverlayDouble(Overlay, init?)` | подмена `Overlay` из CDK; `init.componentInstance` — то, что вернёт `attach(…).instance` |
| `injectOverlayDouble(Overlay, injector?)`                                      | хендл подмены в инжекторе (в `TestBed`, если не передан свой)                            |

- **Флаги платформы — ваши собственные токены.** В Angular нет `IS_PLATFORM_BROWSER`, поэтому
  `providePlatform` принимает ваш токен и выставляет его по имени платформы.
- **Спаи `bypassSecurityTrust*` санитайзера возвращают настоящие безопасные значения Angular**, так
  что шаблон, который их привязывает, рендерится. `sanitize` их разворачивает и на неверном контексте
  бросает ошибку Angular `Required a safe HTML, got a Style`. Обычная строка возвращается как есть:
  разметку подмена не вычищает.
- **Провайдер `ChangeDetectorRef` доходит только до того, что создаёт инжектор окружения**: сервис,
  пайп, созданный через `TestBed.runInInjectionContext(() => new Pipe())`, или класс, которому вы
  передали `createChangeDetectorRefDouble()`. Класс, который создаёт шаблон, получает детектор от
  своего представления. Спаи помечены как отвечающие `undefined`, поэтому `strict` принимает их
  ненастроенными.
- **Подмена оверлея структурная.** `@angular/cdk` не входит в зависимости, поэтому вы передаёте свой
  класс `Overlay`. Каждый `create()` записывает ref (`refs`, `lastRef()`). Каждое звено цепочки
  `position()` возвращает цепочку, а `positionCalls()` перечисляет вызовы. Все четыре
  `scrollStrategies` на месте. Потоки молчат, пока их не запустят `emitBackdropClick()`,
  `emitKeydown(event)` или `emitOutsidePointer()`; `dispose()` их завершает.

```ts
const overlay = injectOverlayDouble(Overlay);

component.openMenu();
overlay.lastRef().emitBackdropClick();

expect(overlay.lastRef().dispose).toHaveBeenCalled();
```

**Частые ошибки:** `lastRef()` до того, как что-то открыло оверлей, бросает
`nothing called Overlay.create() yet`. `injectOverlayDouble()` бросает, если более поздний провайдер
заменил подмену; ставьте `provideOverlayDouble(Overlay)` последним.

## На что спека тратит время {#where-a-spec-spends-its-time}

`enableTestBedDiagnostics` печатает для каждого файла спеки, сколько времени ушло в `TestBed`, а
сколько в ваш код. По нему видно, какие спеки стоит переводить на
[`renderShallow`](#shallow-component-rendering).

```ts
// vitest.setup.ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
```

```text
[vitest-auto-spy] src/app/…/form-editor.component.spec.ts — TestBed 353ms of 661ms (53%), logic 308ms, 155 component(s), 132 module config(s)
```

Время `TestBed` — это настройка модуля, компиляция шаблонов и создание компонентов.

| Опция          | По умолчанию   | Смысл                                               |
| -------------- | -------------- | --------------------------------------------------- |
| `report`       | строка на файл | получает объект `SpecTiming`; собирайте замеры сами |
| `minTestBedMs` | `0`            | молчать о файлах дешевле этого                      |

`disableTestBedDiagnostics()` возвращает исходный `TestBed`. `instrumentTestBed()`,
`getTestBedTiming()`, `formatSpecTiming()` и `reportSpecTiming()` — строительные блоки для проекта,
которому нужны цифры без строки на файл. Часы захватываются при импорте, поэтому спека с
`vi.useFakeTimers()` всё равно измеряется. Отчёт идёт в `process.stdout`, потому что
[`vitest-auto-spy/console`](/ru/utilities/console) глушит `console.info`.

## Zone и zoneless в одном прогоне {#zone-and-zoneless-in-the-same-run}

`setupAngularTestEnv` выбирает zone.js или zoneless для каждого файла спеки. Пригодится, пока
репозиторий переходит на zoneless по одной библиотеке за раз.

```ts
// vitest-setup.ts
import { setupZoneTestEnv, setupZonelessTestEnv } from 'jest-preset-angular/setup-env';
import { setupAngularTestEnv } from 'vitest-auto-spy/angular';

setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/catalog/') || testPath.includes('/apps/storefront/'),
  initZone: setupZoneTestEnv,
  initZoneless: setupZonelessTestEnv,
});
```

| Опция          | Что это                                              |
| -------------- | ---------------------------------------------------- |
| `zoneless`     | функция: путь файла спеки → `true`, если он zoneless |
| `initZone`     | ваш инициализатор для файлов на zone.js              |
| `initZoneless` | ваш инициализатор для zoneless-файлов                |

Без него под `isolate: false` второй файл в другом режиме падает с
`Cannot set base providers because it has already been called`. `test.projects` из Vitest не
поможет: воркер всё равно может получить файлы обоих режимов.

Когда следующему файлу нужен другой режим, хелпер сносит окружение и запускает другой
инициализатор. Режим запоминается на воркер, поэтому файлы в одном режиме инициализируются один
раз. Если платформу тем временем снёс кто-то другой, окружение инициализируется заново.

Инициализаторы остаются вашими: `@analogjs/vitest-angular`, `jest-preset-angular` или свой
`initTestEnvironment`. Ни один из них не входит в зависимости библиотеки.

## Решение проблем {#troubleshooting}

- Спека падает до вашего кода или с ошибкой, которая ваш код не упоминает:
  [Angular: решение проблем](/ru/adapters/angular-troubleshooting).
- Особенности `ng test` (что компилирует билдер, `vi.mock`, покрытие, шарды, разделение кода):
  [Билдер unit-test в Angular](/ru/guides/angular-unit-test-builder).
- Подмена провайдеров, которые объявляет компонент, и проверка, что подмена применилась:
  [Подмена провайдеров компонента](/ru/adapters/angular-overrides).
- Почему хелпер ведёт себя именно так: [Как устроены хелперы Angular](/ru/adapters/angular-how-it-works).
