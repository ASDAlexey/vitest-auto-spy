---
title: Переход с @ngneat/spectator
description: Как заменить спаи и настройку TestBed в тестах сервисов и компонентов Angular. Примеры до и после и обходной путь для Angular 22.
---

# Переход с `@ngneat/spectator`

Замените спаи Spectator и настройку `TestBed` на `vitest-auto-spy`. Это пригодится, если Spectator не
загружается на Angular 22 или вы хотите убрать jQuery и типы Jasmine.
Пример теста для `CartService` и `PricingService` из вашего приложения:

::: code-group

```ts [Стало — vitest-auto-spy]
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('totals the cart', () => {
  TestBed.configureTestingModule({ providers: [CartService, provideAutoSpy(PricingService)] });
  injectSpy(PricingService).total.mockReturnValue(120);
  expect(TestBed.inject(CartService).checkout()).toBe(120);
});
```

```ts [Было — @ngneat/spectator]
import { createServiceFactory } from '@ngneat/spectator/vitest';
import { expect, it } from 'vitest';

const createService = createServiceFactory({ service: CartService, mocks: [PricingService] });

it('totals the cart', () => {
  const spectator = createService();
  spectator.inject(PricingService).total.andReturn(120);
  expect(spectator.service.checkout()).toBe(120);
});
```

:::

- Вместо `mocks: [X]` или `mockProvider(X)` используйте `provideAutoSpy(X)`.
- Вместо `spectator.inject(X)` используйте `injectSpy(X)`. В одном тесте он возвращает тот же спай.
- `TestBed.inject(CartService)` создаёт сервис. Если конструктор вызывает `total()`, задайте ответ
  в провайдере: `provideAutoSpy(PricingService, { returns: { total: 120 } })`. Иначе его можно задать
  позже, до вызова метода в тесте.

