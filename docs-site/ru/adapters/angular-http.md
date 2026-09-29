---
title: Angular HTTP
description: Ответить на запросы httpResource() и HttpClient в Angular-тесте одной строкой - provideHttpTesting, expectRequest и проверка запросов, на которые никто не ответил.
---

# Angular HTTP

`vitest-auto-spy/angular-http` отвечает на HTTP-запросы, которые ваш код делает в тесте с `TestBed`.
Она нужна, когда компонент или сервис загружает данные через `httpResource()` или `HttpClient`. Один
`await` отвечает на запрос, и следующая строка уже видит новое значение.

```ts
import { httpResource } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

interface User {
  id: number;
  name: string;
}

describe('user resource', () => {
  it('loads the user', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
    const user = TestBed.runInInjectionContext(() => httpResource<User>(() => '/api/user'));

    await expectRequest('/api/user').flush({ id: 1, name: 'Ada' });

    expect(user.value()).toEqual({ id: 1, name: 'Ada' }); // без tick и без detectChanges
  });
});
```

С компонентом так же: создайте его, ответьте на запрос, проверьте DOM.

```ts
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

interface User {
  id: number;
  name: string;
}

@Component({
  selector: 'app-profile',
  template: `@if (user.hasValue()) {
    <h1>{{ user.value().name }}</h1>
  }`,
})
class ProfileComponent {
  readonly user = httpResource<User>(() => '/api/user');
}

it('shows the user name', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [...provideHttpTesting()] });
  const fixture = TestBed.createComponent(ProfileComponent);

  await expectRequest('/api/user').flush({ id: 1, name: 'Ada' });

  expect(fixture.nativeElement.textContent).toContain('Ada'); // шаблон уже обновлён
});
```

Если тест закончился, а на запрос так никто и не ответил, тест падает и называет этот запрос.
Подробнее — в разделе [`verifyOnTeardown`](#verifyonteardown).

## Что импортировать {#what-to-import}

| Импорт                         | Что даёт                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/angular-http` | `provideHttpTesting`, `expectRequest`, `expectNoRequest`, `verifyNoPendingRequests`, `injectHttpTesting`              |
| `vitest-auto-spy/angular`      | спаи и хелперы для `TestBed` вроде `provideAutoSpy` и `settleResource`; импортируйте, только если спека их использует |

Для этой точки входа нужен установленный `@angular/common`. Это **необязательная** peer-зависимость
пакета: она нужна только проектам, которые импортируют `vitest-auto-spy/angular-http`. Почему она
необязательная — в разделе [Необязательные peer-зависимости](/ru/core/compatibility#optional-peers).

## `provideHttpTesting()` {#providehttptesting}

Настраивает HTTP-тестирование одним спредом. Добавьте его в `providers` каждого теста, который делает
запросы.

```ts
import { TestBed } from '@angular/core/testing';
import { provideAutoSpy } from 'vitest-auto-spy/angular';
import { provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({
  providers: [...provideHttpTesting(), provideAutoSpy(AnalyticsService)],
});
```

Он добавляет три вещи в том порядке, которого требует Angular:

1. `provideHttpClient(...)` с вашими `interceptors` и `features`;
2. `provideHttpClientTesting()`, чтобы ни один запрос не ушёл в сеть;
3. проверку: если к концу теста остался запрос без ответа, тест падает (пока `verifyOnTeardown` не `false`).

| Опция              | Тип                                        | По умолчанию | Смысл                                                    |
| ------------------ | ------------------------------------------ | ------------ | -------------------------------------------------------- |
| `interceptors`     | `HttpInterceptorFn[]`                      | нет          | функциональные интерцепторы, идут в `withInterceptors()` |
| `features`         | `HttpFeature[]`                            | нет          | любые другие фичи `provideHttpClient()`                  |
| `verifyOnTeardown` | `boolean \| { ignoreCancelled?: boolean }` | `true`       | уронить тест, если к концу остался запрос без ответа     |

**Частая ошибка:** писать `provideHttpClient()` + `provideHttpClientTesting()` руками рядом с ним или
вместо него. Если в `configureTestingModule` нет `provideHttpTesting()`, в конце теста ничего не проверяется.

### `interceptors` и `features` {#interceptors-and-features}

Передайте интерцептор сюда, если тестируете именно его. Проверка в конце теста при этом остаётся.

```ts
import { HttpClient, type HttpInterceptorFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

const authInterceptor: HttpInterceptorFn = (request, next) => next(request.clone({ setHeaders: { Authorization: 'Bearer token' } }));

it('adds the token', async () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting({ interceptors: [authInterceptor] })] });

  TestBed.inject(HttpClient).get('/api/me').subscribe();
  const pending = expectRequest('/api/me');

  expect(pending.request.headers.get('Authorization')).toBe('Bearer token');
  await pending.flush({ id: 1 });
});
```

`expectRequest` видит запрос уже после всех интерцепторов. Заголовок, который добавил интерцептор,
лежит в `request.headers`. Если интерцептор переписал URL, сравнивайте с новым URL. Ответ
`error(status)` тоже проходит обратно через ваши интерцепторы. Если интерцептор превращает ошибку во
что-то другое, ваш код получит именно это.

`features` принимает любые другие фичи `provideHttpClient()`: `withInterceptorsFromDi()` для
интерцептора-класса, `withXsrfConfiguration()`, `withJsonpSupport()`.

```ts
import { HTTP_INTERCEPTORS, withInterceptorsFromDi } from '@angular/common/http';

