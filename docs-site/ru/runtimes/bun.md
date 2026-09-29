---
title: Bun
description: vitest-auto-spy на bun:test - готовый пример, чем Bun отличается от Vitest, уборка между тестами и флаги раннера Bun 1.4.
---

# Bun (`bun:test`)

Точка входа `vitest-auto-spy/bun` нужна, когда тесты запускаются через `bun test`. API у неё то же,
что у точки входа для Vitest, а спаи строятся на моках `bun:test`.

```ts
// greeter.test.ts
import { describe, expect, it } from 'bun:test';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/bun';

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
bun test
```

Кроме импорта точки входа, настраивать ничего не нужно: ни конфига, ни preload-файла.

- **У спая два вида методов, и оба работают.** Хелперы библиотеки (`calledWith(...)`, `resolveWith`,
  `nextWith`, …) одинаковы на любом раннере. Собственные методы мока Bun
  (`users.getName.mockReturnValue('x')`, `mockImplementation`, `mock.calls`) работают так, как их
  определяет Bun.
- **Спай можно передать вместо настоящего класса**, как в `new Greeter(users)` выше. Если у
  `UserService` есть `private`-члены, TypeScript сообщит, что `Spy<UserService>` нельзя присвоить
  `UserService`. Тогда передайте `new Greeter(asInstance(users))`, `asInstance` импортируется из
  `vitest-auto-spy/bun`.
- **Хелперы rxjs** работают после одного `import 'vitest-auto-spy/rxjs'`, например в preload-файле.
  См. [RxJS](/ru/runtimes/rxjs).

Для Angular под `bun test` есть своя точка входа — [`vitest-auto-spy/bun-angular`](/ru/runtimes/bun-angular).

## Чем это отличается от Vitest {#what-differs-from-vitest}

Большинство различий библиотека сглаживает. В таблице — то, что осталось.

| Поведение                             | Vitest                        | Bun                                   | Кто с этим разбирается                                                                                |
| ------------------------------------- | ----------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `mock.settledResults`                 | нативно                       | не отслеживается                      | библиотека добавляет его; читается одинаково                                                          |
| `mockReset()`                         | сохраняет спай, чистит вызовы | ещё и сбрасывает реализацию           | вызывать его почти не нужно; после него спай по-прежнему отвечает через `calledWith` и другие хелперы |
| `spyOn(obj, 'prop', 'get')`           | поддерживается                | бросает: аксессоры пока не поддержаны | библиотека вместо этого переопределяет свойство                                                       |
| Имена спаев в сообщениях об ошибках   | имена `vi.fn()`               | `mockName()`                          | проставляются за вас                                                                                  |
| Фейковые таймеры                      | `vi.useFakeTimers()`          | `jest.useFakeTimers()`                | не сглажено: `vitest-auto-spy/setup` только для Vitest                                                |
| `expect.any(...)` внутри `calledWith` | сопоставляется как предикат   | не совпадает никогда, см. ниже        | не сглажено: на Bun используйте точные аргументы                                                      |

