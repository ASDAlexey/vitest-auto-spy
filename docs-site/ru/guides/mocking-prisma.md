---
title: Мок Prisma Client в Vitest
description: Типизированный мок PrismaClient из mockDeep - ответы findMany и create через resolveWith, rejectWith, resolveWithPerCall и calledWith, сброс между тестами через resetAutoSpy и интерактивный $transaction на том же моке.
---

# Мок Prisma Client в Vitest

[`mockDeep<PrismaClient>()`](/ru/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep) даёт
типизированный фейковый клиент Prisma для юнит-тестов. Каждая модель и каждый метод запроса
появляются, как только вы к ним обращаетесь, например `prisma.user.findMany`. Каждый метод — спай,
поэтому ответ задаётся одним вызовом.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { asInstance, mockDeep, resetAutoSpy } from 'vitest-auto-spy';

import type { PrismaClient } from './generated/client';
import { UserService } from './users';

const prisma = mockDeep<PrismaClient>();

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    resetAutoSpy(prisma);
    service = new UserService(asInstance(prisma));
  });

  it('lists names, falling back to the email', async () => {
    prisma.user.findMany.resolveWith([
      { id: 1, email: 'ada@example.test', name: 'Ada' },
      { id: 2, email: 'bob@example.test', name: null },
    ]);

    await expect(service.listNames()).resolves.toEqual(['Ada', 'bob@example.test']);
    expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
  });

  it('reports a failed insert', async () => {
    prisma.user.create.rejectWith(new Error('Unique constraint failed on the fields: (`email`)'));

    await expect(service.register('ada@example.test')).resolves.toBe(-1);
  });
});
```

Тестируемый сервис получает клиент через конструктор. Это единственное, что рецепт требует от
вашего кода: клиент должен приходить снаружи (аргументом конструктора, провайдером NestJS, аргументом
фабрики), а не импортироваться на уровне модуля. Тогда спека передаёт мок напрямую, и `vi.mock` не
нужен.

```ts
// users.ts
import type { PrismaClient, User } from './generated/client';

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async listNames(): Promise<string[]> {
    const users = await this.db.user.findMany({ orderBy: { id: 'asc' } });
    return users.map((user) => user.name ?? user.email);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async register(email: string): Promise<number> {
    try {
      const user = await this.db.user.create({ data: { email } });
      return user.id;
    } catch {
      return -1;
    }
  }
}
```

Что делает каждый вызов:

- **`mockDeep<PrismaClient>()`** не требует сгенерированного файла мока и списка моделей.
  `prisma.user`, `prisma.post` и все методы запросов появляются при первом обращении.
- **`resolveWith(rows)`** — запрос завершается успешно и возвращает `rows`. Тип записей берётся из того,
  что возвращает метод. Устаревшая фикстура (переименованная колонка, текст там, где в схеме `Int`)
  — ошибка компиляции, а не зелёный тест.
- **`rejectWith(error)`** — запрос завершается ошибкой. Без `mockImplementation` и приведений типов.
- **`resetAutoSpy(prisma)`** очищает записанные вызовы и заданные ответы во всех моделях и методах.
  Один мок служит всему файлу и в каждом тесте начинает с чистого листа. Если удобнее создавать мок
  внутри теста, объявите его через `using` (явное управление ресурсами из TypeScript 5.2), и он
  сбросится в конце блока: см. [`using`](/ru/core/create-spy-from-class#using).
- **`asInstance(prisma)`** передаёт мок туда, где ждут настоящий `PrismaClient`. Без него TypeScript
  не даст передать мок как `PrismaClient`.

Примеры на странице проверены на клиенте, сгенерированном Prisma 7.10 по такой схеме:

```prisma
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
```

## Ответить на `findUnique` записью или `null` {#answer-findunique-with-a-row-or-null}

`findUnique` возвращает запись или `null`, если ничего не найдено. Отвечайте на него так же:

```ts
it('returns null for an unknown email', async () => {
  prisma.user.findUnique.resolveWith(null);

  await expect(service.findByEmail('nobody@example.test')).resolves.toBeNull();
  expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'nobody@example.test' } });
});

