---
title: Моки классов в Vitest
description: createSpyFromClass против vi.spyOn(Class.prototype) и фабрики vi.mock — что выбрать, почему спай на прототипе не видит поле-стрелку и как задублировать класс, который код под тестом создаёт сам.
---

# Моки классов в Vitest

Подменить класс в спеке Vitest можно тремя способами, и тот, с которого начинает большинство
руководств, — тот, что протекает. Эта страница ставит их рядом на одном классе, а затем разбирает
ловушку, общую для всех трёх: члены, которых нет на прототипе.

```ts
export class PaymentClient {
  constructor(readonly apiKey: string) {}

  async charge(amount: number): Promise<Receipt> {
    /* настоящий HTTP-вызов */
  }

  readonly refund = async (id: string): Promise<void> => {
    /* поле-стрелка — живёт на экземпляре, а не на прототипе */
  };
}

export class Checkout {
  constructor(private readonly payments: PaymentClient) {}
  // pay(amount) зовёт payments.charge, cancel(id) зовёт payments.refund
}
```

## 1. `vi.spyOn(Class.prototype, 'method')` {#_1-vi-spyon-class-prototype-method}

```ts
afterEach(() => vi.restoreAllMocks());

it('returns the receipt id', async () => {
  const charge = vi.spyOn(PaymentClient.prototype, 'charge').mockResolvedValue({ id: 'r_1', amount: 5 });
  const checkout = new Checkout(new PaymentClient('pk_test'));

  await expect(checkout.pay(5)).resolves.toBe('r_1');
  expect(charge).toHaveBeenCalledWith(5);
});
```

Это работает, и у этого три цены:

- **Патчится настоящий класс, для всех.** Каждый экземпляр в realm отвечает заглушкой, пока её кто-то
  не снимет, — поэтому `afterEach` не опционален, и поэтому забытое восстановление под
  `isolate: false` роняет тест в другом файле.
- **По одному методу.** Все остальные методы настоящие, так что настоящий конструктор выполняется, а
  незаглушённая половина класса делает настоящую работу. Новый метод в классе — это новый настоящий
  вызов из каждой спеки, которая о нём не знала.