TestBed.configureTestingModule({
  providers: [
    ...provideHttpTesting({ interceptors: [authInterceptor], features: [withInterceptorsFromDi()] }),
    { provide: HTTP_INTERCEPTORS, useClass: LegacyInterceptor, multi: true },
  ],
});
```

Как сочетаются две опции:

- Всё попадает в **один** вызов `provideHttpClient()`. Angular сообщает о конфликтующей настройке
  HTTP, только когда видит её целиком в одном вызове.
- Сначала выполняются `interceptors` в порядке массива. Потом интерцепторы из `features`, в своём
  порядке.
- `provideHttpClientTesting()` идёт последним. Он заменяет настоящий бэкенд, поэтому даже `withXhr()`
  в `features` не уходит в сеть.

### `verifyOnTeardown` {#verifyonteardown}

Включена по умолчанию. Если тест закончился, а на запрос никто не ответил, тест падает, и сообщение
называет запрос:

```text
[vitest-auto-spy] GET /api/products was never answered (end of "products > shows the list").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: await expectRequest('/api/products').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#verifyonteardown
```

Такой тест даёт неверный результат по двум причинам. Код всё ещё ждёт ответа, поэтому ваши `expect` после этого вызова смотрят на
состояние, до которого код не дошёл. А открытый запрос утекает: `expectRequest` следующего теста может
найти именно его.

Выключайте проверку, только если ваши тесты проверяют запросы по-другому:

```ts
TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
```

**Частая ошибка:** настраивать модуль в `beforeAll`. Такой модуль не принадлежит ни одному тесту,
поэтому проверки нет. Настраивайте его в `beforeEach` или в самом тесте, либо вызывайте
[`verifyNoPendingRequests()`](#verifynopendingrequests-options) сами.

**Другие раннеры.** Автоматической проверке нужно, чтобы Vitest сообщал, какой тест сейчас идёт. Под
`bun:test`, `node:test` и другими раннерами она не включается и сообщает об этом один раз на воркер:

```text
[vitest-auto-spy] provideHttpTesting(): globalThis.__vitest_worker__ is not there, so the runner
does not say which test is running and the end-of-test check cannot arm. Call
`verifyNoPendingRequests()` yourself, or report the runner and version — under bun:test and
node:test this entry has no hook to use.
```

Всё остальное на этой странице на таких раннерах работает. Вызовите `verifyNoPendingRequests()` в
конце теста — это та же проверка, только вручную.

### `ignoreCancelled` {#ignorecancelled}

Оставляет проверку включённой, но не роняет тест из-за **отменённых** запросов. Запрос отменён, если
ваш код отписался до того, как пришёл ответ. Два частых случая: у `httpResource()` поменялся входной
сигнал раньше первого ответа, или `switchMap` отменил свой внутренний запрос.

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })],
});
```

Запросы, которые всё ещё ждут ответа, по-прежнему роняют тест. `{ ignoreCancelled: false }` — то же, что
значение по умолчанию: отменённые запросы тоже роняют тест. Смысл опции тот же, что у
`HttpTestingController.verify({ ignoreCancelled })` в самом Angular.

**Частая ошибка:** выключить всю проверку из-за одного теста с отменённым запросом. Тогда перестают
проверяться и все остальные тесты файла. Используйте `ignoreCancelled`.

## `expectRequest(matcher, options?)` {#expectrequest-matcher-options}

