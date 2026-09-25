---
title: Angular HTTP
description: provideHttpTesting и expectRequest — httpResource() и HttpClient отвечают в две строки, вместе с досчётом, который зонлесс-спеке иначе пришлось бы открывать заново.
---

# Angular HTTP

```ts
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]); // без tick, без микротаски, без detectChanges
```

`httpResource()` — флагманский примитив данных в Angular, и ни у кого в экосистеме тестирования нет
на него ответа: ни хелпера в `ng-mocks`, ни хелпера в `Spectator`, ни хелпера в
`@testing-library/angular`. Вместо этого спека танцует шесть шагов, порядок которых не угадывается,
и каждый пропущенный шаг падает так, что этот шаг не называет.

| Шаг                    | Что происходит без него                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| tick                   | `httpResource()` ещё ничего не отправил, поэтому `expectOne` сообщает, что запросов нет    |
| получить контроллер    | `TestBed.inject(HttpTestingController)` — ещё одна строка церемонии в каждой спеке         |
| `expectOne(url)`       | падение, которое называет токен, а не URL, который на самом деле запросили                 |
| `flush(body)`          | ресурс навсегда остаётся в `loading`, а фикстура никогда не стабилизируется                |
| дать пройти микротаске | проверка читает **дефолтное** значение ресурса — зелёный тест, который ничего не проверяет |
| tick ещё раз           | вью, которое рендерит ресурс, отстаёт от значения на кадр                                  |

`expectRequest(url).flush(body)` — это все шесть.

## `provideHttpTesting()` {#providehttptesting}

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting(), provideAutoSpy(Analytics)],
});
```

Это `provideHttpClient()` + `provideHttpClientTesting()` одним спредом и намеренно ничего сверх
того. Сюита, в которой под тестом находятся сами интерцепторы, оставляет свой
`provideHttpClient(withInterceptors([...]))` и добавляет `provideHttpClientTesting()` после него —
этот хелпер про случай, которым является любая другая спека.

### `verifyOnTeardown` {#verifyonteardown}

По умолчанию `true`. Тест, который закончился с запросом, на который никто не ответил, роняет
**именно себя**, называя запрос:

```text
[vitest-auto-spy] GET /api/products was never answered (end of "products > shows the list").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: await expectRequest('/api/products').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#verifyonteardown
```

Если оставить всё как есть, ломаются две вещи. Код под тестом всё ещё ждёт ответа, которого не
получал, поэтому каждая проверка после этого вызова говорит о состоянии, до которого тест так и не
дошёл, — а запрос протекает, и `expectRequest` _следующего_ теста находит запрос, сделанный
предыдущим.

Выключайте для сюиты, которая проверяет запросы другим способом:

```ts
TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
```

### `ignoreCancelled` {#ignorecancelled}

Объект оставляет проверку включённой и передаёт ей одну опцию. **Отменённый** запрос — тот, который
код под тестом забрал обратно, отписавшись: `httpResource()`, у которого сигнал изменился раньше,
чем пришёл первый ответ, или `switchMap`, уронивший свою внутреннюю подписку. Собственный
`HttpTestingController.verify()` у Angular принимает `{ ignoreCancelled }` начиная с Angular 5
ровно для этой формы, а здесь та же опция доходит до проверки при завершении теста:

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })],
});
```

Браться за неё стоит потому, что альтернатива — всё или ничего. Сюита, в которой один
`httpResource()` остался без отписки и простить его нечем, выключает проверку **целиком** — и тогда
каждый остальной тест файла тоже перестаёт проверяться, а ведь ради этой гарантии опция и
существует. `false` и `{ ignoreCancelled: false }` значат то же, что раньше значило `true`: не
прощается ничего.

::: tip Проверку взводит модуль, а не импорт
Каждый модуль, собранный из этих провайдеров, взводит проверку для того теста, который его собрал, —
через environment initializer. Поэтому она достаёт до каждого файла спек воркера под
`isolate: false`, до списка провайдеров, вынесенного в константу, и до спреда, сделанного дважды
(который взводит её один раз). Раньше это был `afterEach`, регистрировавшийся при импорте точки
входа, а под `isolate: false` точка входа импортируется один раз на воркер: проверялся только первый
файл спек, который её импортировал.

