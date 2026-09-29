---
title: Переход с @ngneat/spectator
description: Перенос спек сервисов и компонентов со Spectator на vitest-auto-spy - API рядом, полные спеки до и после, что остаётся за Testing Library и почему Spectator падает на Angular 22.
---

# Переход с `@ngneat/spectator`

Эта страница переносит Angular-спеки со Spectator на `vitest-auto-spy`. Она нужна, если Spectator
перестал загружаться после обновления Angular (на Angular 22 он падает) или если вы хотите убрать из
проекта его jQuery и типы Jasmine. Спека сервиса меняется так:

::: code-group

```ts [Было — @ngneat/spectator]
import { createServiceFactory } from '@ngneat/spectator/vitest';

const createService = createServiceFactory({ service: CartService, mocks: [PricingService] });

it('totals the cart', () => {
  const spectator = createService();
  spectator.inject(PricingService).total.andReturn(120);
  expect(spectator.service.checkout()).toBe(120);
});
```

```ts [Стало — vitest-auto-spy]
import { TestBed } from '@angular/core/testing';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('totals the cart', () => {
  TestBed.configureTestingModule({ providers: [CartService, provideAutoSpy(PricingService)] });
  injectSpy(PricingService).total.mockReturnValue(120);
  expect(TestBed.inject(CartService).checkout()).toBe(120);
});
```

:::

- `provideAutoSpy(X)` заменяет `mocks: [X]` и `mockProvider(X)`.
- `injectSpy(X)` заменяет `spectator.inject(X)`. В пределах одного теста он всегда возвращает один и
  тот же спай.
- `TestBed.inject(CartService)` запускает конструктор `CartService`. Если конструктор сам вызывает
  `total()`, задайте ответ в провайдере: `provideAutoSpy(PricingService, { returns: { total: 120 } })`.
  Остальные ответы можно задать позже, до того как тест вызовет метод.

