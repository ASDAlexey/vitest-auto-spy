---
title: Angular HTTP
description: Ответить на запросы httpResource() и HttpClient в Angular-тесте одной строкой - provideHttpTesting, expectRequest и проверка запросов, на которые никто не ответил.
---

# Angular HTTP

`vitest-auto-spy/angular-http` помогает тестировать код, который загружает данные через `httpResource()` или `HttpClient`, без обращения к серверу. Добавьте `provideHttpTesting()` в настройку `TestBed` и ответьте на запрос через `expectRequest().flush()`.

```ts
import { httpResource } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

it('loads the user', async () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
  const user = TestBed.runInInjectionContext(() => httpResource<{ name: string }>(() => '/api/user'));

  await expectRequest('/api/user').flush({ name: 'Ada' });

  expect(user.value()).toEqual({ name: 'Ada' });
});
```

`expectRequest()` запускает проверку изменений перед поиском запроса. `flush()` обновляет разметку после ответа — дождитесь его через `await`, прежде чем проверять результат. В Vitest [запросы без ответа приводят к ошибке в тесте](#verifyonteardown).

Если в проекте ещё нет Angular-тестов, сначала [настройте тестовое окружение](/ru/core/installation).

Чтобы проверить, что показывает компонент, создайте его до того, как ответите на запрос:

```ts
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

@Component({
  selector: 'app-profile',
  template: `@if (user.hasValue()) {
    <h1>{{ user.value().name }}</h1>
  }`,
})
class ProfileComponent {
  readonly user = httpResource<{ name: string }>(() => '/api/user');
}

it('shows the user name', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [...provideHttpTesting()] });
  const fixture = TestBed.createComponent(ProfileComponent);

  await expectRequest('/api/user').flush({ name: 'Ada' });

  expect(fixture.nativeElement.textContent).toContain('Ada');
});
```

## Что импортировать {#what-to-import}

| Импорт                         | Что даёт                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/angular-http` | `provideHttpTesting`, `expectRequest`, `expectNoRequest`, `verifyNoPendingRequests`, `injectHttpTesting`        |
| `vitest-auto-spy/angular`      | Спаи и хелперы для `TestBed`, например `provideAutoSpy` и `settleResource`. Импортируйте, если ими пользуетесь. |

`@angular/common` — необязательная peer-зависимость пакета. Установите её, если используете `/angular-http`. Подробнее: [необязательные peer-зависимости](/ru/core/compatibility#optional-peers).

## `provideHttpTesting()` {#providehttptesting}

Добавьте `...provideHttpTesting()` в `providers` при каждой настройке `TestBed` для теста с HTTP-запросами. Рядом можно указать другие провайдеры:

```ts
import { TestBed } from '@angular/core/testing';
import { provideAutoSpy } from 'vitest-auto-spy/angular';
import { provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({
  providers: [...provideHttpTesting(), provideAutoSpy(AnalyticsService)],
});
```

| Опция              | Тип                                        | По умолчанию | Что делает                                                  |
| ------------------ | ------------------------------------------ | ------------ | ----------------------------------------------------------- |
| `interceptors`     | `HttpInterceptorFn[]`                      | нет          | Передаёт функциональные интерцепторы в `withInterceptors()` |
| `features`         | `HttpFeature[]`                            | нет          | Передаёт другие настройки в `provideHttpClient()`           |
| `verifyOnTeardown` | `boolean \| { ignoreCancelled?: boolean }` | `true`       | Завершает тест с ошибкой, если остался запрос без ответа    |

Хелпер добавляет `provideHttpClient(...)`, затем `provideHttpClientTesting()`, чтобы подменить настоящий бэкенд. Последней он добавляет проверку в конце теста, если вы её не отключили.

**Частая ошибка:** добавлять `provideHttpClient()` или `provideHttpClientTesting()` вручную. Хелпер уже добавляет оба. Если использовать только провайдеры Angular, проверки в конце теста не будет.

### `interceptors` и `features` {#interceptors-and-features}

Передайте интерцептор, который тестируете, в `provideHttpTesting()`. Проверка в конце теста останется включённой.

```ts
import { HttpClient, type HttpInterceptorFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
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

`expectRequest` видит запрос после всех интерцепторов. Если интерцептор изменил URL, ищите запрос по новому адресу. Если интерцептор преобразует ошибку от `error(status)`, ваш код получит результат этого преобразования.

Остальные настройки `provideHttpClient()` передавайте в `features`. Например, `withInterceptorsFromDi()` для интерцепторов-классов, `withXsrfConfiguration()` или `withJsonpSupport()`.

```ts
import { HTTP_INTERCEPTORS, withInterceptorsFromDi } from '@angular/common/http';

TestBed.configureTestingModule({
  providers: [
    ...provideHttpTesting({ interceptors: [authInterceptor], features: [withInterceptorsFromDi()] }),
    { provide: HTTP_INTERCEPTORS, useClass: LegacyInterceptor, multi: true },
  ],
});
```

- Обе опции передаются в один вызов `provideHttpClient()`, чтобы Angular мог обнаружить конфликтующие настройки.
- Сначала срабатывают интерцепторы из `interceptors`, в порядке массива. Затем — интерцепторы из `features`, в своём порядке.
- После применения обеих опций `provideHttpClientTesting()` подменяет бэкенд. Даже с `withXhr()` запросы не уйдут в сеть.

### `verifyOnTeardown` {#verifyonteardown}

В Vitest проверка включена по умолчанию. Если запрос остался без ответа, тест падает, а сообщение подсказывает, как на него ответить:

```text
[vitest-auto-spy] GET /api/products was never answered (end of "products > shows the list").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: await expectRequest('/api/products').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#verifyonteardown
```

Пока код ждёт ответ, тест может проверить не то состояние. Кроме того, `expectRequest` в следующем тесте может найти этот открытый запрос.

Отключайте автоматическую проверку, только если проверяете запросы другим способом:

```ts
TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
```

**Частая ошибка:** настраивать модуль в `beforeAll`. Он не относится к конкретному тесту, поэтому проверка не запускается. Настройте модуль в `beforeEach` или в самом тесте либо вызовите [`verifyNoPendingRequests()`](#verifynopendingrequests-options) вручную.

**Другие раннеры.** Для автоматической проверки Vitest должен сообщить, какой тест выполняется. В `bun:test`, `node:test` и других раннерах хелпер выдаёт предупреждение один раз на воркер:

```text
[vitest-auto-spy] provideHttpTesting(): globalThis.__vitest_worker__ is not there, so the runner
does not say which test is running and the end-of-test check cannot arm. Call
`verifyNoPendingRequests()` yourself, or report the runner and version — under bun:test and
node:test this entry has no hook to use.
```

Остальные хелперы работают. Вызывайте `verifyNoPendingRequests()` в конце каждого теста, чтобы запустить проверку вручную.

### `ignoreCancelled` {#ignorecancelled}

Используйте эту опцию, если код намеренно отписывается до получения ответа. Например, когда меняется входной сигнал `httpResource()` или `switchMap` отменяет предыдущий запрос.

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })],
});
```

Запросы, которые всё ещё ждут ответа, по-прежнему приводят к ошибке. По умолчанию `ignoreCancelled` равно `false`: отменённые запросы тоже приводят к ошибке. Опция работает так же, как в `HttpTestingController.verify({ ignoreCancelled })` из Angular.

**Частая ошибка:** отключать проверку во всём файле из-за одного теста с отменой запроса. Вместо этого используйте `ignoreCancelled`.

## `expectRequest(matcher, options?)` {#expectrequest-matcher-options}

Находит ровно один подходящий запрос. Перед тем как ответить, можно проверить, что отправил ваш код:

```ts
import { expectRequest } from 'vitest-auto-spy/angular-http';