Проверка выполняется в `onTestFinished`, после всех `afterEach` — то есть после teardown Angular и
после собственного `getTestBed().resetTestingModule()` сюиты, что бы ни говорил `sequence.hooks`.
Она всё равно видит то, что оставалось открытым, потому что сброс инстанса `TestBed` внутри этого
теста сначала забирает открытые запросы, и она никогда не просит контроллер у сброшенного
`TestBed`: это собрало бы свежий модуль, и `configureTestingModule` следующего теста отказался бы
работать.

Модулю, собранному в `beforeAll`, ронять нечего, поэтому он не взводит ничего — забирайте его
запросы через `verifyNoPendingRequests()`, если они важны.
:::

Единственное, что нужно инициализатору сверх ангуляровского, — собственный отчёт раннера о том,
какой тест сейчас выполняется. Там, где его нет — любой раннер, кроме Vitest, включая `bun:test` и
`node:test`, — он говорит об этом один раз на воркер, вместо того чтобы молча ничего не взвести:

```
[vitest-auto-spy] provideHttpTesting(): globalThis.__vitest_worker__ is not there, so the runner
does not say which test is running and the end-of-test check cannot arm. Call
`verifyNoPendingRequests()` yourself, or report the runner and version — under bun:test and
node:test this entry has no hook to use.
```

Всё остальное на этой странице там работает; хук нужен только автоматической проверке при
завершении, а `verifyNoPendingRequests()` — та же проверка, написанная руками.

## `expectRequest(matcher, options?)` {#expectrequest-matcher-options}

```ts
await expectRequest('/api/products').flush([product]); // по URL
await expectRequest('/api/products', { method: 'POST' }).flush({}); // по URL и глаголу
await expectRequest(/\/api\/products\?page=\d+/).flush([]); // по шаблону
await expectRequest((request) => request.body?.id === 7).flush({}); // по чему угодно ещё
```

Строка сопоставляется либо с `request.url`, либо с `request.urlWithParams`, поэтому спека может
назвать эндпоинт, не повторяя строку запроса, — или назвать строку запроса, когда именно она
различает два запроса. `{ method }` регистронезависим.

Он **делает tick перед тем, как смотреть**, — и это тот самый шаг, который вообще делает
`httpResource()` тестируемым.

Возвращается намеренно немногое:

| Член                      | Что делает                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `request`                 | `HttpRequest` в том виде, в каком его отправил код под тестом — URL, метод, заголовки, тело |
| `flush(body, options?)`   | ответить и досчитать; `options` — это `{ headers, status, statusText }`                     |
| `error(status, options?)` | уронить со статусом и досчитать так же; `options` — это `{ headers, statusText }`           |

`flush()` и `error()` — `async`, потому что досчёт требует дать пройти микротаске, а синхронный
вызов этого не умеет. Пишите `await`, и следующая строка читает уже досчитанное значение.

```ts
const created = expectRequest('/api/products', { method: 'POST' });

expect(created.request.body).toEqual({ title: 'Chair' });

await created.flush({ id: 9 });
```

## `expectNoRequest(matcher?, options?)` {#expectnorequest-matcher-options}

```ts
component.filter.set('open');
expectNoRequest('/api/products'); // ответил кэш; наружу ничего не ушло
```

Сначала делает tick, как и `expectRequest`: запрос, который просто ещё _не успел_ уйти, — это
другое утверждение, и иначе проверка прошла бы по неверной причине. Без аргумента означает
«не запрашивалось вообще ничего».

## `verifyNoPendingRequests(options?)` {#verifynopendingrequests-options}

Проверка из teardown, вызываемая руками. Полезна в середине теста — после подготовки, до проверок,
которые от неё зависят, — и в тех двух спеках сюиты, где `verifyOnTeardown` выключили:

```ts
await expectRequest('/api/products').flush([]);
verifyNoPendingRequests(); // больше наружу ничего не ушло
verifyNoPendingRequests({ ignoreCancelled: true }); // …кроме того, от чего код под тестом отписался
```

