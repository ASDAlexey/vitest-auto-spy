---
title: NestJS
description: provideAutoSpy и injectSpy(moduleRef, token) для Test.createTestingModule, а также createNestUnit — юнит, собранный по собственным DI-метаданным, со спаями вместо всех коллабораторов и без зависимости от @nestjs.
---

# NestJS

Точка входа `vitest-auto-spy/nestjs` поставляет провайдер `{ provide, useValue }`, заточенный под
`Test.createTestingModule({ providers: [...] })`, плюс типизированный `injectSpy`, который достаёт
спай из получившегося `TestingModule`.

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const moduleRef = await Test.createTestingModule({
  providers: [provideAutoSpy(MyService), provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] })],
}).compile();

const myService = injectSpy(moduleRef, MyService);
```

Без зависимостей по замыслу: `@nestjs/common` / `@nestjs/testing` — необязательные пиры, поэтому
точка входа описывает ссылку на модуль минимальным структурным типом вместо того, чтобы их
импортировать.

::: warning Здесь `injectSpy` принимает два аргумента
В Angular `injectSpy(token)` читает из глобального `TestBed`. У NestJS глобального модуля нет,
поэтому вариант для NestJS — **`injectSpy(moduleRef, token)`**: ссылка на модуль идёт первой.
:::

## Спека целиком {#a-full-spec}

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

Сам `AuthService` предоставляется **по-настоящему** — это класс под тестом. Всё, что он инжектит,
предоставляется как авто-спай.

## Абстрактные классы и токены-интерфейсы {#abstract-classes-and-interface-tokens}

Nest часто инжектит по абстрактному классу или по строковому / символьному токену. `provideAutoSpy`
нужен конструктор, из которого читать методы, поэтому передайте ему конкретный класс и перенаправьте
токен:

```ts
// абстрактный класс как токен, конкретный класс как форма
providers: [{ provide: PaymentGateway, useValue: provideAutoSpy(StripeGateway).useValue }];

// строковый / символьный токен
providers: [{ provide: 'PAYMENT_GATEWAY', useValue: provideAutoSpy(StripeGateway).useValue }];
```

Дальше читайте его так же, как его разрешает Nest:

```ts
const gateway = injectSpy(moduleRef, PaymentGateway);
```

Когда класса нет вообще — чистый интерфейс, — используйте в качестве `useValue`
[`createAutoMock<PaymentGateway>()`](/ru/core/auto-mock-by-type): он собирает ту же поверхность спая
из типа.

## Почему нет зависимости от `@nestjs` {#why-there-is-no-nestjs-dependency}

`@nestjs/common` и `@nestjs/testing` остаются **вашими** dev-зависимостями. Точка входа описывает
ссылку на модуль минимальным структурным типом (`NestModuleRef` — что угодно с `get(token)`),
поэтому ничто из Nest не попадает в рантайм-бандл этого пакета, а `injectSpy` работает и с
самодельной подделкой в юнит-тесте.

## Сборка юнита по его метаданным {#building-the-unit-from-its-metadata}

`createNestUnit(Target, options?)` собирает класс под тестом по метаданным, которые пишут
собственные декораторы Nest, и отвечает спаем на каждую зависимость, которую никто не предоставил.
Это [`createWithAutoSpies`](/ru/adapters/angular#building-a-class-with-auto-spied-dependencies) поверх
`design:paramtypes`, `@Inject`, `@Optional()` и property injection вместо сгенерированной фабрики
Angular — и модель solitary / sociable из `@suites/unit`, но без Proxy, который отвечает на опечатку.
Изменение конструктора больше не переписывает спеку, потому что список провайдеров выводится, а не
пишется руками.

```ts
import { createNestUnit } from 'vitest-auto-spy/nestjs';

import { CartService } from './cart.service';
import { PricingService } from './pricing.service';
import { TaxService } from './tax.service';

const { unit, spies } = createNestUnit(CartService);

spies.get(PricingService).total.mockReturnValue(100);
spies.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService]);
```

Ни `Test.createTestingModule`, ни `compile()`, ни `await`: граф строится синхронно через `new`, по
одному инстансу на токен — дефолтная синглтон-область Nest, — поэтому зависимость, которую делят два
класса, это один спай. Спай класса читается с настоящего прототипа, поэтому
`spies.get(PricingService).totl` — это `undefined`, а не свежая функция; у строкового или
символьного токена прототипа нет, и на него отвечают
[`createAutoMock()`](/ru/core/auto-mock-by-type).

`spies.get(token)` отказывает по токену, который юнит никогда не просил, — базовый класс, сервис,
убранный рефакторингом, — и перечисляет то, что было заспаено, вместо того чтобы выпустить спай,
который юнит никогда не увидит. Это та же защита, что и в хелпере для Angular, и по той же причине:
неправильная заглушка должна падать на самой заглушке.

### Sociable — `expose` {#sociable-—-expose}

`expose` собирает коллаборатора по-настоящему, а его собственные зависимости разрешает через тот же
граф. Это сахар для `{ provide: X, useClass: X }` и это `sociable().expose()` из `@suites/unit`:

```ts
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