- **Поле экземпляра он не видит.** См. [ниже](#the-trap-arrow-function-fields).

## 2. Фабрика `vi.mock` {#_2-a-vi-mock-factory}

```ts
vi.mock('./payment-client', () => ({
  PaymentClient: vi.fn(function () {
    return { charge: vi.fn(), refund: vi.fn() };
  }),
}));
```

Подменяется весь модуль, так что ничего не протекает, — но дубль не типизирован
(`{ charge: vi.fn() }` ни с чем не сверяется), держать его в ногу с классом приходится руками, и у
него своя ловушка: Vitest передаёт `new` только реализации, которую саму можно вызвать через `new`.
Напишите ту же фабрику со стрелкой — и каждое конструирование падает:

```text
TypeError: () => ({ charge: __vite_ssr_import_0__.vi.fn() }) is not a constructor
```

со стеком в продакшен-коде и одним предупреждением в stderr («The vi.fn() mock did not use
'function' or 'class' in its implementation»), которое легко пропустить в большом прогоне. Вся
история — на странице [дублей конструкторов](/ru/utilities/constructor-doubles).

## 3. `createSpyFromClass` {#_3-createspyfromclass}

```ts
import { type Spy, asInstance, createSpyFromClass } from 'vitest-auto-spy';

describe('Checkout', () => {
  let payments: Spy<PaymentClient>;
  let checkout: Checkout;

  beforeEach(() => {
    payments = createSpyFromClass(PaymentClient, { instanceMethodsToSpyOn: ['refund'] });
    checkout = new Checkout(asInstance(payments));
  });

  it('returns the receipt id', async () => {
    payments.charge.calledWith(5).resolveWith({ id: 'r_1', amount: 5 });

    await expect(checkout.pay(5)).resolves.toBe('r_1');
  });

  it('reports a declined card', async () => {
    payments.charge.rejectWith(new Error('card declined'));

    await expect(checkout.pay(5)).resolves.toBe('declined');
  });

  it('refunds through the arrow field', async () => {
    payments.refund.resolveWith();

    await checkout.cancel('r_1');

    expect(payments.refund).toHaveBeenCalledWith('r_1');
  });
});
```

Спай — новый объект на каждый тест, собранный с прототипа класса без запуска его конструктора:

- **Нечего восстанавливать.** Настоящий `PaymentClient` не трогается, так что нет глобального
  состояния, которое надо вернуть, и нечего унаследовать следующему файлу.
- **Каждый метод, типизированно.** `Spy<PaymentClient>` даёт каждому методу хелперы по его типу
  возврата — `resolveWith` / `rejectWith` у `charge`, потому что он возвращает `Promise`, причём
  аргумент `resolveWith` обязан быть `Receipt`. Метод, добавленный в класс, становится спаем в каждой
  спеке на следующем же прогоне.
- **Ответы по аргументам.** `calledWith(5)` настраивает, что вернёт именно этот вызов, а это более
  сильный контракт, чем безусловный `mockResolvedValue`, — см.
  [причину и следствие](/ru/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue).

`asInstance` нужен потому, что `Spy<T>` — маппед-тип, он отбрасывает приватные члены и как есть не
присваивается `PaymentClient`; компромисс разобран в [Мосте между `Spy<T>` и `T`](/ru/core/spy-typing).

|                       | `vi.spyOn(prototype)`    | фабрика `vi.mock`          | `createSpyFromClass`                        |
| --------------------- | ------------------------ | -------------------------- | ------------------------------------------- |
| Охват патча           | каждый экземпляр в realm | модуль, на весь файл       | один объект, один тест                      |
| Нужно восстанавливать | да                       | нет                        | нет                                         |
| Какие методы покрыты  | те, что вы назвали       | те, что вы написали        | все, лениво                                 |
| Типизирован по классу | только заглушённый метод | нет                        | каждый метод и его хелперы                  |
| Видит поля-стрелки    | нет                      | только если вы их написали | если названы                                |
| Нужен шов             | нет                      | нет                        | да — класс приходит аргументом или через DI |

Последняя строка — честная цена. `createSpyFromClass` требует, чтобы код под тестом _получал_
экземпляр: аргументом конструктора, параметром функции, DI-провайдером. Код, который сам выполняет
`new PaymentClient()`, разобран [ниже](#a-class-the-code-under-test-constructs).

## Ловушка: поля-стрелки {#the-trap-arrow-function-fields}

```ts
vi.spyOn(PaymentClient.prototype, 'refund');
// Error: The property "refund" is not defined on the object.
```

`refund = async () => {}` — не метод. TypeScript компилирует его в присваивание внутри конструктора,
поэтому он существует только на экземплярах и только после того, как конструктор отработал. То же
верно для всего, что присваивается в инициализаторе поля: привязанных обработчиков, полей Angular
`signal()` / `computed()`, членов ngrx `signalStore()`. На прототипе спаить нечего.

`createSpyFromClass` тоже собирает с прототипа и тоже не запускает конструктор — именно это делает
его безопасным на классе, чей конструктор открывает сокет, — поэтому сам поле найти не может.
Назовите его:

```ts
createSpyFromClass(PaymentClient, { instanceMethodsToSpyOn: ['refund'] });
```

Забудете — и у спая не будет `refund`: упадёт строка самой спеки с `Cannot read properties of
undefined (reading 'resolveWith')`, а не код под тестом, тихо позвавший что-то настоящее. Если же
положить поле в `onlyMethodsToSpyOn`, библиотека сообщит, что такого имени нет на прототипе класса, —
предупреждением или исключением под пресетом `strict`, — и назовёт исправление:
`instanceMethodsToSpyOn`. Рассуждение — на странице
[createSpyFromClass](/ru/core/create-spy-from-class#instancemethodstospyon-—-callables-that-are-not-on-the-prototype).

Классу, который у вас есть только как **тип**, — или состоящему из одних полей экземпляра — список не
нужен вовсе: [`createAutoMock<PaymentClient>()`](/ru/core/auto-mock-by-type) лениво собирает каждый
член из того, что читает спека.

## Класс, который код под тестом создаёт сам {#a-class-the-code-under-test-constructs}

Когда вызов конструктора живёт внутри кода под тестом, класс приходится подменять там, где его
находит код, — в модуле. Мок модуля остаётся, но вместо рукописного литерала в нём авто-спаящий
конструктор:

```ts
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

[`createSpyClass`](/ru/utilities/constructor-doubles) — настоящий конструктор, `new` работает на любой
версии раннера, и каждый экземпляр — полноценный авто-спай исходного класса. Две детали несут
нагрузку:

- **Значение по умолчанию — в `returns`.** Экземпляра нет, пока код под тестом не вызвал `new`, а
  `payOnce` зовёт `charge` тут же, так что у спеки нет момента, чтобы его настроить. `returns` —
  значение, с которым начинает каждый экземпляр; экземпляр, полученный через `instances`, всё ещё
  можно перенастроить для последующих вызовов.
- **Настоящий класс приходит из `importOriginal`.** Внутри фабрики собственный импорт модуля
  разрешился бы в строящийся мок, поэтому `importOriginal` — единственный способ добраться до класса,
  с прототипа которого читает `createSpyClass`.

Единственный `as unknown as` — цена того, чтобы прочитать экспорт модуля как дубль, которым его
заменили: собственный тип модуля по-прежнему говорит `PaymentClient`. Если эта строка появляется во
многих спеках, классу нужен шов — передавайте его снаружи или инжектите фабрику, — и тогда работает
раздел выше.

## Смотрите также {#related}

- [createSpyFromClass](/ru/core/create-spy-from-class) — все опции, включая `onlyMethodsToSpyOn`,
  спаи на аксессоры и ленивые спаи.
- [Дубли конструкторов](/ru/utilities/constructor-doubles) — `createSpyClass`, `mockConstructor` и
  `stubConstructor` для всего, что код под тестом собирает через `new`.
- [Моки модулей, которые ничего не сделали](/ru/utilities/module-mocks) — `assertMocked` для
  `vi.mock`, который молча не применился.