const created = expectRequest('/api/products', { method: 'POST' });
expect(created.request.body).toEqual({ title: 'Chair' });
await created.flush({ id: 9 });
```

По умолчанию `expectRequest` запускает проверку изменений перед поиском. За это время `httpResource()` успевает отправить запрос. Дождитесь `flush()` или `error()` через `await`, прежде чем проверять обновлённое значение или разметку.

Вызов `expectRequest()` сам по себе не отвечает на запрос. Если не вызвать `flush()` или `error()`, запрос останется открытым: его обнаружит [проверка в конце теста](#verifyonteardown) или ручной вызов [`verifyNoPendingRequests()`](#verifynopendingrequests-options).

| Условие поиска | Что проверяет                                   | Пример                                           |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| Строка         | `request.url` или `request.urlWithParams`       | `'/api/products'`                                |
| `RegExp`       | `request.urlWithParams`                         | `/\/api\/products\?page=\d+/`                    |
| Функция        | Возвращает `true` для подходящего `HttpRequest` | `(request) => request.headers.has('X-Trace-Id')` |

Указывайте только путь, если для различения запросов не нужна строка параметров.

| Опция    | Тип       | По умолчанию | Что делает                                                                    |
| -------- | --------- | ------------ | ----------------------------------------------------------------------------- |
| `method` | `string`  | любой        | Ищет запрос с указанным HTTP-методом без учёта регистра                       |
| `tick`   | `boolean` | `true`       | [`false`](#tick-false) пропускает проверку изменений до поиска и после ответа |

| Поле или метод            | Что делает                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `request`                 | Объект `HttpRequest`: URL, метод, заголовки и тело запроса                                           |
| `flush(body, options?)`   | Отвечает телом `body` и обновляет приложение. Опции: `{ headers, status, statusText }`.              |
| `error(status, options?)` | Имитирует сбой со статусом `status` и обновляет приложение. Опции: `{ headers, statusText, error }`. |

### Ответ с ошибкой {#error-responses}

Используйте `error(status)`, если проверяете обработку ошибки и тело ответа не нужно:

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

| Что произошло                     | Вызов                                                               | Что содержит `HttpErrorResponse`        |
| --------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Сервер вернул код ошибки без тела | `error(500)`                                                        | `status: 500`                           |
| Сервер вернул код ошибки с телом  | `flush({ code: 'taken' }, { status: 409, statusText: 'Conflict' })` | `status: 409` и тело ответа в `error`   |
| Клиент не получил ответ           | `error(0)`                                                          | `status: 0` и `ProgressEvent` в `error` |

Когда ошибка доходит до `httpResource()`, ресурс переходит в статус `'error'`, а `resource.error()` возвращает `HttpErrorResponse`. Перед чтением `value()` в шаблоне проверьте `error()` или `hasValue()`. В состоянии ошибки Angular бросает исключение при чтении `value()`.

Опция `error` задаёт значение `HttpErrorResponse.error`. По умолчанию это `new ProgressEvent('error')`, как в `TestRequest.error()` из Angular.

**Частая ошибка:** передавать JSON-тело в `error()`. Используйте `flush(body, { status, statusText })`: этот вызов передаст тело в `HttpErrorResponse.error`.

### Сетевой сбой: `error(0)` {#network-failures-error-0}

Используйте `error(0)`, если сервер недоступен, у клиента нет сети или запрос заблокирован. Если тест проверяет событие, передайте свой `ProgressEvent`:

```ts
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