// Спай, который получил CartService, — тот же спай, который получил фасад.
spies.get(PricingService).total.mockReturnValue(10);
spies.get(TaxService).rate.mockReturnValue(0.2);

expect(unit.run(1)).toBe(12);
expect(spies.exposedTokens()).toEqual([CartService]);
```

`spies.get(CartService)` здесь падает: юнит получил настоящий инстанс, а не спай. Читайте вместо
этого спаи его собственных коллабораторов или уберите его из `expose`. `exposedTokens()`
перечисляет выставленные классы, которые граф действительно построил, поэтому запись, которую никто
не просил, видна своим отсутствием.

### Токены без класса — `providers` {#tokens-with-no-class-—-providers}

`providers` побеждает и авто-спаи, и `expose`. Он принимает три формы, которые Nest допускает без
списка `inject`, и результат `provideAutoSpy(X, config)` — первая из них:

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

expect(spies.get('CONFIG')).toEqual({ currency: 'EUR' }); // предоставленное значение возвращается как есть
```

На токен `@Inject('CONFIG')`, который никто не предоставил, отвечают моком по типу — это правильно
для сервиса за интерфейсом и неправильно для литерала конфига: `config.currency` окажется
функцией-спаем. Такие предоставляйте сами. `useClass` строится как выставленный класс, с заспаенными
зависимостями; `useFactory` не принимает аргументов и выполняется один раз, когда токен впервые
запросили.

`@Optional()` меняет одну вещь: параметр или свойство, чей токен вообще невозможно инжектить (см.
ниже), получает `undefined` вместо ошибки. Необязательная зависимость с инжектируемым токеном свой
спай всё равно получает, потому что в этом графе доступен каждый токен.

Property injection (`@Inject(Logger) logger!: Logger`) присваивается после конструирования, по тем же
правилам.

::: warning Метаданные приходят от компилятора, а не от этого пакета
`design:paramtypes` пишет `emitDecoratorMetadata: true`. **tsc** и **SWC**
(`jsc.transform.decoratorMetadata: true`) этот флаг уважают; **esbuild**, а значит и дефолтный
трансформ Vite, — нет, поэтому рецепт Vitest в документации NestJS компилирует через
`unplugin-swc`. В Nest-приложении это уже настроено, иначе оно бы просто не запустилось, а
`reflect-metadata` — собственное требование Nest — должен быть загружен раньше классов. Этот пакет
читает `Reflect.getMetadata` структурно и не добавляет зависимостей.

Без флага `@Inject(X)` на каждом параметре всё равно работает: декоратор записывает сам токен, в
`self:paramtypes`, и `createNestUnit` читает сначала оттуда. А голый `@Inject()` — нет: он читает
ровно те метаданные, которых не хватает.
:::

### Что он отвергает и что говорит сообщение {#what-it-refuses-and-what-the-message-says}

Каждое сообщение называет починку и заканчивается ссылкой на эту страницу.

- **Параметр без инжектируемого токена.** Интерфейс, объединение или примитив эмитятся как
  `Object`, `String`, `Number`, … и Nest такое тоже инжектить не умеет. Ошибка называет класс и
  индекс параметра и даёт обе починки — `@Inject(TOKEN)` плюс запись в `providers` или
  `@Optional()`. Параметр, эмитнутый как `undefined`, отдельно отмечается как признак циклического
  импорта, который решает `@Inject(forwardRef(() => X))`; `forwardRef` под `@Inject`
  разворачивается. О свойстве сообщается так же, по имени.
- **Класс с параметрами и без метаданных.** Называет класс, три вещи, которые нужны метаданным
  (`@Injectable()`, флаг компилятора, `reflect-metadata`, загруженный первым), и какие компиляторы их
  эмитят. Классу без параметров метаданные не нужны, и он просто конструируется.
- **Цикл среди классов, построенных по-настоящему.** `A -> B -> A`, с пометкой, что этот хелпер не
  разрешает циклы через `forwardRef`: выставьте на одну сторону меньше или предоставьте её.
- **`spies.get` по токену, который никто не просил** — со списком заспаенных токенов; и **по
  выставленному классу**, который настоящий, а не спай.