Чем заменить `spectator.query` и DOM-матчеры, см. в разделе
[Компонентные спеки](#component-specs-—-what-is-and-is-not-covered).

## Поставить и удалить {#install-and-delete}

```bash
npm i -D vitest-auto-spy
npm un @ngneat/spectator
```

Удалите из `devDependencies` пакеты, которые больше не нужны:

- `@types/jasmine`, если типы Jasmine нужны были только Spectator.
- `@angular/platform-browser-dynamic`, если он нужен был только как
  [обходной путь для Angular 22](#the-angular-22-failure).

Используйте `vitest-auto-spy/angular` с билдером Angular `@angular/build:unit-test` или с плагином
`@analogjs/vite-plugin-angular` и файлом настройки `TestBed`. См. [адаптер Angular](/ru/adapters/angular).

Для хелперов `Observable`, например `nextWith` и `throwWith`, добавьте `import 'vitest-auto-spy/rxjs';`
в файл настройки. Одного импорта достаточно. См. [RxJS](/ru/runtimes/rxjs).

**Vitest падает при запуске с `TypeError: cache.has is not a function`:** для `@angular/build` 22.2
нужен Analog версии 2.7.5 или новее. Обновите `@analogjs/vite-plugin-angular` и
`@analogjs/vitest-angular`. `npx vitest-auto-spy doctor` сообщает об этой ошибке как
[`analog-behind-angular-build`](/ru/utilities/cli#analog-behind-angular-build).

## Таблица перевода {#the-translation-table}

| `@ngneat/spectator`                                          | `vitest-auto-spy`                                                                               | Примечания                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `createServiceFactory({ service: S, … })`                    | `TestBed.configureTestingModule({ providers: [S, …] })`                                         | собственный API Angular; фабрику создавать не нужно                                                                 |
| `mocks: [Dep]` в любой фабрике                               | `providers: [provideAutoSpy(Dep)]`                                                              | по одному `provideAutoSpy` на каждый подменённый класс                                                              |
| `mockProvider(Dep)`                                          | [`provideAutoSpy(Dep)`](/ru/adapters/angular)                                                   | идёт в `providers`, туда же                                                                                         |
| `mockProvider(Dep, { taxRate: 0.2 })`                        | `provideAutoSpy(Dep, { overrides: { taxRate: 0.2 } })`                                          | готовое значение для поля или геттера                                                                               |
| `mockProvider(Dep, { load: () => of(user) })`                | `provideAutoSpy(Dep, { returns: { load: of(user) } })`                                          | метод остаётся спаем и отвечает этим значением                                                                      |
| `spectator.service`                                          | `TestBed.inject(Service)`                                                                       | настоящий тестируемый экземпляр                                                                                     |
| `spectator.inject(Dep)`                                      | [`injectSpy(Dep)`](/ru/adapters/angular)                                                        | **предупреждает**, когда инжектор вернул настоящий экземпляр                                                        |
| `createSpyObject(Service)`                                   | [`createSpyFromClass(Service)`](/ru/core/create-spy-from-class)                                 | спай на каждый метод класса; см. [ловушку типизации](#the-typing-trap)                                              |
| `SpyObject<T>`                                               | [`Spy<T>`](/ru/core/spy-typing)                                                                 | типизирован по настоящему классу                                                                                    |
| приведение `as SpyObject<T>`                                 | [`asSpy(x)`](/ru/core/spy-typing) / `asInstance(spy)`                                           | именованные преобразования вместо приведения типа                                                                   |
| `spy.method.andReturn(v)`                                    | `spy.method.mockReturnValue(v)`                                                                 | плюс `calledWith(...)`, чтобы отвечать по аргументам                                                                |
| `spy.method.andCallFake(fn)`                                 | `spy.method.mockImplementation(fn)`                                                             |                                                                                                                     |
| _(нет аналога)_                                              | `spy.load.resolveWith(v)` / `.nextWith(v)` / `.failWith(e)`                                     | [хелперы](/ru/core/control-helpers): ответ метода с `Promise`, ответ метода с `Observable`, ошибка при любом вызове |
| _(нет аналога)_                                              | `gettersToSpyOn` / `settersToSpyOn` / `autoSpyAccessors`                                        | спаи на геттеры и сеттеры                                                                                           |
| `createComponentFactory({ component: Cmp, shallow: true })`  | [`renderShallow(Cmp, { … })`](/ru/adapters/angular#shallow-component-rendering)                 | очищает шаблон компонента; `keepTemplate: true` его сохраняет                                                       |
| `detectChanges: false` в фабрике                             | `detectChanges: false` у `renderShallow`                                                        | `ngOnInit` ждёт, пока вы не вызовете `fixture.detectChanges()`                                                      |
| `spectator.component`                                        | `component` из `renderShallow`                                                                  |                                                                                                                     |
| `spectator.fixture`                                          | `fixture` из `renderShallow`                                                                    | настоящий `ComponentFixture`                                                                                        |
| `spectator.detectChanges()`                                  | `fixture.detectChanges()` / `await stable(fixture)`                                             | в zoneless-приложении — `stable`; см. [Ожидание в zoneless](/ru/adapters/angular#zoneless-waiting)                  |
| `spectator.setInput({ x: 1 })`                               | `inputs: { x: 1 }` у `renderShallow` либо `fixture.componentRef.setInput`                       | сигнальные входы принимают **значение**                                                                             |
| `SpectatorHost` / `createHostFactory`                        | host-компонент, объявленный в спеке и созданный через `TestBed.createComponent(Host)`           | хелпера здесь нет                                                                                                   |
| `spectator.query(byTestId('x'))`                             | `fixture.debugElement.query(By.css('[data-testid=x]'))`                                         | **здесь нет**; API самого Angular или Testing Library                                                               |
| `spectator.click(el)`, `typeInElement`, `dispatchMouseEvent` | `@testing-library/angular` + `@testing-library/user-event`                                      | **здесь нет**                                                                                                       |
| `toHaveClass`, `toHaveText`, `toBeVisible`, …                | `@testing-library/jest-dom`                                                                     | **здесь нет**                                                                                                       |
| `SpectatorHttp` / `createHttpFactory`                        | [`provideHttpTesting()` / `expectRequest()`](/ru/adapters/angular-http)                         | валит тест, который оставил запрос без ответа                                                                       |
| `SpectatorRouting` / `createRoutingFactory`, `setRouteParam` | [`provideActivatedRoute()` / `injectActivatedRoute().setParams()`](/ru/adapters/angular-router) | настоящий `ActivatedRoute` Angular; `setParams` заменяет весь набор, а не ключ                                      |
| `flushEffects()`                                             | [`flushEffects()`](/ru/adapters/angular)                                                        | то же имя, та же работа                                                                                             |
| `runInInjectionContext(fn)`                                  | `TestBed.runInInjectionContext(fn)`                                                             | собственный API Angular                                                                                             |

## Спека сервиса до и после {#a-service-spec-before-and-after}

В этом тесте у сервиса две зависимости. Одна возвращает `Observable`.

::: code-group

```ts [До — @ngneat/spectator]
import { SpectatorService, SpyObject, createServiceFactory, mockProvider } from '@ngneat/spectator/vitest';
import { of } from 'rxjs';

describe('CartService', () => {
  let spectator: SpectatorService<CartService>;
  let api: SpyObject<ApiService>;
  let pricing: SpyObject<PricingService>;

  const createService = createServiceFactory({
    service: CartService,
    providers: [mockProvider(ApiService), mockProvider(PricingService, { taxRate: 0.2 })],
  });

  beforeEach(() => {
    spectator = createService();
    api = spectator.inject(ApiService);
    pricing = spectator.inject(PricingService);
  });

  it('totals the cart', async () => {
    api.loadItems.andReturn(of([{ price: 100 }]));
    pricing.total.andReturn(120);

    expect(await spectator.service.checkout()).toBe(120);
  });
});
```

```ts [После — vitest-auto-spy]
import { TestBed } from '@angular/core/testing';
import type { Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

describe('CartService', () => {
  let service: CartService;
  let api: Spy<ApiService>;
  let pricing: Spy<PricingService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CartService, provideAutoSpy(ApiService), provideAutoSpy(PricingService, { overrides: { taxRate: 0.2 } })],
    });

    service = TestBed.inject(CartService);
    api = injectSpy(ApiService);
    pricing = injectSpy(PricingService);
  });

  it('totals the cart', async () => {
    api.loadItems.nextWith([{ price: 100 }]);
    pricing.total.mockReturnValue(120);

    expect(await service.checkout()).toBe(120);
  });
});
```

:::

- Вместо `andReturn(of(value))` используйте `nextWith(value)`.
  [Выбор хелпера зависит от типа результата](/ru/core/control-helpers): для `Observable` — `nextWith`
  и `throwWith`, для `Promise` — `resolveWith` и `rejectWith`.
- Если Angular передаст в `injectSpy` настоящий экземпляр, в предупреждении будут токен и
  пропущенный вызов `provideAutoSpy`.
- `Spy<T>` использует типы исходного класса, поэтому TypeScript заметит больше ошибок. См.
  [ловушку типизации](#the-typing-trap).

### Та же спека без `let` и без `beforeEach` {#the-same-spec-with-no-let-and-no-beforeeach}

На Vitest 4.1 и новее используйте
[`extendWithAutoSpies`](/ru/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies).
Каждый тест создаст только те спаи, которые запрашивает:

```ts
import { TestBed } from '@angular/core/testing';
import { test as base } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(
  base,
  { api: ApiService, pricing: [PricingService, { overrides: { taxRate: 0.2 } }] },
  { providers: [CartService] },
);

test('totals the cart', async ({ api, pricing }) => {
  api.loadItems.nextWith([{ price: 100 }]);
  pricing.total.mockReturnValue(120);

  expect(await TestBed.inject(CartService).checkout()).toBe(120);
});
```

## Компонентные спеки — что покрыто, а что нет {#component-specs-—-what-is-and-is-not-covered}

Подготовьте компонент через `renderShallow`, а его зависимости подмените через `provideAutoSpy`.
Для запросов к DOM и событий используйте отдельные инструменты:

::: code-group

```ts [До — @ngneat/spectator]
import { Spectator, createComponentFactory } from '@ngneat/spectator/vitest';
import { of } from 'rxjs';

describe('ProfileComponent', () => {
  let spectator: Spectator<ProfileComponent>;

  const createComponent = createComponentFactory({
    component: ProfileComponent,
    shallow: true,
    mocks: [UserService],
    detectChanges: false,
  });

  it('shows the user name', () => {
    spectator = createComponent();
    spectator.inject(UserService).load.andReturn(of({ name: 'Ann' }));
    spectator.detectChanges();

    expect(spectator.component.name()).toBe('Ann');
  });
});
```

```ts [После — vitest-auto-spy]
import { of } from 'rxjs';
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

describe('ProfileComponent', () => {
  it('shows the user name', () => {
    const { component } = renderShallow(ProfileComponent, {
      providers: [provideAutoSpy(UserService, { returns: { load: of({ name: 'Ann' }) } })],
    });

    expect(component.name()).toBe('Ann');
  });
});
```

:::

Задайте ответ спая в провайдере, чтобы `ngOnInit` получил его при первой проверке изменений. Если
нужно настроить спай после создания компонента, передайте `detectChanges: false` в `renderShallow`.
Затем настройте `injectSpy(UserService)` и вызовите `fixture.detectChanges()`.

**Покрыто: настройка `TestBed`.** [`renderShallow`](/ru/adapters/angular#shallow-component-rendering)
объединяет `configureTestingModule`, `NO_ERRORS_SCHEMA` и `overrideComponent`. Он очищает `imports`
и шаблон компонента, чтобы Angular пропустил дочерние компоненты. Хуки, входы, сигналы и внедрение
зависимостей работают как обычно. Если для `viewChild` или проекции содержимого нужен шаблон,
передайте `keepTemplate: true`. Angular всё равно пропустит дочерние компоненты.

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // сигнальные входы принимают ЗНАЧЕНИЕ, а не сигнал
});
```

**Покрыто: сигналы, эффекты, ресурсы и HTTP.** Используйте `mockSignalProp`, `mockReadonlyProp`,
`runEffect`, `flushEffects`, `stable(fixture)` и `settleResource`. Вместо `SpectatorHttp` и вызовов
`HttpTestingController` используйте [`expectRequest`](/ru/adapters/angular-http).

**Не покрыто: запросы к DOM и события.** Вместо `spectator.query`, `byTestId` и `spectator.click`
используйте API Angular, на котором они основаны:

```ts
import { By } from '@angular/platform-browser';

const row = fixture.debugElement.query(By.css('[data-testid="task-row"]'));
row.triggerEventHandler('click', {});
```

**Не покрыто: DOM-матчеры.** Для `toHaveClass`, `toHaveText`, `toBeVisible` и большинства других
матчеров используйте [`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom)
с `expect.extend` в Vitest.

Если ваши тесты в основном проверяют DOM, оставьте `vitest-auto-spy` для спаев и настройки
`TestBed`, а [`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro)
используйте для рендеринга и запросов. Оба пакета поддерживаются.

## Ловушка типизации {#the-typing-trap}

Spectator указывает для результата `inject` тип `SpyObject<T>`, даже если за токеном стоит настоящий экземпляр:

```ts
// node_modules/@ngneat/spectator/lib/base/base-spectator.d.ts:7
inject<T>(token: Token<T>): SpyObject<T>;
```

`SpyObject<T>` объявляет спаем каждый метод `T`:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:29
export type SpyObject<T> = T & {
  [P in keyof T]: T[P] extends UnknownFunction ? T[P] & CompatibleSpy<T[P]> : T[P];
} & { castToWritable(): Writable<T> };
```

Если вы забудете `mockProvider`, строка `spectator.inject(RealService).doThing.andReturn(1)` всё
равно скомпилируется. Вызов `andReturn` упадёт с `andReturn is not a function`. А если вызвать
сам метод, сработает настоящая реализация и тест может пройти, хотя подмены нет.

- **В `Spy<T>` нет членов `private` и `#private`.** Если функция ждёт объект исходного типа `T`,
  используйте `asInstance(spy)`. Для обратного преобразования есть `asSpy(x)`. Приведение
  `as unknown as T` не нужно. См. [Как связаны `Spy<T>` и `T`](/ru/core/spy-typing).
- **`injectSpy` проверяет, что вернул Angular.** Если это настоящий экземпляр, `injectSpy` один раз
  на токен выдаёт предупреждение и называет пропущенный вызов `provideAutoSpy`. Чтобы тест вместо
  этого падал, включите [`enableAngularDiagnostics({ unspiedProviders: true })`](/ru/adapters/angular-diagnostics).

При опечатке в имени метода `createSpyObject` не создаст для него спай, а `SpyObject<T>` не подскажет,
в чём дело. `createSpyFromClass(UserService, { onlyMethodsToSpyOn: ['laod'] })` сообщит, что метода
`laod` нет в классе. С [`strict: true`](/ru/core/create-spy-from-class#strict) ненастроенный вызов
вместо `undefined` даст ошибку с именем класса, именем метода и аргументами.

## Что вы получаете от переезда {#what-you-gain-by-moving}

- **Нет зависимостей времени выполнения.** У Spectator их три, в том числе jQuery.
- **Нет глобальных типов Jasmine.** Удалите `@types/jasmine` вместе со Spectator, если они больше не
  нужны. `vitest-auto-spy` не объявляет `namespace jasmine`.
- **Поддержка Angular 22, 21 и 20** без устаревшего пакета.
- **Спаи на геттеры и сеттеры.** Укажите их в `gettersToSpyOn` и `settersToSpyOn` или найдите все
  через `autoSpyAccessors`, включая унаследованные. Spectator не создаёт спаи на геттеры и сеттеры.
- **Хелперы для разных результатов.** Для `Promise` используйте `resolveWith` и `rejectWith`,
  для `Observable` — `nextWith` и `throwWith`. `calledWith(...)` задаёт ответ по аргументам,
  `failWith` заставляет любой вызов бросить ошибку. В Spectator есть `andReturn` и `andCallFake`.
- **Проверка типов и провайдеров.** `Spy<T>` опирается на тип класса. `injectSpy` предупреждает,
  если вы забыли добавить провайдер спая.
- **С zone.js и без него.** Спаи не обращаются к `NgZone`. Если нужен `fakeAsync`, подключите
  [`vitest-auto-spy/zone`](/ru/runtimes/vitest).
- **Поддержка AOT (компиляции заранее).** Используйте билдер Angular `@angular/build:unit-test`.
  [`assertNgModuleScopes` и `assertComponentDefIntact`](/ru/adapters/angular-diagnostics) помогают
  найти причину двух ошибок, которые возникают только при AOT.
- **Не только Vitest.** Тот же API работает с `bun:test` и `node:test`, а Angular `TestBed` —
  [под `bun test`](/ru/runtimes/bun-angular).
- **[Правила линтера](/ru/utilities/eslint-plugin)** входят в ту же версию пакета, что и рекомендуемый API.

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Сравнивайте **имена** тестов, а не их количество. Если один `describe` исчезнет, а нестабильный тест
в другом файле пройдёт, число тестов может не измениться. Передайте два JSON-отчёта в
`compareTestRuns`. См. [пример в руководстве по переходу с Jest](/ru/migrating#did-the-migration-lose-a-test).

За основу возьмите последний успешный прогон на Spectator. На Angular 22 для этого прогона
установите `@angular/platform-browser-dynamic`, а после удалите его.

## Почему Spectator перестаёт работать {#why-spectator-stops-working}

Версии и числа ниже проверены **2026-09-02** по опубликованным пакетам и через API npm и GitHub.

::: info Как это проверялось
Команды `npm pack @ngneat/spectator` и `npm pack @openng/spectator` дают файлы пакетов. Версии и даты
публикации смотрели через `npm view`, состояние репозитория — через `api.github.com`. Ошибку
воспроизвели через `npm install` Angular 22.1.4 и Spectator в пустом каталоге.
:::

**Репозиторий удалён.** `https://github.com/ngneat/spectator` и `api.github.com/repos/ngneat/spectator`
отвечают **HTTP 404**. Вместе с репозиторием исчезли задачи и запросы на изменения. Организация
`ngneat` осталась: `api.github.com/orgs/ngneat` отвечает **200**.

Сторонний разработчик создал [`ngneat-archive/spectator`](https://github.com/ngneat-archive/spectator)
**2026-06-07**. В описании: «Verified archive of ngneat/spectator at `@ngneat/spectator@22.1.0`».
Это архив опубликованного пакета, туда не принимают изменения (4 звезды, ветка по умолчанию
`restore/npm-spectator-22.1.0`).

**Последняя версия — 22.1.0 от 2025-11-02.** На момент проверки в npm у неё стоял тег `latest`.
Версия 22.0.0 вышла 2025-10-08 (`npm view @ngneat/spectator time`). npm не помечает пакет как устаревший.

С **2026-07-31 по 2026-08-29** API npm зафиксировал **739 852** загрузки `@ngneat/spectator`.
Пакет по-прежнему нужен многим проектам, но поддерживаемого пути обновления у них нет.

### Падение на Angular 22 {#the-angular-22-failure}

Spectator импортирует устаревший модуль Angular для тестов:

```ts
// node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs:7
import { BrowserDynamicTestingModule } from '@angular/platform-browser-dynamic/testing';
```

В сборке этот импорт нужен только для `overrideModule(BrowserDynamicTestingModule, {})` в строках
1605, 1751, 1878 и 2469. В исправлении ниже предлагают убрать этот неиспользуемый вызов.

- **Пакет Angular всё ещё можно установить.** На момент проверки npm ставил по тегу `latest`
  версию **22.1.4**, выпущенную вместе с остальными пакетами Angular. В `types/testing.d.ts:21`
  по-прежнему объявлен `BrowserDynamicTestingModule`. Предупреждение npm:
  _«@angular/platform-browser-dynamic is deprecated. Use `@angular/platform-browser` instead.»_
- **Spectator импортирует пакет, но не указывает его как зависимость.** Его нет ни в `dependencies`,
  ни в `peerDependencies`. Среди peer-зависимостей только `@angular/common`, `@angular/router` и
  `@angular/animations`. Импорт сработает, если пакет уже установлен, но в новом проекте на Angular 22
  его нет.

Так можно воспроизвести ошибку на чистой установке Angular 22.1.4:

```console
$ npm i @angular/core@22.1.4 @angular/common@22.1.4 @angular/platform-browser@22.1.4 \
        @angular/compiler@22.1.4 @angular/router@22.1.4 @angular/animations@22.1.4 \
        @ngneat/spectator@22.1.0 rxjs zone.js
$ node -e "import('@ngneat/spectator')"
FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@angular/platform-browser-dynamic'
imported from node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs
```

**Временный обходной путь:** добавьте `@angular/platform-browser-dynamic` в `devDependencies`.
Импорт заработает, и тесты запустятся на Angular 22. Когда Angular удалит пакет, тесты снова
перестанут работать, а исходного репозитория Spectator уже нет.

В форке есть предложение об исправлении: [`openng-org/spectator#13`](https://github.com/openng-org/spectator/pull/13),
_«fix: remove BrowserDynamicTestingModule override»_. Его открыли **2026-07-26**. Последнее обновление —
**2026-08-13**. На 2026-09-02 запрос оставался открытым. Исходный репозиторий уже не принимает изменения.

### Три рантайм-зависимости, одна из них jQuery {#three-runtime-dependencies-one-of-them-jquery}

Из `package.json` в тарболле:

```json
"dependencies": {
  "@testing-library/dom": "^10.4.1",
  "jquery": "^3.7.1",
  "tslib": "^2.6.2"
}
```

Spectator требует `jquery` во время выполнения. У `vitest-auto-spy` таких зависимостей нет.

### Он тащит глобалы Jasmine в ваш Vitest-проект {#it-puts-jasmine-s-globals-into-your-vitest-project}

Spectator объявляет свои матчеры в пространстве имён Jasmine:

```ts
// node_modules/@ngneat/spectator/lib/matchers-types.d.ts:1
declare namespace jasmine {
  interface Matchers<T> {
    toExist(): boolean;
    // …и ещё 20
  }
}
```

Тип спая тоже ссылается на Jasmine, поэтому отказаться от матчеров недостаточно:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:11
export interface CompatibleSpy<F extends UnknownFunction = UnknownFunction>
  extends jasmine.Spy<(...args: Parameters<F>) => ReturnType<F>> {
```

`SpyObject<T>` использует `CompatibleSpy`, которому нужно глобальное пространство имён `jasmine`.
Точка входа `@ngneat/spectator/vitest` определяет свой `SpyObject` как `BaseSpyObject<T> & { … Mock … }`,
а `BaseSpyObject` берёт из основной точки входа. Даже если тесты запускает Vitest, `@types/jasmine`
нужны по-прежнему. И типы Jasmine, и типы Vitest объявляют `expect`.

### Форк `@openng/spectator` — что это такое и чем не является {#the-openng-spectator-fork-—-what-it-is-and-is-not}

Версия **1.0.1** пакета [`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) вышла
**2026-07-10** из репозитория [`openng-org/spectator`](https://github.com/openng-org/spectator).
Репозиторий открыли 2026-06-21. На момент проверки он был активен: 39 звёзд, 7 открытых задач,
сам репозиторий не в архиве. С 2026-07-31 по 2026-08-29 у форка было **16 251** загрузка против
739 852 у оригинала. Это около **2,1 %** от общего числа.

Форк отличается от оригинала. Обычный `diff` показывает около 1450 изменённых строк: в основном
строки сдвинулись. Чтобы увидеть различия, приведите к одному виду имя пакета и версию компилятора,
уберите отступы и отсортируйте строки:

```bash
norm() { sed -e 's/ngneat/openng/g' -e 's/version: "2[0-9]\.[0-9]*\.[0-9]*"/version: "X"/g' "$1" \
         | sed 's/^[[:space:]]*//' | sort; }
diff <(norm ngneat-spectator.mjs) <(norm openng-spectator.mjs)
```

В обоих бандлах по 2543 строки. После нормализации различаются ровно **три**:

| Рантайм форка отличается тем, что                                 | Подробность                                         |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| Пересобран более новым компилятором Angular                       | `version: "22.0.5"` в декларациях против `"20.1.0"` |
| Внутренний host-компонент получил стратегию обнаружения изменений | `changeDetection: ChangeDetectionStrategy.Eager`    |
| Из бандла пропала triple-slash-ссылка на `matchers-types.ts`      | следствие того, как упакованы типы, — ниже          |

В форке 33 файла вместо 121. Вместо копии дерева исходников он поставляет четыре файла деклараций
в `types/`. Диапазон `peerDependencies` начинается с `>= 22.0.0`, в `package.json` добавлено
`"type": "module"`. Все три зависимости времени выполнения, включая jQuery, остались прежними.

Две проблемы остались:

- **Форк на Angular 22 всё так же не загружается.** `openng-spectator.mjs:7` импортирует
  `@angular/platform-browser-dynamic/testing`, не указывая пакет как зависимость. Чистая установка
  `@openng/spectator@1.0.1` с Angular 22.1.4 даёт тот же `ERR_MODULE_NOT_FOUND`. Сборка для Angular 22
  обновила компилятор и диапазон peer-зависимостей. Запрос № 13 с исправлением на момент проверки
  оставался открытым.
- **Пространство имён Jasmine осталось.** В `types/openng-spectator.d.ts:11` объявлено
  `namespace jasmine {`, а в строке 84 по-прежнему есть `CompatibleSpy … extends jasmine.Spy`.

У форка есть активный мейнтейнер, но исправление для Angular 22 пока не вышло.

## Смотрите также {#see-also}

- [Сравнение](/ru/comparison): библиотеки для тестирования Angular и даты их последних релизов.
- [Адаптер Angular](/ru/adapters/angular): `provideAutoSpy`, `injectSpy`, `renderShallow` и ожидание
  изменений без zone.js.
- Если вы используете ещё одну библиотеку спаев, см. [Переход с jest-auto-spies](/ru/migrating) или
  [с jasmine-auto-spies](/ru/migrating-jasmine).
