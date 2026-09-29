---
title: NestJS
description: Заменить зависимости сервиса типизированными спаями в Test.createTestingModule или собрать сервис через createNestUnit вообще без тестового модуля.
---

# NestJS

`vitest-auto-spy/nestjs` заменяет зависимости Nest-сервиса типизированными спаями. Это нужно, когда
вы тестируете один провайдер и хотите, чтобы всё, что он получает через DI, было подменой под вашим
контролем. Спай — функция-заглушка: она запоминает вызовы и возвращает то, что вы ей задали.

```ts
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';

import { AuthService } from './auth.service';
import { UserService } from './user.service';

describe('AuthService', () => {
  let moduleRef: TestingModule;
  let auth: AuthService;
  let users: Spy<UserService>;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [AuthService, provideAutoSpy(UserService)],
    }).compile();

    auth = moduleRef.get(AuthService);
    users = injectSpy(moduleRef, UserService);
  });

  it('signs in a known user', async () => {
    users.findByEmail.calledWith('ada@example.com').resolveWith({ id: 1, name: 'Ada' });

    await expect(auth.signIn('ada@example.com')).resolves.toMatchObject({ id: 1 });
    expect(users.findByEmail).toHaveBeenCalledWith('ada@example.com');
  });

  it('rejects an unknown one', async () => {
    users.findByEmail.resolveWith(null);

    await expect(auth.signIn('nobody@example.com')).rejects.toThrow('Unknown user');
  });
});
```

`AuthService` указан как есть, поэтому Nest создаёт настоящий класс — его и тестируем. `UserService`
указан через `provideAutoSpy`, поэтому сервис получает спай.

