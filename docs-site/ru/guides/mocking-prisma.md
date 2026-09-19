---
title: Мок Prisma Client в Vitest
description: Типизированный дубль PrismaClient из mockDeep — findMany и create, настроенные через resolveWith, rejectWith, resolveWithPerCall и calledWith, сброс через resetAutoSpy и интерактивный $transaction, который выполняется на том же дубле.
---

# Мок Prisma Client в Vitest

Обычный рецепт юнит-теста для кода, который говорит с Prisma, — глубокий мок `PrismaClient`:
`prisma.user.findMany` — это два чтения свойств и вызов, а глубокий мок делает так, что каждый шаг
существует без того, чтобы его выписывать. [`mockDeep`](/ru/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep)
— ровно это, плюс хелперы, которые каждый метод Prisma получает по своему типу возврата: запрос
отвечает типизированным значением, а отказ — это один вызов, а не рукописная реализация.

Всё ниже выполнено на клиенте, сгенерированном Prisma 7.10 из такой схемы:

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

## Сервис и его шов {#the-service-and-its-seam}

```ts
import type { PrismaClient } from './generated/client';

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async listNames(): Promise<string[]> {
    const users = await this.db.user.findMany({ orderBy: { id: 'asc' } });
    return users.map((user) => user.name ?? user.email);
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

Клиент приходит через конструктор — провайдером NestJS, аргументом фабрики, чем угодно, кроме
синглтона уровня модуля, который код импортирует сам. Это единственное проектное решение, которого
требует рецепт, и именно оно позволяет спеке отдать дубль вообще без `vi.mock`.

## Спека {#the-spec}

```ts
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

Что делает каждая строка:

- **`mockDeep<PrismaClient>()`** — ни сгенерированного файла мока, ни списка моделей. `prisma.user`,
  `prisma.post` и каждый метод делегата появляются при первом чтении, и каждый метод — спай с полным
  набором хелперов.
- **`resolveWith(rows)`** типизирован тем, что возвращает метод. Значение обязано быть строками,
  которые вернула бы Prisma, так что устаревшая фикстура — переименованная колонка, строка там, где
  схема говорит `Int`, — это ошибка компиляции в спеке, а не зелёный тест на данных, которых база
  никогда бы не выдала.