it('reports a network failure', async () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
  const http = TestBed.inject(HttpClient);
  const offline = new ProgressEvent('error');
  let failure: HttpErrorResponse | undefined;

  http.get('/api/products').subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
  await expectRequest('/api/products').error(0, { error: offline });

  expect(failure?.error).toBe(offline);
});
```

### `{ tick: false }` {#tick-false}

Используйте опцию, только если самодельная подмена `DOCUMENT` мешает Angular проверять изменения. При сбое с неполной подменой (например, `inject(...).body?.querySelector is not a function`) хелпер указывает на подмену `DOCUMENT` и предлагает `{ tick: false }`.

```ts
it('sends the token request', () => {
  TestBed.inject(TokenService).refresh();

  expectRequest('/api/token', { tick: false }).flush('t');
});
```

- С `{ tick: false }` хелпер пропускает проверку изменений, которая запускает запросы `httpResource()`. Используйте эту опцию для уже отправленных запросов, например при активной подписке на `HttpClient`.
- `flush()` и `error()` выполняются синхронно и возвращают `void`. `await` по-прежнему работает, но `@typescript-eslint/await-thenable` на него жалуется.
- `expectNoRequest` тоже принимает `{ tick: false }`.
- С `provideDocumentDouble()` из `vitest-auto-spy/angular` Angular видит свойства настоящего документа. Оставьте проверку изменений включённой. Если приложение бросит ошибку, хелпер пробросит её без изменений.

## `expectNoRequest(matcher?, options?)` {#expectnorequest-matcher-options}

Проверяет, что подходящий запрос не отправлялся. Без аргумента проверяет, что запросов вообще не было.

```ts
import { expectNoRequest } from 'vitest-auto-spy/angular-http';