it('returns the user it finds', async () => {
  const ada = { id: 1, email: 'ada@example.test', name: 'Ada' };
  prisma.user.findUnique.resolveWith(ada);

  await expect(service.findByEmail('ada@example.test')).resolves.toEqual(ada);
});
```

## Разный ответ на каждый вызов {#return-a-different-answer-on-each-call}

```ts
it('answers per call', async () => {
  prisma.user.findMany.resolveWithPerCall([{ value: [{ id: 1, email: 'ada@example.test', name: 'Ada' }] }, { value: [] }]);

  await expect(service.listNames()).resolves.toEqual(['Ada']);
  await expect(service.listNames()).resolves.toEqual([]);
});
```

`resolveWithPerCall` отдаёт первому вызову первый элемент, второму — второй и так далее. Подходит
для опроса, повторов и постраничной загрузки. Каждый элемент — объект: `value` — то, что вернёт этот
вызов, а необязательный `delay` (в миллисекундах) откладывает ответ. `value` типизирован так же, как
в `resolveWith`.

## Ответ в зависимости от аргументов {#answer-based-on-the-arguments}

```ts
it('only the conflicting email fails', async () => {
  prisma.user.create.calledWith({ data: { email: 'taken@example.test' } }).rejectWith(new Error('Unique constraint failed'));
  prisma.user.create.resolveWith({ id: 7, email: 'new@example.test', name: null });

  await expect(service.register('taken@example.test')).resolves.toBe(-1);
  await expect(service.register('new@example.test')).resolves.toBe(7);
});
```

Запрос падает только для этого аргумента. Значит, тест пройдёт, только если код отправил правильный
запрос. Почему это надёжнее одного общего ответа и `toHaveBeenCalledWith` в конце —
[причина и следствие](/ru/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue).

Аргументы сравниваются по значению, порядок ключей не важен. Асимметричные матчеры работают на
любой глубине: `calledWith({ where: { email: expect.stringContaining('@') } })`.

Вызов, аргументы которого не подошли ни к одному `calledWith`, получает общий ответ метода (обычный
`resolveWith` выше). Если обычного `resolveWith` нет, он возвращает `undefined`. Чтобы любые другие аргументы
приводили к ошибке, используйте [`mustBeCalledWith`](/ru/core/control-helpers):

```ts
prisma.user.findUnique.mustBeCalledWith({ where: { email: 'ada@example.test' } }).resolveWith(null);

