---
title: Роутер Angular
description: provideActivatedRoute и provideRouterDouble — собственный ActivatedRoute Angular поверх одной записи и Router, у которого URL, routerState и events не могут разойтись, а navigate уже спай.
---

# Роутер Angular

Здесь живут два дубля: `ActivatedRoute`, который читает компонент, и [`Router`](#the-router-double),
которым он навигирует. Друг без друга они обходятся, а спека, которой нужны оба, объявляет оба.

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

| Дубль                                                             | Что получает код, читающий другую половину                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `provideAutoSpy(ActivatedRoute)`                                  | ни `snapshot`, ни `params`: это поля экземпляра, а спай строится по прототипу        |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `route.paramMap` — `undefined`, и `route.paramMap.pipe(…)` падает внутри компонента  |
| `{ provide: ActivatedRoute, useValue: { params: of({ id }) } }`   | `snapshot` — `undefined`, а поток больше не сдвинется: вторую навигацию не проверить |
| обе половины, написанные руками                                   | они совпадают до первой спеки, которая обновила одну и забыла про другую             |

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

| Поле `init`   | Куда попадает                                                | По умолчанию |
| ------------- | ------------------------------------------------------------ | ------------ |
| `params`      | `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap` | `{}`         |
| `queryParams` | `queryParams`, `queryParamMap` и их двойники в снимке        | `{}`         |
| `data`        | `data`, `snapshot.data`                                      | `{}`         |
| `fragment`    | `fragment`, `snapshot.fragment`                              | `null`       |
| `url`         | `url`, `snapshot.url` — строка режется по `/`                | `[]`         |
| `outlet`      | `outlet`, `snapshot.outlet`                                  | `'primary'`  |
| `component`   | `component`, `snapshot.component`                            | `null`       |
| `routeConfig` | `routeConfig`, `snapshot.routeConfig`                        | `null`       |

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

| Член                     | Что делает                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `route`                  | тот `ActivatedRoute`, который выдаёт каждый инжектор в тесте                                 |
| `setParams(params)`      | заменить параметры                                                                           |
| `setQueryParams(params)` | заменить query-параметры                                                                     |
| `setData(data)`          | заменить данные                                                                              |
| `setFragment(fragment)`  | заменить фрагмент; `null` — фрагмента нет                                                    |
| `setUrl(url)`            | заменить сегменты URL; строка или `UrlSegment[]`                                             |
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

| Сообщение содержит                                                   | Причина                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `injectActivatedRoute(): nothing provides ActivatedRoute here`       | провайдера нет вовсе — добавьте `provideActivatedRoute({ … })` в `providers`                                              |
| `the ActivatedRoute here is … not one provideActivatedRoute() built` | выиграл более поздний провайдер: `provideRouter()`, `RouterModule`, `useValue`, `provideAutoSpy` — ставьте этот последним |
| `the installed @angular/router does not wire ActivatedRoute …`       | мажор роутера собирает классы иначе; сообщите об этом с версией                                                           |

## Дубль Router {#the-router-double}

### `provideRouterDouble(init?)` {#providerouterdouble-init}

```ts
import { injectRouterDouble, provideRouterDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/products/7' })] });

const fixture = TestBed.createComponent(ProductPage);
const router = injectRouterDouble();

await fixture.componentInstance.checkout();
expect(router.navigate).toHaveBeenCalledWith(['/checkout']);

router.emitNavigation('/products/8'); // events выпустил NavigationEnd; router.url уже читает его
fixture.detectChanges();
```

После маршрута `Router` — провайдер, который реальные сюиты пишут руками чаще всего: 48 штук в двух
приватных наборах тестов, и все 48 — одна и та же строка:
`createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate: Promise.resolve(true) } })`.
Каждая её часть — догадка, сквозь которую компонент проваливается: `of()` больше ничего не выпустит,
`url` — строка, которую никто не обновляет, `routerState` нет вовсе, а `serializeUrl` падает на
первом же редиректе, собранном гардом.

Этот дубль держит один URL и выводит из него всё остальное. В отличие от маршрута выше он **не**
экземпляр класса Angular — настоящий `Router` тянет за собой всю маршрутизацию, а юнит-тесту она ни
к чему, — поэтому это структурный дубль, выданный на токен `Router`:

| Член                        | Что это                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `url`                       | URL, сериализованный так же, как настоящий роутер сериализует свой: `setUrl('products/7')` читается как `/products/7` |
| `events`                    | `BehaviorSubject`, начинающийся с того `NavigationEnd`, который привёл роутер сюда                                    |
| `navigate`, `navigateByUrl` | спаи, резолвящиеся в `true`: записывают вызов и не трогают URL                                                        |
| `serializeUrl`, `parseUrl`  | собственный `DefaultUrlSerializer` роутера, а не пара заглушек                                                        |
| `createUrlTree`             | `createUrlTreeFromSnapshot` самого Angular, поэтому `relativeTo`, `queryParamsHandling` и `preserveFragment` работают |
| `routerState`               | собственный `RouterState` Angular: `snapshot.url` — это URL, а `root` — маршрут с его query-параметрами и фрагментом  |

Всё остальное, что объявляет `Router` Angular, — `getCurrentNavigation`, `isActive`, `resetConfig` —
**не** `undefined`: чтение падает, называя член и то, что дубль покрывает. Член, отвечающий на вызов,
которого в юнит-тесте быть не должно, — это то, как неправильный тест доживает до зелёного прогона.

У `init` одно поле, `url`, потому что всё остальное в роутере следует из него. По умолчанию — `'/'`.

### `injectRouterDouble(injector?)` {#injectrouterdouble-injector}

```ts
const router = injectRouterDouble();

router.setUrl('/products/8?tab=reviews');
router.navigate.resolveWith(false);
```

Хендл роутера, который `provideRouterDouble()` положил в инжектор теста. Читает `TestBed`; передайте
`fixture.debugElement.injector`, когда роутер лежит в собственных `providers` компонента.

| Член                     | Что делает                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `router`                 | то значение, которое каждый инжектор в тесте выдаёт на `Router`                           |
| `navigate`               | спай `navigate()` — проверяйте его или отвечайте через `resolveWith(false)`               |
| `navigateByUrl`          | спай `navigateByUrl()`, точно так же                                                      |
| `setUrl(url)`            | поставить роутер на URL: `url`, `routerState` и корневой маршрут двигаются вместе и молча |
| `emitNavigation(event?)` | протолкнуть событие через `router.events`                                                 |

`emitNavigation()` принимает то, что есть у спеки: ничего (объявить текущий URL заново), строку URL
(`NavigationEnd` для неё соберут за вас) или собранное вами событие — `new NavigationEnd(1, '/a', '/a')`,
`new NavigationStart(1, '/a')`, что угодно из объединения. `NavigationEnd` двигает URL вместе с
собой, как это делает настоящий роутер; любое другое событие оставляет URL на месте.

Из того, что `events` — `BehaviorSubject`, а не `Subject`, который выставляет настоящий роутер,
следуют две вещи:

- **Подписчик, пришедший позже, видит последнюю навигацию.** Что раньше — `emitNavigation()` или
  `fixture.detectChanges()` — перестаёт решать, увидел ли её компонент; на этом и держится флакость
  самодельных дублей на `Subject`.
- **Первое, что видит подписчик, — `NavigationEnd` стартового URL**, потому что это и есть навигация,
  которая привела роутер сюда. Компонент, считающий навигации, начинает с единицы, а не с нуля.

### `createRouterDouble(init?)` {#createrouterdouble-init}

Тот же дубль без `TestBed` — для гарда или класса, который создаётся через `new`:

```ts
import { createRouterDouble } from 'vitest-auto-spy/angular-router';

const { router, navigate } = createRouterDouble({ url: '/admin' });

expect(new AuthGuard(router).canActivate()).toBe(false);
expect(navigate).toHaveBeenCalledWith(['/login']);
```

### Чего дубль Router не делает {#what-the-router-double-does-not-do}

- **Он не навигирует.** `navigate()` и `navigateByUrl()` записывают вызов и резолвятся в `true`, но
  не двигают `url`. Навигация в приложении асинхронна, проходит гарды и может быть отменена — дубль,
  который двигал бы собственный URL по вызову, проверял бы сам себя. Двигают его `setUrl()` и
  `emitNavigation()`, а когда под тестом сама навигация — это `RouterTestingHarness` поверх
  настоящего `provideRouter()`.
- **Это токен `Router` и ничего больше.** Ни маршрутов, ни аутлета, ни `RouterLinkActive`. Ссылка
  `routerLink` в шаблоне разрешается — её `href` выходит из `createUrlTree` и `serializeUrl`, а они
  собственные роутерные, — но как только спека про маршрутизацию, а не про компонент, короче дорога
  через настоящий роутер.
- **Он не заменяет `provideActivatedRoute()`.** `routerState.root` — корневой маршрут: он несёт
  query-параметры и фрагмент URL и, как настоящий корень, не имеет ни сегментов, ни параметров.
  Маршрут, который инжектит компонент, — по-прежнему второй хелпер на этой странице; они стоят рядом.

В отличие от дубля маршрута этот строит спаи, поэтому вход, регистрирующий мок-адаптер, — любой
импорт `vitest-auto-spy` в сюите, обычно `vitest-auto-spy/angular` в том же файле или в setup-файле,
— должен быть загружен. Без него первый же `provideRouterDouble()` скажет
`No mock adapter registered` и назовёт нужный импорт.

### Что говорит каждое падение Router {#what-each-router-failure-says}

| Сообщение содержит                                                      | Причина                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `the Router double has no …`                                            | код под тестом полез за членом `Router`, которого у дубля нет                                                           |
| `the Router here is Angular's own, not one provideRouterDouble() built` | `Router` объявлен `providedIn: 'root'`, поэтому `TestBed` без дубля выдаёт настоящий — добавьте `provideRouterDouble()` |
| `the Router here is a value written by hand …`                          | выиграл `useValue` или `provideAutoSpy(Router)` — ставьте `provideRouterDouble()` последним                             |
| `nothing provides Router in the injector given`                         | инжектор, собранный руками, в котором `Router` нет вовсе                                                                |

В отличие от маршрута этот дубль не нужно ставить после `provideRouter()`: `Router` объявлен
`providedIn: 'root'`, а `provideRouter()` токен заново не выдаёт, поэтому явный провайдер выигрывает
в любом порядке.

## Отдельный вход и опциональная peer-зависимость {#its-own-entry-and-an-optional-peer}

`vitest-auto-spy/angular-router` — единственная часть пакета, которая импортирует `@angular/router`,
поэтому `@angular/router` — **опциональная** peer-зависимость, за которую платят только сюиты,
импортирующие этот вход, — по той же причине [`vitest-auto-spy/angular-http`](/ru/adapters/angular-http)
в одиночку держит `@angular/common`.

- Как и `/angular-http`, он **не** реэкспортирует ядро; это спутник `vitest-auto-spy/angular`.
- Он не регистрирует ни хуков, ни мок-адаптера и ничего не импортирует из тест-раннера, поэтому
  точно так же работает под [`bun test`](/ru/runtimes/bun-angular).
- Вход весит **6.4 kB min+gzip** (6396 B, замерено так же, как для бейджа в README: бандл esbuild,
  минифицированный, gzip, пиры внешние).