Библиотека берёт на себя спаи и настройку `TestBed`, но не запросы к DOM. Про `spectator.query` и
DOM-матчеры — в разделе [Компонентные спеки](#component-specs-—-what-is-and-is-not-covered).

## Поставить и удалить {#install-and-delete}

```bash
npm i -D vitest-auto-spy
npm un @ngneat/spectator
```

Затем уберите из `devDependencies`:

- `@types/jasmine`, если он больше никому не нужен. Он стоял там из-за типов Spectator.
- `@angular/platform-browser-dynamic`, если вы добавили его только как
  [обходной путь для Angular 22](#the-angular-22-failure).

`vitest-auto-spy/angular` нужна рабочая связка Vitest + Angular: либо собственный билдер Angular
`@angular/build:unit-test`, либо `@analogjs/vite-plugin-angular` плюс файл настройки `TestBed`.
Подробнее — [адаптер Angular](/ru/adapters/angular).

Если вы пользуетесь хелперами для `Observable` (`nextWith`, `throwWith`), один раз импортируйте
`vitest-auto-spy/rxjs` в файле настройки: `import 'vitest-auto-spy/rxjs';`. См.
[RxJS](/ru/runtimes/rxjs).

**Частая ошибка:** Analog старше 2.7.5 на `@angular/build` 22.2. Vitest падает на старте с
`TypeError: cache.has is not a function`. Обновите и `@analogjs/vite-plugin-angular`, и
`@analogjs/vitest-angular`. `npx vitest-auto-spy doctor` сообщает об этом как
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

Тестируемый сервис с двумя зависимостями. Одна из них возвращает `Observable`.

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

Кроме имён, поменялись три вещи:

- `nextWith(value)` заменяет `andReturn(of(value))`. Хелпер
  [выбирается по типу возврата метода](/ru/core/control-helpers): метод с `Observable` получает
  `nextWith` / `throwWith`, метод с `Promise` — `resolveWith` / `rejectWith`.
- `injectSpy` предупреждает, когда инжектор вернул настоящий экземпляр вместо спая. В предупреждении
  названы токен и недостающий вызов `provideAutoSpy`.
- `Spy<T>` типизирован по настоящему классу, поэтому компилятор ловит больше. См.
  [ловушку типизации](#the-typing-trap).

### Та же спека без `let` и без `beforeEach` {#the-same-spec-with-no-let-and-no-beforeeach}

На Vitest 4.1 и новее
[`extendWithAutoSpies`](/ru/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)
превращает каждую зависимость в фикстуру теста. Тест создаёт только те спаи, которые называет:

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

Библиотека заменяет настройку `TestBed` и спаи Spectator. Запросов к DOM и событий в ней нет.
Типичная компонентная спека на Spectator переезжает так:

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

Ответ спая задан прямо в провайдере, поэтому компонент получает его уже при первом обнаружении
изменений. Выключать `detectChanges`, чтобы успеть задать ответ до `ngOnInit`, больше не нужно. Если
ответ нужно задать позже, передайте
`detectChanges: false` в `renderShallow`, настройте `injectSpy(UserService)` и вызовите
`fixture.detectChanges()`.

**Покрыто: настройка `TestBed`.** [`renderShallow`](/ru/adapters/angular#shallow-component-rendering)
делает `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` одним вызовом. Он очищает
`imports` компонента и его шаблон, поэтому дочерние компоненты не рендерятся. Хуки жизненного цикла,
входы, сигналы и DI продолжают работать. `keepTemplate: true` сохраняет настоящий шаблон (для
`viewChild` и проекции контента); дочерние компоненты всё равно убираются.

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // сигнальные входы принимают ЗНАЧЕНИЕ, а не сигнал
});
```

**Покрыто: сигналы, эффекты, ресурсы и HTTP.** `mockSignalProp`, `mockReadonlyProp`, `runEffect`,
`flushEffects`, `stable(fixture)`, `settleResource` и [`expectRequest`](/ru/adapters/angular-http)
вместо вызовов `HttpTestingController`. `SpectatorHttp` из Spectator переводится на `expectRequest`.

**Не покрыто: запросы к DOM и события.** Здесь нет ни `spectator.query`, ни `byTestId`, ни
`spectator.click`. Пользуйтесь API самого Angular — его Spectator и оборачивал:

```ts
import { By } from '@angular/platform-browser';

const row = fixture.debugElement.query(By.css('[data-testid="task-row"]'));
row.triggerEventHandler('click', {});
```

**Не покрыто: DOM-матчеры.** У `toHaveClass`, `toHaveText`, `toBeVisible` и других DOM-матчеров
Spectator здесь аналогов нет. [`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom)
даёт замену для большинства из них и работает с `expect.extend` в Vitest.

Если ваши спеки в основном проверяют DOM, переезжайте на два пакета: `vitest-auto-spy` для спаев и
настройки `TestBed` и
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro) для
рендеринга и запросов. Оба поддерживаются.

## Ловушка типизации {#the-typing-trap}

Это разница, которая меняет, какие ошибки ловят ваши тесты.

`inject` в Spectator возвращает `SpyObject<T>` для любого токена — подменили вы его или нет:

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

Поэтому, если вы забыли `mockProvider`, строка `spectator.inject(RealService).doThing.andReturn(1)`
всё равно компилируется. В рантайме она падает с `andReturn is not a function`. Или не падает:
выполняется настоящий метод, возвращает что-то правдоподобное, и тест проходит не по той причине.

`vitest-auto-spy` закрывает это с двух сторон:

- **`Spy<T>` типизирован по настоящему классу.** В нём нет `private`- и `#private`-членов, поэтому
  передать его туда, где ждут `T`, без преобразования нельзя. Для этого есть `asInstance(spy)`, а для
  обратного направления — `asSpy(x)`; `as unknown as T` не нужен. См. [Как связаны `Spy<T>` и `T`](/ru/core/spy-typing).
- **`injectSpy` проверяет, что на самом деле пришло из контейнера.** Если это настоящий экземпляр, он
  один раз на токен предупреждает и называет недостающий вызов `provideAutoSpy`.
  [`enableAngularDiagnostics({ unspiedProviders: true })`](/ru/adapters/angular-diagnostics) делает из
  предупреждения падение теста.