`mock.settledResults` описан в разделе
[Управляющие хелперы → Разбор итога промиса](/ru/core/control-helpers#settled-results).

**Частая ошибка:** `calledWith(expect.any(Number))` на Bun. Ошибки нет, просто совпадения никогда не
будет: `read.calledWith(expect.any(Number))` отвечает `undefined` на `read(7)`. Матчеры Bun — нативные
объекты, и библиотека не может их применить. На Bun настраивайте точные аргументы или берите
`mockImplementation`, если ответ зависит от формы аргумента. На Vitest та же строка работает, как
описано в разделе
[асимметричные матчеры в `calledWith`](/ru/core/control-helpers#asymmetric-matchers-in-calledwith).

## Рядом с этой точкой входа {#beside-this-entry}

Эти точки входа тоже работают под Bun без установленного Vitest:

- `vitest-auto-spy/console`: [`useConsoleSpies()`](/ru/utilities/console) регистрирует свои хуки на
  `beforeEach` / `afterEach` из Bun, как только импортирована эта точка входа. Её типы тоже не упоминают `vitest`.
- `vitest-auto-spy/nestjs`: хелперы Nest строят моки `bun:test`. Эта точка входа также экспортирует
  `createNestUnit` и его типы, так что [тестам Nest](/ru/adapters/nestjs#any-runner) хватает одного
  импорта.
- `vitest-auto-spy/angular-router`: [подмены маршрута и `Router`](/ru/adapters/angular-router)
  работают под `bun test` с preload [`/bun-angular`](/ru/runtimes/bun-angular).

Остальные точки входа (корневая `vitest-auto-spy`, `/angular`, `/setup`, `/dom-stubs`, `/react`,
`/vue`, …) импортируют `vitest` и под `bun test` не работают. Фабрики берите из этой точки входа, а
хелперы Angular — из [`/bun-angular`](/ru/runtimes/bun-angular). `npx vitest-auto-spy doctor` сообщает
о неверном импорте как [`vitest-entry-without-vitest`](/ru/utilities/cli#vitest-entry-without-vitest)
и называет нужную точку входа.

Типы этой точки входа не ссылаются на `vitest`, поэтому проект без Vitest проходит проверку типов
без ошибок, даже с `skipLibCheck: false`. У `Spy<T>` здесь те же члены, что на Vitest,
кроме `mockThrow` из Vitest; `failWith()` делает то же самое на любом раннере.

## Между тестами ничего не восстанавливается {#nothing-is-restored-between-tests}

У `bun:test` нет опций `restoreMocks` и `clearMocks`. После конца теста:

- `spyOn(obj, 'm')` остаётся на объекте, и следующий тест вызывает спай, а не метод;
- спай сохраняет настроенные ответы и записанные вызовы;
- патч `mockValueProp` остаётся на месте.

Убирайте за тестами в preload-файле, который выполняется перед каждым файлом тестов:

```ts
// bun-test-setup.ts
import { afterEach, mock } from 'bun:test';
import { restoreMockedProps } from 'vitest-auto-spy/bun';

afterEach(() => {
  restoreMockedProps(); // mockValueProp, mockReadonlyProp и остальные
  mock.restore(); // каждый spyOn
});
```

```toml
# bunfig.toml
[test]
preload = ["./bun-test-setup.ts"]
```

На Vitest это делает [`setupAutoSpy()`](/ru/utilities/setup), но у `vitest-auto-spy/setup` нет версии
для Bun.

Спай из `createSpyFromClass(X)` — новый объект, `X` он не патчит, поэтому `mock.restore()` нечего за
ним отменять. Важно, где вы его создаёте:

- в `beforeEach`: каждый тест получает новый спай, уборка не нужна;
- один раз в начале файла: ответы и вызовы переходят из теста в тест, сбрасывайте его в `beforeEach`.

```ts
import { beforeEach } from 'bun:test';
import { createSpyFromClass, resetAutoSpy } from 'vitest-auto-spy/bun';

const users = createSpyFromClass(UserService);

beforeEach(() => {
  resetAutoSpy(users); // чистит вызовы и настроенные ответы
});
```

**`mock.module()` тоже кладите в preload.** Когда файл теста вызывает `mock.module()`, его импорты уже
выполнились, и значения, вычисленные при импорте, остаются настоящими:

```ts
// greet.ts
export const greet = (): string => 'real';
```

```ts
// greeting.ts
import { greet } from './greet';

export const greeting = greet(); // вычисляется один раз, при импорте greeting.ts
```

```ts
// bun-test-setup.ts (preload-файл)
import { mock } from 'bun:test';

mock.module('./greet', () => ({ greet: () => 'mocked' }));
```

С моком в preload `greeting` равен `'mocked'`. Тот же `mock.module()` внутри файла теста опаздывает:
`greeting` уже `'real'`. `mock.restore()` не отменяет `mock.module()`: мок остаётся до конца процесса.

## Флаги тест-раннера Bun 1.4 {#bun-1-4-test-runner-flags}

Ни один флаг не требует настройки в этом пакете. Два из них меняют поведение спаев между файлами
тестов.

| Флаг                             | Что делает                                                    | Как влияет на ваши спаи                                                      |
| -------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--isolate`                      | свежий глобальный объект JavaScript на файл, в одном процессе | как Vitest по умолчанию: патчи и списки моков не утекают между файлами       |
| _(без флага)_                    | один общий глобальный объект на весь прогон                   | осторожно: патч свойства или список моков переживают создавший их файл       |
| `--parallel[=N]`                 | распределяет файлы по процессам-воркерам                      | никак: у каждого воркера свой список моков                                   |
| `--shard=M/N`                    | делит файлы между раннерами CI                                | никак                                                                        |
| `--changed[=ref]`                | запускает только файлы, задетые вашим диффом                  | никак                                                                        |
| `--timings` / `--update-timings` | балансирует шарды по записанному времени                      | никак                                                                        |
| `--retry <N>` / `{ repeats: n }` | перезапускает нестабильный или нагрузочный тест               | спай без сброса между прогонами копит вызовы: сбрасывайте его в `beforeEach` |

Без `--isolate` восстанавливайте всё, что патчите.
`restoreMockedProps()` в `afterEach` закрывает хелперы для свойств; `resetAutoSpy(spy)` чистит спай,
который живёт дольше теста.

::: tip Какой режим выбрать
`--isolate` — безопасный вариант по умолчанию и стоит немного. `--parallel` ускоряет большой прогон.
Используйте оба: `bun test --isolate --parallel`.
:::

## Совместимость {#compatibility}

Проверено на **Bun 1.4**; CI также гоняет последний релиз Bun.
