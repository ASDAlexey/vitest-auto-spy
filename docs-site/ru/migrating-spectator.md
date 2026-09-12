---
title: Переход с @ngneat/spectator
description: Что на самом деле не так с @ngneat/spectator — проверено по опубликованному тарболлу, а не пересказано по памяти — и механический перевод спеки на Spectator в vitest-auto-spy, включая те части, которые эта библиотека сознательно не заменяет.
---

# Переход с `@ngneat/spectator`

Если вы здесь потому, что обновление воркспейса сломало вашу тестовую сюиту, а репозиторий, куда вы
пошли смотреть, ответил 404, — эта страница и подтверждение, и путь наружу. Она написана так, чтобы её
можно было проверить: каждое утверждение ниже сверено с опубликованным тарболлом и с API npm и GitHub
**2026-09-02**, а там, где широко повторяемая версия утверждения оказалась неверной, здесь написано
то, что нашлось на самом деле.

## Что правда, а что только звучит как правда {#what-is-true-and-what-only-sounds-true}

::: info Как это проверялось
`npm pack @ngneat/spectator` и `npm pack @openng/spectator`, затем чтение распакованных файлов;
`npm view` для версий и дат публикации; `api.github.com` для состояния репозитория; и чистая
`npm install` Angular 22.1.4 вместе со Spectator в пустой директории — чтобы воспроизвести падение, а
не рассуждать о нём. Даты и версии указаны рядом с каждым утверждением, чтобы всё можно было прогнать
заново.
:::