Ловушка поменьше из той же серии — опечатка в имени метода. У `createSpyObject` для него нет спая, и
`SpyObject<T>` не помогает её найти. Здесь `createSpyFromClass(UserService, { onlyMethodsToSpyOn: ['laod'] })`
сообщает, что метода `laod` в классе нет. [`strict: true`](/ru/core/create-spy-from-class#strict) заставляет ненастроенный метод бросить
ошибку с именами класса, метода и аргументами, а не вернуть `undefined`.

## Что вы получаете от переезда {#what-you-gain-by-moving}

- **Ноль рантайм-зависимостей** против трёх у Spectator, и одна из них — jQuery.
- **Никаких глобалов Jasmine.** Здесь ничто не объявляет `namespace jasmine`, поэтому `@types/jasmine`
  уходит вместе со Spectator.
- **Работает на Angular 22, 21 и 20** без лишнего deprecated-пакета.
- **Спаи на геттеры и сеттеры**, которых в Spectator нет: `gettersToSpyOn`, `settersToSpyOn` и
  `autoSpyAccessors`, чтобы найти все аксессоры класса и его родителей.
- **Хелперы по типу возврата.** `resolveWith` / `rejectWith` для `Promise`, `nextWith` / `throwWith`
  для `Observable`, `calledWith(...)`, чтобы отвечать по аргументам, `failWith`, чтобы любой вызов
  бросал ошибку. В Spectator есть `andReturn` и `andCallFake`.
- **Честный тип** и `injectSpy`, который сообщает о токене, который вы забыли подменить.
- **И zoneless, и zone.js.** Ничто на пути спая не трогает `NgZone`. `fakeAsync` доступен из
  [`vitest-auto-spy/zone`](/ru/runtimes/vitest), если он ещё нужен вашим тестам.
- **Работает с AOT.** Работает под билдером Angular `@angular/build:unit-test`.
  [`assertNgModuleScopes` и `assertComponentDefIntact`](/ru/adapters/angular-diagnostics) ловят две
  ошибки, которые бывают только под AOT и иначе ломают спеку далеко от причины.
- **Не только Vitest.** Тот же API работает на `bun:test` и `node:test`, а `TestBed` из Angular —
  [под `bun test`](/ru/runtimes/bun-angular).
- **[Правила линтера](/ru/utilities/eslint-plugin)**, которые выходят в той же версии, что и API,
  который они советуют.

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Счётчики тестов этого не покажут. Допустим, в одном файле пропал целый `describe`, а в другом начал
проходить нестабильный тест. Итоговые числа совпадут. `compareTestRuns` сравнивает **имена** тестов из двух
JSON-отчётов; код — на [странице про jest](/ru/migrating#did-the-migration-lose-a-test).

Базовый прогон берите с последнего зелёного прогона на Spectator. На Angular 22 этот прогон работает
только с установленным `@angular/platform-browser-dynamic`: поставьте пакет ради него и удалите в
конце.

## Почему Spectator перестаёт работать {#why-spectator-stops-working}

Всё в этом разделе проверено по опубликованным тарболлам и через API npm и GitHub **2026-09-02**. Где
широко повторяемое утверждение оказалось неверным, здесь написано то, что нашлось на самом деле.

::: info Как это проверялось
`npm pack @ngneat/spectator` и `npm pack @openng/spectator`, затем чтение распакованных файлов.
`npm view` для версий и дат публикации. `api.github.com` для состояния репозитория. Чистая
`npm install` Angular 22.1.4 со Spectator в пустой директории, чтобы воспроизвести падение. Даты и
версии указаны рядом с каждым утверждением, чтобы всё можно было проверить заново.
:::

**Репозитория нет, но организация есть.** `https://github.com/ngneat/spectator` отвечает
**HTTP 404**, и `api.github.com/repos/ngneat/spectator` тоже. Утверждение, что удалили всю
организацию `ngneat`, неверно: `api.github.com/orgs/ngneat` по-прежнему отвечает **200**. Исчез только
этот репозиторий, а с ним все issue и pull request'ы.

Третья сторона опубликовала восстановленную копию —
[`ngneat-archive/spectator`](https://github.com/ngneat-archive/spectator). Она создана
**2026-06-07** и уже заархивирована (4 звезды, ветка по умолчанию `restore/npm-spectator-22.1.0`). В
описании: «Verified archive of ngneat/spectator at `@ngneat/spectator@22.1.0`». Это снимок
опубликованного пакета, а не продолжение, и изменения туда не принимаются.

**Последний релиз — 22.1.0, опубликован 2025-11-02** (`npm view @ngneat/spectator time`; 22.0.0 вышел
2025-10-08). На момент написания это dist-тег `latest`. Как deprecated на npm пакет **не** помечен.

**Его по-прежнему ставят очень многие.** За **2026-07-31 → 2026-08-29** API загрузок npm показывает
**739 852** загрузки `@ngneat/spectator`. От него зависит много тестовых проектов, и поддерживаемого
пути обновления у них нет.

### Падение на Angular 22 {#the-angular-22-failure}

Spectator импортирует модуль, от которого Angular уже ушёл:

```ts
// node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs:7
import { BrowserDynamicTestingModule } from '@angular/platform-browser-dynamic/testing';
```

Бандл использует его в четырёх местах (строки 1605, 1751, 1878 и 2469). Каждое — вызов
`overrideModule(BrowserDynamicTestingModule, {})`. Поэтому открытый фикс, ссылка на который ниже,
называется «remove the **unused** override».

Две часто повторяемые детали неверны:

- **`@angular/platform-browser-dynamic` по-прежнему есть на npm.** Его `latest` — **22.1.4**, он
  выходит вместе со всеми пакетами Angular, и `types/testing.d.ts:21` по-прежнему объявляет
  `BrowserDynamicTestingModule`. npm помечает его как deprecated: _«@angular/platform-browser-dynamic
  is deprecated. Use `@angular/platform-browser` instead.»_ Но deprecated-пакет всё ещё ставится и
  работает.
- **Падение — из-за отсутствующего объявления, а не отсутствующего пакета.** `package.json`
  Spectator не перечисляет `@angular/platform-browser-dynamic` **ни в `dependencies`, ни в
  `peerDependencies`**. Его peer-зависимости — только `@angular/common`, `@angular/router` и
  `@angular/animations`. То есть он импортирует пакет, который нигде не запрашивает. Работает он только
  там, где этот пакет ещё остался в воркспейсе, а в воркспейсах на Angular 22 его нет.

Воспроизведено в чистой директории с Angular 22.1.4 и ничем больше:

```console
$ npm i @angular/core@22.1.4 @angular/common@22.1.4 @angular/platform-browser@22.1.4 \
        @angular/compiler@22.1.4 @angular/router@22.1.4 @angular/animations@22.1.4 \
        @ngneat/spectator@22.1.0 rxjs zone.js
$ node -e "import('@ngneat/spectator')"
FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@angular/platform-browser-dynamic'
imported from node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs
```

**Обходной путь:** добавьте `@angular/platform-browser-dynamic` в свои `devDependencies`. Импорт
разрешится, и тесты снова пойдут на Angular 22. Так вы выиграете время, но мейнтейнер у библиотеки от этого не появится. Вы держите
deprecated-пакет Angular ради библиотеки, у которой нет репозитория. Релиз Angular, который удалит этот
пакет по-настоящему, сломает ваши тесты, и сообщить об этом будет некому.

**Фикс есть, но не влит.** Это
[`openng-org/spectator#13`](https://github.com/openng-org/spectator/pull/13), _«fix: remove
BrowserDynamicTestingModule override»_. Он открыт **2026-07-26**, последняя активность —
**2026-08-13**, и на 2026-09-02 он всё ещё **открыт и не влит**. Он живёт в форке: оригинальный
репозиторий отвечает 404 и pull request'ов принимать не может.

### Три рантайм-зависимости, одна из них jQuery {#three-runtime-dependencies-one-of-them-jquery}

Из `package.json` в тарболле:

```json
"dependencies": {
  "@testing-library/dom": "^10.4.1",
  "jquery": "^3.7.1",
  "tslib": "^2.6.2"
}
```

`jquery` — жёсткая рантайм-зависимость библиотеки для тестирования Angular. У `vitest-auto-spy`
рантайм-зависимостей **ноль**.

### Он тащит глобалы Jasmine в ваш Vitest-проект {#it-puts-jasmine-s-globals-into-your-vitest-project}

Часто цитируемый файл действительно есть:

```ts
// node_modules/@ngneat/spectator/lib/matchers-types.d.ts:1
declare namespace jasmine {
  interface Matchers<T> {
    toExist(): boolean;
    // …и ещё 20
  }
}
```

Важнее второй: он в типе самого объекта со спаями, а не в необязательном файле матчеров:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:11
export interface CompatibleSpy<F extends UnknownFunction = UnknownFunction>
  extends jasmine.Spy<(...args: Parameters<F>) => ReturnType<F>> {
```

`SpyObject<T>` построен на `CompatibleSpy`, поэтому ему нужно глобальное пространство имён `jasmine`.
Точка входа для Vitest от этого не спасает: `@ngneat/spectator/vitest` объявляет свой `SpyObject` как
`BaseSpyObject<T> & { … Mock … }`, а `BaseSpyObject` берётся из главной точки входа. На практике
`@types/jasmine` остаётся в проекте без Jasmine. Он лежит рядом с глобалами Vitest, и оба объявляют
`expect`.

### Форк `@openng/spectator` — что это такое и чем не является {#the-openng-spectator-fork-—-what-it-is-and-is-not}

[`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) **1.0.1** опубликован
**2026-07-10** из [`openng-org/spectator`](https://github.com/openng-org/spectator). Репозиторий создан
2026-06-21 и живой: не заархивирован, 39 звёзд, 7 открытых issue. За то же окно
2026-07-31 → 2026-08-29 у него **16 251** загрузка против 739 852 у оригинала — около **2,1 %** от
суммы.

Его часто называют побайтовой копией плюс сборкой под Angular 22. **Побайтовой копией он не
является.** Обычный `diff` двух главных бандлов показывает около 1450 изменённых строк, почти всё —
шум от сдвига строк. Чтобы увидеть настоящие различия, замените имя пакета и вшитую версию
компилятора, уберите отступы, отсортируйте и сравните:

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

Упаковка отличается сильнее кода. В форке 33 файла против 121: четыре свёрнутых бандла деклараций в
`types/` вместо копии дерева исходников. `peerDependencies` поднимаются до `>= 22.0.0`, добавляется
`"type": "module"`. Три рантайм-зависимости, включая jQuery, **те же самые**.

Две вещи, которые форк **не** чинит (проверено тем же способом):

- **На Angular 22 он падает по той же причине.** `openng-spectator.mjs:7` всё так же импортирует
  `@angular/platform-browser-dynamic/testing` и всё так же его не объявляет. То же воспроизведение с
  чистой установкой `@openng/spectator@1.0.1` и Angular 22.1.4 даёт тот же `ERR_MODULE_NOT_FOUND`.
  «Сборка под Angular 22» — это пересборка и поднятый диапазон peer-зависимостей. PR #13, который бы
  это исправил, всё ещё открыт.
- **Пространство имён Jasmine никуда не делось**, теперь оно внутри свёрнутого бандла:
  `types/openng-spectator.d.ts:11` — это `namespace jasmine {`, а `:84` — то же объявление
  `CompatibleSpy … extends jasmine.Spy`.

Форк — настоящий живой репозиторий с мейнтейнером, а у оригинала мейнтейнера уже нет. Оценивайте форк
по этому, а не по фиксу для Angular 22, который так и не вышел.

## Смотрите также {#see-also}

- [Сравнение](/ru/comparison): эта библиотека рядом с другими библиотеками для тестирования Angular,
  с датами последних релизов.
- [Адаптер Angular](/ru/adapters/angular): `provideAutoSpy`, `injectSpy`, `renderShallow`, ожидание
  в zoneless.
- [Переход с jest-auto-spies](/ru/migrating) и [с jasmine-auto-spies](/ru/migrating-jasmine), если
  ваши тесты на Spectator используют ещё и одну из них.
