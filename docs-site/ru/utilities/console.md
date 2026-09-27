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

### Всё, что тест написал, одним значением {#everything-a-test-wrote-as-one-value}

`toHaveBeenCalledWith` на одном спае ничего не говорит об остальных: тест, который закрепил
`consoleInfoSpy`, проходит, пока мимо идёт никем не проверенный `console.warn`. `consoleOutput()`
возвращает все вызовы, которые записали спаи, по каналам (`debug`, `error`, `info`, `log`, `trace`,
`warn`), с аргументами каждого вызова — и только те каналы, в которые что-то писали. Точное сравнение
закрепляет весь вывод целиком, а лишняя строка роняет его с полным диффом:

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

`time` и `timeEnd` не входят: `timeEnd` печатает длительность, которую тест не закрепит.
`consoleOutput()` бросает, пока ни один спай не сидит на `console`, — после `restoreConsole()` или под
охраной от посторонней консоли до `installConsoleSpies()`: снятые спаи ничего не записывают, и пустой
результат читался бы как тишина.

Это функция, а не матчер `toHaveLogged(…)`, намеренно: `toStrictEqual` уже даёт точное сравнение и
дифф, функция добавляет входу 184 байта (min+gzip) против 340 у функции вместе с матчером, и ей не
нужны ни `expect.extend` при импорте, ни типизация матчера.

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
(тип `ConsoleMethodSpy`). `consoleOutput()` (тип `ConsoleOutput` с ключами `ConsoleChannel`) читает
их все разом.

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

Спаи переживают `vi.resetModules()`. Этот вызов отдаёт следующему импорту свежую копию модуля, пока
спаи предыдущей копии ещё сидят на `console`, и новая копия никогда не примет такой спай за настоящий
метод: настоящие запомнены один раз на воркер, и там их находит любая копия. Поэтому
`restoreConsole()` не может посадить обратно на `console` спай, до которого уже никто не дотянется, —
и так на весь остаток жизни воркера.

## Под охраной от посторонней консоли {#under-the-stray-console-guard}

[`setupAutoSpy({ strayConsole: 'throw' })`](/ru/utilities/setup#_16-console-output-nothing-absorbed)
роняет тест на любом выводе в консоль, который никто не поглотил, и поглощают его как раз эти спаи. Пока
охрана включена, меняются три вещи.

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
оригинал, строка всё равно печатается, и охрана всё равно роняет тест со словами
`vi.spyOn(console, 'error') calls through — add .mockImplementation(() => undefined).` Такую форму
ещё до прогона ловит правило
[`no-passthrough-console-spy`](/ru/utilities/eslint-rules#no-passthrough-console-spy).

**То, что пишет DOM-окружение, тоже доходит до спаев.** Консоль страницы happy-dom и виртуальная
консоль jsdom держат собственную консоль воркера, захваченную до того, как Vitest подменил
`globalThis.console`, поэтому их строки уходили в stderr мимо всех спаев и мимо охраны. Охрана
перенаправляет их в ту консоль, на которой сидят спаи: `consoleErrorSpy` поглощает
`NotSupportedError … Iframe page loading is disabled` от happy-dom, как любой другой `console.error`, и
тест может это проверить.

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