**Репозитория нет — но организация есть.** `https://github.com/ngneat/spectator` отвечает
**HTTP 404**, и `api.github.com/repos/ngneat/spectator` тоже. Часто повторяемое более сильное
утверждение, что удалили всю организацию `ngneat`, **не** подтверждается: `api.github.com/orgs/ngneat`
по-прежнему отвечает **200**. Исчез именно этот один репозиторий, а вместе с ним все issue и
pull-request'ы, которые на нём жили. Третья сторона опубликовала восстановленную копию —
[`ngneat-archive/spectator`](https://github.com/ngneat-archive/spectator), создан **2026-06-07**, уже
заархивирован, 4 звезды, ветка по умолчанию `restore/npm-spectator-22.1.0`, описан как «Verified
archive of ngneat/spectator at `@ngneat/spectator@22.1.0`». Это снимок опубликованного пакета, а не
продолжение, и, будучи архивом, он ничего не принимает.

**Последний релиз — 22.1.0, опубликован 2025-11-02** (`npm view @ngneat/spectator time`; 22.0.0 вышел
до него 2025-10-08). На момент написания это и есть dist-тег `latest`, и пакет на npm **не** помечен
как deprecated.

**Он по-прежнему стоит очень у многих.** API загрузок npm за окно **2026-07-31 → 2026-08-29**
сообщает о **739 852** загрузках `@ngneat/spectator`. Это не заброшенная игрушка; это большое
количество сюит, которым некуда идти.

### Падение на Angular 22 — настоящая причина не та, которую обычно называют {#the-angular-22-failure-—-the-real-cause-is-not-the-one-usually-given}

Spectator импортирует модуль, от которого Angular уже ушёл:

```ts
// node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs:7
import { BrowserDynamicTestingModule } from '@angular/platform-browser-dynamic/testing';
```

Он используется в четырёх местах — строки 1605, 1751, 1878 и 2469 того же бандла, — и каждое из них
представляет собой вызов `overrideModule(BrowserDynamicTestingModule, {})`, поэтому открытый фикс,
на который ссылка ниже, и называется «remove the **unused** override».

Две часто повторяемые детали про это неверны, и разница важна, если вы решаете, что делать:

- **`@angular/platform-browser-dynamic` не удаляли из npm.** Его `latest` — **22.1.4**, он публикуется
  вместе со всеми остальными пакетами Angular, и `types/testing.d.ts:21` по-прежнему объявляет
  `BrowserDynamicTestingModule`. Флажок на npm у него **есть** — запрос поля `deprecated` отвечает
  _«@angular/platform-browser-dynamic is deprecated. Use `@angular/platform-browser` instead.»_ — но
  deprecated-пакет всё ещё ставится и всё ещё работает.
- **Падает из-за отсутствующего объявления, а не из-за отсутствующего пакета.** Собственный
  `package.json` Spectator не перечисляет `@angular/platform-browser-dynamic` **ни в `dependencies`,
  ни в `peerDependencies`** — его peer-зависимости это только `@angular/common`, `@angular/router` и
  `@angular/animations`. То есть он импортирует пакет, о котором никогда не просит, и работает лишь на
  том воркспейсе, где этот пакет случайно ещё есть. У воркспейсов на Angular 22 его нет.

Воспроизведено, а не выведено рассуждением — чистая директория, Angular 22.1.4, больше ничего:

```console
$ npm i @angular/core@22.1.4 @angular/common@22.1.4 @angular/platform-browser@22.1.4 \
        @angular/compiler@22.1.4 @angular/router@22.1.4 @angular/animations@22.1.4 \
        @ngneat/spectator@22.1.0 rxjs zone.js
$ node -e "import('@ngneat/spectator')"
FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@angular/platform-browser-dynamic'
imported from node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs
```

**А значит, обходной путь существует, и знать о нём стоит до того, как что-то переносить.** Добавление
`@angular/platform-browser-dynamic` в собственные `devDependencies` разрешает импорт и снова запускает
сюиту на Angular 22. Это покупает время. Это не покупает мейнтейнера — вы теперь прибиваете
deprecated-пакет Angular ради библиотеки, репозитория которой не существует, а следующий релиз
Angular, который его действительно удалит, положит сюиту, и жаловаться будет некому.

**Фикс есть, и он не влит.** Это
[`openng-org/spectator#13`](https://github.com/openng-org/spectator/pull/13), _«fix: remove
BrowserDynamicTestingModule override»_, открыт **2026-07-26**, последняя активность **2026-08-13**,
на 2026-09-02 по-прежнему **открыт и не влит**. Обратите внимание, где он живёт: в форке. Оригинальный
репозиторий — 404, так что pull-request'ов у него быть не может в принципе.

### Три рантайм-зависимости, одна из них jQuery {#three-runtime-dependencies-one-of-them-jquery}

Прямо из `package.json` в тарболле:

```json
"dependencies": {
  "@testing-library/dom": "^10.4.1",
  "jquery": "^3.7.1",
  "tslib": "^2.6.2"
}
```

`jquery` — жёсткая рантайм-зависимость библиотеки для тестирования Angular в 2026 году. У
`vitest-auto-spy` рантайм-зависимостей **ноль**.

### Он тащит глобалы Jasmine в ваш Vitest-проект {#it-puts-jasmine-s-globals-into-your-vitest-project}

Часто цитируемый файл действительно существует:

```ts
// node_modules/@ngneat/spectator/lib/matchers-types.d.ts:1
declare namespace jasmine {
  interface Matchers<T> {
    toExist(): boolean;
    // …и ещё 20
  }
}
```

Но есть и второй, хуже, и укусит вас именно он — потому что лежит не в файле матчеров, который можно и
не подключать, а в типе самого дубля:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:11
export interface CompatibleSpy<F extends UnknownFunction = UnknownFunction>
  extends jasmine.Spy<(...args: Parameters<F>) => ReturnType<F>> {
```

`SpyObject<T>` определён через `CompatibleSpy`, поэтому `SpyObject<T>` транзитивно требует, чтобы
существовало глобальное пространство имён `jasmine`. И этим не ограничивается точка входа для Jasmine:
собственный `SpyObject` из `@ngneat/spectator/vitest` объявлен как `BaseSpyObject<T> & { … Mock … }`,
где `BaseSpyObject` импортируется из `@ngneat/spectator` — из главной точки входа. **Через точку входа
для Vitest от типов Jasmine не убежать.** На практике вы держите установленным `@types/jasmine` в
проекте, где никакого Jasmine нет, и он лежит рядом с глобалами Vitest, причём оба объявляют `expect`.

### Форк `@openng/spectator` — что это такое и чем не является {#the-openng-spectator-fork-—-what-it-is-and-is-not}

[`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) **1.0.1**, опубликован
**2026-07-10**, из [`openng-org/spectator`](https://github.com/openng-org/spectator) (создан
2026-06-21, активен, не заархивирован, 39 звёзд, 7 открытых issue). Загрузки за то же окно
2026-07-31 → 2026-08-29: **16 251** против 739 852 у оригинала — около **2,1 %** пары.

Его часто описывают как побайтово идентичный плюс сборка под Angular 22. **Побайтово он не
идентичен**, и способ в этом убедиться стоит записать, потому что наивное сравнение вводит в
заблуждение. Обычный `diff` двух главных бандлов сообщает о ~1450 изменённых строках, и это почти
целиком шум от сдвига строк. Сравнение, которое отвечает на вопрос, нормализует две очевидные
косметические оси — имя пакета и вшитую версию компилятора, — снимает отступы и сортирует, так что
выживают только настоящие содержательные различия:

```bash
norm() { sed -e 's/ngneat/openng/g' -e 's/version: "2[0-9]\.[0-9]*\.[0-9]*"/version: "X"/g' "$1" \
         | sed 's/^[[:space:]]*//' | sort; }
diff <(norm ngneat-spectator.mjs) <(norm openng-spectator.mjs)
```

В обоих бандлах по 2543 строки, и после нормализации различаются ровно **три**:

| Рантайм форка отличается тем, что                                 | Подробность                                         |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| Пересобран более новым компилятором Angular                       | `version: "22.0.5"` в декларациях против `"20.1.0"` |
| Внутренний host-компонент получил стратегию обнаружения изменений | `changeDetection: ChangeDetectionStrategy.Eager`    |
| Из бандла пропала triple-slash-ссылка на `matchers-types.ts`      | следствие того, как упакованы типы, — ниже          |

Упаковка отличается сильнее, чем код: 33 файла против 121, потому что форк поставляет четыре
свёрнутых бандла деклараций в `types/` вместо зеркала дерева исходников. `peerDependencies` уезжают на
`>= 22.0.0`, добавляется `"type": "module"`. Три рантайм-зависимости — вместе с jQuery —
**идентичны**.

Две вещи, которые форк **не** чинит, обе проверены тем же способом, что и выше:

- **Он падает на Angular 22 ровно по той же причине.** `openng-spectator.mjs:7` всё так же импортирует
  `@angular/platform-browser-dynamic/testing` и всё так же нигде его не объявляет. То же самое
  воспроизведение с чистой установкой против `@openng/spectator@1.0.1` и Angular 22.1.4 даёт
  идентичный `ERR_MODULE_NOT_FOUND`. «Сборка под Angular 22» — это пересборка и поднятый диапазон
  peer-зависимостей; PR #13, который действительно бы это починил, по-прежнему открыт.
- **Пространство имён Jasmine никуда не делось**, теперь оно внутри свёрнутого бандла:
  `types/openng-spectator.d.ts:11` — это `namespace jasmine {`, а `:84` — то же самое объявление
  `CompatibleSpy … extends jasmine.Spy`.

Форк — настоящий, живой репозиторий с мейнтейнером, а этого у оригинала уже нет. Судите о нём по
этому, а не по фиксу Angular 22, который так и не вышел.

## Чем эта библиотека является и чем не является {#what-this-library-is-and-what-it-is-not}

Прочитайте это до таблицы, потому что от этого зависит, полезна ли вам остальная страница.

Spectator — это две вещи, скрученные вместе: **фабрика дублей** (`createSpyObject`, `mockProvider`,
`SpyObject<T>`) и **обвязка для рендеринга компонентов** (`createComponentFactory`, `SpectatorHost`,
`spectator.query`, DOM-матчеры, `byTestId`, `dispatchMouseEvent`, `typeInElement`).

`vitest-auto-spy` заменяет **первую** из них и делает это заметно лучше. Библиотекой рендеринга он
**не** является и не пытается ею быть. Здесь нет ни `spectator.query`, ни `byText`, ни `toHaveClass`,
ни хелперов для отправки событий.

Поэтому честная форма этой миграции такова:

| Spectator умеет                     | Здесь                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| дубли сервисов и DI                 | **покрыто полностью**, причём с типизацией, которой компилятор действительно может пользоваться |
| поверхностная настройка компонента  | **покрыто** через [`renderShallow`](/ru/adapters/angular#shallow-component-rendering)           |
| запросы к DOM, события, DOM-матчеры | **не покрыто** — берите `fixture.debugElement.query(By.css(…))` или `@testing-library/angular`  |

Если ваша сюита состоит в основном из спек на сервисы — это механический перевод, который делается
файл за файлом. Если в основном из компонентных спек с проверками DOM — рассчитывайте поставить рядом
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro), который
активно поддерживается и является лучшей заменой для этой половины.

## Поставить и удалить {#install-and-delete}

```bash
npm i -D vitest-auto-spy
npm un @ngneat/spectator
```

Затем уберите `@types/jasmine` из `devDependencies`, если он больше никому не нужен: со Spectator
уходит и причина, по которой он там оказался. Если вы держали `@angular/platform-browser-dynamic`
только как описанный выше обходной путь — он уходит тоже.

`vitest-auto-spy/angular` требует обычной обвязки Vitest + Angular (`@analogjs/vite-plugin-angular`
плюс файл настройки TestBed) либо собственного билдера Angular `@angular/build:unit-test`. См.
[адаптер Angular](/ru/adapters/angular).

## Таблица перевода {#the-translation-table}

| `@ngneat/spectator`                                          | `vitest-auto-spy`                                                                               | Примечания                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `createSpyObject(Service)`                                   | [`createSpyFromClass(Service)`](/ru/core/create-spy-from-class)                                 | читает настоящий прототип; см. [разницу в типизации](#the-typing-trap)                 |
| `mockProvider(Service)`                                      | [`provideAutoSpy(Service)`](/ru/adapters/angular)                                               | идёт в `providers`, туда же                                                            |
| `mockProvider(Service, { getX: 1 })`                         | `provideAutoSpy(Service, { returns: { getX: 1 } })`                                             | `overrides` — для члена, который не является результатом метода                        |
| `createServiceFactory(Service)`                              | `TestBed.configureTestingModule({ providers: [...] })`                                          | собственный API Angular; никакой фабрики создавать не нужно                            |
| `spectator.service`                                          | `TestBed.inject(Service)`                                                                       | настоящий тестируемый экземпляр                                                        |
| `spectator.inject(Dep)`                                      | [`injectSpy(Dep)`](/ru/adapters/angular)                                                        | **предупреждает**, когда инжектор вернул настоящий экземпляр, — Spectator так не умеет |
| `SpyObject<T>`                                               | [`Spy<T>`](/ru/core/create-spy-from-class)                                                      | mapped type над настоящим прототипом                                                   |
| приведение `as SpyObject<T>`                                 | [`asSpy(x)`](/ru/core/create-spy-from-class) / `asInstance(spy)`                                | именованные представления вместо утверждения, с которым спорит линтер                  |
| `spy.method.andReturn(v)`                                    | `spy.method.mockReturnValue(v)`                                                                 | плюс `calledWith(...)` для разветвления по аргументам                                  |
| `spy.method.andCallFake(fn)`                                 | `spy.method.mockImplementation(fn)`                                                             |                                                                                        |
| _(нет эквивалента)_                                          | `spy.load.resolveWith(v)` / `.nextWith(v)` / `.failWith(e)`                                     | [хелперы, выбранные по типу возврата](/ru/core/control-helpers)                        |
| _(нет эквивалента)_                                          | `gettersToSpyOn` / `settersToSpyOn` / `autoSpyAccessors`                                        | у Spectator спаев на аксессоры нет вообще                                              |
| `createComponentFactory(Cmp)` (поверхностный)                | [`renderShallow(Cmp, { … })`](/ru/adapters/angular#shallow-component-rendering)                 | один вызов вместо `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent`  |
| `spectator.component`                                        | `component` из `renderShallow`                                                                  |                                                                                        |
| `spectator.fixture`                                          | `fixture` из `renderShallow`                                                                    | настоящий `ComponentFixture`                                                           |
| `spectator.detectChanges()`                                  | `fixture.detectChanges()` / `await stable(fixture)`                                             | в zoneless предпочитайте `stable` — см. [ловушку](/ru/adapters/angular)                |
| `spectator.setInput({ x: 1 })`                               | `inputs: { x: 1 }` у `renderShallow` либо `fixture.componentRef.setInput`                       | сигнальные входы принимают **значение**                                                |
| `SpectatorHost` / `createHostFactory`                        | `renderShallow(Cmp, { template: '…', keepTemplate: true })`                                     | ближайший аналог; не идентичен                                                         |
| `spectator.query(byTestId('x'))`                             | `fixture.debugElement.query(By.css('[data-testid=x]'))`                                         | **здесь не предоставляется** — собственный API Angular либо Testing Library            |
| `spectator.click(el)`, `typeInElement`, `dispatchMouseEvent` | `@testing-library/angular` + `@testing-library/user-event`                                      | **здесь не предоставляется**                                                           |
| `toHaveClass`, `toHaveText`, `toBeVisible`, …                | `@testing-library/jest-dom`                                                                     | **здесь не предоставляется**                                                           |
| `SpectatorHttp` / `createHttpFactory`                        | [`provideHttpTesting()` / `expectRequest()`](/ru/adapters/angular-http)                         | и он валит тест, который оставил запрос без ответа                                     |
| `SpectatorRouting` / `createRoutingFactory`, `setRouteParam` | [`provideActivatedRoute()` / `injectActivatedRoute().setParams()`](/ru/adapters/angular-router) | собственный `ActivatedRoute` Angular; сеттер заменяет весь набор, а не один ключ       |
| `flushEffects()`                                             | [`flushEffects()`](/ru/adapters/angular)                                                        | то же имя, та же работа                                                                |
| `runInInjectionContext(fn)`                                  | `TestBed.runInInjectionContext(fn)`                                                             | собственный API Angular                                                                |

## Спека сервиса до и после {#a-service-spec-before-and-after}

Обычная форма: тестируемый сервис, два коллаборатора, один из них возвращает `Observable`.

::: code-group

```ts [До — @ngneat/spectator]
import { SpectatorService, SpyObject, createServiceFactory, mockProvider } from '@ngneat/spectator/vitest';

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

Помимо имён поменялись три вещи. `nextWith` заменяет `andReturn(of(…))`, потому что хелпер
[выбирается по типу возврата метода](/ru/core/control-helpers): метод, возвращающий `Observable`,
получает `nextWith` / `throwWith`, возвращающий `Promise` — `resolveWith` / `rejectWith`. `injectSpy`
**сообщает вам**, когда инжектор отдал настоящий экземпляр вместо дубля, называя токен и недостающий
вызов `provideAutoSpy`. А объявления `Spy<T>` здесь несущие, а не декоративные — об этом следующий
раздел.

### Та же спека без `let` и без `beforeEach` {#the-same-spec-with-no-let-and-no-beforeeach}

На Vitest 4.1
[`extendWithAutoSpies`](/ru/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)
схлопывает весь блок — а тест, который ни разу не назвал зависимость, её и не построит:

```ts
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

## Ловушка типизации {#the-typing-trap}

Это самое ценное, что стоит понять про переезд, потому что именно эта разница меняет то, какие баги
ваша сюита вообще способна поймать.

`SpyObject<T>` в Spectator проходит по `T` и типизирует **каждый** функциональный член как спай:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:29
export type SpyObject<T> = T & {
  [P in keyof T]: T[P] extends UnknownFunction ? T[P] & CompatibleSpy<T[P]> : T[P];
} & { castToWritable(): Writable<T> };
```

А `inject` объявлен так, что возвращает его безусловно, для любого токена:

```ts
// node_modules/@ngneat/spectator/lib/base/base-spectator.d.ts:7
inject<T>(token: Token<T>): SpyObject<T>;
```

Прочитайте это вместе, и следствие таково: **компилятор говорит вам, что токен — спай, независимо от
того, замокали вы его или нет.** Забыли `mockProvider` — и
`spectator.inject(RealService).doThing.andReturn(1)` прекрасно проходит проверку типов, а потом падает
в рантайме с `andReturn is not a function`. Или, что хуже, не падает, потому что настоящий метод
выполнился и вернул что-то правдоподобное. Система типов активно прячет ошибку.

`vitest-auto-spy` закрывает это с обоих концов:

- **`Spy<T>` — это mapped type над настоящим прототипом**, и он сознательно **не** присваиваем к `T`:
  он отбрасывает `private`- и `#private`-члены. Это фича — у обоих направлений есть именованные
  преобразования, `asSpy(x)` и `asInstance(spy)`, вместо `as unknown as T`, которое перестаёт
  проверять что-либо вообще. См. [`Spy<T>` не присваиваем к `T`](/ru/core/create-spy-from-class).
- **`injectSpy` проверяет, что на самом деле вышло из контейнера**, и сообщает — один раз на токен, —
  когда это обычный экземпляр, а не auto-spy, называя токен и недостающий вызов `provideAutoSpy`.
  [`enableAngularDiagnostics({ unspiedProviders: true })`](/ru/adapters/angular-diagnostics) поднимает
  это с предупреждения до падения.

Есть и вторая, поменьше, ловушка из той же семьи. `createSpyObject` строит по прототипу, поэтому имя
метода, в котором вы опечатались, в рантайме просто отсутствует, а индекс `SpyObject<T>` по `keyof T`
ничем не помогает его найти. Здесь `onlyMethodsToSpyOn` **сообщает об имени, которого на прототипе
нет**, а [`strict: true`](/ru/core/create-spy-from-class#strict) превращает ненастроенный метод из
`undefined`, падающего тремя кадрами позже, в исключение, называющее класс, метод и аргументы.

## Компонентные спеки — что покрыто, а что нет {#component-specs-—-what-is-and-is-not-covered}

Здесь стоит смотреть трезво. Компонентная спека на Spectator обычно делает четыре вещи, и эта
библиотека покрывает две из них.

**Покрыто — настройка TestBed.** [`renderShallow`](/ru/adapters/angular#shallow-component-rendering) —
это последовательность `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` в одном
вызове, то есть ровно та часть, которую вам на самом деле экономил `createComponentFactory`:

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // сигнальные входы принимают ЗНАЧЕНИЕ, а не сигнал
});
```

Он вычищает шаблоны дочерних компонентов **намеренно** — именно это делает рендер поверхностным и
быстрым (291 мс → 174 мс на трёх настоящих компонентных спеках). Хуки жизненного цикла, входы,
сигналы и DI при этом продолжают работать, а это всё, что читает спека, проверяющая состояние на
уровне TypeScript. `keepTemplate: true` сохраняет настоящий шаблон, всё так же опустошая дочерние
импорты, — для `viewChild` и проекции контента.

**Покрыто — сигналы, эффекты, ресурсы и HTTP.** `mockSignalProp`, `mockReadonlyProp`, `runEffect`,
`flushEffects`, `stable(fixture)`, `settleResource` и [`expectRequest`](/ru/adapters/angular-http) для
танцев вокруг `HttpTestingController`. `SpectatorHttp` из Spectator ложится на последний из них.

**Не покрыто — запросы к DOM и события.** Здесь нет ни `spectator.query`, ни `byTestId`, ни
`spectator.click`. Пользуйтесь собственным API Angular — тем самым, который Spectator и оборачивал:

```ts
import { By } from '@angular/platform-browser';

const row = fixture.debugElement.query(By.css('[data-testid="task-row"]'));
row.triggerEventHandler('click', {});
```

**Не покрыто — DOM-матчеры.** У `toHaveClass`, `toHaveText`, `toBeVisible` и остального списка из
`matchers-types.d.ts` здесь аналогов нет.
[`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) даёт эквиваленты для
большинства из них и работает с `expect.extend` в Vitest.

Для сюиты, состоящей в основном из проверок DOM, прагматичная миграция — это **два пакета, а не
один**: `vitest-auto-spy` для дублей и настройки TestBed,
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro) для
рендеринга и запросов. Оба поддерживаются; ни один не притворяется другим.

## Что вы получаете от переезда {#what-you-gain-by-moving}

Коротко и по фактам.

- **Ноль рантайм-зависимостей** против трёх — и одна из этих трёх это jQuery.
- **Никаких глобалов Jasmine.** Здесь ничто не объявляет `namespace jasmine`, поэтому `@types/jasmine`
  уходит из проекта вместе со Spectator.
- **Работает на Angular 22** — и на Angular 21, и на 20 — без прибитого сбоку deprecated-пакета,
  который нужен, чтобы разрешился необъявленный импорт.
- **Спаи на геттеры и сеттеры**, которых у Spectator нет вовсе: `gettersToSpyOn`, `settersToSpyOn` и
  `autoSpyAccessors`, чтобы найти их по всей цепочке прототипов.
- **Хелперы, выбранные по типу возврата** — `resolveWith` / `rejectWith` для `Promise`, `nextWith` /
  `throwWith` для `Observable`, `calledWith(...)` для разветвления по аргументам, `failWith`, чтобы
  один набор аргументов бросал, пока остальные отвечают. У Spectator есть `andReturn` и `andCallFake`.
- **Честно типизированный дубль** и `injectSpy`, который сообщает о токене, который вы забыли
  предоставить, вместо того чтобы всё равно типизировать его как спай.
- **Zoneless и zone.js одинаково.** Ничто на пути спая не трогает `NgZone`. `fakeAsync` доступен за
  [`vitest-auto-spy/zone`](/ru/runtimes/vitest), когда сюите он всё ещё нужен.
- **Безопасно для AOT.** Работает под билдером Angular `@angular/build:unit-test`, а
  [`assertNgModuleScopes` и `assertComponentDefIntact`](/ru/adapters/angular-diagnostics) закрывают два
  способа, которыми AOT-бандл тестов падает через полчаса в чужой спеке.
- **За пределами Vitest** тот же API работает на `bun:test` и `node:test`, а `TestBed` из Angular
  работает [под `bun test`](/ru/runtimes/bun-angular).
- **[Тридцать семь правил линтера](/ru/utilities/eslint-plugin)**, версионируемые вместе с API, который
  они рекомендуют.

## Не потеряла ли миграция тест? {#did-the-migration-lose-a-test}

Ответ тот же, что и на [странице про jest](/ru/migrating#did-the-migration-lose-a-test): счётчики вам
не скажут, потому что файл может потерять целый `describe`, пока где-то в другом месте начинает
проходить нестабильный тест, — и итоги всё равно сойдутся. `compareTestRuns` сравнивает два
**множества имён тестов** из JSON-отчёта, который пишут оба прогона. Базовую линию берите с последнего
зелёного прогона на Spectator — а если этому прогону, чтобы вообще состояться, нужен установленный
`@angular/platform-browser-dynamic`, поставьте его ради базовой линии и удалите в конце.

## Смотрите также {#see-also}

- [Сравнение](/ru/comparison) — всё поле целиком, с датами последних релизов, включая измерения,
  стоящие за числами на этой странице.
- [Адаптер Angular](/ru/adapters/angular) — `provideAutoSpy`, `injectSpy`, `renderShallow`, ожидание в
  zoneless.
- [Переход с jest-auto-spies](/ru/migrating) и
  [с jasmine-auto-spies](/ru/migrating-jasmine) — если сюита на Spectator тащит ещё и одну из них.