component.filter.set('open');
expectNoRequest('/api/products');
```

Как и `expectRequest`, хелпер сначала запускает проверку изменений. Иначе проверка могла бы пройти только потому, что запрос ещё не ушёл. Условия поиска и опции те же.

## `verifyNoPendingRequests(options?)` {#verifynopendingrequests-options}

Проверяет вручную, остались ли запросы без ответа. Хелпер убирает открытые запросы, даже если сообщает об ошибке.

```ts
import { expectRequest, verifyNoPendingRequests } from 'vitest-auto-spy/angular-http';

await expectRequest('/api/products').flush([]);
verifyNoPendingRequests();
```

Вызывайте хелпер между шагами теста, при выключенном `verifyOnTeardown` или в [раннерах без автоматической проверки](#verifyonteardown).

| Опция             | Тип       | По умолчанию | Что делает                                   |
| ----------------- | --------- | ------------ | -------------------------------------------- |
| `ignoreCancelled` | `boolean` | `false`      | Пропускает запросы, от которых код отписался |

Если тест не настраивал HTTP-тестирование, хелпер ничего не делает. Если тест уже сбросил `TestBed`, хелпер всё равно сообщит о запросах, открытых на момент сброса.

## `injectHttpTesting()` {#injecthttptesting}

Возвращает `HttpTestingController` из Angular. Используйте его, если предпочитаете `expectOne`, `match` или `expectNone`. `HttpClient` отправляет запрос при подписке на Observable, так что найти запрос и ответить на него можно синхронно.

```ts
import { injectHttpTesting } from 'vitest-auto-spy/angular-http';

const received: Item[][] = [];
service.load().subscribe((items) => received.push(items));
injectHttpTesting().expectOne('/api/items').flush([]);

