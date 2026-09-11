---
title: Роутер Angular
description: provideActivatedRoute и injectActivatedRoute — собственный ActivatedRoute Angular поверх одной записи, так что его потоки, ParamMap и снимок не могут разойтись, а сеттер двигает их вместе.
---

# Роутер Angular

```ts
import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({
  providers: [provideActivatedRoute({ params: { id: '7' }, queryParams: { tab: 'reviews' } })],
});

const fixture = TestBed.createComponent(ProductPage);

injectActivatedRoute().setParams({ id: '8' });
fixture.detectChanges(); // params и paramMap выпустили значение; snapshot.params уже читает { id: '8' }
```

`ActivatedRoute` держит всё, что читает компонент, — `snapshot`, `params`, `queryParams`, `data`,
`fragment`, `url` — в полях экземпляра. У каждого из привычных дублей есть только часть этого, и
недостающая часть падает далеко от провайдера:

| Дубль                                                             | Что получает код, читающий другую половину                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `provideAutoSpy(ActivatedRoute)`                                  | ни `snapshot`, ни `params`: это поля экземпляра, а спай строится по прототипу                          |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `route.paramMap` — `undefined`, и `route.paramMap.pipe(…)` падает внутри компонента                    |
| `{ provide: ActivatedRoute, useValue: { params: of({ id }) } }`   | `snapshot` — `undefined`, а поток больше не сдвинется: вторую навигацию не проверить                   |
| обе половины, написанные руками                                   | они совпадают до первой спеки, которая обновила одну и забыла про другую                               |

Дубль здесь — не подделка под маршрут. Это собственный `ActivatedRoute` Angular, собранный поверх
одной записи: каждый поток — `BehaviorSubject` одного из её полей, снимок — собственный
`ActivatedRouteSnapshot` Angular из той же записи, а оба `ParamMap` Angular сам выводит из них.
Второй копии, которая могла бы отстать, нет.

## `provideActivatedRoute(init?)` {#provideactivatedroute-init}

```ts
TestBed.configureTestingModule({
  providers: [
    provideActivatedRoute({
      params: { id: '7' },
      queryParams: { tab: 'reviews' },
      data: { product: chair },
      fragment: 'specs',
      url: 'products/7',
    }),
  ],
});
```

| Поле `init`   | Куда попадает                                                  | По умолчанию |
| ------------- | -------------------------------------------------------------- | ------------ |
| `params`      | `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`   | `{}`         |
| `queryParams` | `queryParams`, `queryParamMap` и их двойники в снимке          | `{}`         |
| `data`        | `data`, `snapshot.data`                                        | `{}`         |
| `fragment`    | `fragment`, `snapshot.fragment`                                | `null`       |
| `url`         | `url`, `snapshot.url` — строка режется по `/`                  | `[]`         |
| `outlet`      | `outlet`, `snapshot.outlet`                                    | `'primary'`  |
| `component`   | `component`, `snapshot.component`                              | `null`       |
| `routeConfig` | `routeConfig`, `snapshot.routeConfig`                          | `null`       |

Строковый `url` даёт сегменты без матричных параметров; передайте `UrlSegment`
(`[new UrlSegment('products', { color: 'red' })]`), если код их читает.

Возвращается один `FactoryProvider`, поэтому он кладётся в `providers` как есть, и **каждый
инжектор, который его строит, получает собственный маршрут**: список провайдеров, вынесенный в
константу модуля и переиспользуемый между тестами, никогда не переносит навигацию одного теста в
следующий.

::: warning Ставьте его после `provideRouter()`
В спеке, которая ещё и вызывает `provideRouter()` (или импортирует `RouterModule`), два провайдера
`ActivatedRoute`, и выигрывает последний. Ставьте `provideActivatedRoute()` последним —
`injectActivatedRoute()` скажет об этом прямо, если найдёт вместо дубля маршрут самого роутера.
:::

## `injectActivatedRoute(injector?)` {#injectactivatedroute-injector}

```ts
const route = injectActivatedRoute();

route.setQueryParams({ tab: 'specs' });
route.set({ params: { id: '9' }, fragment: null });
```

Хендл маршрута, который `provideActivatedRoute()` положил в инжектор теста. Читает `TestBed`;
передайте `fixture.debugElement.injector`, когда маршрут лежит в собственных `providers` компонента.

| Член                     | Что делает                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `route`                  | тот `ActivatedRoute`, который выдаёт каждый инжектор в тесте                        |
| `setParams(params)`      | заменить параметры                                                                  |
| `setQueryParams(params)` | заменить query-параметры                                                            |
| `setData(data)`          | заменить данные                                                                     |
| `setFragment(fragment)`  | заменить фрагмент; `null` — фрагмента нет                                           |
| `setUrl(url)`            | заменить сегменты URL; строка или `UrlSegment[]`                                    |
| `set(change)`            | несколько из перечисленного одной навигацией: один новый снимок, каждый поток не больше раза |

Каждое изменение ведёт себя так же, как собственное обновление роутера после навигации, поэтому
спека не увидит того, чего никогда не увидит приложение:

- **Снимок двигается первым.** Подписчик на `params`, который читает `route.snapshot` в своём
  колбэке, уже видит новые значения. Снимок каждый раз — **новый объект**, как после навигации:
  ссылка, сохранённая раньше, по-прежнему держит старое состояние.