Находит единственный подходящий запрос, даёт на него посмотреть и отвечает на него. Перед поиском
запроса запускает change detection, поэтому `httpResource()` к этому моменту уже отправил запрос.
Вызывать `fixture.detectChanges()` самому не нужно ни до, ни после.

```ts
await expectRequest('/api/products').flush([product]); // по URL
await expectRequest('/api/products', { method: 'POST' }).flush({}); // по URL и методу
await expectRequest(/\/api\/products\?page=\d+/).flush([]); // по шаблону
await expectRequest((request) => request.body?.id === 7).flush({}); // по чему угодно ещё
```

Как сравнивается `matcher`:

- **Строка** совпадает с `request.url` или с `request.urlWithParams`. Обычно эндпоинт называют без
  query-строки. Добавляйте query-строку, только если два запроса отличаются только ею.
- **RegExp** проверяется на `request.urlWithParams`.
- **Функция** получает `HttpRequest` и возвращает `true`, если запрос подходит.

| Опция    | Тип       | По умолчанию | Смысл                                                                   |
| -------- | --------- | ------------ | ----------------------------------------------------------------------- |
| `method` | `string`  | любой        | HTTP-метод; регистр не важен                                            |
| `tick`   | `boolean` | `true`       | `false` пропускает change detection до поиска и после ответа (см. ниже) |

`expectRequest` возвращает объект с тремя членами:

| Член                      | Что делает                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `request`                 | `HttpRequest` в том виде, в каком его отправил ваш код: URL, метод, заголовки, тело                     |
| `flush(body, options?)`   | отвечает `body` и обновляет приложение; `options` — `{ headers, status, statusText }`                   |
| `error(status, options?)` | роняет запрос со статусом `status` и обновляет приложение; `options` — `{ headers, statusText, error }` |

Проверьте, что отправил код, прежде чем отвечать:

```ts
const created = expectRequest('/api/products', { method: 'POST' });

expect(created.request.body).toEqual({ title: 'Chair' });

await created.flush({ id: 9 });
```

**Всегда пишите `await` перед `flush()` и `error()`.** После `await` следующая строка видит уже новое
значение и обновлённую разметку.

### Ответ с ошибкой {#error-responses}

Выберите вызов по тому, что делает сервер:

| Сервер…                                           | Вызов                                       | Ваш код получает `HttpErrorResponse`, где…   |
| ------------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| отвечает 500 или другим кодом ошибки, без тела    | `error(500)`                                | `status: 500`                                |
| отвечает кодом ошибки и телом, которое вы читаете | `flush({ code: 'taken' }, { status: 409 })` | `status: 409`, тело лежит в `error`          |
| не отвечает вовсе: лежит, нет сети, заблокирован  | `error(0)`                                  | `status: 0`, в `error` лежит `ProgressEvent` |

В любом из случаев `httpResource()` переходит в статус `'error'`, а `resource.error()` возвращает
этот `HttpErrorResponse`. Проверяйте в шаблоне `error()` или `hasValue()` до чтения `value()`: в
состоянии ошибки `value()` в Angular бросает исключение.

```ts
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

@Component({
  selector: 'app-profile',
  template: `@if (user.error()) {
    <p>Could not load the user</p>
  }`,
})
class ProfileComponent {
  readonly user = httpResource<{ name: string }>(() => '/api/user');
}

it('shows an error when the server fails', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [...provideHttpTesting()] });
  const fixture = TestBed.createComponent(ProfileComponent);

  await expectRequest('/api/user').error(500);

  expect(fixture.componentInstance.user.status()).toBe('error');
  expect(fixture.nativeElement.textContent).toContain('Could not load the user');
});
```

`options` у `error()` — это `{ headers, statusText, error }`. Опция `error` задаёт содержимое поля
`HttpErrorResponse.error`. По умолчанию там `new ProgressEvent('error')`, как в `TestRequest.error()`
из Angular.

**Частая ошибка:** передавать JSON-тело ошибки в `error()`. Эта опция — не тело ответа. Используйте
`flush(body, { status })`, и ваш код найдёт тело в `HttpErrorResponse.error`.

### Сетевой сбой: `error(0)` {#network-failures-error-0}

`error(0)` значит, что до клиента не дошёл никакой ответ: сервер лежит или запрос заблокирован.
Передайте свой `ProgressEvent` в `error`, если тест его проверяет:

```ts
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';

const http = TestBed.inject(HttpClient);
const offline = new ProgressEvent('error');
let failure: HttpErrorResponse | undefined;

http.get('/api/products').subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
await expectRequest('/api/products').error(0, { error: offline });

expect(failure?.error).toBe(offline);
```