expect(received).toEqual([[]]);
```

Проверка в конце теста по умолчанию остаётся включённой. Если в `providers` нет `provideHttpTesting()`, вы получите то же сообщение `this TestBed has no HttpTestingController`, что и с `expectRequest`.

## Что говорит каждое падение {#what-each-failure-says}

| Сообщение содержит                          | Причина и что делать                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `no request matched … Made instead: …`      | Запрос не найден. Сверьте URL, метод или предикат со списком запросов в сообщении.            |
| `no POST … — but GET … was made`            | Отличается только метод. Укажите метод, который использует ваш код.                           |
| `… was made; the query differs`             | Путь и метод совпадают. Укажите фактическую строку параметров или ищите только по пути.       |
| `nothing was requested at all`              | Проверьте, запустился ли ресурс или есть ли подписка на Observable.                           |
| `N requests matched …`                      | Уточните поиск через `{ method }`, полный URL или предикат.                                   |
| `this TestBed has no HttpTestingController` | Добавьте `provideHttpTesting()` в `providers`.                                                |
| `… was never answered (end of "…")`         | Проверка нашла открытый запрос. Сообщение называет тест и показывает, как ответить на запрос. |

## Связанные хелперы {#related-helpers}

- **[`settleResource`](/ru/adapters/angular#resources-httpresource-and-resource)** из `vitest-auto-spy/angular` ждёт обновления ресурса без привязки к конкретному запросу. Используйте его с `resource()` с асинхронным загрузчиком, с `rxResource` или при повторной загрузке. `expectRequest().flush()` ждёт только обновления после запроса, на который отвечает.
- **[`enableAngularDiagnostics({ pendingRequests })`](/ru/adapters/angular-diagnostics#pendingrequests)** сообщает о запросах без ответа из файла настройки тестов, в том числе при использовании провайдеров Angular напрямую. Оставьте проверку, если часть тестов ещё настраивает HTTP вручную. Если все тесты используют `provideHttpTesting()`, она не нужна. О каждом запросе без ответа сообщат только один раз.

## Zoneless и `fakeAsync` {#zoneless-and-fakeasync}

Поиск запроса, `flush()` и `error()` используют `TestBed.tick()`. Он синхронно запускает ожидающие эффекты и проверку изменений, с Zone.js и без него. Он также обновляет фикстуры, не прикреплённые к `ApplicationRef`.

Внутри `fakeAsync` из [`vitest-auto-spy/zone`](/ru/utilities/zone) хелперы работают так же. Если загрузчик ждёт таймер, продвиньте время с помощью `tick()` или `advanceTimers()` из этой точки входа. Одного запуска микрозадач недостаточно.

## Подробнее {#in-depth}

### Что заменяет `expectRequest(url).flush(body)` {#what-expectrequest-url-flush-body-replaces}

Хелпер выполняет шесть шагов по порядку:

| Шаг                              | Зачем нужен                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| Получить `HttpTestingController` | Даёт доступ к контроллеру без лишней строки в тесте                 |
| Вызвать `TestBed.tick()`         | Даёт `httpResource()` отправить запрос до поиска                    |
| Найти запрос                     | Показывает отправленные запросы, если ни один не подходит           |
| Передать тело ответа             | Позволяет ресурсу завершить загрузку, а фикстуре стать стабильной   |
| Дождаться одной микрозадачи      | Позволяет ресурсу обновить значение до того, как его прочитает тест |
| Снова вызвать `TestBed.tick()`   | Обновляет разметку, чтобы она показывала новое значение             |

### Когда запускается проверка конца теста {#when-the-end-of-test-check-runs}

Модуль с `provideHttpTesting()` регистрирует проверку для того теста, который его создал. Даже если добавить провайдеры дважды, проверка запустится один раз. Она также работает с общим массивом провайдеров и при `isolate: false`.

Проверка запускается в `onTestFinished`, после всех `afterEach`, независимо от `sequence.hooks`. К этому моменту Angular уже очистил тестовое окружение, а все ваши вызовы `getTestBed().resetTestingModule()` уже выполнены. При сбросе хелпер сохраняет открытые запросы. Он не обращается к контроллеру после сброса: это создало бы новый модуль и помешало следующему вызову `configureTestingModule()`.

### Как она уживается с `pendingRequests` {#how-it-works-with-pendingrequests}

Обе проверки забирают запросы, которые ещё хранит Angular, через `match(() => true)`. Этот вызов удаляет запросы из списка Angular, поэтому о них сообщает только та проверка, которая забрала их первой. Проверка из `/angular-http` также учитывает запросы, которые `expectRequest()` уже нашёл, но на которые тест ещё не ответил.