- **Потоки выпускают значения в порядке роутера** — `queryParams`, `fragment`, `params`, `url`,
  `data`.
- **Равное значение ничего не выпускает.** Равенство — роутерное: те же ключи, включая символьные,
  каждое значение `===`, массивы сравниваются как отсортированные множества. Строковый `url` строит
  новые сегменты, а новые сегменты — это изменение, ровно как когда роутер заново разбирает URL.
- **Сеттер заменяет, а не сливает** — параметры после навигации это весь набор. Чтобы сохранить
  старые, разверните их: `route.setQueryParams({ ...route.route.snapshot.queryParams, page: '2' })`.

## `createActivatedRoute(init?)` {#createactivatedroute-init}

Тот же дубль без `TestBed` — для класса, который создаётся через `new`, или функционального гарда
или резолвера, принимающего снимок аргументом:

```ts
import { createActivatedRoute } from 'vitest-auto-spy/angular-router';

const { route, setParams } = createActivatedRoute({ params: { id: '7' } });
const page = new ProductPage(route);

setParams({ id: '8' });

expect(page.productId()).toBe('8');
```

Сеттеры — обычные функции над маршрутом, с которым их построили, поэтому деструктурировать их
безопасно.

## Собственный маршрут Angular, сверенный с Angular {#angular-s-own-route-checked-against-angular}

- Выполняются `route instanceof ActivatedRoute` и `route.snapshot instanceof ActivatedRouteSnapshot`,
  а спеки сравнивают собственные ключи дубля с ключами `new ActivatedRoute()` и
  `new ActivatedRouteSnapshot()` — член, который добавит будущий Angular, окажется на дубле в день
  выхода, а изменение в том, как собираются классы, уронит набор тестов, а не уйдёт в релиз.
- Маршрут сидит в дереве из одного узла, поэтому геттеры дерева отвечают, а не падают: `root` — сам
  маршрут, `parent` и `firstChild` — `null`, `children` пуст, `pathFromRoot` — `[route]`; то же для
  снимка.
- Для настоящего `Router` это настоящий маршрут:

  ```ts
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideActivatedRoute({ url: 'products/12' })] });

  const router = TestBed.inject(Router);

  router.serializeUrl(router.createUrlTree(['reviews'], { relativeTo: injectActivatedRoute().route }));
  // '/products/12/reviews'
  ```

Маршрут собирается собственными конструкторами роутера, а они внутренние — не менялись с Angular 20
по 22 и проверяются в момент сборки дубля. Мажор, который их переставит, упадёт на первом же
`provideActivatedRoute()` с сообщением, называющим член, который собрался не так, а не выдаст
маршрут, молча читающий не то поле; CI пакета собирает дубль на каждом поддерживаемом мажоре Angular.

## Чего он сознательно не делает {#what-it-deliberately-does-not-do}

- **Нет родительских и дочерних маршрутов.** Компоненту, который читает `route.parent.params` или
  `route.firstChild`, нужно дерево; подмените один член через
  [`mockReadonlyProp`](/ru/adapters/angular#signal-readonly-property-mocking) или ведите настоящий
  роутер через `RouterTestingHarness`, когда под тестом само дерево.
- **Нет `title`.** Роутер хранит вычисленный заголовок в `data` под приватным символом, поэтому
  `title` здесь выпускает `undefined` — как у маршрута, которому заголовок никто не дал.
- **Нет навигации.** `Router.navigate()` этот маршрут не двигает — его двигают сеттеры. Когда под
  тестом сама навигация, это работа `RouterTestingHarness`.
- **Нет привязки инпутов.** `withComponentInputBinding()` — работа аутлета; задайте инпут через
  `fixture.componentRef.setInput('id', '7')`.

## Что говорит каждое падение {#what-each-failure-says}

| Сообщение содержит                                                   | Причина                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `injectActivatedRoute(): nothing provides ActivatedRoute here`       | провайдера нет вовсе — добавьте `provideActivatedRoute({ … })` в `providers`                             |
| `the ActivatedRoute here is … not one provideActivatedRoute() built` | выиграл более поздний провайдер: `provideRouter()`, `RouterModule`, `useValue`, `provideAutoSpy` — ставьте этот последним |
| `the installed @angular/router does not wire ActivatedRoute …`       | мажор роутера собирает классы иначе; сообщите об этом с версией                                          |

## Отдельный вход и опциональная peer-зависимость {#its-own-entry-and-an-optional-peer}

`vitest-auto-spy/angular-router` — единственная часть пакета, которая импортирует `@angular/router`,
поэтому `@angular/router` — **опциональная** peer-зависимость, за которую платят только сюиты,
импортирующие этот вход, — по той же причине [`vitest-auto-spy/angular-http`](/ru/adapters/angular-http)
в одиночку держит `@angular/common`.

- Как и `/angular-http`, он **не** реэкспортирует ядро; это спутник `vitest-auto-spy/angular`.
- Он не регистрирует ни хуков, ни мок-адаптера и ничего не импортирует из тест-раннера, поэтому
  точно так же работает под [`bun test`](/ru/runtimes/bun-angular).
- Вход весит **2.1 kB min+gzip** (2063 B, замерено так же, как для бейджа в README: бандл esbuild,
  минифицированный, gzip, пиры внешние).
