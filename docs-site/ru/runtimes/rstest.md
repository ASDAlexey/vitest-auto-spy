---
title: Rstest
description: Создавайте типизированные спаи в Rstest и узнайте, что менять в тестах при переходе с Vitest.
---

# Rstest

Если тесты запускаются на [Rstest](https://rstest.rs), тест-раннере на базе сборщика Rspack,
импортируйте `createSpyFromClass` из `vitest-auto-spy/rstest`. Сохраните пример в `greeter.test.ts`.
Тест передаёт спай вместо `UserService` и проверяет, как `Greeter` использует его ответы.

```ts
import { describe, expect, it } from '@rstest/core';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/rstest';

class UserService {
  getName(id: number): string {
    return `user-${id}`;
  }

  async load(id: number): Promise<string> {
    return `loaded-${id}`;
  }
}

class Greeter {
  constructor(private readonly users: UserService) {}

  greet(id: number): string {
    return `Hello, ${this.users.getName(id)}!`;
  }

  async welcome(id: number): Promise<string> {
    return `Welcome, ${await this.users.load(id)}`;
  }
}

describe('Greeter', () => {
  it('greets the user the service returns', async () => {
    const users: Spy<UserService> = createSpyFromClass(UserService);
    const greeter = new Greeter(users);

    users.getName.calledWith(7).mockReturnValue('Ada');
    users.load.resolveWith('Ada');

    expect(greeter.greet(7)).toBe('Hello, Ada!');
    expect(await greeter.welcome(1)).toBe('Welcome, Ada');
    expect(users.getName).toHaveBeenCalledWith(7);
  });
});
```

Запустите тест:

```bash
npx rstest run
```

Тест передаёт спай в конструктор `Greeter`. Только вызов `getName(7)` возвращает `'Ada'`.
При любых аргументах `await users.load(...)` даёт `'Ada'`.

Если переносите тесты с Vitest, поменяйте импорты спаев на `vitest-auto-spy/rstest`, а `describe`,
`it` и `expect` импортируйте из `@rstest/core`. API библиотеки тот же, что и в Vitest.
После импорта спаи работают с матчерами и утилитами моков Rstest. Файл настройки для спаев не нужен.

Чтобы использовать `describe`, `it` и `expect` без импортов, задайте `globals: true` в
`rstest.config.ts`. Тогда `rstest` (аналог `vi` в Vitest) и его короткое имя `rs` тоже станут
глобальными.

```ts
// rstest.config.ts
import { defineConfig } from '@rstest/core';

export default defineConfig({
  globals: true,
  clearMocks: true,
});
```

## Собственные методы моков как в Vitest {#the-native-surface-is-vitest-shaped}

Спаи в Rstest поддерживают знакомые по Vitest методы и свойства моков:

- `spy.method.mock.calls[0]` — массив аргументов.
- У спаев есть `mockReturnValue` и похожие методы.
- `mockClear()` и `mockReset()` работают как в Vitest.
- Опции [`createSpyFromClass`](/ru/core/create-spy-from-class) `gettersToSpyOn` и `settersToSpyOn`
  позволяют создавать спаи для геттеров и сеттеров класса.

Если хотите, чтобы код тестов был одинаковым на разных раннерах, используйте хелперы библиотеки:
`calledWith`, `resolveWith`, `nextWith` и другие.

## `rstest.clearAllMocks()` чистит и спаи библиотеки {#rstest-clearallmocks-sweeps-the-library-spies}

`rstest.clearAllMocks()` и `rstest.resetAllMocks()` действуют и на спаи из `createSpyFromClass`.
Чтобы очищать или сбрасывать все моки перед каждым тестом, задайте `clearMocks: true` или
`resetMocks: true` в `rstest.config.ts`. Дополнительно настраивать библиотеку не нужно. Как это
работает, описано в разделе [Подробнее](#in-depth).

## Рядом с этой точкой входа {#beside-this-entry}

Эти импорты тоже работают в Rstest без установленного Vitest:

- `vitest-auto-spy/console`: после импорта `vitest-auto-spy/rstest`
  [`useConsoleSpies()`](/ru/utilities/console) использует хуки `beforeEach` и `afterEach` из Rstest.
  В типах `/console` нет ссылок на `vitest`.
- `vitest-auto-spy/nestjs`: хелперы Nest создают моки Rstest. В
  [тестах Nest](/ru/adapters/nestjs#any-runner) импортируйте `createNestUnit` из `/nestjs` вместе с
  `vitest-auto-spy/rstest`.

Корневой импорт `vitest-auto-spy` и такие точки входа, как `/angular`, `/setup`, `/dom-stubs`,
`/react` и `/vue`, импортируют `vitest`. Если Vitest не установлен, запуск остановится до первого
теста с ошибкой `Cannot find package 'vitest' imported from …/node_modules/vitest-auto-spy/dist/<entry>.js`.
Импортируйте фабрики спаев из `vitest-auto-spy/rstest`. Команда `npx vitest-auto-spy doctor` помечает
неверный импорт как [`vitest-entry-without-vitest`](/ru/utilities/cli#vitest-entry-without-vitest) и
подсказывает, откуда импортировать.

В типах `/rstest` нет ссылок на `vitest`, поэтому проверка типов работает без Vitest даже при
`skipLibCheck: false`. В `Spy<T>` всё как в Vitest, кроме `mockThrow`. Вместо него используйте
`failWith()`: он работает одинаково на всех раннерах.

## Чего здесь пока нет {#what-is-not-here-yet}

**[`/setup`](/ru/utilities/setup)** работает только с хуками Vitest. В Rstest пока нет замены для
`setupAutoSpy()`, хелперов фейковых таймеров и отслеживания необработанных отклонений промисов
и забытых таймеров.

::: tip Какой раннер выбрать
Rstest пока в версии 0.x. [Vitest](/ru/runtimes/vitest) остаётся выбором по умолчанию. Используйте
`/rstest`, если ваши тесты уже работают на Rstest. Обычно это проекты, в которых для тестов
используют тот же конфиг Rspack, что и для сборки.
:::

## Подробнее {#in-depth}

- Библиотека создаёт спаи методов без `rstest.fn()`. Она регистрирует один скрытый мок Rstest,
  который передаёт спаям команды очистки и сброса.
- `gettersToSpyOn` и `settersToSpyOn` переопределяют свойство вместо вызова `rstest.spyOn`.
- `trackNodeMocks()` есть только в точке входа для `node:test`. В Rstest он не нужен: как и Vitest с
  Bun, Rstest очищает моки между тестовыми файлами.