- **`rejectWith(error)`** заставляет запрос отклониться. Без `mockImplementation` и без каста.
- **`resetAutoSpy(prisma)`** в `beforeEach` обходит всё дерево — каждый делегат, каждый тронутый
  метод — и сбрасывает и записанные вызовы, и конфигурацию. Один дубль на файл, чистый для каждого
  теста. [`using`](/ru/core/create-spy-from-class#using) делает то же в конце блока, если вы
  предпочитаете собирать дубль внутри теста.
- **`asInstance(prisma)`** отдаёт дубль коду, типизированному настоящим `PrismaClient`; собственный
  тип глубокого мока — маппед-тип и как есть ему не присваивается.

## Свой ответ на каждый вызов {#a-different-answer-per-call}

```ts
it('answers per call', async () => {
  prisma.user.findMany.resolveWithPerCall([{ value: [{ id: 1, email: 'ada@example.test', name: 'Ada' }] }, { value: [] }]);

  await expect(service.listNames()).resolves.toEqual(['Ada']);
  await expect(service.listNames()).resolves.toEqual([]);
});
```

`resolveWithPerCall` отдаёт n-му вызову n-й элемент — форма опроса, повтора или цикла пагинации — и
типизирован так же, как `resolveWith`.

## Ответ, привязанный к аргументам {#an-answer-keyed-on-the-arguments}

```ts
it('only the conflicting email fails', async () => {
  prisma.user.create.calledWith({ data: { email: 'taken@example.test' } }).rejectWith(new Error('Unique constraint failed'));
  prisma.user.create.resolveWith({ id: 7, email: 'new@example.test', name: null });

  await expect(service.register('taken@example.test')).resolves.toBe(-1);
  await expect(service.register('new@example.test')).resolves.toBe(7);
});
```

Отказ случается на этом аргументе и ни на каком другом, поэтому тест может пройти только если код
отправил тот запрос, который должен был, — почему это сильнее безусловного ответа плюс
`toHaveBeenCalledWith` в конце, разобрано в
[причине и следствии](/ru/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue).
Аргументы сравниваются по значению с отсортированными ключами, а асимметричные матчеры работают на
любой глубине: `calledWith({ where: { email: expect.stringContaining('@') } })`.

## Интерактивные транзакции — `$transaction` {#interactive-transactions-—-transaction}

Колбэчная форма `$transaction` передаёт колбэку транзакционный клиент, и код под тестом выполняет
свои запросы через него. В юнит-тесте транзакционным клиентом должен быть тот же дубль, чтобы запросы
попадали туда, где спека их настроила и проверяет:

```ts
async moveTitle(fromId: number, toId: number): Promise<void> {
  await this.db.$transaction(async (tx) => {
    const post = await tx.post.delete({ where: { id: fromId } });
    await tx.post.create({ data: { title: post.title, authorId: toId } });
  });
}
```

```ts
it('runs the transaction callback against the same double', async () => {
  prisma.$transaction.mockImplementation((callback) => callback(asInstance(prisma)));
  prisma.post.delete.resolveWith({ id: 1, title: 'Hello', authorId: 1 });

  await service.moveTitle(1, 2);

  expect(prisma.post.create).toHaveBeenCalledWith({ data: { title: 'Hello', authorId: 2 } });
});
```

`mockImplementation` типизирован по колбэчной перегрузке, поэтому `callback` не нужна аннотация.
Массивная форма — `$transaction([query, query])` — принимает промисы, которые код уже построил из
дубля; отвечайте ей через `resolveWith([...results])`.

## Запрос, который никто не замокал {#a-query-nobody-mocked}

По умолчанию запрос, который спека не настроила, отвечает `undefined`, и проверяемый код падает
где-то после него. Чтобы он падал прямо на вызове, передайте `fallbackMockImplementation` — во
**втором** аргументе, рядом с остальными опциями:

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

Имя опции взято у `vitest-mock-extended`, но там она идёт в первом аргументе; перенесённый
`mockDeep<PrismaClient>({ fallbackMockImplementation })` здесь — ошибка компиляции, потому что первый
аргумент — это заготовка значений. Запасная реализация отвечает за член, который **никто не
настроил**. Как только на запросе стоит `calledWith`, список аргументов, не совпавший ни с одним
правилом, отвечает `undefined`, а не запасной реализацией; падать на любом другом `where` умеет
[`mustBeCalledWith`](/ru/core/control-helpers). С бросающей запасной реализацией настроенный
`$transaction` всё равно выполняет свой колбэк, и каждый запрос внутри него попадает на запасную
реализацию, если спека его не настроила. `resetAutoSpy(prisma)` сбрасывает то, что настроил тест, и
запасная реализация снова в силе.

Два пункта помельче. Отвечать строками по-прежнему через `findMany.resolveWith([row])`: член
`mockDeep`, прочитанный по индексу, становится настоящим массивом, но это для чтения членов-массивов
с дубля, а не для результатов запросов. А `vi.spyOn(prisma.user, 'findMany')` работает и на члене,
который ещё никто не читал, — он возвращает собственный спай этого члена.

## В сравнении с `vitest-mock-extended` {#compared-with-vitest-mock-extended}

Собственная серия статей Prisma о тестировании использует
[`vitest-mock-extended`](https://github.com/eratio08/vitest-mock-extended), и структура спеки та же:
глубокий мок `PrismaClient`, сбрасываемый перед каждым тестом. Меняется слой хелперов поверх:

|                                 | `vitest-mock-extended`                                          | `mockDeep` из `vitest-auto-spy`                                                    |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Разрешить запрос                | `mockResolvedValue(rows)`                                       | `resolveWith(rows)`                                                                |
| Отклонить запрос                | `mockRejectedValue(error)`                                      | `rejectWith(error)`                                                                |
| Исключение из не-async члена    | `mockThrow(error)` на Vitest 4.1+, до него `mockImplementation` | `failWith(error)`, на любом раннере                                                |
| Значение на каждый вызов        | цепочка `mockResolvedValueOnce`                                 | `resolveWithPerCall([...])`                                                        |
| Ответ по аргументам             | `calledWith(…).mockResolvedValue(…)`                            | `calledWith(…).resolveWith(…)`, `mustBeCalledWith`, чтобы падать на всём остальном |
| Сброс между тестами             | `mockReset(prisma)`                                             | `resetAutoSpy(prisma)` или `using`                                                 |
| Падение на незамоканном запросе | `mockDeep({ fallbackMockImplementation })`                      | `mockDeep({}, { fallbackMockImplementation })`                                     |
| Диапазон Vitest                 | peer `vitest >=4.0.0`                                           | peer `vitest >=2.1.0`; работает также на `bun:test` и `node:test`                  |

Если `vitest-mock-extended` уже справляется, переезд — это в основном переименование. Причины его
сделать — те, что в таблице: хелперы, описывающие исход запроса одним вызовом, и одна зависимость,
которая заодно покрывает классы, потоки и адаптеры фреймворков в остальной сюите. Сравнение по
возможностям — на странице [Сравнение](/ru/comparison#the-double-itself).

## Где это заканчивается {#where-this-stops}

Замоканный клиент проверяет, как _ваш_ код пользуется Prisma: какой запрос он отправил и что сделал с
ответом. Сам запрос он не проверяет: `where`, который в настоящей базе ничего не находит, связь,
которой нужен `include`, ограничение, которое навязывает схема. Для этого держите небольшую
интеграционную сюиту на настоящей базе, а юнит-тесты пусть остаются быстрыми.

## Смотрите также {#related}

- [Автомок по типу](/ru/core/auto-mock-by-type) — `mockDeep`, `createAutoMock` и `createMock`, и чего
  не умеет дубль на Proxy.
- [Управляющие хелперы](/ru/core/control-helpers) — каждый хелпер с этой страницы.
- [NestJS](/ru/adapters/nestjs) — передача дубля в Nest-юнит, где обычный шов — `PrismaService`.
