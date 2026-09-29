---
title: Rstest
description: vitest-auto-spy на Rstest, тест-раннере на Rspack - готовый пример, чем его моки похожи на Vitest и чего пока нет.
---

# Rstest

Точка входа `vitest-auto-spy/rstest` нужна, когда тесты запускаются на [Rstest](https://rstest.rs) —
тест-раннере на сборщике Rspack. API у неё то же, что у точки входа для Vitest, а спаи она связывает
с моками Rstest, так что их видят `rstest.clearAllMocks()` и матчеры Rstest.

```ts
// greeter.test.ts
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

// проверяемый код: получает UserService через конструктор
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

    users.getName.calledWith(7).mockReturnValue('Ada'); // отвечает только на getName(7)
    users.load.resolveWith('Ada'); // без calledWith: отвечает на любой вызов

    expect(greeter.greet(7)).toBe('Hello, Ada!');
    expect(await greeter.welcome(1)).toBe('Welcome, Ada');
    expect(users.getName).toHaveBeenCalledWith(7);
  });
});
```

```bash
npx rstest run
```

Setup-файл не нужен: импорт из этой точки входа регистрирует всё сам. Пример импортирует
`describe` / `it` / `expect` из `@rstest/core`.

Чтобы пользоваться ими без импорта, включите `globals: true`. Тогда глобальной станет и `rstest` —
утилита моков Rstest (как `vi` в Vitest) с коротким псевдонимом `rs`:

```ts
// rstest.config.ts
import { defineConfig } from '@rstest/core';

export default defineConfig({
  globals: true,
  clearMocks: true, // чистить все моки перед каждым тестом, включая спаи из createSpyFromClass
});
```

## Собственные методы моков как в Vitest {#the-native-surface-is-vitest-shaped}

Собственные методы мока Rstest на спае работают как в Vitest:

- `spy.method.mock.calls[0]` — обычный массив аргументов;
- `mockReturnValue` и родственные методы есть у спая;
- `mockClear()` / `mockReset()` ведут себя как в Vitest;
- `gettersToSpyOn` / `settersToSpyOn` работают. Эти опции
  [`createSpyFromClass`](/ru/core/create-spy-from-class) превращают геттеры или сеттеры класса в спаи.

Хелперы библиотеки (`calledWith`, `resolveWith`, `nextWith`, …) всё равно удобнее: на любом раннере
они читаются одинаково.

## `rstest.clearAllMocks()` чистит и спаи библиотеки {#rstest-clearallmocks-sweeps-the-library-spies}

`rstest.clearAllMocks()`, `rstest.resetAllMocks()` и ключи конфига `clearMocks: true` /
`resetMocks: true` чистят и спаи, созданные `createSpyFromClass`. Включать в библиотеке ничего не
нужно: ключи конфига включите в `rstest.config.ts`, если они нужны, как выше. Как это устроено — в
разделе [Подробнее](#in-depth).

## Рядом с этой точкой входа {#beside-this-entry}

Эти точки входа тоже работают под Rstest без установленного Vitest:

- `vitest-auto-spy/console`: [`useConsoleSpies()`](/ru/utilities/console) регистрирует свои хуки на
  `beforeEach` / `afterEach` из Rstest, как только импортирована эта точка входа. Её типы тоже не упоминают `vitest`.
- `vitest-auto-spy/nestjs`: хелперы Nest строят моки Rstest.
  [Тесты Nest](/ru/adapters/nestjs#any-runner) импортируют `createNestUnit` из `/nestjs` рядом с этой
  точкой входа.

Остальные точки входа (корневая `vitest-auto-spy`, `/angular`, `/setup`, `/dom-stubs`, `/react`,
`/vue`, …) импортируют `vitest`. Без установленного Vitest прогон останавливается до первого теста с
`Cannot find package 'vitest' imported from …/node_modules/vitest-auto-spy/dist/<entry>.js`. Берите
фабрики из этой точки входа. `npx vitest-auto-spy doctor` сообщает о таком импорте как
[`vitest-entry-without-vitest`](/ru/utilities/cli#vitest-entry-without-vitest) и называет нужную точку
входа.

Типы этой точки входа не ссылаются на `vitest`, поэтому проект без Vitest проходит проверку типов
без ошибок, даже с `skipLibCheck: false`. У `Spy<T>` здесь те же члены, что на Vitest,
кроме `mockThrow` из Vitest; `failWith()` делает то же самое на любом раннере.

## Чего здесь пока нет {#what-is-not-here-yet}

- **[`/setup`](/ru/utilities/setup)** (`setupAutoSpy()`, хелперы фейковых таймеров, отслеживание
  потерянных отказов промисов и таймеров) работает только с хуками Vitest. Замены для Rstest пока нет.

::: tip Какой раннер выбрать
Rstest пока в версии 0.x. [Vitest](/ru/runtimes/vitest) остаётся выбором по умолчанию. Эта точка входа
нужна, когда тесты уже работают на Rstest — обычно в проекте на Rspack, который переиспользует конфиг
сборщика для тестов.
:::

## Подробнее {#in-depth}

- Спаи методов библиотека строит сама, а не через `rstest.fn()`. Чтобы очистка и сброс Rstest до них
  доходили, точка входа регистрирует один скрытый мок Rstest, который передаёт вызов дальше.
- Спаи на аксессоры (`gettersToSpyOn` / `settersToSpyOn`) переопределяют свойство; `rstest.spyOn` не
  используется.
- У `trackNodeMocks()` из точки входа для `node:test` нет версии для Rstest, и она не нужна: Rstest
  очищает моки между файлами, как Vitest и Bun.