`{ ignoreCancelled: true }` — та же опция, которую принимает
[`verifyOnTeardown`](#ignorecancelled), и та самая, которую `HttpTestingController.verify()`
называет начиная с Angular 5.

Ничего не делает, если тест вообще не настраивал HTTP-тестирование.

## Что говорит каждое падение {#what-each-failure-says}

| Сообщение содержит                          | Причина                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `no request matched … Made instead: …`      | URL, глагол или предикат не описывают ничего из отправленного                                             |
| `no POST … — but GET … was made`            | отличается только глагол; передайте `{ method }`, который шлёт код                                        |
| `… was made; the query differs`             | тот же путь и глагол, другой query; назовите его или сравните только путь                                 |
| `nothing was requested at all`              | ресурс не стартовал, или никто не подписался на Observable                                                |
| `N requests matched …`                      | совпало больше одного; сузьте через `{ method }`, полный URL или предикат                                 |
| `this TestBed has no HttpTestingController` | в `providers` нет `provideHttpTesting()`                                                                  |
| `… was never answered (end of "…")`         | `verifyOnTeardown` нашёл то, что спека забыла; сообщение называет тест и `expectRequest`, который ответит |

Список запросов, которые _были_ сделаны, — ровно та причина, по которой первое сообщение стоит
больше, чем сообщение `expectOne`. «Expected one matching request, found none» отправляет читателя
перечитывать собственную спеку; «единственный сделанный запрос — `GET /api/product`, а вы просили
`/api/products`» заканчивает поиск на месте.

## Собственная точка входа и необязательный второй пир {#its-own-entry-and-an-optional-second-peer}

`vitest-auto-spy/angular-http` — единственная часть пакета, которая импортирует `@angular/common`.

`vitest-auto-spy/angular` обязан продолжать загружаться в проекте, где есть `@angular/core` и нет
`@angular/common`, а статический импорт внутри `dist/angular.js` сломал бы это для всех — включая
большинство сюит, которые никогда не тестируют HTTP-вызовы. У пакета уже была ровно такая ситуация,
и решена она была так же: rxjs живёт за `vitest-auto-spy/rxjs`, и ни одна другая точка входа до него
не дотягивается. Поэтому `@angular/common` — **необязательный** пир, и цену платят только те сюиты,
которые импортируют эту точку входа, и больше никто.

Два следствия, которые стоит проговорить прямо:

- Как и [`/angular-router`](/ru/adapters/angular-router) — и с 5.21.0 спутники `/angular/diagnostics`,
  `/angular/doubles` и `/angular/matchers` — и в отличие от всех остальных подпутей, этот
  **не** реэкспортирует ядро. Он спутник `vitest-auto-spy/angular`, который остаётся импортом для
  спаев, хелперов `TestBed` и `settleResource`.
- Точка входа весит **2.5 kB min+gzip** (2459 B, замерено так же, как для бейджа в README: бандл
  esbuild, минифицированный, gzip, пиры внешние).

## Как это соотносится с тем, что было раньше {#how-it-relates-to-what-was-already-here}

**[`settleResource`](/ru/adapters/angular#resources-httpresource-and-resource)** остаётся ровно таким, каким был, и по-прежнему
является ответом всегда, когда ожидание не привязано к одному запросу: `resource()` с асинхронным
загрузчиком, `rxResource`, перезагрузка, ресурс, которым движет что-то кроме HTTP.
`expectRequest().flush()` досчитывает за тот запрос, на который только что ответил;
`settleResource` ждёт ресурс, кто бы его ни запустил.

**[`enableAngularDiagnostics({ pendingRequests })`](/ru/adapters/angular-diagnostics#pendingrequests)**
продолжает работать без изменений, в том числе в сюитах, которые эту точку входа так и не взяли: он
читает токен контроллера структурно из вашего же `configureTestingModule`, что и позволило ему
изначально обойтись без пир-зависимости. Эти двое не конкурируют, а сотрудничают: оба забирают
открытые запросы через `match(() => true)`, а это одноразовая операция, поэтому один неотвеченный
запрос будет сообщён один раз — тем, кто посмотрел первым.

Для сюиты, которая использует `provideHttpTesting()` везде, `pendingRequests` избыточен: проверка
на уровне сюиты — та же самая проверка, только приезжающая из провайдеров, а не из setup-файла.
Оставьте диагностику включённой, если хоть какой-то файл всё ещё настраивает HTTP-тестирование
руками; вреда от обоих нет.

## Зонлесс и зоны {#zoneless-and-zones}

Tick, который делает эта точка входа, — это `TestBed.tick()` (под капотом `flushEffects()`), и он
корректен в обоих мирах: выполняет отложенные эффекты и change detection синхронно и обновляет вью
фикстур, которые никогда не были прикреплены к `ApplicationRef`. Под `fakeAsync` из
[`vitest-auto-spy/zone`](/ru/utilities/zone) тот же вызов по-прежнему работает; меняется то, что
загрузчик, разрешающийся по _таймеру_, требует `tick()`/`advanceTimers()` из слоя зон, а этого не
заменит никакой объём выкачивания микротасок.
