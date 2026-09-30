---
title: Автомок по типу
description: createAutoMock, mockDeep и createMock - спай или тестовый объект по типу или интерфейсу TypeScript, без класса во время выполнения.
---

# Автомок по типу

Стройте спай по **типу или интерфейсу** TypeScript, когда класса нет: интерфейс, сгенерированный
API-клиент, токен внедрения. Каждый метод, к которому вы обратились, становится спаем с обычными
хелперами (`calledWith`, `resolveWith`, `nextWith`, …).

```ts
import { asInstance, createAutoMock } from 'vitest-auto-spy';

interface PaymentGateway {
  charge(amount: number): Promise<Receipt>;
  refund(id: string): Promise<void>;
}

const gateway = createAutoMock<PaymentGateway>();

gateway.charge.resolveWith({ id: 'r-1', amount: 42 });

await checkout(asInstance(gateway), 42); // ваш код под тестом; asInstance даёт спаю тип PaymentGateway
expect(gateway.charge).toHaveBeenCalledWith(42);
expect(gateway.refund).not.toHaveBeenCalled();
```

Фабрику выбирайте по тому, что код под тестом делает с объектом:

| Код под тестом…                                               | Используйте           | Что получаете                               |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------- |
| **вызывает** его методы (сервис, клиент)                      | `createAutoMock<T>()` | `Spy<T>`: каждый член — спай                |
| **читает** его как данные (DTO, конфиг, маршрут)              | `createMock<T>()`     | обычный `T` с переданными полями, без спаев |
| идёт **на несколько уровней вглубь** (`api.repo.user.find()`) | `mockDeep<T>()`       | спай на каждом уровне                       |

Если класс у вас есть, обычно лучше [`createSpyFromClass`](./create-spy-from-class): он знает, какие
члены — методы, и падает, если класс лишится метода.

## Что каждая фабрика даёт по умолчанию {#what-each-factory-gives-you-by-default}

Что возвращает каждый член, пока тест ничего не настроил. «Спай» — функция, которая записывает вызовы и
возвращает `undefined`. Ни один спай не возвращает `Promise` или `Observable`, пока `resolveWith` /
`nextWith` не скажет, что выдавать.

| Член `T`                              | `createSpyFromClass(C)`                                               | `createAutoMock<T>()`                  | `mockDeep<T>()`                                         | `createMock<T>()` |
| ------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- | ----------------- |
| Метод на прототипе                    | спай                                                                  | спай                                   | спай                                                    | `undefined`       |
| Метод, возвращающий `Promise` / поток | спай, возвращающий `undefined`                                        | спай, возвращающий `undefined`         | спай, возвращающий `undefined`                          | `undefined`       |
| Геттер / сеттер                       | `undefined`; спай аксессора с `gettersToSpyOn` или `autoSpyAccessors` | спай; задайте значение заранее         | спай; задайте значение заранее                          | `undefined`       |
| Поле данных (`count: number`)         | `undefined` (полей нет на прототипе)                                  | спай; задайте значение заранее         | спай; задайте значение заранее                          | `undefined`       |
| Поле-массив (`items: Item[]`)         | `undefined`                                                           | спай; задайте массив заранее           | настоящий массив глубоких моков после чтения по индексу | `undefined`       |
| Вложенный объект                      | `undefined`                                                           | спай; уровень под ним — `undefined`    | глубокий мок на каждом уровне                           | `undefined`       |
| Свойство-`Observable`                 | `undefined`; поток с `observablePropsToSpyOn`                         | спай; поток с `observablePropsToSpyOn` | глубокий мок                                            | `undefined`       |
| `then`, символы, протокольные ключи   | `undefined`                                                           | `undefined`                            | `undefined`                                             | `undefined`       |
| Значение из `overrides`               | это значение                                                          | это значение                           | это значение                                            | это значение      |

**Частая ошибка:** спай на месте поля данных — функция, а значит, он **истинный**. Код вроде
`if (user.nickname)` уходит не в ту ветку, пока тест не задаст поле. Задавайте поля данных заранее через
`overrides` (первый аргумент).

## Из типа — `createAutoMock` {#from-a-type-—-createautomock}

`createAutoMock<T>(overrides?, config?)` строит `Spy<T>` только по типу. Каждый метод, который вы
прочитали, становится спаем. Конкретные значения задавайте заранее в `overrides`, первом аргументе.

