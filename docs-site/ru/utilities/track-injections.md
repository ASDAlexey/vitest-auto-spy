---
title: Отслеживание инъекций
description: trackInjections — каких коллабораторов точка входа действительно запросила, записано через фабрики DI-провайдеров, а не через мок barrel-модуля. Angular и NestJS, одна реализация.
---

# Отслеживание инъекций

```ts
// та же функция экспортируется из 'vitest-auto-spy/nestjs'
import { trackInjections } from 'vitest-auto-spy/angular';

const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);

TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

TestBed.inject(CheckoutFacade).start();

expect(collaborators.names()).toEqual(['FeatureFlagService']); // аналитику никто не запрашивал
```

## На какой вопрос это отвечает {#the-question-it-answers}

За большинством вызовов `vi.mock('@app/services')` стоит вовсе не утверждение «этот модуль
подменили». Стоит вопрос — **каких коллабораторов эта точка входа действительно запросила**, и на него
можно ответить, вообще не трогая границу модуля, потому что фабрика провайдера выполняется ровно
тогда, когда кто-то инжектит её токен. Зарегистрируйте коллабораторов фабриками, выполните точку
входа, прочитайте обратно токены, чьи фабрики отработали, — по порядку.

Это важно потому, что граница модуля — как раз та часть, которую бандлер волен убрать. Под
`@angular/build:unit-test` barrel-модуль или алиас воркспейса уже заинлайнены к моменту, когда мок должен был
бы встать, и `vi.mock` превращается в молчаливый no-op —
[об этом вся первая половина страницы про моки модулей](/ru/utilities/module-mocks). DI — это шов,
который сборка обязана сохранить.

Руками это каждый раз одни и те же девять строк — `providers.map(token => ({ provide: token,
useFactory: … }))`, кладущий результат в массив, объявленный строчкой выше. На одной реальной сюите
это написали дважды за один день и захотели в третий раз. Ручная версия к тому же всегда
останавливается на самой записи, так что спеке нужен второй механизм — чтобы задать, что каждый
коллаборатор отвечает. Здесь есть и то, и другое: провайдеры несут авто-спаи, а лог говорит, кого из
них создал DI.

## `trackInjections(tokens, options?)` {#trackinjections-tokens-options}

Возвращает `InjectionLog`:

| Член                 | Что даёт                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| `providers`          | список `{ provide, useFactory }`, который разворачивают в тестовый модуль |
| `injectedTokens()`   | токены, которые запросил DI, в порядке выполнения их фабрик — копия       |
| `names()`            | тот же список именами, а именно это делает падающий `toEqual` читаемым    |
| `wasInjected(token)` | создавал ли DI `token` хоть раз                                           |
| `get<D>(token)`      | дубль, зарегистрированный на `token`, с типом `Spy<D>`                    |
| `reset()`            | забыть запись; дубли не трогаются                                         |

`injectedTokens()` отдаёт копию, так что её изменение ни на что не влияет. `names()` читает имя класса
с самого токена, а не с литерала, потому что downlevelling декораторов в Angular-плагине переименовывает
скомпилированные классы; `InjectionToken` — или класс, у которого минификатор срезал имя, — называется
своей `String`-формой.

`reset()` очищает только запись. Дубли её переживают — их сбрасывайте через `resetAutoSpy`, если спеке
нужна ещё и очищенная история вызовов.

### Дубли {#the-doubles}

По умолчанию на каждый токен строится дубль тем же способом, каким его строит `createWithAutoSpies`:
спай класса (`createSpyFromClass(token, { lazySpies: true })`), если токен — функция, и
[`createAutoMock()`](/ru/core/auto-mock-by-type) в остальных случаях — `InjectionToken` не несёт
рантайм-формы, так что мок на уровне типов здесь единственная честная подмена.

```ts
collaborators.get<{ retries: number }>(CONFIG).retries = 3;
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);
```

Передайте `double`, когда коллаборатор обязан быть настоящим объектом — `FormBuilder`, литерал
конфига:

```ts
const collaborators = trackInjections([CONFIG], { double: () => ({ retries: 7 }) });
```

### Контракт по времени {#the-timing-contract}

Дубли строятся **сразу**, в момент вызова `trackInjections`, так что спека может задать поведение
одного из них до запуска точки входа. А вот _запись_ заполняется только по мере того, как DI их
создаёт:

```ts
expect(collaborators.injectedTokens()).toEqual([]); // пока ничего не запрашивали
injector.get(CheckoutFacade).start();
expect(collaborators.injectedTokens()).toEqual([FeatureFlagService]);
```

Фабрика выполняется один раз на инжектор, так что токен появляется по разу на каждый запросивший его
инжектор — а не по разу на место инъекции.

### `get` на токене, которого нет в отслеживаемых {#get-on-a-token-that-is-not-tracked}

```
[vitest-auto-spy] trackInjections(...).get(AnalyticsService): that token is not tracked by this log.
Tracked here: FeatureFlagService. Add it to the trackInjections([...]) list, or read it from the injector directly — `get` only answers for the tokens whose providers this log created.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/track-injections
```

С пустым списком токенов то же сообщение говорит `Tracked here: (none)`.

## Не только для Angular {#not-angular-specific}

`{ provide, useFactory }` — буквально один и тот же объект в обоих фреймворках: и `deps` у Angular, и
`inject` у NestJS необязательны, а фабрики этого хелпера не имеют зависимостей, так что ни тот ключ, ни
другой не пишутся.

```ts
// NestJS
const collaborators = trackInjections([MailerService, ConfigService]);

const moduleRef = await Test.createTestingModule({
  providers: [OrdersService, ...collaborators.providers],
}).compile();

moduleRef.get(OrdersService).place(order);

expect(collaborators.wasInjected(MailerService)).toBe(true);
```

Одна реализация реэкспортируется и из `vitest-auto-spy/angular`, и из `vitest-auto-spy/nestjs` — вместо
того чтобы написать её дважды и оставить расходиться. Ядро не импортирует **вообще никакого
фреймворка** — именно это и держит [точку входа NestJS](/ru/adapters/nestjs) свободной от
зависимостей, поскольку `@nestjs/common` и `@nestjs/testing` — опциональные peer-зависимости, которые
она никогда не импортирует.

## Смотрите также {#related}

- [Дайте настоящий шов](/ru/utilities/module-mocks#provide-a-real-seam) — конструктивный совет, для
  которого этот хелпер и есть инструмент. Тот раздел говорит инжектить зависимость вместо мока модуля;
  `trackInjections` — то, чем вы это проверяете, когда уже сделали.
- [`createWithAutoSpies`](/ru/adapters/angular#building-a-class-with-auto-spied-dependencies) — когда
  вопрос звучит «построй этот класс с дублями», а не «запиши, что он запросил».