### `{ tick: false }` {#tick-false}

Нужна, только если тестовый модуль подменяет `DOCUMENT` самодельным объектом, в котором нет части
свойств настоящего документа. Angular читает эти свойства во время change detection, и tick падает с
`inject(...).body?.querySelector is not a function`. Тогда `expectRequest` бросает ошибку: в ней сказано,
что этот `TestBed` подставил свой `DOCUMENT`, и предложено `{ tick: false }`.

```ts
it('sends the token request', () => {
  TestBed.inject(TokenService).refresh(); // вызов HttpClient, запрос уже ушёл

  expectRequest('/api/token', { tick: false }).flush('t'); // синхронно, без await
});
```

- Без tick `httpResource()` ничего не отправляет, поэтому опция подходит для вызовов `HttpClient`, чей
  запрос уже ушёл.
- `flush()` и `error()` отвечают синхронно и возвращают `void`. Оставленный `await` работает, но
  `@typescript-eslint/await-thenable` на него жалуется.
- `expectNoRequest` принимает ту же опцию.
- Если документ подменён через `provideDocumentDouble()` из `vitest-auto-spy/angular`, `{ tick: false }`
  не нужен. Такая подмена сохраняет все члены настоящего документа, и change detection проходит.
  Если под такой подменой ваше приложение бросит ошибку, `expectRequest` пробросит её как есть.

## `expectNoRequest(matcher?, options?)` {#expectnorequest-matcher-options}

Проверяет, что подходящий запрос не отправлялся. Без аргумента проверяет, что не отправлялось вообще
ничего.

```ts
component.filter.set('open');
expectNoRequest('/api/products'); // ответил кэш, наружу ничего не ушло
```

Сначала запускает change detection, как и `expectRequest`. Иначе проверка могла бы пройти только
потому, что запрос **ещё** не ушёл. Принимает те же `matcher` и опции, что и `expectRequest`.

## `verifyNoPendingRequests(options?)` {#verifynopendingrequests-options}

Проверка конца теста, вызванная вручную. Падает, если остался запрос без ответа, и в любом случае
убирает открытые запросы.

```ts
await expectRequest('/api/products').flush([]);
verifyNoPendingRequests(); // больше ничего не ушло
verifyNoPendingRequests({ ignoreCancelled: true }); // кроме запросов, от которых код отписался
```

Когда нужна:

- в середине теста, чтобы убедиться, что до следующего шага больше ничего не ушло;
- в тех немногих тестах, где она нужна, если `verifyOnTeardown` выключен;
- на раннерах без автоматической проверки (см. [Другие раннеры](#verifyonteardown)).

| Опция             | Тип       | По умолчанию | Смысл                                                   |
| ----------------- | --------- | ------------ | ------------------------------------------------------- |
| `ignoreCancelled` | `boolean` | `false`      | не ронять тест из-за запросов, от которых код отписался |

Ничего не делает, если тест не настраивал HTTP-тестирование. Если `TestBed` уже сбросили во время
теста, всё равно сообщает о запросах, которые были открыты в момент сброса.

## `injectHttpTesting()` {#injecthttptesting}

Возвращает `HttpTestingController`, который поставил `provideHttpTesting()`. Он удобен, если вы
привыкли к `expectOne`, `match` и `expectNone` из Angular и тестируете сервис, который возвращает
Observable: запрос уходит сразу при подписке, и эти методы отвечают синхронно.

```ts
import { injectHttpTesting } from 'vitest-auto-spy/angular-http';

const received: Item[][] = [];

service.load().subscribe((items) => received.push(items));
injectHttpTesting().expectOne('/api/items').flush([]);

expect(received).toEqual([[]]);
```

Проверка в конце теста остаётся включённой. Без `provideHttpTesting()` в `providers` бросает то же
сообщение `this TestBed has no HttpTestingController`, что и `expectRequest`.

## Что говорит каждое падение {#what-each-failure-says}

| Сообщение содержит                          | Причина и что делать                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `no request matched … Made instead: …`      | URL, метод или предикат не подходят ни к одному отправленному запросу; сравните со списком            |
| `no POST … — but GET … was made`            | отличается только метод; передайте тот `{ method }`, который шлёт код                                 |
| `… was made; the query differs`             | тот же путь и метод, другая query-строка; назовите её или сравнивайте только путь                     |
| `nothing was requested at all`              | ресурс не запустился, или на Observable никто не подписался                                           |
| `N requests matched …`                      | подошло больше одного; сузьте через `{ method }`, полный URL или предикат                             |
| `this TestBed has no HttpTestingController` | в `providers` нет `provideHttpTesting()`                                                              |
| `… was never answered (end of "…")`         | `verifyOnTeardown` нашёл запрос без ответа; сообщение называет тест и строку, которая на него ответит |

Первое сообщение перечисляет все отправленные запросы. Если вы ждали `/api/products`, а ушёл только
`GET /api/product`, опечатка видна сразу.

## Связанные хелперы {#related-helpers}

- **[`settleResource`](/ru/adapters/angular#resources-httpresource-and-resource)** из
  `vitest-auto-spy/angular` ждёт, пока ресурс загрузится, кто бы ни запустил загрузку. Он нужен, когда
  ожидание не привязано к одному запросу: `resource()` с асинхронным загрузчиком, `rxResource`, перезагрузка.
  `expectRequest().flush()` ждёт только обновления после того запроса, на который ответил.
- **[`enableAngularDiagnostics({ pendingRequests })`](/ru/adapters/angular-diagnostics#pendingrequests)**
  сообщает о запросах без ответа из setup-файла, в том числе в тестах, где HTTP настроен вручную. Если
  все тесты используют `provideHttpTesting()`, он не нужен. Если какие-то файлы ещё настраивают HTTP
  вручную, оставьте его. О запросе без ответа сообщит одна из двух проверок, а не обе.

## Zoneless и `fakeAsync` {#zoneless-and-fakeasync}

`flush()`, `error()` и поиск запроса обновляют приложение через `TestBed.tick()`. Он синхронно выполняет
отложенные эффекты и change detection и в zoneless-тестах, и в тестах с зонами. А ещё обновляет
фикстуры, которые не прикреплены к приложению (`ApplicationRef`).

Под `fakeAsync` из [`vitest-auto-spy/zone`](/ru/utilities/zone) хелперы работают так же. Одно
исключение: если загрузчик разрешается по **таймеру**, продвиньте таймер через `tick()` или
`advanceTimers()` из той же точки входа. Прогон микрозадач этого не заменит.

## Подробнее {#in-depth}

### Что заменяет `expectRequest(url).flush(body)` {#what-expectrequest-url-flush-body-replaces}

Без этой точки входа тест `httpResource()` требует шести шагов в строгом порядке. Пропущенный шаг
падает с сообщением, которое этот шаг не называет.

| Шаг                     | Что будет без него                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| tick                    | `httpResource()` ещё ничего не отправил, и `expectOne` не находит запрос                      |
| получить контроллер     | ещё одна строка `TestBed.inject(HttpTestingController)` в каждом тесте                        |
| `expectOne(url)`        | падение называет токен, а не URL, который на самом деле запросили                             |
| `flush(body)`           | ресурс навсегда остаётся в `loading`, фикстура не становится стабильной                       |
| дать пройти микрозадаче | проверка читает значение ресурса **по умолчанию** — зелёный тест, который ничего не проверяет |
| tick ещё раз            | шаблон, который показывает ресурс, отстаёт от значения на кадр                                |

`expectRequest(url).flush(body)` делает все шесть.

### Когда запускается проверка конца теста {#when-the-end-of-test-check-runs}

Каждый тестовый модуль, собранный с `provideHttpTesting()`, включает проверку для того теста, который
его собрал. Поэтому она работает и когда:

- Vitest гоняет несколько файлов спек в одном воркере (`isolate: false`);
- список провайдеров вынесен в общую константу;
- провайдеры добавлены спредом дважды (проверка всё равно одна).

Проверка идёт в `onTestFinished`, после всех `afterEach`. То есть после teardown самого Angular и
после вашего `getTestBed().resetTestingModule()`, что бы ни стояло в `sequence.hooks`. Сброс во время
теста сначала сохраняет открытые запросы, так что проверка их всё равно видит. Контроллер у
сброшенного `TestBed` она не запрашивает: это собрало бы новый модуль, и `configureTestingModule`
следующего теста упал бы.

### Как она уживается с `pendingRequests` {#how-it-works-with-pendingrequests}

`provideHttpTesting()` и `enableAngularDiagnostics({ pendingRequests })` обе забирают открытые запросы
через `match(() => true)`. Этот вызов убирает то, что вернул, поэтому о каждом запросе без ответа
сообщают один раз — та проверка, что посмотрела первой.
