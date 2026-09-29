---
title: Спаи над console
description: Тихие типизированные спаи над глобальным console из vitest-auto-spy/console - поставьте их тестам, которые ждут вывода, проверьте, и после каждого теста они снимаются.
---

# Спаи над console

`vitest-auto-spy/console` заменяет `console.debug`, `error`, `info`, `log`, `time`, `timeEnd`,
`trace` и `warn` тихими типизированными спаями. Он нужен, когда ваш код пишет в лог, а тест хочет
этот лог проверить, или чтобы лог не засорял вывод прогона. Чтобы проверить весь вывод разом,
включая «больше ничего не печаталось», используйте [`consoleOutput()`](#everything-a-test-wrote-as-one-value),
а если важен и порядок — [`consoleLines()`](#everything-a-test-wrote-in-order).

```ts
import { useConsoleSpies } from 'vitest-auto-spy/console';

describe('JobService', () => {
  const { consoleInfoSpy, consoleWarnSpy } = useConsoleSpies();

  it('logs the finished job', () => {
    service.doWork();

    expect(consoleInfoSpy).toHaveBeenCalledWith('done');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
```

## `useConsoleSpies()` {#useconsolespies}

Ставит спаи перед каждым тестом окружающего `describe` (или файла) и снимает после каждого теста.
Возвращает спаи.

Экспортированные константы (`consoleInfoSpy`, `consoleErrorSpy`, …) — те же самые объекты, так что
их можно импортировать напрямую:

```ts
import { consoleErrorSpy, useConsoleSpies } from 'vitest-auto-spy/console';

useConsoleSpies();

it('reports the failure', () => {
  service.doWork();
  expect(consoleErrorSpy).toHaveBeenCalledWith('boom');
});
```

Если вывода ждёт каждый тест файла, вместо этого один раз вызовите `installConsoleSpies()` в начале
файла.

Работает в Vitest, `node:test`, Bun и Rstest. Хуки ставятся в раннер, чью точку входа вы
импортировали (`vitest-auto-spy/node`, `vitest-auto-spy/bun`, `vitest-auto-spy/rstest`), а иначе —
в Vitest. `vitest-auto-spy/console` не импортирует пакет `vitest` и загружается без него.

Если хуки раннера не найдены, `useConsoleSpies()` бросает ошибку и называет точки входа, которые
нужно импортировать. Пару всегда можно записать в собственных хуках раннера:

```ts
import { installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies());
afterEach(() => restoreConsole());
```

**Частая ошибка:** голый `useConsoleSpies();` в теле `describe` нарушает правило линтера
`vitest/require-hook`. Добавьте `autoSpy.hookRegisteringHelpers` из
`vitest-auto-spy/eslint-plugin` в `allowedFunctionCalls` этого правила; см.
[Рядом с `vitest/require-hook`](/ru/utilities/eslint-plugin#alongside-vitest-require-hook).

### Всё, что тест написал, одним значением {#everything-a-test-wrote-as-one-value}

`consoleOutput()` возвращает все вызовы, которые записали спаи, по каналам (`debug`, `error`,
`info`, `log`, `trace`, `warn`), с аргументами каждого вызова. Каналов, в которые никто не писал, в
результате нет. Сравните его точно — и любая лишняя строка уронит тест с полным диффом.
`toHaveBeenCalledWith` на одном спае так не умеет: неожиданный `console.warn` он пропустит.

```ts
import { consoleOutput, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies());
afterEach(() => restoreConsole());

it('reports the dry run and nothing else', () => {
  cli.run(['--dry-run']);

  expect(consoleOutput()).toStrictEqual({ info: [['dry run: 3 files']] });
});

it('stays silent on a clean run', () => {
  cli.run([]);

  expect(consoleOutput()).toStrictEqual({});
});
```

`time` и `timeEnd` не входят: `timeEnd` печатает длительность, которую тест не может предсказать.

**Частая ошибка:** вызывать её, когда спаи не установлены, например после `restoreConsole()`. Она
бросает ошибку, потому что пустой результат выглядел бы как тишина.

### Всё, что тест написал, по порядку {#everything-a-test-wrote-in-order}

`consoleLines()` возвращает один массив по всем каналам в порядке вызовов. Каждый элемент — канал и
за ним аргументы вызова. Используйте, когда важен порядок, например предупреждение перед результатом.

```ts
import { consoleLines, useConsoleSpies } from 'vitest-auto-spy/console';

describe('cli', () => {
  useConsoleSpies();

  it('warns before it reports', () => {
    cli.run(['--dry-run']);

    expect(consoleLines()).toStrictEqual([
      ['warn', 'deprecated flag'],
      ['info', 'done'],
    ]);
  });
});
```

`time` и `timeEnd` не входят и сюда. `vi.clearAllMocks()` или `clearMocks: true` между тестами
порядок не ломают.

**Частая ошибка:** задавать спаю консоли свой `mockImplementation` или `mockReturnValue`. Тогда
порядок вызовов больше не записывается, и `consoleLines()` бросает ошибку, а не гадает. В этом
случае проверяйте `consoleOutput()`.

### Почему не полагаться на импорт {#why-not-rely-on-the-import}

Импорт точки входа тоже ставит спаи — при первом выполнении модуля. Если файлы спек делят одно
окружение (`isolate: false`), это происходит один раз на воркер: спаи встают в том файле, который
импортировал их первым, и глушат все следующие файлы воркера. Никто их не снимает, и что они скрывают, зависит от порядка файлов.

Ставьте их явно через `useConsoleSpies()` или `installConsoleSpies()`. Правило линтера
[`no-import-time-console-spies`](/ru/utilities/eslint-rules#no-import-time-console-spies) находит
спеки, которые полагаются на импорт. Установка при импорте оставлена только для прогонов без
[охраны консоли](#under-the-stray-console-guard); под охраной импорт ничего не ставит.

## Экспорты {#exports}

| Экспорт                                                                                                                                             | Что это                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `consoleDebugSpy`, `consoleErrorSpy`, `consoleInfoSpy`, `consoleLogSpy`, `consoleTimeSpy`, `consoleTimeEndSpy`, `consoleTraceSpy`, `consoleWarnSpy` | Спай на каждый метод, тип `ConsoleMethodSpy`                                                 |
| `useConsoleSpies()`                                                                                                                                 | Ставит перед каждым тестом, снимает после; возвращает спаи                                   |
| `installConsoleSpies()`                                                                                                                             | Ставит сейчас; возвращает объект `ConsoleSpies`                                              |
| `restoreConsole()`                                                                                                                                  | Возвращает настоящие методы                                                                  |
| `resetConsoleSpies()`                                                                                                                               | Очищает записанные вызовы, спаи остаются                                                     |
| `consoleOutput()`                                                                                                                                   | Все вызовы по каналам, тип `ConsoleOutput` с ключами `ConsoleChannel`                        |
| `consoleLines()`                                                                                                                                    | Все вызовы по порядку, тип `ConsoleLine[]` (`[channel: ConsoleChannel, ...args: unknown[]]`) |

## Уборка {#housekeeping}

```ts
import { installConsoleSpies, resetConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

resetConsoleSpies(); // очистить записанные вызовы
restoreConsole(); // вернуть настоящие методы console
installConsoleSpies(); // поставить снова после restore; повторный вызов безопасен
```

- `resetConsoleSpies()` очищает записанные вызовы, но оставляет спаи на месте. `clearMocks: true` в
  конфиге Vitest делает это перед каждым тестом. [`setupAutoSpy()`](/ru/utilities/setup) делает это
  после каждого теста через свою опцию `resetConsoleSpies` (по умолчанию включена). Выключайте эту
  опцию, только если спека проверяет то, что записал предыдущий тест.
- `restoreConsole()` возвращает настоящие методы и очищает записанное. Сами объекты спаев остаются,
  поэтому `consoleErrorSpy` и остальные экспорты работают и после следующей установки.
- `installConsoleSpies()` всегда возвращает один и тот же объект `ConsoleSpies`. Если что-то сняло
  спаи с `console`, он ставит их обратно.
- Спаи переживают `vi.resetModules()`. Свежая копия модуля всё равно находит настоящие методы
  консоли, поэтому `restoreConsole()` никогда не оставит на `console` устаревший спай.

## Под охраной от посторонней консоли {#under-the-stray-console-guard}

[`setupAutoSpy({ strayConsole: 'throw' })`](/ru/utilities/setup#_16-console-output-nothing-absorbed)
роняет тест, который пишет в консоль, когда этот вывод нечем поглотить. Поглощают его эти спаи.
Пока охрана включена, меняются три вещи.

**Импорт ничего не ставит.** Он только создаёт спаи. Ставьте их там, где они нужны:

```ts
import { consoleWarnSpy, useConsoleSpies } from 'vitest-auto-spy/console';

useConsoleSpies(); // тесты этого файла; или installConsoleSpies() в начале файла

it('warns about the deprecated flag', () => {
  service.configure({ legacy: true });

  expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy'));
});
```

**Спаи не переживают свою область.** Поставленные в тесте или в `beforeEach`, они снимаются после
теста. Поставленные в начале файла — после файла. Спаи, поставленные более ранним импортом,
снимаются, когда охрана включается.

**То, что пишет DOM-среда, тоже доходит до спаев.** Консоль страницы happy-dom и виртуальная
консоль jsdom раньше писали мимо всех спаев. Охрана перенаправляет их в консоль, на которой стоят
спаи. Поэтому `consoleErrorSpy` поглощает `NotSupportedError … Iframe page loading is disabled` из
happy-dom, как любой другой `console.error`, и тест может это проверить.

**Частая ошибка:** `vi.spyOn(console, 'error')` без реализации. Он передаёт вызов дальше, строка всё
равно печатается, и охрана всё равно роняет тест:
`vi.spyOn(console, 'error') calls through — add .mockImplementation(() => undefined).` Правило
линтера [`no-passthrough-console-spy`](/ru/utilities/eslint-rules#no-passthrough-console-spy) находит
его до запуска.

Без охраны здесь ничего не меняется: импорт точки входа ставит спаи, как и раньше.

## Рантаймы {#runtimes}

Спаи построены на зарегистрированном [`MockAdapter`](../runtimes/vitest) (связь библиотеки с
`vi.fn()` / `mock()` вашего раннера), а не напрямую на `vi.spyOn`. Импортируйте точку входа вашего
рантайма (`vitest-auto-spy/bun`, `vitest-auto-spy/node`) **до** `vitest-auto-spy/console`, и спаи
консоли будут работать на моках этого раннера.

В Vitest без импортированной точки входа рантайма адаптер по умолчанию использует собственный `vi`
Vitest. В другом раннере спаи ждут точку входа этого раннера. Если `/console` импортирован первым
(отсортированный список импортов ставит его перед `/node`), он пока ничего не создаёт. Первый
`installConsoleSpies()` или `useConsoleSpies()` создаёт спаи, и экспортированный `consoleErrorSpy` с
остальными их подхватывают.

## Полностью отвязанная альтернатива {#fully-detached-alternative}

Чтобы не трогать настоящий `console`, передайте в код типизированную консоль в памяти.
`createAutoMock<Console>()` даёт такую для кода, который принимает логгер:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const fakeConsole = createAutoMock<Console>();
const service = new ReportService(fakeConsole);

service.doWork();

expect(fakeConsole.info).toHaveBeenCalledWith('done');
```
