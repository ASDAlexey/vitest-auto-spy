---
title: Отслеживание инъекций
description: trackInjections записывает, какие зависимости ваш код действительно запросил у DI, и даёт каждой авто-спай. Работает с Angular и NestJS.
---

# Отслеживание инъекций

`trackInjections(tokens)` заменяет список зависимостей спаями и записывает, какие из них ваш код
запросил у DI, по порядку. Используйте его, чтобы проверить «эта точка входа использует только эти
сервисы», вместо мока barrel-модуля (файла `index.ts`, который реэкспортирует соседей) через `vi.mock`.

```ts
import { TestBed } from '@angular/core/testing';
import { trackInjections } from 'vitest-auto-spy/angular';

// также экспортируется из 'vitest-auto-spy/nestjs'

it('starts checkout without analytics', () => {
  const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);

  TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
  collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

  TestBed.inject(CheckoutFacade).start();

  expect(collaborators.names({ clean: true })).toEqual(['FeatureFlagService']); // аналитику так и не запросили
});
```

## На какой вопрос это отвечает {#the-question-it-answers}

Большинство вызовов `vi.mock('@app/services')` на самом деле спрашивают: какие зависимости
использовал этот код? DI может ответить на это напрямую. Фабрика провайдера выполняется ровно тогда,
когда кто-то внедряет её токен. Поэтому `trackInjections` регистрирует каждую зависимость как
фабрику, а вы читаете, чьи фабрики сработали.

Это работает и под бандлером. Под `@angular/build:unit-test` barrel-файл или workspace-алиас уже
встроен в бандл, и `vi.mock` молча ничего не делает; см.
[Моки модулей, которые ничего не сделали](/ru/utilities/module-mocks). DI сборка не выбросит.

Самописный вариант (`providers.map(token => ({ provide: token, useFactory: … }))`) только
записывает. Чтобы подменить ответы зависимостей, понадобился бы второй механизм. `trackInjections`
делает и то, и другое: провайдеры несут авто-спаи, а журнал говорит, какие из них создал DI.

## `trackInjections(tokens, options?)` {#trackinjections-tokens-options}

| Параметр         | Тип                        | По умолчанию | Смысл                                               |
| ---------------- | -------------------------- | ------------ | --------------------------------------------------- |
| `tokens`         | массив классов или токенов | —            | Зависимости, которые подменить и отслеживать        |
| `options.double` | `(token) => unknown`       | авто-спай    | Строит подмену для токена; см. [ниже](#the-doubles) |

Возвращает журнал:

| Член                 | Что даёт                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| `providers`          | список `{ provide, useFactory }`, который разворачивают в тестовый модуль |
| `injectedTokens()`   | токены, которые запросил DI, в порядке срабатывания фабрик (копия)        |
| `names(options?)`    | тот же список именами, чтобы упавший `toEqual` читался                    |
| `wasInjected(token)` | создавал ли DI `token` хоть раз                                           |
| `get<D>(token)`      | спай, зарегистрированный для `token`, с типом `Spy<D>`                    |
| `reset()`            | забывает записи; спаи не трогает                                          |

**Используйте `names({ clean: true })`.** Бандлер может переименовать классы: Angular-плагин
компилирует `FeatureFlagService` в класс `_FeatureFlagService`, и обычный `names()` вернёт это имя.
`clean: true` убирает переименование бандлера (ведущий `_` у esbuild, суффикс `$1` у Rollup), и
список совпадает с тем, что вы написали. `InjectionToken` или класс, чьё имя стёр минификатор,
называется своей строковой формой.

`reset()` очищает только записи. Чтобы очистить и историю вызовов спаев, используйте `resetAutoSpy`.

### Подмены {#the-doubles}

По умолчанию каждый токен получает спай, построенный так же, как это делает `createWithAutoSpies`:

- токен-класс получает спай класса, `createSpyFromClass(token)` с настройками по умолчанию;
- любой другой токен, например `InjectionToken`, получает
  [`createAutoMock()`](/ru/core/auto-mock-by-type): у такого токена нет формы, которую можно
  прочитать во время выполнения.

```ts
collaborators.get<{ retries: number }>(CONFIG).retries = 3;
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);
```

Передайте `double`, когда зависимость должна быть настоящим объектом, например `FormBuilder` или
объектом конфигурации:

```ts
const collaborators = trackInjections([CONFIG], { double: () => ({ retries: 7 }) });
```

### Контракт по времени {#the-timing-contract}

Спаи создаются сразу, при вызове `trackInjections`, поэтому их можно настроить до запуска кода.
Записи появляются, только когда DI их создаёт:

```ts
expect(collaborators.injectedTokens()).toEqual([]); // пока никто не запрашивал
TestBed.inject(CheckoutFacade).start();
expect(collaborators.injectedTokens()).toEqual([FeatureFlagService]);
```

DI создаёт каждую зависимость один раз в каждом инжекторе. Поэтому токен появляется один раз для
каждого инжектора, который его запросил, а не для каждого места внедрения.

**Частая ошибка:** ждать, что журнал покажет, что запросил один метод. Большинство классов получают
зависимости при создании, поэтому запись появляется на `TestBed.inject(CheckoutFacade)`, раньше, чем
выполнится `start()`. Чтобы увидеть только то, что запросил `start()`, вызовите
`collaborators.reset()` после создания класса. Зависимость, созданная раньше, повторно не
записывается. Поэтому если класс получает зависимости в конструкторе или в полях, можно доказать,
что запросил класс, но не то, что запросил один его метод.

### `get` на токене, которого нет в отслеживаемых {#get-on-a-token-that-is-not-tracked}

**Частая ошибка:** вызвать `get` с токеном, которого нет в списке. Это бросает ошибку:

```
[vitest-auto-spy] trackInjections(...).get(AnalyticsService): that token is not tracked by this log.
Tracked here: FeatureFlagService. Add it to the trackInjections([...]) list, or read it from the injector directly — `get` only answers for the tokens whose providers this log created.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/track-injections#get-on-a-token-that-is-not-tracked
```

При пустом списке токенов сообщение говорит `Tracked here: (none)`.

## Не только для Angular {#not-angular-specific}

`{ provide, useFactory }` — один и тот же объект в Angular и NestJS, а фабрикам не нужны
зависимости. Поэтому один и тот же список `providers` работает в обоих.

```ts
// NestJS
import { Test } from '@nestjs/testing';
import { trackInjections } from 'vitest-auto-spy/nestjs';

const collaborators = trackInjections([MailerService, ConfigService]);

const moduleRef = await Test.createTestingModule({
  providers: [OrdersService, ...collaborators.providers],
}).compile();

moduleRef.get(OrdersService).place(order);

expect(collaborators.wasInjected(MailerService)).toBe(true);
```

Это одна реализация, экспортированная из `vitest-auto-spy/angular` и из `vitest-auto-spy/nestjs`. Она
не импортирует ни одного фреймворка, поэтому [точке входа NestJS](/ru/adapters/nestjs) не нужны
зависимости: `@nestjs/common` и `@nestjs/testing` — необязательные peer-зависимости, которые она не
импортирует.

## Смотрите также {#related}

- [Дайте коду точку подмены](/ru/utilities/module-mocks#provide-a-real-seam): почему зависимость
  лучше внедрить, чем мокать её модуль. `trackInjections` — то, чем вы потом это проверяете.
- [`createWithAutoSpies`](/ru/adapters/angular#building-a-class-with-auto-spied-dependencies): когда
  нужно собрать класс с зависимостями-спаями, а не записывать, что он запросил.
