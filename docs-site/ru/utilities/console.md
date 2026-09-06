---
title: Спаи над console
description: Тихие типизированные спаи над глобальным console — ставятся при импорте, снимаются по требованию.
---

# Спаи над console

Спаи над консолью живут за подпутём `vitest-auto-spy/console`. Импорт этого входа (в тестовом файле
или в setup-файле Vitest) подменяет `console.debug` / `error` / `info` / `log` / `time` / `timeEnd` /
`trace` / `warn` на **тихие, полностью типизированные спаи** и экспортирует каждый из них готовым к
проверке — никакого бойлерплейта `vi.spyOn(console, 'info')` в каждой сюите и никакого лога, который
засоряет прогон:

```ts
import { consoleInfoSpy, consoleWarnSpy } from 'vitest-auto-spy/console';

service.doWork();

expect(consoleInfoSpy).toHaveBeenCalledWith('done');
expect(consoleWarnSpy).not.toHaveBeenCalled();
```

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
- `restoreConsole()` отменяет патч целиком и забывает установленные спаи.
- `installConsoleSpies()` возвращает полный мешок `ConsoleSpies`; вызов, когда спаи уже стоят,
  возвращает тот же мешок.

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