await expect(service.findByEmail('bob@example.test')).rejects.toThrow(); // arguments do not match
```

## Мок интерактивной `$transaction` {#mock-an-interactive-transaction}

В форме с колбэком `$transaction` передаёт колбэку клиент транзакции, и ваш код выполняет запросы
через него. В юнит-тесте сделайте клиентом транзакции тот же мок. Тогда запросы попадут туда, где
спека их настроила:

```ts
// users.ts
async moveTitle(fromId: number, toId: number): Promise<void> {
  await this.db.$transaction(async (tx) => {
    const post = await tx.post.delete({ where: { id: fromId } });
    await tx.post.create({ data: { title: post.title, authorId: toId } });
  });
}
```

```ts
it('runs the transaction callback against the same mock', async () => {
  prisma.$transaction.mockImplementation((callback) => callback(asInstance(prisma)));
  prisma.post.delete.resolveWith({ id: 1, title: 'Hello', authorId: 1 });

  await service.moveTitle(1, 2);

  expect(prisma.post.create).toHaveBeenCalledWith({ data: { title: 'Hello', authorId: 2 } });
});
```

`mockImplementation` типизирован по форме с колбэком, поэтому аннотация у `callback` не нужна.

Форма с массивом, `$transaction([query, query])`, получает промисы, которые код уже взял у мока.
Мок эти промисы игнорирует: код получит ровно то, что вы передали в `resolveWith([...results])`, по
одному результату на запрос, по порядку:

```ts
// code under test: const [user, total] = await db.$transaction([db.user.create(...), db.user.count()]);
prisma.$transaction.resolveWith([{ id: 7, email: 'new@example.test', name: null }, 3]);
```

## Уронить незамоканный запрос {#make-an-unmocked-query-fail}

По умолчанию запрос, который спека не настроила, возвращает `undefined`, и код падает где-то
позже. Чтобы падать прямо на вызове, передайте `fallbackMockImplementation` **вторым** аргументом:

```ts
const prisma = mockDeep<PrismaClient>(
  {},
  {
    fallbackMockImplementation: () => {
      throw new Error('query not mocked');
    },
  },
);
```

**Частая ошибка:** `mockDeep<PrismaClient>({ fallbackMockImplementation })` не компилируется. Первый
аргумент — начальные значения членов мока. (`vitest-mock-extended` принимает эту опцию первым
аргументом, поэтому при переезде с него это место нужно поправить.)

Как работает запасной ответ:

- Он срабатывает только для членов, которые **никто не настроил**.
- Если у запроса задан `calledWith`, запрос считается настроенным. Вызов с другими аргументами
  подчиняется правилам `calledWith` из раздела
  [Ответ в зависимости от аргументов](#answer-based-on-the-arguments), а не запасному ответу.
- Настроенная `$transaction` всё равно выполняет колбэк. Запросы внутри попадают в запасной ответ,
  если спека их не настроила.
- `resetAutoSpy(prisma)` очищает то, что настроил тест, и запасной ответ снова работает.

`vi.spyOn(prisma.user, 'findMany')` тоже работает, даже если к этому члену ещё никто не обращался.
Он возвращает тот же спай, что и `prisma.user.findMany`, поэтому настройка одного настраивает и
другой.

## Переезд с `vitest-mock-extended` {#coming-from-vitest-mock-extended}

Собственное руководство Prisma по тестированию использует
[`vitest-mock-extended`](https://github.com/eratio08/vitest-mock-extended). Структура спеки та же:
глубокий мок `PrismaClient`, сброс перед каждым тестом. Отличаются хелперы:

|                               | `vitest-mock-extended`                                          | `mockDeep` из `vitest-auto-spy`                                                    |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Успешный ответ запроса        | `mockResolvedValue(rows)`                                       | `resolveWith(rows)`                                                                |
| Ошибка запроса                | `mockRejectedValue(error)`                                      | `rejectWith(error)`                                                                |
| Исключение из не-async члена  | `mockThrow(error)` в Vitest 4.1+, раньше — `mockImplementation` | `failWith(error)`, в любом раннере                                                 |
| Своё значение на каждый вызов | цепочка `mockResolvedValueOnce`                                 | `resolveWithPerCall([...])`                                                        |
| Ответ по аргументам           | `calledWith(…).mockResolvedValue(…)`                            | `calledWith(…).resolveWith(…)`, `mustBeCalledWith`, чтобы падать на всём остальном |
| Сброс между тестами           | `mockReset(prisma)`                                             | `resetAutoSpy(prisma)` или `using`                                                 |
| Уронить незамоканный запрос   | `mockDeep({ fallbackMockImplementation })`                      | `mockDeep({}, { fallbackMockImplementation })`                                     |
| Поддерживаемые раннеры        | peer `vitest >=4.0.0`                                           | peer `vitest >=2.1.0`; также `bun:test` и `node:test`                              |

Если `vitest-mock-extended` вас устраивает, переезд — в основном переименование. Зачем переезжать:
хелперы, которые описывают результат запроса одним вызовом, и одна зависимость, которая покрывает
ещё и классы, потоки и адаптеры фреймворков в остальных тестах. Подробное сравнение — на странице
[Сравнение](/ru/comparison#the-double-itself).

## Чего мок клиента не проверяет {#what-a-mocked-client-does-not-test}

Мок клиента проверяет, как _ваш_ код использует Prisma: какой запрос отправлен и что сделано с
ответом. Сам запрос он не проверяет: `where`, который в настоящей базе ничего не находит; связь,
которой нужен `include`; ограничение, которое проверяет схема. Для этого держите несколько
интеграционных тестов на настоящей базе, а юнит-тесты пусть остаются быстрыми.

## Подробнее {#in-depth}

Член `mockDeep`, который читают по индексу (`mock.items[0]`), становится настоящим массивом. Это
нужно для членов мока, которые сами являются массивами. Результаты запросов по-прежнему задаются через
`resolveWith([row])`: не пытайтесь собрать результат `findMany`, обращаясь к моку по индексу.

## Смотрите также {#related}

- [Автомок по типу](/ru/core/auto-mock-by-type): `mockDeep`, `createAutoMock` и `createMock`, и чего
  не умеет мок на основе Proxy.
- [Управляющие хелперы](/ru/core/control-helpers): все хелперы с этой страницы.
- [NestJS](/ru/adapters/nestjs): как отдать мок юниту Nest, где `PrismaService` — обычная точка
  внедрения.