Под Vitest компилируйте через `unplugin-swc` с включёнными метаданными декораторов: стандартная
трансформация Vite (esbuild) не пишет метаданные, которые нужны Nest. Подробнее — в разделе
[Метаданные пишет ваш компилятор](#the-metadata-comes-from-your-compiler).

Как задать ответ методу спая:

- `resolveWith(value)` — для метода, который возвращает `Promise`; вызов разрешится значением `value`.
- `mockReturnValue(value)` — для метода, который возвращает обычное значение.
- `calledWith(args)` перед любым из них — ответ сработает только на вызов с этими аргументами.

Все хелперы для ответов — на странице [Хелперы управления](/ru/core/control-helpers).

::: warning Здесь `injectSpy` принимает два аргумента
В Angular `injectSpy(token)` читает из глобального `TestBed`. В Nest глобального модуля нет, поэтому
здесь **`injectSpy(moduleRef, token)`**: сначала ссылка на модуль.
:::

**Частая ошибка:** в `providers` указан сам класс (`providers: [UserService]`), а потом на нём
вызывают `injectSpy`. Вы получаете настоящий сервис с типом спая, и первый же заданный ответ падает
с `TypeError: users.findByEmail.resolveWith is not a function`. Указывайте его через
`provideAutoSpy(UserService)`.

Если тестовый модуль вообще не нужен, [`createNestUnit`](#building-the-unit-from-its-metadata)
собирает сервис и все его спаи одним синхронным вызовом.

## Что экспортирует точка входа {#what-the-entry-exports}

| Экспорт                                             | Что делает                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `provideAutoSpy(Class, config?)`                    | возвращает `{ provide: Class, useValue: spy }` для `providers`        |
| `injectSpy(moduleRef, token)`                       | достаёт провайдер из скомпилированного модуля с типом `Spy<T>`        |
| `createNestUnit(Target, options?)`                  | создаёт `Target` по его DI-метаданным, со спаем на каждую зависимость |
| [`trackInjections`](/ru/utilities/track-injections) | записывает, какие провайдеры юнит на самом деле запросил              |

Второй аргумент `provideAutoSpy` принимает те же опции, что и
[`createSpyFromClass`](/ru/core/create-spy-from-class), например
`provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] })`.

## Абстрактные классы и токены-интерфейсы {#abstract-classes-and-interface-tokens}

Nest часто внедряет зависимость по абстрактному классу или по строковому либо символьному токену.
`provideAutoSpy` нужен настоящий класс, чтобы прочитать методы. Передайте ему конкретный класс, а
токен направьте на спай:

```ts
// абстрактный класс как токен, конкретный класс как форма
providers: [{ provide: PaymentGateway, useValue: provideAutoSpy(StripeGateway).useValue }];

// строковый или символьный токен
providers: [{ provide: 'PAYMENT_GATEWAY', useValue: provideAutoSpy(StripeGateway).useValue }];
```

Достаёте его по тому же токену, что и Nest:

```ts
const gateway = injectSpy(moduleRef, PaymentGateway);
```

Если класса нет совсем, только интерфейс, передайте в `useValue`
[`createAutoMock<PaymentGateway>()`](/ru/core/auto-mock-by-type). Он собирает такой же спай по
типу.

## Любой раннер {#any-runner}

На Vitest точка входа раннера не нужна: достаточно одного `vitest-auto-spy/nestjs`.

На других раннерах импортируйте ещё точку входа своего раннера (`vitest-auto-spy/node`,
`vitest-auto-spy/bun` или `vitest-auto-spy/rstest`), и хелперы Nest будут создавать моки этого
раннера. `vitest-auto-spy/nestjs` не импортирует `vitest`, поэтому там работает. Её объявления типов
тоже не упоминают `vitest`, так что проект на Bun или `node:test` проходит проверку типов с
`skipLibCheck: false` и без установленного Vitest. Точку входа раннера можно импортировать до или
после `vitest-auto-spy/nestjs`.

**Частая ошибка:** на Vitest набор тестов, который импортирует только `vitest-auto-spy/nestjs`,
получает спаи без `mockThrow` из Vitest. Добавьте `import type {} from 'vitest-auto-spy';` в любой
файл; подробнее — [Совместимость](/ru/core/compatibility#vitest-2-1).

`createNestUnit` экспортируется ещё и из `vitest-auto-spy/node` и `vitest-auto-spy/bun`, поэтому
тестам Nest на `node --test` или `bun test` хватает одного импорта:

```ts
import 'reflect-metadata';

import { createNestUnit } from 'vitest-auto-spy/node';
```

Версии `provideAutoSpy` и `injectSpy` для Nest есть только в `/nestjs`. Импортируйте их оттуда на
любом раннере.

## Сборка юнита по его метаданным {#building-the-unit-from-its-metadata}

`createNestUnit(Target, options?)` собирает тестируемый класс без `Test.createTestingModule`. Он
читает метаданные, которые уже пишут декораторы Nest, создаёт класс через `new` и даёт каждой
зависимости спай. Когда конструктор меняется, спека остаётся прежней: список провайдеров никто не
пишет руками.

```ts
import { expect, it } from 'vitest';
import { createNestUnit } from 'vitest-auto-spy/nestjs';

import { CartService } from './cart.service';
import { PricingService } from './pricing.service';
import { TaxService } from './tax.service';

it('adds tax to the total', () => {
  const { unit, spies } = createNestUnit(CartService);

  spies.get(PricingService).total.mockReturnValue(100);
  spies.get(TaxService).rate.mockReturnValue(0.5);

  expect(unit.checkout(3)).toBe(150);
  expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService]);
});

it('saves the order through the repository', async () => {
  const { unit, spies } = createNestUnit(OrderService);

  spies.get(OrderRepository).save.resolveWith({ id: 7 }); // save() возвращает Promise

  await expect(unit.place({ total: 30 })).resolves.toEqual({ id: 7 });
  expect(spies.get(OrderRepository).save).toHaveBeenCalledWith({ total: 30 });
});
```

`compile()` не нужен: сам `createNestUnit` синхронный. `spies.get(X)` возвращает тот же спай, который
получил юнит, поэтому ответы и проверки вызовов на нём такие же, как с `injectSpy`. Для
`createNestUnit` `import 'reflect-metadata'` должен загрузиться раньше ваших классов (см.
[раздел о метаданных](#the-metadata-comes-from-your-compiler) ниже).

| Опция       | Тип                  | По умолчанию | Смысл                                                 |
| ----------- | -------------------- | ------------ | ----------------------------------------------------- |
| `expose`    | `NestUnitClass[]`    | `[]`         | классы, которые создаются по-настоящему, а не спаятся |
| `providers` | `NestUnitProvider[]` | `[]`         | ваши значения; важнее спаев и `expose`                |

| Метод `spies`       | Возвращает                                                 |
| ------------------- | ---------------------------------------------------------- |
| `get(token)`        | спай (или ваше значение), который юнит получил для `token` |
| `autoSpiedTokens()` | токены, которые получили спай                              |
| `exposedTokens()`   | классы из `expose`, которые юнит действительно создал      |

Как ведёт себя граф зависимостей:

- На каждый токен один экземпляр, как в синглтон-области Nest по умолчанию. Если два класса делят
  зависимость, у них один спай.
- У спая класса есть только методы настоящего класса. Метод с опечаткой — это `undefined`, а не
  новый спай, так что тест падает на опечатке: `spies.get(PricingService).totl // опечатка → undefined`.
- У строкового или символьного токена нет класса, поэтому он получает спай
  [`createAutoMock()`](/ru/core/auto-mock-by-type), собранный по типу.
- `spies.get(token)` бросает ошибку на токен, который юнит не запрашивал, и перечисляет токены,
  получившие спай. Иначе вы настроили бы спай, которым юнит не пользуется, и тест ничего бы не
  проверял.

Это аналог Angular-хелпера
[`createWithAutoSpies`](/ru/adapters/angular#building-a-class-with-auto-spied-dependencies) для Nest.

### Sociable — `expose` {#sociable-—-expose}

`expose` создаёт зависимость по-настоящему, а её собственные зависимости по-прежнему получают спаи.
Это короткая запись `{ provide: X, useClass: X }`.

```ts
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

// CartService настоящий; его спаи — те, что ниже.
spies.get(PricingService).total.mockReturnValue(10);
spies.get(TaxService).rate.mockReturnValue(0.2);

expect(unit.run(1)).toBe(12);
expect(spies.exposedTokens()).toEqual([CartService]);
```

**Частая ошибка:** `spies.get(CartService)` здесь бросает ошибку: юнит получил настоящий экземпляр, а
не спай. Читайте спаи его зависимостей или уберите класс из `expose`. Если класса из `expose` нет в
`exposedTokens()`, значит, никто в графе его не запросил.

### Токены без класса — `providers` {#tokens-with-no-class-—-providers}

В `providers` вы задаёте значения сами. Поддерживаются три формы: `useValue`, `useClass` и
`useFactory`. Результат `provideAutoSpy(X, config)` — это провайдер `useValue`, он тоже подходит.

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [
    provideAutoSpy(TaxService, { onlyMethodsToSpyOn: ['rate'] }),
    { provide: 'CONFIG', useValue: { currency: 'EUR' } },
    { provide: PaymentGateway, useClass: StripeGateway },
    { provide: FLAGS, useFactory: () => ({ beta: true }) },
  ],
});

expect(spies.get('CONFIG')).toEqual({ currency: 'EUR' }); // заданное значение возвращается как есть
```

- `useClass` создаётся как класс из `expose`: настоящий класс, зависимости — спаи.
- `useFactory` не принимает аргументов и вызывается один раз, когда токен понадобился впервые.
  Список `inject` не поддерживается.

**Частая ошибка:** токен конфига вроде `@Inject('CONFIG')` не задан в `providers`. Он получает спай
по типу, и `config.currency` оказывается функцией-спаем, а не строкой. Значения конфига задавайте в
`providers`.

### Необязательные зависимости и зависимости-свойства {#optional-and-property-dependencies}

- Для обычной зависимости `@Optional()` ничего не меняет: она всё равно получает спай.
- `@Optional()` важен только для параметра, чей токен вообще нельзя внедрить (см.
  [ошибки ниже](#what-it-refuses-and-what-the-message-says)). Такой параметр получает `undefined`
  вместо ошибки.
- Внедрение в свойство (`@Inject(Logger) logger!: Logger`) работает по тем же правилам. Свойство
  заполняется после конструктора.

### Метаданные пишет ваш компилятор {#the-metadata-comes-from-your-compiler}

Nest берёт типы параметров конструктора из `design:paramtypes`. Компилятор пишет эти метаданные при
включённом `emitDecoratorMetadata: true`. Они нужны обоим способам на этой странице: и
`Test.createTestingModule`, и `createNestUnit`.

Одно правило для тестовой сборки:

- **Vitest:** компилируйте через `unplugin-swc` с включёнными метаданными декораторов, как советует
  документация NestJS. Стандартная трансформация Vite (esbuild) метаданные не пишет.
- **tsc или SWC** (`jsc.transform.decoratorMetadata: true`), например `node --test` на выходе tsc:
  ничего дополнительно не нужно, оба пишут метаданные.
- **`reflect-metadata`** должен загрузиться раньше ваших классов. Для `Test.createTestingModule` его
  загружает тестовый пакет Nest. Для `createNestUnit` добавьте `import 'reflect-metadata'` в начало
  спеки или setup-файла. `reflect-metadata` — ваша dev-зависимость, этот пакет её не ставит.

Если флаг включить нельзя, ставьте `@Inject(X)` на каждый параметр конструктора. Декоратор сам
записывает токен, и `createNestUnit` его читает. `@Inject()` без токена не поможет: он опирается на те
самые метаданные, которых нет.

### Что он отвергает и что говорит сообщение {#what-it-refuses-and-what-the-message-says}

Каждая ошибка называет способ починки и заканчивается ссылкой на эту страницу.

- **Параметр без токена, который можно внедрить.** Интерфейсы, объединения и примитивы компилируются
  в `Object`, `String`, `Number` и т. п., и Nest их тоже внедрить не может. Сообщение называет класс и
  номер параметра. Почините через `@Inject(TOKEN)` плюс запись в `providers` или пометьте параметр
  `@Optional()`. Параметр, скомпилированный как `undefined`, обычно означает циклический импорт:
  используйте `@Inject(forwardRef(() => X))`. О свойстве сообщается так же, по имени.
- **Класс с параметрами конструктора и без метаданных.** Сообщение называет класс и три нужные вещи:
  `@Injectable()`, флаг компилятора и `reflect-metadata`, загруженный первым. Классу без параметров
  метаданные не нужны.
- **Цикл среди классов, созданных по-настоящему**, в виде `A -> B -> A`. Этот хелпер не разрешает
  циклы через `forwardRef`. Уберите одну сторону из `expose` или задайте её значением.
- **`spies.get` по токену, который юнит не запрашивал.** Сообщение перечисляет токены со спаями.
- **`spies.get` по классу из `expose`.** Этот класс настоящий, а не спай.

## Зависимости {#dependencies}

`@nestjs/common` и `@nestjs/testing` остаются вашими dev-зависимостями: точка входа их не
импортирует. `injectSpy` нужен только объект с методом `get(token)` (тип `NestModuleRef`), так что он
работает и с самописным фейковым модулем.