```ts
import { createAutoMock } from 'vitest-auto-spy';

interface UserService {
  getName(id: number): string;
  load(id: number): Promise<User>;
  readonly region: string;
}

const users = createAutoMock<UserService>({ region: 'eu' });

users.getName.calledWith(1).mockReturnValue('Ada');
users.load.resolveWith({ id: 1 });
```

| Опция (второй аргумент)  | Тип                   | По умолчанию | Смысл                                                                                        |
| ------------------------ | --------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `returns`                | `{ метод: значение }` | нет          | что отвечает метод; он остаётся спаем ([`returns` или `overrides`](./returns-vs-overrides))  |
| `observablePropsToSpyOn` | имена членов          | `[]`         | строить эти члены как потоки (`nextWith` …), а не спаи-функции; нужен `vitest-auto-spy/rxjs` |
| `selfReturning`          | имена методов         | `[]`         | эти методы возвращают сам спай, для цепочек вызовов                                          |
| `returnsUndefined`       | имена методов         | `[]`         | эти методы отвечают `undefined` и считаются настроенными под `strict`                        |
| `returnsClass`           | `{ метод: Класс }`    | нет          | эти методы возвращают спай этого класса ([подробнее](./create-spy-from-class#returns-class)) |
| `strict`                 | `boolean`             | `false`      | ненастроенный метод бросает ошибку ([Строгий режим](./strict-mode))                          |
| `onUnstubbedCall`        | `(call) => unknown`   | нет          | вызывается вместо возврата `undefined` для ненастроенного метода                             |
| `name`                   | `string`              | нет          | имя в сообщениях строгого режима                                                             |

### Опции без значений {#options-without-values}

Если заранее задавать нечего, передайте одни опции:

```ts
const stream = createAutoMock<EventSource>({ returnsUndefined: ['close'] });
```

Единственный аргумент читается как опции, когда в нём только имена опций и хотя бы одна из
`returnsUndefined`, `selfReturning`, `returnsClass`, `observablePropsToSpyOn`, `onUnstubbedCall` или
`onUnstubbedRead`. `autoMocked` читает его так же.

**Частая ошибка:** `createAutoMock<UserService>({ strict: true })`. `strict`, `name` и `returns` сами по
себе могут оказаться настоящими членами `T`, поэтому TypeScript такой вызов не пропустит. Передайте их
вторым аргументом: `createAutoMock<UserService>(undefined, { strict: true })`. Если у типа есть члены с
именами опций, передайте второй аргумент (хватит `{}`), и первый останется значениями.

С `strict` метод, который никто не настроил, бросает ошибку вместо того, чтобы вернуть `undefined`:

```ts
const users = createAutoMock<UserService>(undefined, { strict: true });

users.getName(1); // throws: createAutoMock(users.spec.ts:12).getName(1) was called; this strict double has nothing configured for it.
```

Имени класса нет, поэтому сообщение называет спай по файлу и строке, где вы его создали, например
`createAutoMock(users.spec.ts:12)` (или `autoMocked(…)` для `autoMocked`). `className` в обработчике `onUnstubbedCall` — та же строка. Чтобы выбрать имя, передайте
`{ name: 'USERS' }`. Член из `overrides` — обычное значение, а не спай, поэтому строгий режим его не
проверяет.

`createSpyFromClass` для полностью абстрактного класса (все члены `abstract`) возвращает такой же спай,
названный по классу, и `strict` там тоже работает.

**Частая ошибка:** свойство-`Observable` без `observablePropsToSpyOn`. Тип не говорит, какие члены —
потоки, поэтому член становится спаем-функцией, и код под тестом подписывается на функцию. Укажите член
в `observablePropsToSpyOn` или передайте настоящий `Subject` в `overrides`:

```ts
import 'vitest-auto-spy/rxjs';

// один раз на проект, обычно в setup-файле
import { createAutoMock } from 'vitest-auto-spy';

interface StatusSource {
  status$: Observable<'up' | 'down'>;
}

const source = createAutoMock<StatusSource>({ observablePropsToSpyOn: ['status$'] });
source.status$.nextWith('up'); // подписчики получат 'up'
```

### `autoMocked` — один объект с типами `T` и `Spy<T>` {#automocked-—-one-object-typed-as-both-t-and-spy-t}

Когда спай передаётся коду под тестом аргументом, TypeScript ждёт там `T`, а проверка ждёт `Spy<T>`.
`autoMocked<T>(overrides?, config?)` строит такой же спай, как `createAutoMock`, но с типом
`T & Spy<T>`, поэтому одна переменная годится в обоих местах. `AutoMocked<T>` — этот
тип, для `let`, который присваивается в `beforeEach`:

```ts
import { type AutoMocked, autoMocked } from 'vitest-auto-spy';

let logger: AutoMocked<Logger>;

beforeEach(() => {
  logger = autoMocked<Logger>();
});

it('logs the failure', () => {
  checkEndpoint('/health', logger); // принимается как Logger
  expect(logger.error).toHaveBeenCalledOnce(); // а здесь это спай
});
```

### `using` — сброс в конце блока {#using}

Объявите спай через `using`, и его вызовы и настройки сбросятся в конце блока:

```ts
it('names the user', () => {
  using users = createAutoMock<UserService>();
  users.getName.calledWith(1).mockReturnValue('Ada');

  expect(users.getName(1)).toBe('Ada');
});
// здесь нет ни вызовов, ни настроек
```

`Symbol.dispose` не видно ни в `Object.keys(users)`, ни в spread спая: там только члены, к которым
обращались. Значение, заданное под этим ключом, побеждает, как для любого другого ключа. Подробности и
почему нет `[Symbol.asyncDispose]` — на странице [createSpyFromClass](./create-spy-from-class#using).

### `undefined` в `overrides` — это заданное значение, а не пропуск {#undefined-in-overrides-is-a-seed-not-an-omission}

Ключ со значением `undefined` в `overrides` делает член равным `undefined`. Если ключ пропустить,
получится спай-функция — она истинная и уводит код с проверкой в неверную ветку:

```ts
createAutoMock<NavigationService>({ currentFocus: undefined, navRoot: undefined, selectors: 'button, a' });
//                                  ^ «это поле данных, и данных нет»
```

Пишите такой ключ, даже если он кажется лишним. Он говорит «член есть, и он пустой», а это не то же
самое, что промолчать.

### Геттер в `overrides` остаётся геттером {#a-getter-in-overrides-stays-a-getter}

Геттер, написанный в `overrides`, устанавливается как геттер, как патч от `mockAccessorsProp`. Он
срабатывает при каждом чтении, со спаем в качестве `this`. Аксессор `{ set }` принимает запись:

```ts
const platform = createAutoMock<PlatformSupport>({
  get transceiver(): never {
    throw new TypeError('RTCRtpTransceiver is not defined');
  },
});

expect(() => platform.transceiver).toThrow(); // бросает там, где его читает код под тестом
```

Создание спая геттер не запускает, как и `Object.keys`, `in`, сброс или снимок. То же верно, когда
`registerAutoSpyDefaults` объединяет свои умолчания с вашими `overrides`.

## Из типа, но без спаев — `createMock` {#from-a-type-without-spies-—-createmock}

`createMock<T>(partial?)` возвращает обычный `T`, собранный из переданных полей, без единого спая.
Используйте его для объектов, которые код под тестом только **читает**: DTO, снимок маршрута, объект
конфигурации.

```ts
import { createMock } from 'vitest-auto-spy';

const route = createMock<ActivatedRouteSnapshot>({ data: { title: 'Report' } });
const config = createMock<ServerConfig>({ baseUrl: 'https://example.test' });
```

|                          | `createMock<T>()`         | `createAutoMock<T>()`             |
| ------------------------ | ------------------------- | --------------------------------- |
| Возвращает               | `T`                       | `Spy<T>`                          |
| Члены, которые не задали | `undefined`               | спай, создаётся при первом чтении |
| Когда использовать       | объект **читают**: данные | объект **вызывают**: сервисы      |

- `partial` — глубоко частичный `T`, поэтому переданные поля проверяются типами: неизвестный ключ или
  неверный тип — ошибка компиляции.
- Приведение `as T` живёт в одном месте, поэтому под правилом линтера `no-type-assertion` фикстурам не
  нужны комментарии `eslint-disable`.
- `createMock<T>(undefined)` — то же, что `createMock<T>()`, и возвращает `{}`, а не `undefined`. На это
  полагается хелпер, который пробрасывает необязательный параметр `overrides`.

## Рекурсивные глубокие моки — `mockDeep` {#recursive-deep-mocks-—-mockdeep}

`mockDeep<T>(overrides?, options?)` — это `createAutoMock` на каждом уровне. Чтение вложенного свойства
само создаёт следующий уровень, поэтому `api.repo.user.find()` работает без подготовки. Каждый уровень —
тоже спай с `calledWith`, `mockReturnValue` и `resolveWith`.

```ts
import { mockDeep } from 'vitest-auto-spy';

interface Api {
  repo: { user: { find(id: number): Promise<User> } };
}

const api = mockDeep<Api>();
api.repo.user.find.calledWith(1).resolveWith({ id: 1 });
await expect(api.repo.user.find(1)).resolves.toEqual({ id: 1 });

// задать конкретные значения заранее или присвоить позже
const preset = mockDeep<Api>({ repo: { user: { find: () => Promise.resolve({ id: 9 }) } } });
```

| Опция (второй аргумент)      | Тип                    | По умолчанию | Смысл                                                          |
| ---------------------------- | ---------------------- | ------------ | -------------------------------------------------------------- |
| `selfReturning`              | `boolean`              | `false`      | вызванный узел возвращает сам себя, и цепочки вызовов работают |
| `fallbackMockImplementation` | `(...args) => unknown` | нет          | отвечает на любой ненастроенный вызов на любой глубине         |

- Заданное значение (в `overrides` или через `mock.x = …`) заменяет сгенерированный уровень для этого
  ключа.
- Узел никогда не «thenable», поэтому `await node` не принимает его за промис.
- `using api = mockDeep<Api>()` работает на любой глубине. `resetAutoSpy` сбрасывает дерево от того
  узла, который ему передали, поэтому `using` на поддереве сбрасывает это поддерево.
- У `mockDeep` нет опции `strict`, и `setupAutoSpy({ strict: true })` до него не достаёт. Ненастроенный
  вызов возвращает `undefined` (или сам узел с `selfReturning`). Чтобы такие вызовы падали, используйте
  [`fallbackMockImplementation`](#fallback).

### Глубина берётся из чтения свойств, а не из вызовов {#depth-comes-from-property-access-not-from-calls}

Прочитайте это до того, как брать `mockDeep`: в типах этого не видно. `api.repo.user.find()` работает,
потому что каждый шаг, кроме последнего, — **чтение** свойства. **Вызванный** узел возвращает то, что
ему настроили, а по умолчанию это `undefined`. Поэтому цепочка вызовов ломается на втором вызове:

```ts
import { mockDeep } from 'vitest-auto-spy';

const logger = mockDeep<AppLogger>();

logger.channel('app').info('started'); // TypeError: Cannot read properties of undefined
```

Для такого API передайте `{ selfReturning: true }`. Вызванный узел тогда возвращает сам себя, и цепочка
продолжается:

```ts
const logger = mockDeep<AppLogger>({}, { selfReturning: true });

logger.channel('app').info('started');
expect(logger.channel('app').info).toHaveBeenCalledWith('started');
```

Настройки по-прежнему сильнее: `mockReturnValue`, `calledWith(...).mockReturnValue(...)` и `resolveWith`
работают, и только _ненастроенный_ вызов возвращает узел. Единственный неверный случай — узел, который
вы намеренно настроили возвращать `undefined`; там проверяйте вызовы, а не возвращаемое значение.
Поэтому опция по умолчанию выключена.

Два помощника с типами, по одному на направление:

- То, что возвращает **вызов**, имеет объявленный тип возврата метода, а не тип спая. Оберните в
  `asSpy<T>(…)`, чтобы получить хелперы.
- **Весь мок** имеет тип `DeepMockProxy<T>`, который нельзя присвоить `T` (отображённый тип не видит
  приватных членов). Оберните в `asInstance(…)`, чтобы передать туда, где ждут `T`.

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

asSpy<QueryBuilder>(query.where('id')).limit.mockReturnValue(query);
boot(asInstance(mockDeep<AppLogger>({}, { selfReturning: true })));
```

Если цепочку продолжает только один метод, проще `createAutoMock<T>({ selfReturning: ['channel'] })`.
Этот метод возвращает сам спай, остаётся спаем и считается настроенным под `strict`.

**Частая ошибка:** `selfReturning: true` на билдере с `return this`. Вызванный узел возвращает _себя_, а
не объект, с которого прочитан метод, поэтому каждый шаг цепочки уходит на уровень глубже. Для API, где
все методы возвращают **один и тот же** объект (`ChainedCommands` из tiptap, построитель запросов, всё,
что вы мокали бы через `mockReturnThis()`), вызовы попадают на узлы, которых тест не держит:

```ts
const editor = mockDeep<Editor>({}, { selfReturning: true });
const chain = editor.chain();

chain.focus().insertContent('text').run();

expect(chain.insertContent).toHaveBeenCalled(); // падает: вызов попал на `chain.focus.insertContent`
```

Проверяйте по пути, который прошла цепочка (`asSpy<ChainedCommands>(chain.focus()).insertContent`), или
постройте цепочку через `createAutoMock`, где `selfReturning` перечисляет методы, возвращающие один общий
спай:

```ts
import { asInstance, createAutoMock } from 'vitest-auto-spy';

const chain = createAutoMock<ChainedCommands>({ selfReturning: ['focus', 'insertContent'] });
const editor = createAutoMock<Editor>(undefined, { returns: { chain: asInstance(chain) } });

editor.chain().focus().insertContent('text').run();
expect(chain.insertContent).toHaveBeenCalledWith('text');
```

### Массивы {#arrays}

Член, прочитанный по числовому индексу, — массив. Первое чтение по индексу превращает его в настоящий
`Array` глубоких моков, поэтому `Array.isArray`, `length`, `map`, `filter`, spread и `for…of` работают
так, как ждёт код под тестом:

```ts
const page = mockDeep<Page>(); // в типе `items: Item[]`

page.items[0].load.mockReturnValue('first');
page.items[1].load.mockReturnValue('second');

render(page); // рабочий код выполняет `page.items.map((item) => item.load())`

expect(page.items).toHaveLength(2);
expect(page.items[1].load).toHaveBeenCalled();
```

- Вложенные массивы работают так же: `page.matrix[0][1].inner = 'cell'` строит два настоящих массива.
- Массив растёт до индекса, следующего за самым большим прочитанным. Пропущенный индекс становится
  глубоким моком, как только до него что-то доходит, включая `map` и `forEach`.
- Заданное значение побеждает: `mockDeep<Page>({ items: [] })` остаётся пустым.
- `resetAutoSpy` и `using` сбрасывают элементы вместе с деревом; длина массива сохраняется.
- Ссылка, взятая **до** первого чтения по индексу, остаётся узлом, а не массивом. Она по-прежнему
  отвечает на индексы из того же массива, но для `Array.isArray` или `toEqual` прочитайте член заново.
  По той же причине корень `mockDeep<Item[]>()` индексируется, но массивом не является. Список верхнего
  уровня стройте так: `[mockDeep<Item>(), mockDeep<Item>()]`.
- Член с типом словаря с числовыми ключами (`Record<number, User>`) становится массивом при первом
  чтении по индексу. Чтение по ключу продолжает работать; `Object.keys` и `Array.isArray` видят массив.
- Под `noUncheckedIndexedAccess` тип элемента включает `| undefined`, как у любого массива. Глубокий мок
  всегда создаёт элемент, поэтому `page.items[0]!` здесь безопасен.

### Вызов, который никто не настроил, — `fallbackMockImplementation` {#fallback}

`fallbackMockImplementation` отвечает на любой вызов узла, который никто не настроил, на любой глубине.
Он получает аргументы вызова, а его результат становится результатом вызова.

```ts
import { mockDeep } from 'vitest-auto-spy';

const db = mockDeep<Db>(
  {},
  {
    fallbackMockImplementation: () => {
      throw new Error('not mocked');
    },
  },
);

db.user.findUnique.calledWith({ where: { id: 1 } }).resolveWith(user);
db.user.count(); // throws: not mocked
```

Побеждает первое совпадение:

1. собственная настройка узла: `mockReturnValue`, `mockImplementation`, `resolveWith`,
   `calledWith(...)`, `mustBeCalledWith(...)`;
2. запасная реализация;
3. `selfReturning`, который всё равно возвращает узел, если запасная реализация вернула `undefined`.
   Поэтому запасная реализация, которая только записывает, работает с цепочкой, а та, что бросает,
   цепочку останавливает.

**Частая ошибка:** ждать запасную реализацию для вызова с другими аргументами. «Настроен» — свойство
узла, а не вызова: узел с `calledWith({ id: 1 })` отвечает на `{ id: 2 }` значением `undefined`, а не
запасной реализацией. Чтобы падать на других аргументах, используйте `mustBeCalledWith`. После
`resetAutoSpy` узел снова не настроен, и запасная реализация снова отвечает.

Общие настройки набора тестов в этом не участвуют. `setupAutoSpy({ strict: true })` не достаёт до
глубокого мока, с запасной реализацией или без, поэтому ни одна опция не может молча отключить другую.

### `vi.spyOn` на члене {#vi-spyon-on-a-member}

`vi.spyOn(api.repo, 'find')` находит член, который ещё никто не читал. Каждый узел уже спай, и Vitest
возвращает этот спай, а не оборачивает его. Поэтому `vi.spyOn(prisma.user, 'findMany').mockResolvedValue(rows)`
в перенесённом тесте настраивает сам узел.

### Метод, который вызывает колбэк с клиентом {#a-method-that-runs-a-callback-with-the-client}

API транзакций вызывает свой колбэк с клиентом. Глубокий мок этого не угадывает: какой аргумент —
колбэк, ждать ли его и что ему передать — контракт самого метода. Настройте это на одном методе:

```ts
import { asInstance } from 'vitest-auto-spy';

db.transaction.mockImplementation((run) => run(asInstance(db)));
db.user.count.resolveWith(3);

await expect(service.countInTransaction()).resolves.toBe(3);
```

`asInstance` превращает `DeepMockProxy<Db>` в `Db`, которого ждёт колбэк. `fallbackMockImplementation`
не мешает: метод настроен, а всё, до чего колбэк доходит без настройки теста, по-прежнему получает
запасную реализацию.

### Член, который код под тестом зовёт через `new` {#a-member-the-code-under-test-calls-with-new}

В SDK часто есть классы: `new sdk.Client(key)`, `new api.Session()`. Вызов замоканного члена через `new`
работает. Вызов записывается как любой другой и возвращает новый экземпляр или объект, настроенный для
этих аргументов:

```ts
const sdk = mockDeep<Sdk>(); // в типе `Client: new (key: string) => Client`

service.connect(); // рабочий код выполняет `new this.sdk.Client(key)`

expect(sdk.Client).toHaveBeenCalledWith(key);
```

С настройкой такого члена типы не помогают. Член, объявленный в типе как конструктор, сохраняет этот
тип, поэтому хелперам и `new`, написанному **в тесте**, нужно приведение
(`as unknown as new (key: string) => Client`). Если экземпляры должны быть спаями настоящего класса,
используйте [`createSpyClass`](/ru/utilities/constructor-doubles) — он конструктор и по типу, и во время
выполнения.

### Как печатается узел {#how-a-node-prints}

В снимке узел печатается как `[MockFunction mockDeep.repo.find]` со своими вызовами, а член-массив —
как список таких узлов. В диффе проверки узел, переданный **аргументом**, печатается как
`[Function undefined]`: дифф подписывает функцию её `name`, а у узла `name` — член замоканного типа.
Сама проверка работает, пуста только подпись.

### Хелпер, который точка входа регистрирует позже, — всё равно хелпер {#a-helper-the-entry-registers-later-is-still-a-helper}

`mockDeep` решает при **каждом чтении**, чем является ключ: хелпером спая (`mockReturnValue`,
`calledWith`, `nextWith`, …) или членом вашего типа. Поэтому хелперы, зарегистрированные позже, тоже
работают: `vitest-auto-spy/rxjs` и `vitest-auto-spy/jasmine` добавляют свои при импорте, а
`setSpyEngine` заменяет весь набор.

```ts
import 'vitest-auto-spy/rxjs';

const api = mockDeep<Api>();

api.feed.items.nextWith([item]); // хелпер Observable, а не дочерний узел
```

Это важно при `isolate: false`, когда один воркер выполняет несколько файлов. Если один файл читает
глубокий мок, а другой импортирует `/rxjs` позже, во втором файле `nextWith` всё равно остаётся хелпером.
Место для импорта — по-прежнему setup-файл.

## Ограничения спая по типу {#limits-of-a-type-based-spy}

`createAutoMock` и `mockDeep` строят JavaScript-`Proxy`: объект, который отвечает на любое свойство,
потому что во время выполнения у типа нет списка членов. У этого есть пределы.

### Чего не может спай на основе Proxy {#what-a-proxy-backed-double-cannot-do}

| Операция                               | Что происходит                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `mockValueProp` и три его родственника | работают; `restoreMockedProps()` их отменяет                                                                                      |
| `delete mock.optionalMethod`           | члена нет, пока что-нибудь не запишет его снова                                                                                   |
| `Object.assign(realInstance, mock)`    | копирует только уже **прочитанные** члены; всё остальное остаётся настоящим (см. ниже)                                            |
| `of(mock)` / `from(mock)`              | работают: четыре протокольных ключа отвечают `undefined` ([следующий раздел](#it-answers-everything-so-it-must-not-answer-these)) |

**Частая ошибка:** ставить спай, **копируя его в настоящий экземпляр**. У типа нет списка членов во время
выполнения, поэтому копия получит только прочитанные члены, а остальные вызовы молча уйдут в настоящий
код. Для этого используйте `createSpyFromClass`: он возвращает обычный объект с перечислимыми ключами
методов, и копия будет полной.

### Он отвечает на всё — значит, на _это_ отвечать не должен {#it-answers-everything-so-it-must-not-answer-these}

Некоторые библиотеки определяют, что за объект им дали, проверяя наличие ключа. Спай, отвечающий на
любой ключ, прошёл бы такую проверку и был бы принят за планировщик или поток. Поэтому эти четыре ключа
отвечают `undefined`, пока вы их не зададите, как `then` и все символы:

| Ключ           | Кто проверяет                                | За что приняли бы спай |
| -------------- | -------------------------------------------- | ---------------------- |
| `schedule`     | `popScheduler` в `of` / `from` / `merge` / … | за планировщик         |
| `lift`         | `isObservable`, вместе с `subscribe`         | за Observable          |
| `@@observable` | `isInteropObservable` в `innerFrom`          | за interop-поток       |
| `getReader`    | `isReadableStreamLike` в `innerFrom`         | за ReadableStream      |

Случай, из-за которого это появилось:

```ts
of(autoMocked<AnimationItem>()); // без списка: Observable, который ничего не выдаёт
```

`of(...)` считает **последний аргумент** планировщиком, если `typeof x.schedule === 'function'`. Весь спай
принимался за планировщик, `of()` оставался без значений, а падение проявлялось в несвязанном месте.

Если в вашем типе действительно есть один из четырёх ключей, задайте его, и он вернётся:

```ts
createAutoMock<TaskScheduler>({ schedule: vi.fn() });
```

Без этого члена нет, и вызов сразу падает с `TypeError: … is not a function` на месте вызова.

- `subscribe` в списке **нет**. Это обычное имя метода (стор, `OutputEmitterRef` в Angular, шина событий),
  и `expect(store.subscribe).toHaveBeenCalledWith(cb)` — настоящая проверка. Без `lift` и `@@observable`
  вызов `from(spy)` падает с собственной ошибкой rxjs _«You provided an invalid object where a stream
  was expected»_.
- `constructor` отвечает `Object`, как у любого обычного объекта. Код, который печатает
  `${value.constructor.name}` в ветке ошибки, прочитает `Object`. Значение, заданное под `constructor`,
  побеждает; `returns` его не настроит, потому что это не спай.
- `toString` и `valueOf` отвечают стандартными методами `Object.prototype`, поэтому `` `${spy}` `` —
  это `'[object Object]'`, а печать спая не добавляет в него ключей. Чтобы замокать их, задайте или
  присвойте значение. `returns`, `selfReturning` и `returnsUndefined` с этими именами выводят
  предупреждение: настраивать там нечего.

## Подробнее {#in-depth}

### Почему список запретов короткий {#why-the-deny-list-stays-short}

Ключ попадает в список, только когда видно, что реальная библиотека его проверяет, а не потому, что имя
похоже на протокольное. Каждая запись лишает возможности замокать член с таким именем, не задав его
заранее.

### Почему важны первые две строки таблицы {#why-the-first-two-table-rows-matter}

Случай с `mockValueProp` ломал две рекомендации, взятые вместе: правило линтера
`no-object-define-property` отправляет к `mock*Prop`, а руководство по выбору фабрики — к
`createAutoMock`. До исправления эта пара давала спай, который игнорировал патч, и тесты собирали спай
вручную: настоящие геттеры плюс `createFunctionSpy` на каждый метод.
