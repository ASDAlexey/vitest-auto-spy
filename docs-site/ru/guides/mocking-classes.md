---
title: Моки классов в Vitest
description: Как подменить класс в спеке Vitest - createSpyFromClass в сравнении с vi.spyOn на прототипе и фабрикой vi.mock, поля-стрелки и классы, которые код под тестом создаёт через new.
---

# Моки классов в Vitest

`createSpyFromClass` строит из класса типизированный объект-спай. Каждый метод становится спаем, а
настоящий класс остаётся нетронутым. Подходит, когда код под тестом получает экземпляр класса
аргументом конструктора, параметром функции или через DI.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, asInstance, createSpyFromClass } from 'vitest-auto-spy';

import { Checkout } from './checkout';
import { PaymentClient } from './payment-client';

describe('Checkout', () => {
  let payments: Spy<PaymentClient>;
  let checkout: Checkout;

  beforeEach(() => {
    payments = createSpyFromClass(PaymentClient);
    checkout = new Checkout(asInstance(payments));
  });

  it('returns the receipt id', async () => {
    payments.charge.calledWith(5).resolveWith({ id: 'r_1', amount: 5 });

    await expect(checkout.pay(5)).resolves.toBe('r_1');
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('reports a declined card', async () => {
    payments.charge.rejectWith(new Error('card declined'));

    await expect(checkout.pay(5)).resolves.toBe('declined');
  });

  it('refunds a receipt', async () => {
    payments.refund.resolveWith();

    await checkout.cancel('r_1');

    expect(payments.refund).toHaveBeenCalledWith('r_1');
  });
});
```

Классы из примера:

```ts
// payment-client.ts
export interface Receipt {
  id: string;
  amount: number;
}

export class PaymentClient {
  constructor(readonly apiKey: string) {}

  async charge(amount: number): Promise<Receipt> {
    /* настоящий HTTP-вызов */
  }

  async refund(id: string): Promise<void> {
    /* настоящий HTTP-вызов */
  }
}

// checkout.ts
export class Checkout {
  constructor(private readonly payments: PaymentClient) {}
  // pay(amount) вызывает payments.charge и возвращает id чека или 'declined', если запрос упал
  // cancel(id) вызывает payments.refund
}
```

Что делает каждая часть:

- **`createSpyFromClass(PaymentClient)`** создаёт новый объект на каждый тест. Он читает методы
  класса, не запуская конструктор, поэтому после теста ничего восстанавливать не нужно.
- **Каждый метод — спай**, даже если тест его не настраивал. В первом тесте `payments.refund` уже
  есть, поэтому `expect(payments.refund).not.toHaveBeenCalled()` работает.
- **`Spy<PaymentClient>`** даёт каждому методу хелперы под его тип возврата. `charge` возвращает
  `Promise<Receipt>`, поэтому у него есть `resolveWith` и `rejectWith`, а `resolveWith` принимает
  только `Receipt`.
- **`calledWith(5).resolveWith(...)`** отвечает, только если аргумент равен `5`. Вызов с другими
  аргументами получит общий ответ метода, заданный без `calledWith` (например,
  `payments.charge.resolveWith(receipt)`). Если его нет — `undefined`. Поэтому тест
  упадёт, если код отправит не ту сумму. Чтобы любой другой аргумент сразу бросал ошибку, используйте
  `mustBeCalledWith(5)`. Почему это надёжнее `mockResolvedValue` —
  [причина и следствие](/ru/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue).
- **`asInstance(payments)`** передаёт спай туда, где ждут `PaymentClient`. Он нужен, только если у
  класса есть приватные или защищённые члены: в `Spy<T>` их нет, и TypeScript не примет спай как
  `PaymentClient`. В остальных случаях он не мешает. Подробнее — в разделе [Мост между `Spy<T>` и `T`](/ru/core/spy-typing).

Если метод записан как поле-стрелка (`refund = async () => {}`), спаю нужна одна опция. См.
[Мок поля-стрелки](#mock-an-arrow-function-field).

## Выбрать подход {#choose-an-approach}

|                                   | `vi.spyOn(prototype)`           | Фабрика `vi.mock`                | `createSpyFromClass`                       |
| --------------------------------- | ------------------------------- | -------------------------------- | ------------------------------------------ |
| Что подменяет                     | все экземпляры класса           | модуль, на весь файл             | один объект, на один тест                  |
| Нужно восстанавливать             | да                              | нет                              | нет                                        |
| Какие методы покрыты              | те, что вы назвали              | те, что вы написали              | все, настроенные и нет                     |
| Типизирован по классу             | только подменённый метод        | нет                              | каждый метод и его хелперы                 |
| Новый метод в классе              | настоящий, пока его не подменят | отсутствует: `is not a function` | сразу спай, спеки не меняются              |
| Видит поля-стрелки                | нет                             | только если их написать          | если указать их в `instanceMethodsToSpyOn` |
| Код должен получать класс снаружи | нет                             | нет                              | да: аргументом или через DI                |

Последняя строка — единственное настоящее ограничение `createSpyFromClass`. Если код под тестом сам
вызывает `new PaymentClient()`, см. [Мок класса, который код создаёт через `new`](#mock-a-class-the-code-creates-with-new).

## Спай на прототипе через `vi.spyOn` {#spy-on-the-prototype-with-vi-spyon}

```ts
import { afterEach, expect, it, vi } from 'vitest';

import { Checkout } from './checkout';
import { PaymentClient } from './payment-client';

afterEach(() => vi.restoreAllMocks());

it('returns the receipt id', async () => {
  const charge = vi.spyOn(PaymentClient.prototype, 'charge').mockResolvedValue({ id: 'r_1', amount: 5 });
  const checkout = new Checkout(new PaymentClient('pk_test'));

  await expect(checkout.pay(5)).resolves.toBe('r_1');
  expect(charge).toHaveBeenCalledWith(5);
});
```

Это работает, но есть три минуса:

- **Меняется настоящий класс, для всех.** Каждый экземпляр получает подмену, пока её не снимут.
  Поэтому `afterEach` обязателен. Если его забыть, а тесты делят одно окружение (`isolate: false` — файлы тестов выполняются в одном
  общем окружении, без изоляции),
  упадёт тест в другом файле.
- **По одному методу.** Остальные методы остаются настоящими, и настоящий конструктор выполняется.
  Метод, добавленный в класс позже, станет настоящим вызовом во всех спеках, которые его не подменили.
- **Не видит поля-стрелки.** См. [Мок поля-стрелки](#mock-an-arrow-function-field).

## Подменить модуль через `vi.mock` {#replace-the-module-with-vi-mock}

```ts
vi.mock('./payment-client', () => ({
  PaymentClient: vi.fn(function () {
    return { charge: vi.fn(), refund: vi.fn() };
  }),
}));
```

Модуль подменяется целиком, поэтому между файлами ничего не протекает. Но:

- фейк не типизирован: `{ charge: vi.fn() }` ни с чем не сверяется;
- синхронизировать его с классом приходится вручную;
- внутри нужна `function`, а не стрелка. Vitest вызывает `new` только у реализации, которую можно
  вызвать как конструктор. Со стрелкой каждый `new PaymentClient()` падает:

```text
TypeError: () => ({ charge: __vite_ssr_import_0__.vi.fn() }) is not a constructor
```

Стек указывает в продакшен-код. Ещё Vitest печатает одно предупреждение в stderr ("The vi.fn() mock
did not use 'function' or 'class' in its implementation"), и в большом прогоне его легко пропустить.
Подробнее — на странице [Подмены конструкторов](/ru/utilities/constructor-doubles).

## Мок поля-стрелки {#mock-an-arrow-function-field}

Пусть `refund` записан не методом, а полем-стрелкой:

```ts
export class PaymentClient {
  // ...
  readonly refund = async (id: string): Promise<void> => {
    /* настоящий HTTP-вызов */
  };
}
```

Спай на прототипе до него не дотянется:

```ts
vi.spyOn(PaymentClient.prototype, 'refund');
// Error: The property "refund" is not defined on the object.
```

`refund = async () => {}` — поле, а не метод. TypeScript превращает его в присваивание внутри
конструктора, поэтому оно есть только у экземпляров и только после конструктора. На прототипе
следить не за чем. То же верно для всего, что задаётся в инициализаторе поля: привязанных
обработчиков, полей Angular `signal()` и `computed()`, членов ngrx `signalStore()`.

`createSpyFromClass` тоже читает прототип. В отличие от `new PaymentClient()`, он никогда не
запускает конструктор, поэтому безопасен для класса, чей конструктор открывает сокет. Сам он поле не
найдёт. Назовите его:

```ts
createSpyFromClass(PaymentClient, { instanceMethodsToSpyOn: ['refund'] });
```

Если забыть, у спая не будет `refund`. Упадёт сама спека, на строке, где вы настраиваете `refund`:
`Cannot read properties of undefined (reading 'resolveWith')`. Код под тестом ничего настоящего не
вызовет.

Если вместо этого указать поле в `onlyMethodsToSpyOn`, библиотека сообщит, что такого имени нет на
прототипе класса, и предложит `instanceMethodsToSpyOn`. По умолчанию это предупреждение. Ошибкой оно
становится, если сетап-файл вызывает `setupAutoSpy({ preset: 'strict' })` (или
`setupAutoSpy({ misconfiguration: 'throw' })`). Подробности —
[`instanceMethodsToSpyOn`](/ru/core/create-spy-from-class#instancemethodstospyon-—-callables-that-are-not-on-the-prototype).

Если класс есть только как **тип** или он весь состоит из полей экземпляра, список не нужен:
[`createAutoMock<PaymentClient>()`](/ru/core/auto-mock-by-type) создаёт каждый член, который читает
спека.

## Мок класса, который код создаёт через `new` {#mock-a-class-the-code-creates-with-new}

Если код под тестом сам вызывает `new PaymentClient()`, класс подменяют в его модуле. Оставьте
`vi.mock`, но верните из фабрики автоспай-конструктор `createSpyClass` вместо рукописного объекта:

```ts
import { expect, it, vi } from 'vitest';
import type { ConstructorSpy } from 'vitest-auto-spy';

import { payOnce } from './checkout';
import * as payments from './payment-client';

vi.mock('./payment-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./payment-client')>();
  const { createSpyClass } = await import('vitest-auto-spy');

  return {
    ...actual,
    PaymentClient: createSpyClass(actual.PaymentClient, {
      returns: { charge: Promise.resolve({ id: 'r_1', amount: 5 }) },
    }),
  };
});

