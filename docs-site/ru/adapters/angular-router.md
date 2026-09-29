---
title: Роутер Angular
description: Подмены ActivatedRoute, Router и Location для тестов. Задайте параметры маршрута, сдвиньте URL, проверьте navigate() и то, куда ушло приложение, без настоящего роутера.
---

# Роутер Angular

`vitest-auto-spy/angular-router` даёт готовые подмены для трёх сервисов роутера, с которыми
работает компонент: `ActivatedRoute`, [`Router`](#the-router-double) и
[`Location`](#the-location-double). Подмена — объект, который тест выдаёт вместо настоящего
сервиса. Эта страница нужна, когда компонент читает параметры маршрута, вызывает
`router.navigate()` или проверяет, куда ушло приложение.

```ts
import { TestBed } from '@angular/core/testing';

import 'vitest-auto-spy/angular';

import { injectActivatedRoute, injectRouterDouble, provideActivatedRoute, provideRouterDouble } from 'vitest-auto-spy/angular-router';

import { ProfileComponent } from './profile.component';

it('opens the orders of the user in the route', () => {
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [provideActivatedRoute({ params: { id: '7' } }), provideRouterDouble()],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  const router = injectRouterDouble();
  fixture.detectChanges(); // компонент прочитал id '7' из paramMap

  fixture.componentInstance.openOrders();
  expect(router.navigate).toHaveBeenCalledWith(['/users', '7', 'orders']);

  injectActivatedRoute().setParams({ id: '8' }); // маршрут переходит на пользователя 8
  fixture.detectChanges(); // paramMap уже отдал '8'; это перерисовка

  fixture.componentInstance.openOrders();
  expect(router.navigate).toHaveBeenLastCalledWith(['/users', '8', 'orders']);
});
```

- `provideActivatedRoute()` задаёт то, что компонент читает из маршрута. `injectActivatedRoute()`
  меняет это позже в тесте.
- `provideRouterDouble()` подменяет `Router`. Его `navigate()` — спай: записывает вызов и
  возвращает промис с `true`, но маршрут не меняет.
- `import 'vitest-auto-spy/angular'` позволяет библиотеке создавать спаи Vitest. Без него
  `provideRouterDouble()` бросит `No mock adapter registered`. Импорт можно перенести в setup-файл;
  импорт в обоих местах ничего не ломает.
- Параметры маршрута — строки, как в настоящем приложении.
- Компонент увидит `setParams()`, только если подписан на `params` или `paramMap`. Значение, которое
  он один раз скопировал из `route.snapshot`, не изменится.

Каждый хелпер — отдельный провайдер. Компоненту, который только читает маршрут, хватит
`provideActivatedRoute()`; если он ещё и переходит по ссылкам, нужны оба, как в примере.

| Код использует                | Провайдер                 | Чем управлять                                                              |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `ActivatedRoute`              | `provideActivatedRoute()` | [`injectActivatedRoute()`](#injectactivatedroute-injector)                 |
| `Router`                      | `provideRouterDouble()`   | [`injectRouterDouble()`](#injectrouterdouble-injector)                     |
| `Location`                    | `provideLocationDouble()` | [`injectLocationDouble()`](#the-location-double)                           |
| порядок событий роутера       | —                         | [`collectRouterEvents()`](#collectrouterevents-events)                     |
| любое из этого, без `TestBed` | —                         | `createActivatedRoute()`, `createRouterDouble()`, `createLocationDouble()` |

## Почему не написать `ActivatedRoute` руками {#why-not-a-hand-written-activatedroute}

`ActivatedRoute` хранит то, что читает компонент (`snapshot`, `params`, `queryParams`, `data`,
`fragment`, `url`), в полях экземпляра. Привычные самодельные моки покрывают только часть:

| Мок                                                               | Что ломается                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `provideAutoSpy(ActivatedRoute)`                                  | нет ни `snapshot`, ни `params`: спай строится по прототипу, а не по полям |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `route.paramMap` — `undefined`, и `route.paramMap.pipe(…)` падает         |
| `{ provide: ActivatedRoute, useValue: { params: of({ id }) } }`   | `snapshot` — `undefined`, а вторую навигацию не проверить                 |
| обе половины руками                                               | они разойдутся, как только спека обновит одну и забудет про другую        |

Подмена здесь — настоящий `ActivatedRoute` Angular. Потоки и снимок (snapshot) строятся из одних
и тех же данных, поэтому всегда совпадают.

## `provideActivatedRoute(init?)` {#provideactivatedroute-init}

Выдаёт `ActivatedRoute` с переданными значениями. Кладётся в `providers` тестового модуля.

```ts
TestBed.configureTestingModule({
  imports: [ProfileComponent],
  providers: [
    provideActivatedRoute({
      params: { id: '7' },
      queryParams: { tab: 'orders' },
      data: { user: ada },
      fragment: 'contacts',
      url: 'users/7',
    }),
  ],
});
```

| Поле `init`   | Тип                      | По умолчанию | Что задаёт                                                                  |
| ------------- | ------------------------ | ------------ | --------------------------------------------------------------------------- |
| `params`      | `Params`                 | `{}`         | `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`                |
| `queryParams` | `Params`                 | `{}`         | `queryParams`, `queryParamMap` и то же в снимке                             |
| `data`        | `Data`                   | `{}`         | `data`, `snapshot.data`                                                     |
| `title`       | `string`                 | `undefined`  | `route.title`, `snapshot.title`                                             |
| `fragment`    | `string \| null`         | `null`       | `fragment`, `snapshot.fragment`                                             |
| `url`         | `string \| UrlSegment[]` | `[]`         | `url`, `snapshot.url`; строка режется по `/`                                |
| `outlet`      | `string`                 | `'primary'`  | `outlet`, `snapshot.outlet`                                                 |
| `component`   | `Type \| null`           | `null`       | `component`, `snapshot.component`                                           |
| `routeConfig` | `Route \| null`          | `null`       | `routeConfig`, `snapshot.routeConfig`                                       |
| `resolve`     | `ResolveData`            | `{}`         | данные резолверов в снимке, отдельно от `data`, как хранит их Angular       |
| `children`    | `ActivatedRouteInit[]`   | `[]`         | `children`, `firstChild`, а у каждого дочернего — `parent` и `root`         |
| `resources`   | запись ресурсов маршрута | `undefined`  | `resources`, `snapshot.resources`; только Angular 22.2+ (developer preview) |

**Дочерние маршруты.** Каждый элемент `children` становится дочерним маршрутом с теми же опциями.
Меняйте их через массив `children`, который возвращает хелпер. Снимок родителя обновится вместе с
ними:

```ts
const { route, children } = createActivatedRoute({
  children: [{ outlet: 'aside', routeConfig: { path: 'map' } }],
});

children[0]?.setParams({ id: '8' }); // route.snapshot.firstChild.params теперь { id: '8' }
```

**Ресурсы.** Если компонент читает `route.resources`, передайте пустую запись и ставьте каждый ресурс
через [`mockResourceProp`](/ru/adapters/angular#skipping-the-request-entirely-—-mockresourceprop).
Маршрут и все снимки делят эту одну запись. `restoreMockedProps()` снимает подмену.

```ts
const resources = {};

TestBed.configureTestingModule({ providers: [provideActivatedRoute({ resources })] });

const user = mockResourceProp(resources, 'user', undefined as User | undefined, { status: 'loading' });
user.set({ name: 'Ada' });
```

**Матричные параметры.** В строковом `url` их нет. Если код их читает, передайте `UrlSegment`:
`url: [new UrlSegment('users', { role: 'admin' })]`.

**Общие провайдеры для нескольких тестов безопасны.** Каждый тест получает новый маршрут, даже если
список провайдеров лежит в константе в начале файла.

::: warning С настоящим роутером Angular ставьте его последним
Настоящие `provideRouter()` и `RouterModule` из Angular тоже выдают `ActivatedRoute`, а выигрывает
более поздний провайдер. Поэтому ставьте `provideActivatedRoute()` после них, иначе
`injectActivatedRoute()` бросит ошибку и скажет, какой маршрут нашёл вместо подмены.
`provideRouterDouble()` `ActivatedRoute` не выдаёт, так что с подменой Router порядок не важен.
:::

## `injectActivatedRoute(injector?)` {#injectactivatedroute-injector}

Возвращает объект с маршрутом (`route`) и сеттерами, которые его меняют. По умолчанию читает из
`TestBed`. Если маршрут
лежит в собственных `providers` компонента, передайте `fixture.debugElement.injector`.

```ts
const route = injectActivatedRoute();

route.setQueryParams({ tab: 'orders' });
route.set({ params: { id: '9' }, fragment: null }); // два изменения, одна навигация
```

| Поле                     | Что делает                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `route`                  | тот `ActivatedRoute`, который выдаёт любой инжектор в тесте                                 |
| `setParams(params)`      | заменяет параметры                                                                          |
| `setQueryParams(params)` | заменяет query-параметры                                                                    |
| `setData(data)`          | заменяет данные                                                                             |
| `setFragment(fragment)`  | заменяет фрагмент; `null` — фрагмента нет                                                   |
| `setUrl(url)`            | заменяет сегменты URL; строка или `UrlSegment[]`                                            |
| `set(change)`            | несколько изменений одной навигацией: один новый снимок, каждый поток не больше одного раза |
| `children`               | объекты дочерних маршрутов из `init.children`, по порядку                                   |

Каждое изменение ведёт себя как обновление маршрута настоящим роутером после навигации:

- **Сначала меняется снимок.** Подписчик на `params`, который читает `route.snapshot`, уже видит
  новые значения. Каждое изменение создаёт новый объект снимка, поэтому сохранённый раньше снимок
  хранит старые значения.
- **Потоки отдают новые значения в порядке роутера:** `queryParams`, `fragment`, `params`, `url`,
  `data`.
- **То же значение ещё раз поток не отдаёт.** Если id уже `'7'`, `setParams({ id: '7' })` ничего не
  отдаст. Значения равны, если совпадают ключи (включая ключи-`Symbol`) и значения по `===`. Значение-массив
  (`?tag=a&tag=b`) сравнивается без учёта порядка. Строковый `url` каждый раз создаёт новые
  сегменты, поэтому его поток срабатывает всегда.
- **Сеттер заменяет, а не дополняет.** Чтобы сохранить старые значения, возьмите их из `route`:

  ```ts
  const { route, setQueryParams } = injectActivatedRoute();

  setQueryParams({ ...route.snapshot.queryParams, page: '2' });
  ```

## `createActivatedRoute(init?)` {#createactivatedroute-init}

Тот же маршрут без `TestBed`. Нужен для класса, который вы создаёте через `new`, или для
функционального гарда и резолвера, которые получают маршрут аргументом. Принимает тот же `init`,
что и `provideActivatedRoute()`, и возвращает такой же объект.

```ts
import { createActivatedRoute } from 'vitest-auto-spy/angular-router';

const { route, setParams } = createActivatedRoute({ params: { id: '7' } });
const page = new ProfilePage(route);

setParams({ id: '8' });

expect(page.userId()).toBe('8');
```

Сеттеры — обычные функции, их можно деструктурировать.

## Это настоящий маршрут Angular {#angular-s-own-route-checked-against-angular}

- `route instanceof ActivatedRoute` и `route.snapshot instanceof ActivatedRouteSnapshot` истинны.
  Тесты библиотеки сравнивают ключи подмены с настоящим `new ActivatedRoute()`, поэтому поле, которое
  добавит будущий Angular, появится и здесь.
- Без `children` маршрут стоит в дереве из одного узла, поэтому геттеры дерева возвращают значения, а не бросают ошибку: `root` — сам
  маршрут, `parent` и `firstChild` — `null`, `children` пуст, `pathFromRoot` — `[route]`. Снимок
  отвечает так же.
- Настоящий `Router` принимает его как настоящий маршрут:

  ```ts
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideActivatedRoute({ url: 'users/12' })] });

  const router = TestBed.inject(Router);

  router.serializeUrl(router.createUrlTree(['orders'], { relativeTo: injectActivatedRoute().route }));
  // → '/users/12/orders'
  ```

Если будущий Angular начнёт собирать маршруты иначе, первый же `provideActivatedRoute()` бросит
ошибку и назовёт поле, которое собралось неправильно.

## Чего он сознательно не делает {#what-it-deliberately-does-not-do}

- **Нет родительского маршрута и нет дерева из конфига.** Построенный маршрут — корень, поэтому
  `route.parent` равен `null`. Если компонент читает `route.parent.params`, подмените это поле через
  [`mockReadonlyProp`](/ru/adapters/angular#signal-readonly-property-mocking) или возьмите настоящий
  роутер с `RouterTestingHarness`. Дочерние маршруты берутся только из `children`; массив
  `routeConfig.children` маршрутов не создаёт.
- **`title` — просто строка.** `provideActivatedRoute({ title: 'User 7' })` задаёт
  `route.snapshot.title`. Резолвер `title: () => …` в `routeConfig` не запускается; передайте
  готовую строку.
- **`resources` — просто запись.** Функция `resources: (ctx) => …` в `routeConfig` не запускается.
  Передайте запись, которую читает компонент, и управляйте каждым ресурсом через `mockResourceProp`.
  Сеттера для неё нет: роутер держит одну запись всю жизнь маршрута.
- **`navigate()` этот маршрут не меняет.** Проверяйте вызов `navigate()` на
  [подмене Router](#the-router-double), а маршрут меняйте сеттерами. Настоящую маршрутизацию (гарды,
  резолверы, редиректы) проверяйте через `RouterTestingHarness` из Angular.
- **Нет привязки инпутов.** `withComponentInputBinding()` — работа аутлета. Задайте инпут сами:
  `fixture.componentRef.setInput('id', '7')`.

## Что говорит каждое падение {#what-each-failure-says}

| Сообщение содержит                                                                                 | Причина и что сделать                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `injectActivatedRoute(): nothing provides ActivatedRoute here`                                     | провайдера нет вовсе; добавьте `provideActivatedRoute({ … })` в `providers`                                               |
| `the ActivatedRoute here is … not one provideActivatedRoute() built`                               | выиграл более поздний провайдер (`provideRouter()`, `RouterModule`, `useValue`, `provideAutoSpy`); ставьте этот последним |
| `@angular/router <version> does not wire ActivatedRoute …`                                         | эта версия роутера собирает классы иначе; соберите маршрут вручную и сообщите версию                                      |
| `provideActivatedRoute({ title }): … keeps the route title under a key this helper could not find` | эта версия роутера хранит заголовок в другом месте; уберите `title` и сообщите версию                                     |

## Подмена Router {#the-router-double}

### `provideRouterDouble(init?)` {#providerouterdouble-init}

Выдаёт подмену `Router`. `navigate()` и `navigateByUrl()` — спаи, а `url`, `routerState` и
`events` всегда согласованы между собой.

```ts
import { TestBed } from '@angular/core/testing';

import 'vitest-auto-spy/angular';

import { injectRouterDouble, provideRouterDouble } from 'vitest-auto-spy/angular-router';

import { ProfileComponent } from './profile.component';

it('goes to checkout', async () => {
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [provideRouterDouble({ url: '/users/7' })],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  const router = injectRouterDouble();

  await fixture.componentInstance.checkout();
  expect(router.navigate).toHaveBeenCalledWith(['/checkout']);

  router.emitNavigation('/users/8'); // синхронно; events отдал NavigationEnd; router.url — '/users/8'
  fixture.detectChanges();
});
```

`navigate()` и `navigateByUrl()` — спаи `vi.fn()` из Vitest. Чтобы их создать, библиотеке нужен
`import 'vitest-auto-spy/angular'` (или `'vitest-auto-spy'`) где-то в прогоне тестов. Импортируйте его один раз — в спеке или в setup-файле. Без него
первый же `provideRouterDouble()` бросит `No mock adapter registered` и назовёт нужный импорт.

| Поле `init`         | Тип                      | По умолчанию | Что задаёт                                                                     |
| ------------------- | ------------------------ | ------------ | ------------------------------------------------------------------------------ |
| `url`               | `string`                 | `'/'`        | где стоит роутер; `routerState` и `events` выводятся из него                   |
| `currentNavigation` | `NavigationInit \| null` | `null`       | навигация в процессе — для компонента, который читает её в инициализаторе поля |
| `children`          | `ActivatedRouteInit[]`   | нет          | маршруты под `routerState.root`, любой вложенности                             |

`children` нужен коду, который обходит `routerState.root.children` в поисках открытых аутлетов.
`setUrl()` их сохраняет:

```ts
provideRouterDouble({
  url: '/cards/7',
  children: [{ routeConfig: { path: 'cards' }, children: [{ outlet: 'report' }, { outlet: 'map' }] }],
});
```

Из чего состоит подмена:

| Поле                        | Что это                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `url`                       | URL в том же формате, что у настоящего роутера: после `setUrl('users/7')` читается `/users/7`                     |
| `events`                    | `BehaviorSubject`, который начинается с `NavigationEnd` стартового URL                                            |
| `navigate`, `navigateByUrl` | спаи: резолвятся в `true`, записывают вызов и не меняют URL                                                       |
| `serializeUrl`, `parseUrl`  | собственный `DefaultUrlSerializer` Angular                                                                        |
| `createUrlTree`             | `createUrlTreeFromSnapshot` из Angular, поэтому `relativeTo`, `queryParamsHandling` и `preserveFragment` работают |
| `routerState`               | собственный `RouterState` Angular: `snapshot.url` — это URL, `root` несёт его query-параметры и фрагмент          |
| `currentNavigation`         | навигация в процессе (сигнал Angular 20.2+), `null`, пока роутер стоит на месте                                   |
| `getCurrentNavigation()`    | тот же ответ через устаревший метод                                                                               |

Любое другое поле или метод `Router` (`isActive`, `resetConfig`, `lastSuccessfulNavigation`, …) при чтении
бросает ошибку. Она называет это поле и перечисляет, что подмена умеет. Вместо тихого `undefined` вы
получаете понятное падение.

Подмена — не экземпляр класса `Router` из Angular: настоящий `Router` тянет за собой всю
маршрутизацию. Это объект, выданный на токен `Router`.

**Частая ошибка:** самодельный
`createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate: Promise.resolve(true) } })`
ломается молча. `of()` больше ничего не отдаст, `url` не меняется, `routerState` нет, а
`serializeUrl` падает, как только гард собирает редирект. Берите `provideRouterDouble()`.

### `injectRouterDouble(injector?)` {#injectrouterdouble-injector}

Возвращает объект, через который тест управляет роутером. По умолчанию читает из `TestBed`. Если
роутер лежит в собственных `providers` компонента, передайте `fixture.debugElement.injector`.

```ts
const router = injectRouterDouble();

router.setUrl('/users/8?tab=orders');
router.navigate.resolveWith(false); // следующий navigate() вернёт false
```

| Поле                                | Что делает                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `router`                            | то значение, которое любой инжектор в тесте выдаёт на `Router`                             |
| `navigate`                          | спай `navigate()`: проверяйте вызовы или отвечайте через `resolveWith(false)`              |
| `navigateByUrl`                     | спай `navigateByUrl()`, так же                                                             |
| `setUrl(url)`                       | ставит роутер на URL; `url`, `routerState` и корневой маршрут меняются вместе, без события |
| `emitNavigation(event?)`            | отправляет событие в `router.events`; возвращает промис                                    |
| `setCurrentNavigation(navigation?)` | запускает навигацию или завершает её через `null`                                          |

`emitNavigation()` принимает:

- ничего — объявить текущий URL ещё раз;
- строку URL — для неё соберётся `NavigationEnd`;
- любое событие роутера, собранное вами, например `new NavigationEnd(1, '/a', '/a')` или
  `new NavigationStart(1, '/a')`.

`NavigationEnd` двигает URL, как у настоящего роутера. Остальные события URL не трогают.

Работа синхронная: следующая строка уже видит новое состояние, с `await` или без. Промис нужен
тестируемому коду, который ждёт окончания навигации. Он резолвится, когда событие доставлено
и завершённая им навигация закончилась.

У настоящего роутера `events` — обычный `Subject`, а у подмены — `BehaviorSubject`. Из этого
следуют две вещи:

- **Поздний подписчик всё равно видит последнюю навигацию.** Уже не важно, что было раньше:
  `emitNavigation()` или `fixture.detectChanges()`.
- **Первым подписчик получает `NavigationEnd` стартового URL.** Компонент, который считает
  навигации, начинает с единицы, а не с нуля.

### Навигация в полёте {#the-navigation-in-flight}

Компонент читает `currentNavigation()`, чтобы узнать, откуда пришла навигация: какой `extras.state`
передал вызывающий код или какой был `trigger` (`'popstate'` или клик). Задайте её через
`setCurrentNavigation()`:

```ts
const router = injectRouterDouble();

router.setCurrentNavigation({ extras: { state: { from: 'the card' } } });
expect(fixture.componentInstance.origin()).toBe('the card');
```

- Пока вы её не задали, ответ — `null`, как у настоящего роутера без навигации.
- Переданное сохраняется. Остальное берётся из текущего URL: `id`, `initialUrl`, `extractedUrl`;
  `trigger` — `'imperative'`, `extras` пуст, `previousNavigation` — `null`.
- `abort` по умолчанию ничего не делает. Если спека его проверяет, передайте свой.

Навигация следует и за событиями, как у настоящего роутера:

- `emitNavigation(new NavigationStart(4, '/users/8', 'popstate'))` запускает навигацию с этим id,
  URL и триггером.
- `NavigationEnd`, `NavigationCancel`, `NavigationError` или `NavigationSkipped` её завершают,
  **после** доставки события. Компонент, который читает `currentNavigation()` при обработке
  `NavigationEnd`, ещё видит завершённую навигацию, как в продакшене. Почему так — в разделе
  [Подробнее](#in-depth).

### `createRouterDouble(init?)` {#createrouterdouble-init}

Та же подмена `Router` без `TestBed` — для гарда или класса, который вы создаёте через `new`:

```ts
import 'vitest-auto-spy/angular';

import { createRouterDouble } from 'vitest-auto-spy/angular-router';

const { router, navigate } = createRouterDouble({ url: '/admin' });

expect(new AuthGuard(router).canActivate()).toBe(false);
expect(navigate).toHaveBeenCalledWith(['/login']);
```

### Чего подмена Router не делает {#what-the-router-double-does-not-do}

- **Он не навигирует.** `navigate()` и `navigateByUrl()` записывают вызов и резолвятся в `true`;
  `url` остаётся на месте. Двигайте его через `setUrl()` или `emitNavigation()`. Саму навигацию
  (гарды, отмену) проверяйте через `RouterTestingHarness` поверх настоящего `provideRouter()`.
- **Это только токен `Router`.** Ни маршрутов, ни аутлета, ни `RouterLinkActive`. У `routerLink` в
  шаблоне всё равно будет правильный `href`: `createUrlTree` и `serializeUrl` — настоящие, из
  роутера. Если спека про маршрутизацию, а не про компонент, берите настоящий роутер.
- **Он не выдаёт компоненту `ActivatedRoute`.** Компоненту, который читает параметры маршрута и
  вызывает `navigate()`, нужны оба провайдера: `provideActivatedRoute()` и `provideRouterDouble()`,
  в любом порядке. У `routerState.root` подмены есть query-параметры и фрагмент URL, но нет
  параметров пути (`params`).

### Что говорит каждое падение Router {#what-each-router-failure-says}

| Сообщение содержит                                                      | Причина и что сделать                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `the Router double has no …`                                            | код под тестом обратился к полю или методу `Router`, которого у подмены нет                                              |
| `the Router here is Angular's own, not one provideRouterDouble() built` | `Router` объявлен `providedIn: 'root'`, поэтому `TestBed` без подмены выдаёт настоящий; добавьте `provideRouterDouble()` |
| `the Router here is a value written by hand …`                          | выиграл `useValue` или `provideAutoSpy(Router)`; ставьте `provideRouterDouble()` последним                               |
| `nothing provides Router in the injector given`                         | в инжекторе, собранном вручную, `Router` нет вовсе                                                                       |

Порядок `provideRouterDouble()` и настоящего `provideRouter()` не важен: `provideRouter()` не выдаёт
токен `Router`, поэтому подмена выигрывает всегда.

## `collectRouterEvents(events)` {#collectrouterevents-events}

Записывает все события роутера с этого момента до конца теста и проверяет их последовательность
одним вызовом.

```ts
import { NavigationEnd, NavigationStart } from '@angular/router';
import { collectRouterEvents, injectRouterDouble } from 'vitest-auto-spy/angular-router';

const router = injectRouterDouble();
const events = collectRouterEvents(router.router.events);

await router.emitNavigation(new NavigationStart(2, '/checkout'));
await router.emitNavigation('/checkout');

events.expect([
  [NavigationStart, '/checkout'],
  [NavigationEnd, '/checkout'],
]);
```

- Запись начинается пустой. `NavigationEnd`, который `BehaviorSubject` повторяет при подписке, в неё
  не попадает.
- `expect()` принимает по одной паре `[КлассСобытия, url?]` на событие, по порядку, без лишних.
- `events.events` — сама запись, для проверок сложнее простой последовательности.
- Запись заканчивается вместе с тестом, который её начал, на Vitest и Bun.

При несовпадении падение одно: где последовательности впервые расходятся, затем обе целиком.

```text
[vitest-auto-spy] collectRouterEvents().expect(): the events differ at #2: expected NavigationEnd /checkout, got NavigationCancel /checkout.
Expected: NavigationStart /checkout, NavigationEnd /checkout
Recorded: NavigationStart /checkout, NavigationCancel /checkout
```

## Подмена Location {#the-location-double}

Выдаёт на `Location` собственный `SpyLocation` из Angular. С ним можно проверить, куда привёл
редирект и что сделала кнопка «Назад».

```ts
import { TestBed } from '@angular/core/testing';
import { injectLocationDouble, provideLocationDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

const location = injectLocationDouble();

location.go('/reports/7');
expect(location.urlChanges).toEqual(['/reports/7']);

location.simulateUrlPop('/'); // «назад/вперёд» в браузере, которого не вызвать методом
```

| Хелпер                            | Что делает                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `provideLocationDouble()`         | выдаёт `SpyLocation` и `MockLocationStrategy` одной строкой                             |
| `injectLocationDouble(injector?)` | возвращает этот `SpyLocation`; бросает ошибку, если выиграл другой провайдер `Location` |
| `createLocationDouble()`          | тот же `SpyLocation` без `TestBed`                                                      |

Что даёт `SpyLocation`:

- `go()`, `back()` и `historyGo()` двигают настоящую историю; `path()` и `getState()` читают её.
- `urlChanges` — список всех переходов, которые запросило приложение.
- `simulateUrlPop()` и `simulateHashChange()` вызывают события, которые в жизни вызывает только
  браузер.
- `back()` и `forward()` оповещают подписчиков popstate, но **не** пишут в `urlChanges`. В списке —
  то, что запросило приложение; подписчики получают то, что сделал браузер.

**Одно отличие от `SpyLocation` из Angular.** `SpyLocation.path()` в Angular теряет query. Настоящий
`Location.path()` его сохраняет, и эта подмена тоже: после `go('/reports', 'tab=7')` вызов `path()`
вернёт `/reports?tab=7`. `isCurrentPathEqualTo(path, query)` и `url` у popstate с этим согласны.
Объект по-прежнему `SpyLocation`.

**Частая ошибка:** забыть провайдер. `Location` объявлен `providedIn: 'root'`, поэтому спека без
`provideLocationDouble()` получает настоящий `Location` платформы, и ничего из действий теста не
записывается. У самодельного `{ provide: Location, useValue: { path: vi.fn() } }` обратная беда: он
отвечает только на поля, о которых вспомнил автор.

| Сообщение содержит                                       | Причина и что сделать                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `injectLocationDouble(): nothing provides Location here` | провайдера нет; добавьте `provideLocationDouble()` в `providers`                        |
| `the Location here is … not the SpyLocation`             | выиграл более поздний провайдер `Location`; ставьте `provideLocationDouble()` последним |

## Отдельная точка входа и опциональная peer-зависимость {#its-own-entry-and-an-optional-peer}

- `vitest-auto-spy/angular-router` — единственная точка входа, которая импортирует
  `@angular/router`. Поэтому `@angular/router` — **опциональная** peer-зависимость: её ставят,
  только если импортируют эту точку входа. [`vitest-auto-spy/angular-http`](/ru/adapters/angular-http)
  так же устроена для `@angular/common`.
- Подмене `Location` отдельный пакет не нужен. Она оборачивает `@angular/common/testing`, а
  `@angular/router` и так зависит от `@angular/common`.
- Точка входа **не** реэкспортирует ядро. Импортируйте её рядом с `vitest-auto-spy/angular`.
- Она не регистрирует ни хуков, ни адаптера раннера. Спаям подмены `Router` нужен
  `vitest-auto-spy/angular` — см. [`provideRouterDouble()`](#providerouterdouble-init).
- Она не импортирует `vitest`. `collectRouterEvents()` перестаёт записывать, когда заканчивается
  его тест, через собственный `onTestFinished` раннера (Vitest или Bun). В `node:test` нет уборки после каждого теста, поэтому там запись живёт столько же, сколько подмена `Router`.
- Её объявления типов тоже не упоминают `vitest`, так что проект на Bun или `node:test` проходит
  проверку типов с `skipLibCheck: false` и без установленного Vitest.

## Подробнее {#in-depth}

**Почему `currentNavigation` сбрасывается после события, а не до.** В комментарии Angular сказано:
«the current navigation becomes to null after the NavigationEnd event is emitted». Роутер отправляет
финальное событие из `tap`, пока навигация ещё идёт, а сбрасывает её в `finalize` после этого
(`cancelNavigationTransition` не сбрасывает её вовсе). `events` — это `Subject`, поэтому синхронный
подписчик выполняется между этими шагами. Он получает завершённую навигацию, а `null` — только после
того, как резолвится `navigate()`. Это проверено на настоящем `provideRouter()` под Angular 22.
Подмена, которая сбрасывала бы навигацию раньше, сломала бы частый приём «прочитать state навигации,
когда она завершилась».

**Почему неизвестные поля `Router` бросают ошибку.** `currentNavigation`, `config` и `navigated`
лежат на экземпляре `Router`, а не на `Router.prototype`. Мок по прототипу вернул бы для них
`undefined`, и `router.currentNavigation()` упал бы с «is not a function» далеко от причины. Подмена
вместо этого падает при чтении и называет поле.

**Почему `currentNavigation` трудно замокать руками.** Это сигнал на экземпляре, а не на прототипе,
поэтому с класса его не прочитать. Самодельному моку приходится перечислять его в
`instanceMethodsToSpyOn: ['currentNavigation']`.

**Как собран маршрут.** Каждый поток — `BehaviorSubject` над одним полем общей записи. Снимок —
собственный `ActivatedRouteSnapshot` Angular из той же записи, а оба `ParamMap` Angular выводит из
них сам. Второй копии, которая могла бы отстать, нет. Заголовок кладётся в `data` под `RouteTitleKey`
роутера — символ, который роутер не экспортирует; подмена узнаёт его у установленного роутера. CI
пакета собирает маршрут на каждой поддерживаемой мажорной версии Angular.
