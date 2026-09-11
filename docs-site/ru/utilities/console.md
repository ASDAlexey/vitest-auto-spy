---
title: Спаи над console
description: Тихие типизированные спаи над глобальным console — ставятся на тест через installConsoleSpies(), снимаются в afterEach и поглощают вывод под охраной от посторонней консоли.
---

# Спаи над console

Спаи над консолью живут за подпутём `vitest-auto-spy/console`: `console.debug` / `error` / `info` /
`log` / `time` / `timeEnd` / `trace` / `warn` заменяются **тихими, полностью типизированными
спаями**, готовыми к проверке, — никакого бойлерплейта `vi.spyOn(console, 'info')` в каждой сюите и
никакого лога, который засоряет прогон. Ставьте их тестам, которые ждут вывода, и снимайте обратно:

```ts
import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

let consoleSpies: ConsoleSpies;

beforeEach(() => {
  consoleSpies = installConsoleSpies();
});

afterEach(() => restoreConsole());

it('logs the finished job', () => {
  service.doWork();

  expect(consoleSpies.consoleInfoSpy).toHaveBeenCalledWith('done');
  expect(consoleSpies.consoleWarnSpy).not.toHaveBeenCalled();
});
```

Экспортированные константы — `consoleInfoSpy`, `consoleErrorSpy`, … — те же объекты, что и мешок,
который возвращает `installConsoleSpies()`, так что `expect(consoleErrorSpy)` — та же проверка. Когда
вывода ждут все тесты файла, `installConsoleSpies()` один раз в начале файла делает то же для всего
файла.

### Почему не полагаться на импорт {#why-not-rely-on-the-import}

Импорт входа тоже ставит спаи, при первом вычислении модуля, — а под `isolate: false` это один раз на
**воркер**: спаи встают в том файле, который импортировал их первым, глушат каждый следующий файл
воркера, и ничто в этих файлах их не снимает. Что это скрывает — зависит от порядка файлов. На
Angular-потребителе в 1759 файлов 32 из 39 файлов, импортирующих вход, полагались ровно на это; как
только три файла начали звать `restoreConsole()` в `afterEach`, упали 12 тестов в 5 других файлах, а
вывод, который скрывала тишина, всплыл в 7 файлах. Правило
[`no-import-time-console-spies`](/ru/utilities/eslint-rules#no-import-time-console-spies) ловит этот
паттерн. Установка при импорте оставлена только ради совместимости для прогона без охраны от
посторонней консоли; под охраной импорт не ставит ничего.

## Экспорты {#exports}

По одному спаю на каждый пропатченный метод: `consoleDebugSpy`, `consoleErrorSpy`, `consoleInfoSpy`,
`consoleLogSpy`, `consoleTimeSpy`, `consoleTimeEndSpy`, `consoleTraceSpy`, `consoleWarnSpy`
(тип `ConsoleMethodSpy`).

## Уборка {#housekeeping}

```ts
import { installConsoleSpies, resetConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

resetConsoleSpies(); // очистить записанные вызовы (`clearMocks: true` в Vitest делает это на каждый тест)
restoreConsole(); // вернуть на место настоящие методы console
installConsoleSpies(); // поставить заново после снятия (в остальных случаях идемпотентно)
```

- `resetConsoleSpies()` очищает записанные вызовы, но оставляет спаи на месте. С `clearMocks: true`
  в конфиге Vitest это происходит само перед каждым тестом.
- `restoreConsole()` возвращает настоящие методы и очищает записанное спаями. Сами спаи сохраняются,
  так что `consoleErrorSpy` и остальные экспорты остаются живыми до следующей установки — под
  `isolate: false` снятие, которое их забывало, оставляло каждый следующий файл воркера проверять спаи,
  до которых уже ничто не дотягивалось.
- `installConsoleSpies()` возвращает полный мешок `ConsoleSpies` — всегда один и тот же — и снова
  сажает его спаи на консоль, если что-то их сняло.

## Под охраной от посторонней консоли {#under-the-stray-console-guard}

[`setupAutoSpy({ strayConsole: 'throw' })`](/ru/utilities/setup#_16-console-output-nothing-absorbed)
роняет тест на любом выводе в консоль, который никто не поглотил, и поглощают его как раз эти спаи. Пока
охрана включена, меняются две вещи.

**Импорт ничего не ставит.** Под `isolate: false` модуль вычисляется один раз на воркер, поэтому
установка при импорте сажала спаи на консоль в том файле, который импортировал их первым, и оставляла
их там для всех следующих файлов воркера — глуша ровно тот вывод, ради которого охрана существует.
Поэтому импорт только строит спаи, а `installConsoleSpies()` ставит те же объекты на консоль:

```ts
import { consoleWarnSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies()); // для тестов этого файла — или вызовите в начале файла

it('warns about the deprecated flag', () => {
  service.configure({ legacy: true });

  expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy'));
});
```

**Спаи не переживают свою область.** Поставленные в тесте или в `beforeEach`, они снимаются после
теста; поставленные в начале файла — после файла. Спаи, которые импорт успел поставить до включения
охраны, снимаются в момент включения. `vi.spyOn(console, m)` без реализации — не замена: он вызывает
оригинал, строка всё равно печатается, и охрана всё равно роняет тест; такую форму ловит правило
[`no-passthrough-console-spy`](/ru/utilities/eslint-rules#no-passthrough-console-spy).

Без охраны здесь ничего не меняется: импорт входа ставит спаи, как и раньше.

## Рантаймы {#runtimes}

Спаи строятся на зарегистрированном [`MockAdapter`](../runtimes/vitest), а не напрямую на
`vi.spyOn` — импортируйте вход своего рантайма (`vitest-auto-spy/bun`, `vitest-auto-spy/node`)
**до** `vitest-auto-spy/console`, и спаями над консолью будут править моки этого раннера. Если
никакого входа рантайма до этого не было, регистрируется адаптер Vitest по умолчанию.

## Полностью отвязанная альтернатива {#fully-detached-alternative}

Не хочется трогать настоящий глобал? `createAutoMock<Console>()` даёт типизированную консоль в
памяти, которую можно передать коду, принимающему логгер:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const fakeConsole = createAutoMock<Console>();
const service = new ReportService(fakeConsole);

service.doWork();

expect(fakeConsole.info).toHaveBeenCalledWith('done');
```