const PaymentClient = payments.PaymentClient as unknown as ConstructorSpy<payments.PaymentClient>;

it('charges through the client it builds', async () => {
  await expect(payOnce(5)).resolves.toBe('r_1');

  expect(PaymentClient.calls[0]).toEqual(['pk_live']);
  expect(PaymentClient.instances[0].charge).toHaveBeenCalledWith(5);
});
```

[`createSpyClass`](/ru/utilities/constructor-doubles) возвращает настоящий конструктор, поэтому `new`
работает всегда. Каждый экземпляр — полный спай исходного класса. В `calls` лежат аргументы каждого
`new`, в `instances` — спай, созданный каждым `new`.

Две важные детали:

- **Ответы по умолчанию — в `returns`.** Экземпляра нет, пока код не вызовет `new`, а `payOnce`
  сразу после этого вызывает `charge`. Между ними у спеки нет момента что-то настроить. `returns`
  задаёт то, с чем стартует каждый новый экземпляр. Экземпляр из `instances` можно перенастроить
  для следующих вызовов.
- **Настоящий класс — из `importOriginal`.** Внутри фабрики обычный импорт модуля вернёт
  строящийся мок. `importOriginal` — единственный способ добраться до настоящего класса, из которого
  `createSpyClass` читает методы.

Приведение `as unknown as` нужно, потому что тип модуля по-прежнему говорит `PaymentClient`. Если
такое приведение встречается во многих спеках, измените код так, чтобы он получал класс снаружи:
аргументом или через фабрику в DI. Тогда подойдёт способ из начала страницы.

## Смотрите также {#related}

- [createSpyFromClass](/ru/core/create-spy-from-class): все опции, включая `onlyMethodsToSpyOn`,
  спаи на аксессорах и ленивые спаи.
- [Подмены конструкторов](/ru/utilities/constructor-doubles): `createSpyClass`, `mockConstructor` и
  `stubConstructor` для всего, что код под тестом создаёт через `new`.
- [Моки модулей, которые ничего не сделали](/ru/utilities/module-mocks): `assertMocked` для
  `vi.mock`, который молча не применился.
