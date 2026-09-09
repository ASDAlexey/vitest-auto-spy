---
title: Rstest
description: Как запускать vitest-auto-spy на Rstest, тест-раннере на Rspack, — готовый к запуску пример и то, как ложится нативная мок-поверхность в форме Vitest.
---

# Rstest

Точка входа `vitest-auto-spy/rstest` гоняет то же ядро на `rstest.fn()` / `rstest.spyOn()` из Rstest.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/rstest';

// rstest run
```

Публичное API идентично точке входа Vitest. Импорт этой точки входа регистрирует адаптер Rstest;
хелперы auto-spy (`calledWith`, `resolveWith`, `nextWith`, …) приведены к общему виду, а нативные методы
моков остаются методами самого раннера.

## Готовый к запуску пример {#a-runnable-example}

Rstest поставляет `describe` / `it` / `expect` — импортируйте их из `@rstest/core` или пользуйтесь
глобалами `rs` / `rstest` с `globals: true`.

```js
// user.spec.ts
import { describe, expect, it } from '@rstest/core';
import { createSpyFromClass } from 'vitest-auto-spy/rstest';

class UserService {
  getName(id) {
    return `user-${id}`;
  }

  async load(id) {
    return `loaded-${id}`;
  }
}

describe('UserService spy', () => {
  it('returns per-argument values and resolves promises', async () => {
    const users = createSpyFromClass(UserService);

    users.getName.calledWith(7).mockReturnValue('seven');
    users.load.resolveWith('ok');

    expect(users.getName(7)).toBe('seven');
    await expect(users.load(1)).resolves.toBe('ok');
    expect(users.getName.mock.calls[0]).toEqual([7]);
  });
});
```

```bash
npx rstest run
```

## Нативная поверхность повторяет Vitest {#the-native-surface-is-vitest-shaped}

Rstest реализует мок-API в духе Jest/Vitest, поэтому ни одно из
[расхождений node:test](/ru/runtimes/node#where-the-native-surface-differs) сюда не относится.
`spy.method.mock.calls[0]` — голый массив аргументов, семейство `mockReturnValue` нативно,
`mockClear()` / `mockReset()` ведут себя как в Vitest, а спаи аксессоров идут через собственный
`rstest.spyOn(obj, 'prop', 'get' | 'set')` из Rstest — так что `gettersToSpyOn` / `settersToSpyOn`
не нуждаются в запасном переопределении. Унифицированные хелперы всё равно остаются лучшей привычкой:
они читаются одинаково на каждой среде запуска.

## `rstest.clearAllMocks()` подметает спаев библиотеки {#rstest-clearallmocks-sweeps-the-library-spies}

Методные спаи библиотеки берутся из её собственного движка (по умолчанию с 4.1), а не из раннера,
поэтому очистке всего прогона нужен мост. Rstest обходит каждый созданный им мок — вызывался тот или
нет, — и точка входа регистрирует ровно один мок-часовой, чей `mockClear` / `mockReset` подметают
заодно и спаев библиотеки. Включать нечего: `rstest.clearAllMocks()`, `rstest.resetAllMocks()` и
конфиг-ключи `clearMocks: true` / `resetMocks: true` добираются до спаев, построенных
`createSpyFromClass`.

## Чего здесь пока нет {#what-is-not-here-yet}

- Точка входа [`/setup`](/ru/utilities/setup) — `setupAutoSpy()`, хелперы фейковых таймеров,
  отслеживание потерянных отказов и потерянных таймеров — привязана к хукам Vitest. На Rstest
  импортируйте `vitest-auto-spy/rstest` один раз в setup-файле: регистрация адаптера — ровно то,
  ради чего setup-файл и существует.
- `trackNodeMocks()` существует только для node:test. Rstest, как Vitest и Bun, сбрасывает свой
  реестр моков между файлами, так что отслеживать нечего.

::: tip Какую среду выбрать
Rstest молод — на момент написания это 0.x. [Vitest](/ru/runtimes/vitest) остаётся дефолтом без
настройки; тянитесь к этой точке входа, когда сюита уже работает на Rstest, — как правило, это
проект на Rspack, переиспользующий конфиг своего бандлера для тестов.
:::
