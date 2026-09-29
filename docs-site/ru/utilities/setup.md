---
title: Гигиена тестового прогона
description: setupAutoSpy() в setup-файле Vitest возвращает на место то, что тест оставил после себя - пропатченные свойства, таймеры, слушатели, глобалы - и называет тест, который это оставил.
---

# Гигиена тестового прогона

`setupAutoSpy()` — один вызов в setup-файле Vitest. Он убирает то, что тест оставил после себя, и
называет тест, который это оставил. Нужнее всего он там, где файлы спек делят одно окружение
(`isolate: false`): остаток одного файла ломает другой файл.

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // isolate: false, // если файлы спек делят одно окружение
  },
});
```

С Angular-билдером `@angular/build:unit-test` укажите файл в `options.setupFiles` тестовой цели в
`angular.json`. `/setup` работает только в Vitest: у `bun:test`, `node:test` и Rstest нет
setup-точки входа, куда его можно поставить.

## Типичные настройки {#common-setups}

Начните с настроек по умолчанию. Они только чинят и сообщают и не меняют того, что видит ваш код.

```ts
setupAutoSpy();
```

Если файлы спек делят одно окружение (`isolate: false`), добавьте уборку между файлами. Она убирает
молча; чтобы файл падал, добавьте `onStrayTimers: 'throw'` и похожие опции. `restoreMocks` снимает и
заглушки `vi.spyOn`, поставленные в `beforeAll`, поэтому ставьте их в `beforeEach`.

```ts
setupAutoSpy({ restoreMocks: true, strayTimers: true, strayListeners: true, restoreGlobals: true });
```

Чтобы включить все проверки на самый строгий уровень разом, возьмите пресет:

```ts
setupAutoSpy({ preset: 'strict' });
```

Опция, переданная в том же объекте, что и пресет, важнее его. Подробнее —
[`preset: 'strict'`](#one-grade-for-everything-preset-strict).

## Опции {#options}

Все опции необязательны. Опции-«уровни» принимают `'throw'` (упасть), `'warn'` (только сообщить) или
`'off'`.

| Опция                                                                                  | Тип                               | По умолчанию | Что делает                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| [`restoreProps`](#_1-restoring-patched-properties)                                     | `boolean`                         | `true`       | Откатывает патчи `mock*Prop` после каждого теста                                     |
| [`propsOutsideHooks`](#a-patch-put-in-the-wrong-hook-stops-applying)                   | уровень                           | `'warn'`     | Сообщает о патче `mock*Prop`, сделанном вне `beforeEach`                             |
| [`duplicateCopies`](#_2-one-copy-of-the-library-in-the-process)                        | уровень                           | `'throw'`    | Роняет прогон, если загружены две копии библиотеки                                   |
| [`restoreMocks`](#_3-draining-the-runner-s-restore-registry)                           | `boolean`                         | `false`      | Вызывает `vi.restoreAllMocks()` после каждого теста                                  |
| [`strayTimers`](#_4-cancelling-timers-that-outlive-their-file)                         | `boolean` \| `{ ignore }`         | `false`      | Отменяет таймауты, интервалы и кадры, которые файл оставил                           |
| [`onStrayTimers`](#_4-cancelling-timers-that-outlive-their-file)                       | `'throw'` \| функция              | —            | Роняет файл, оставивший таймеры, или сообщает о нём                                  |
| [`blockNetwork`](#_5-keeping-the-run-off-the-network)                                  | `boolean` \| объект               | `false`      | `fetch`, `XMLHttpRequest` и `sendBeacon` падают вместо выхода в сеть                 |
| [`restoreTimerGlobals`](#_6-putting-back-timer-globals-the-fakes-took-with-them)       | `boolean`                         | `true`       | Возвращает глобалы таймеров, которые удалило снятие фейковых таймеров                |
| [`guardGlobals`](#_7-naming-the-file-that-sealed-a-global)                             | уровень                           | `'off'`      | Сообщает о тесте, сделавшем глобальное свойство неконфигурируемым                    |
| [`strayRejections`](#_8-failing-on-a-rejection-zone-js-swallowed)                      | `boolean`                         | `false`      | Роняет тест, в котором zone.js проглотил отклонённый промис                          |
| [`pruneMockRegistry`](#_9-pruning-the-mock-registry-nothing-empties)                   | `boolean`                         | `false`      | Не даёт списку всех моков Vitest расти весь прогон                                   |
| [`strict`](#_10-strict-doubles-for-the-whole-suite)                                    | `boolean` \| `'survey'`           | `false`      | Метод, который никто не настроил, бросает ошибку вместо `undefined`                  |
| [`onUnstubbedCall`](#_10-strict-doubles-for-the-whole-suite)                           | функция                           | —            | Вызывается на ненастроенный вызов; её результат становится ответом                   |
| [`swallowedStrictCalls`](/ru/core/strict-mode)                                         | уровень                           | см. ссылку   | Роняет тест, если строгую ошибку поймали раньше, чем её увидел тест                  |
| [`unconfiguredReads`](#_10-strict-doubles-for-the-whole-suite)                         | уровень                           | `'off'`      | Сообщает о геттерах и потоках строгого спая, которые никто не настроил               |
| [`onUnstubbedRead`](#_10-strict-doubles-for-the-whole-suite)                           | функция                           | —            | Получает эти находки вместо отчёта                                                   |
| [`hookTimeoutHint`](#_11-the-hook-budget-jest-had-only-one-of)                         | `boolean`                         | `true`       | Объясняет таймаут хука, если `hookTimeout` меньше `testTimeout`                      |
| [`frozenClockHint`](#_12-a-timeout-the-clock-explains-not-the-code)                    | `boolean`                         | `true`       | Объясняет таймаут из-за фейковых часов, которые никто не сдвинул                     |
| [`angularBuildHint`](#_13-the-builder-version-that-eats-memory-named-in-the-run)       | `boolean`                         | `true`       | Предупреждает о версиях `@angular/build`, которые собирают тесты без разделения кода |
| [`restoreWebStorage`](#_14-web-storage-the-runner-never-handed-over)                   | `boolean`                         | `true`       | Даёт прогону рабочие `localStorage` и `sessionStorage`                               |
| [`prototypePollution`](#_15-the-key-on-object-prototype-that-stops-the-run-collecting) | уровень                           | `'throw'`    | Снимает ключ, оставленный тестом на `Object.prototype`, и сообщает о нём             |
| [`strayConsole`](#_16-console-output-nothing-absorbed)                                 | уровень \| `{ reaction, allow }`  | `'off'`      | Роняет тест, который писал в консоль, а спая для этого вывода не было                |
| [`resetConsoleSpies`](./console)                                                       | `boolean`                         | `true`       | Очищает спаи `vitest-auto-spy/console` после каждого теста                           |
| [`documentPollution`](#_17-an-attribute-left-on-the-shared-document)                   | уровень \| объект                 | `'off'`      | Возвращает атрибуты, оставленные тестом на `<html>`, `<head>`, `<body>`              |
| [`restoreStorageSpies`](#_18-a-spy-on-storage-the-runner-cannot-take-off)              | `boolean`                         | `true`       | Снимает спаи с методов Web Storage там, где `mockRestore()` не может                 |
| [`strayListeners`](#_19-listeners-that-outlive-their-file)                             | `boolean`                         | `false`      | Снимает слушатели `window` и `document`, оставленные файлом                          |
| [`onStrayListeners`](#_19-listeners-that-outlive-their-file)                           | `'throw'` \| функция              | —            | Роняет файл, оставивший слушатели, или сообщает о нём                                |
| [`restoreGlobals`](#_20-globals-put-back-at-the-file-boundary)                         | `boolean`                         | `false`      | Возвращает каждый изменённый глобал в конце каждого файла                            |
| [`cleanTestBed`](#_21-a-testbed-left-dirty-at-file-end)                                | уровень                           | `'warn'`     | Сбрасывает Angular `TestBed`, который файл оставил грязным                           |
| [`misconfiguration`](#misconfiguration-reports-that-fail-at-the-call)                  | `'warn'` \| `'throw'`             | `'warn'`     | Превращает предупреждения о неверном использовании библиотеки в ошибку               |
| [`globalFakeTimers`](#fake-timers-for-the-whole-run)                                   | `boolean` \| конфиг фейк-таймеров | `false`      | Фейковые таймеры для каждого теста и между тестами                                   |
| [`preset`](#one-grade-for-everything-preset-strict)                                    | `'strict'`                        | —            | Включает все проверки на самом строгом уровне                                        |

`swallowedStrictCalls` по умолчанию `'throw'` при `strict: true` или `preset: 'strict'`, иначе
`'off'`.

```ts
setupAutoSpy({ restoreMocks: true, duplicateCopies: 'warn' });
```

## 1. Восстановление пропатченных свойств {#_1-restoring-patched-properties}

Включено по умолчанию (`restoreProps`). После каждого теста каждое свойство, которое пропатчили
[`mockReadonlyProp` / `mockValueProp`](../adapters/angular#signal-readonly-property-mocking),
возвращается к исходному значению. `vi.restoreAllMocks()` этого не делает: он знает про спаи, а не
про пропатченные свойства.

Уборка срабатывает, даже если собственный `afterEach` спеки упал раньше. Тогда вы получите
предупреждение: какой тест, сколько патчей возвращено и какой хук упал.

Чтобы проверить, что патчей не осталось, используйте `countMockedProps()`:

```ts
import { countMockedProps } from 'vitest-auto-spy/setup';

afterEach(() => expect(countMockedProps()).toBe(0));
```

**Частая ошибка:** патч в теле `describe` или в `beforeAll` действует только на первый тест. См.
[Патч, поставленный не в тот хук, перестаёт действовать](#a-patch-put-in-the-wrong-hook-stops-applying).

Зачем нужна подстраховка после `afterEach`: [Подробнее](#restoring-properties-when-a-hook-throws).

## 2. Одна копия библиотеки в процессе {#_2-one-copy-of-the-library-in-the-process}

Включено по умолчанию (`duplicateCopies: 'throw'`). Если загружены две копии `vitest-auto-spy`,
прогон падает с отчётом: обе копии и как исправить каждую причину.

У двух копий два набора спаев консоли и два реестра. Симптом — «тесты падают в зависимости от
порядка файлов». Обычные причины: вторая установка пакета или одна установка, загруженная и как ESM,
и как CommonJS.

```ts
import { describeDuplicateCopies, getPackageCopies } from 'vitest-auto-spy/setup';

getPackageCopies(); // зарегистрированные копии, для вашего собственного отчёта
describeDuplicateCopies(); // читаемый отчёт или undefined, если копия одна
```

Обе функции экспортируются и из основной точки входа `vitest-auto-spy`. `'warn'` только сообщает,
`'off'` отключает проверку.

## 3. Очистка реестра восстановления у раннера {#_3-draining-the-runner-s-restore-registry}

Выключено по умолчанию (`restoreMocks: false`). Если включить, после каждого теста вызывается
`vi.restoreAllMocks()`.

Каждый `vi.spyOn` добавляет запись, которую убирает только `vi.restoreAllMocks()`. При общем
окружении (`isolate: false`) этот список растёт весь прогон. В этом случае включите опцию.

```ts
setupAutoSpy({ restoreMocks: true });
```

**Частая ошибка:** опция снимает и заглушки `vi.spyOn`, поставленные в `beforeAll`. Поэтому по
умолчанию она выключена.

### Clear, reset и restore применительно к авто-спаю {#clear-reset-and-restore-applied-to-an-auto-spy}

Флаги конфига Vitest `clearMocks`, `mockReset` и `restoreMocks` действуют на спай этой библиотеки
(авто-спай) ровно так же, как на `vi.fn()`. Это верно при любом движке спаев.

| Флаг конфига   | По умолчанию      | Записанные вызовы | `mockReturnValue` / `mockImplementation`      | правила `calledWith(…)` | `vi.spyOn` на реальном объекте     |
| -------------- | ----------------- | ----------------- | --------------------------------------------- | ----------------------- | ---------------------------------- |
| `clearMocks`   | `true` с Vitest 5 | очищены           | сохранены                                     | сохранены               | вызовы очищены, спай остаётся      |
| `mockReset`    | `false`           | очищены           | сброшены; метод или геттер отвечает undefined | сохранены               | снова отвечает реальная реализация |
| `restoreMocks` | `false`           | не тронуты        | не тронуты                                    | не тронуты              | снят, реальный член вернулся       |

Что это значит для вас:

- **`clearMocks`** в Vitest 5 включён по умолчанию. Он очищает записанные вызовы и сохраняет
  настройку.
- **`mockReset`** выполняется перед каждым тестом. Он стирает настройку, сделанную в `beforeAll` или
  в теле `describe`, и такой спай отвечает `undefined`. Создавайте спаи в `beforeEach`. Правила
  `calledWith(…)` сохраняются;
  [`resetAutoSpy(spy)`](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy)
  сбрасывает и их.
- **`restoreMocks`** авто-спай не трогает. Он откатывает только `vi.spyOn` на реальных объектах.

Спаю, созданному в `beforeEach`, не нужен ни один из трёх флагов: следующий тест создаст новый.
`setupAutoSpy()` сам спаи не очищает и не сбрасывает. Для спая, который живёт дольше одного теста,
есть [`resetAutoSpy` и `clearAutoSpy`](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

### Движок на один файл {#switching-the-engine-for-one-file}

Это нужно, только если вы переключаете движок спаев. `setSpyEngine(...)` меняет движок для всего
воркера, а не только для вашего файла. Он
возвращает функцию отмены. При `isolate: false` переключайте в `beforeAll` и отменяйте в `afterAll`:

```ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

let undo: () => void;

beforeAll(() => {
  undo = setSpyEngine('runner');
});
afterAll(() => undo());
```

В setup-файле возвращаемое значение можно не использовать.
`beforeEach(() => setSpyEngine('runner'))` тоже работает: Vitest считает возвращённую отмену
teardown-функцией хука и вызывает её после каждого теста. Что такое движки —
[Движок спаев](/ru/core/performance#the-spy-engine).

## 4. Отмена таймеров, переживших свой файл {#_4-cancelling-timers-that-outlive-their-file}

Выключено по умолчанию (`strayTimers: false`). Если включить, каждый колбэк `setTimeout`,
`setInterval` и `requestAnimationFrame`, который ещё ждёт в конце файла, отменяется. Это важно только
при `isolate: false`. Там таймер одного файла срабатывает во время другого, и раннер винит не тот
файл.

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: 'throw' });
```

С `onStrayTimers: 'throw'` файл падает, а отчёт называет каждый таймер:

```text
[vitest-auto-spy] src/app/cart.component.spec.ts left 1 timer pending when it ended:
  - setTimeout 5000 ms, scheduled in "CartComponent > polls" at src/app/cart.component.spec.ts:14:5
It was cancelled so it cannot fire in the next file. Clear it in the test that scheduled it — clearTimeout, unsubscribe, fixture.destroy() — or run it out with fake timers before the test ends.
```

| Опция           | Тип                                             | По умолчанию | Смысл                                                   |
| --------------- | ----------------------------------------------- | ------------ | ------------------------------------------------------- |
| `strayTimers`   | `boolean` \| `{ ignore: (string \| RegExp)[] }` | `false`      | Включает уборку; `ignore` не трогает подходящие таймеры |
| `onStrayTimers` | `'throw'` \| `(report) => void`                 | —            | Вызывается раз на файл и только если что-то отменено    |

Без `onStrayTimers` уборка идёт молча.

Таймер, поставленный после конца одного файла, засчитывается следующему. Поэтому падает не всегда
тот файл, который поставил таймер; настоящего владельца называет поле `file` у каждого таймера.

Обработчик получает `{ cancelled, timers }`. У каждой записи в `timers` есть:

- `kind` и `delay` таймера;
- `file` — файл спеки, который выполнялся, когда таймер поставили;
- `test` (в виде `suite > test`) или `outsideTest: 'import' | 'hook'`, если тест не шёл;
- `frames` — до пяти строк стека: где поставили таймер. Сначала идут строки вашего кода. Строки
  из `node_modules` — только если других нет. Строк самой библиотеки там не бывает.

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: ({ cancelled }) => expect(cancelled).toBe(0) });

setupAutoSpy({
  strayTimers: true,
  onStrayTimers: ({ timers }) => expect(timers).toEqual([]), // дифф назовёт файл и кадры
});
```

Если обработчик печатает своё сообщение, выводите `kind`, `delay`, `test` и `frames[0]`.

Части работают и без `setupAutoSpy`. Каждая принимает необязательный хост — объект с функциями
таймеров, который используется вместо настоящих глобалов, например в вашем собственном тесте:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

const stop = trackStrayTimers(); // повторный вызов безопасен; stop() выключает отслеживание и отменяет оставшиеся таймеры
afterEach(() => expect(countStrayTimers()).toBe(0));
afterAll(() => {
  const cancelled = cancelStrayTimers(); // сколько пришлось отменить

  if (cancelled > 0) {
    process.stdout.write(`${cancelled} timer(s) outlived this file\n`);
  }
});
```

`describeStrayTimers()` возвращает тот же список, что `timers`, — для набора тестов, который
убирает таймеры вручную.

Подготовку, которая ставит таймеры (например, запись в `localStorage` под jsdom), можно исключить из
подсчёта:

```ts
import { withoutStrayTimerTracking } from 'vitest-auto-spy/setup';

withoutStrayTimerTracking(() => seedStorage()); // то, что здесь поставлено, не считается и не отменяется
```

::: warning Таймер под фейковыми таймерами не виден
`vi.useFakeTimers()` ставит свой `setTimeout` поверх отслеживания, поэтому ничего из того, что
планируют фейковые часы, не считается. `expect(countStrayTimers()).toBe(0)` ничего не доказывает в
файле на замороженных часах, в том числе с `globalFakeTimers: true`. Очередь самих фейковых часов
показывает `vi.getTimerCount()`.
:::

**Частая ошибка:** ждать от опции пользы при `isolate: true`. Тогда каждый файл и так получает свежее
окружение, убирать нечего.

Как отслеживание узнаёт отменённый таймер и сколько это стоит: [Подробнее](#stray-timers-in-depth).

### Таймеры, которыми владеет зависимость {#timers-a-dependency-owns}

Некоторые библиотеки держат таймеры намеренно. Таймеры undici (HTTP-клиент за `fetch()` в Node —
встроенный или пакет `undici`) никогда не считаются, не попадают в отчёт и не отменяются. Но если
undici вызывает ваш колбэк, например обработчик ответа `MockAgent`, это ваш код: таймеры, которые он
ставит, считаются.

Служебные таймеры другой библиотеки перечислите в `ignore`:

```ts
setupAutoSpy({ strayTimers: { ignore: [/some-sdk[/\\]poll/, 'heartbeat.js'] }, onStrayTimers: 'throw' });

trackStrayTimers(undefined, { ignore: [/some-sdk[/\\]poll/] }); // то же без setupAutoSpy
```

Каждая запись — подстрока или RegExp. Её ищут в стеке вызова, который поставил таймер.
Проигнорированный таймер и не отменяется: он нужен владельцу. Каждый вызов `trackStrayTimers` (или
`setupAutoSpy`) заменяет список `ignore`. Если его задают два setup-файла, действует тот, что
выполнился последним.

### Ошибка Observable, которую никто не обработал {#an-observable-error-nothing-handled}

Когда поток падает с ошибкой, а подписчик её не обрабатывает, rxjs бросает ошибку заново из
`setTimeout`. Ни один тест от этого не падает. С включённым `strayTimers` библиотека выполняет этот
повторный бросок в `afterEach` и роняет тест, который его вызвал:

```text
[vitest-auto-spy] Unhandled Observable error in "TokenSetupScreen > saves the token":
  - HttpErrorResponse: Http failure response for /api/token: 502 Bad Gateway
rxjs rethrows an error no subscriber handles from a setTimeout, where it fails no test; it was rethrown now instead. …
```

Исходная ошибка лежит в `cause`, поэтому вы видите и её стек. Ошибка, запланированная вне теста,
роняет файл в конце. Проверка работает и под фейковыми таймерами, пока они установлены, в том числе с
`globalFakeTimers`. Ошибку, которую обработал `config.onUnhandledError`, отчёт не показывает.

Если тест оставляет ошибку необработанной намеренно, проверьте её через
`expectUnhandledObservableErrors`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { expectUnhandledObservableErrors } from 'vitest-auto-spy/setup';

it('gives up after the last retry', () => {
  service.refresh(); // поток падает с 502, и никто его не обрабатывает

  expectUnhandledObservableErrors([{ message: /502/ }]);
});
```

Каждый элемент списка соответствует одной ошибке, по порядку. Элемент может быть:

- самой ошибкой (то же имя и сообщение);
- классом: `TypeError`, ваш `ApiError` или `HttpErrorResponse` из Angular (наследовать `Error` не
  обязательно);
- `{ message }` со строкой или RegExp.

Лишняя, недостающая или не по порядку ошибка роняет тест и показывает оба списка. Вытащенные записи
возвращаются. Без аргумента функция проверяет, что не осталось ничего.

```ts
expectUnhandledObservableErrors([HttpErrorResponse]);
expectUnhandledObservableErrors([{ message: /Http failure response.*502/ }]);
```

`flushUnhandledObservableErrors()` делает то же самое без сравнения. Она возвращает `{ error, test }`
для каждой ошибки или `{ error, outsideTest }` для ошибки вне теста. Чтобы проверить только ошибки,
используйте `toMatchObject`:

```ts
expect(flushUnhandledObservableErrors()).toMatchObject([{ error: new Error('502') }]);
```

**Частая ошибка:** если собственный `afterEach` спеки вызывает `vi.useRealTimers()`, ждущий фейковый
таймер выбрасывается раньше проверки, и отчёта нет.

### Вместе с `--detect-async-leaks` из Vitest 4.1 {#with-vitest-4-1-s-detect-async-leaks}

::: warning Они гасят друг друга
Детектор утечек Vitest ищет оставшиеся таймеры после конца файла. К этому моменту `strayTimers` их
уже отменил, и Vitest утечек не находит.
:::

Уборка всё равно отменяет таймеры: таймер, сработавший в чужом файле, — поломка хуже. Взамен, когда
включено и то и другое, а `onStrayTimers` не задан, уборка печатает свой отчёт в stderr: файл, число и первые три таймера с их тестами. В конце —
фраза о том, что этих таймеров нет в отчёте Vitest «Async Leaks». Обработчик `onStrayTimers` получает
все таймеры.

С выключенным `strayTimers` отчёт Vitest указывает на `setTimeout` в вашей спеке, а не на код
библиотеки:

```
⎯⎯⎯⎯⎯⎯⎯ Async Leaks 1 ⎯⎯⎯⎯⎯⎯⎯⎯

Timeout leaking in src/app/cart.component.spec.ts
  12|   it('polls', () => {
  13|     component.startPolling();
  14|     setTimeout(() => refresh(), 60_000);
     |     ^
```

Отчёт идёт в stderr, а не в `console.warn`: вывод в консоль после последнего теста файла Vitest
выбрасывает.

## 5. Как удержать прогон подальше от сети {#_5-keeping-the-run-off-the-network}

Выключено по умолчанию (`blockNetwork: false`). Если включить, `fetch` отклоняется,
`XMLHttpRequest` падает, а `navigator.sendBeacon` возвращает `false`. Ничего не уходит с машины, а
каждый отказ называет запрос и тест, который его сделал.

```ts
setupAutoSpy({ blockNetwork: true });
```

```text
[vitest-auto-spy] fetch is stubbed in unit tests — GET https://cdn.example.test/sprite.svg. The test "icons > loads the sprite" requested it, and blockNetwork() refused it: unit tests stay off the network. Answer it in this test: vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ body: … })).
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_5-keeping-the-run-off-the-network
```

`fetch`, который спека подменила сама, не блокируется.

Включите опцию, чтобы тесты не ходили в сеть. Особенно она нужна, когда зелёный прогон всё равно
завершается с ненулевым кодом. Так бывает под happy-dom, где
`fetch` реализован: компонент тихо грузит иконки или опрашивает эндпоинт, а Vitest обрывает эти
запросы при завершении. Обрывы приходят необработанными ошибками после итогов, без имени теста:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

Под jsdom опция тоже полезна: там полностью реализован `XMLHttpRequest`.

Объектная форма сужает блокировку:

| Опция    | Тип                                | По умолчанию | Смысл                                                                    |
| -------- | ---------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `fetch`  | `boolean`                          | `true`       | `fetch` отклоняется и называет запрос                                    |
| `xhr`    | `'reject'` \| `'empty'` \| `false` | `'reject'`   | Как ответить на заблокированный `XMLHttpRequest`; `false` не трогает его |
| `beacon` | `boolean`                          | `true`       | `navigator.sendBeacon` возвращает `false`, если он есть в среде          |

- `'reject'` роняет запрос как недоступный хост: `readyState` 4, `status` 0, событие `error` и
  маркер в `statusText`.
- `'empty'` отвечает на каждый заблокированный `XMLHttpRequest` статусом 200 и пустым телом.
  Подходит, когда весь XHR-трафик — это запросы, ответ на которые никто не читает, например пинги
  трекеров.

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } }); // пинги трекеров получают ответ и молчат
```

Заблокированный `XMLHttpRequest` пишет в `statusText`:
`[vitest-auto-spy] XMLHttpRequest is stubbed in unit tests — GET <url> blocked. Stub it in this test, or blockNetwork({ xhr: 'empty' }) if nothing reads the reply.`

Чтобы узнать эти ошибки в спеке или репортере, используйте экспортированные маркеры. Текст после
маркера может меняться между релизами, маркер — нет.

```ts
import { BLOCKED_FETCH_MESSAGE, BLOCKED_XHR_MESSAGE } from 'vitest-auto-spy/setup';

await expect(fetch('https://api.example.test/cart')).rejects.toThrow(BLOCKED_FETCH_MESSAGE);

const xhr = new XMLHttpRequest();
xhr.open('GET', 'https://api.example.test/cart');
xhr.send();
await vi.waitFor(() => expect(xhr.statusText).toContain(BLOCKED_XHR_MESSAGE));
```

`BLOCKED_FETCH_MESSAGE` — это `'[vitest-auto-spy] fetch is stubbed in unit tests'`, а
`BLOCKED_XHR_MESSAGE` — `'[vitest-auto-spy] XMLHttpRequest is stubbed in unit tests'`.

Что ещё важно:

- Блокировка ставится перед каждым тестом и снимается после него. Спека по-прежнему может сама
  подменить `fetch`, например через `vi.spyOn(globalThis, 'fetch')`; подменённый вызов до блокировки
  не доходит. Подменяйте в `beforeEach` или в самом тесте: блокировка ставится после `beforeAll` и
  заменила бы подмену оттуда.
- `blockNetwork()` экспортируется — для набора тестов, которому блокировка нужна точечно.
- Если `blockNetwork` вызван дважды, действует режим последнего вызова. Опция `blockNetwork` в
  `setupAutoSpy` тоже считается вызовом. Поэтому спека с `blockNetwork({ xhr: 'reject' })` получит
  `'reject'`, даже если setup-файл просил `'empty'`.
- Пропускаются только URL `data:`. Относительный URL вроде `/config` тоже блокируется: DOM
  разрешает его относительно origin страницы.
- `WebSocket` и `EventSource` не блокируются. Для них есть
  [`stubConstructor`](/ru/utilities/constructor-doubles).

**Частая ошибка:** возвращать из заглушки `fetch` самодельный
`{ ok: true, json: async () => data } as Response`. Используйте
[`stubResponse`](#answering-a-stubbed-fetch-—-stubresponse).

### Ответ заглушенному `fetch` — `stubResponse` {#answering-a-stubbed-fetch-—-stubresponse}

`stubResponse(init)` создаёт настоящий `Response` для заглушки `fetch`, без приведения типов.

```ts
import { stubResponse } from 'vitest-auto-spy/setup';

vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ body: { id: 1, name: 'Ada' } }));
vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ ok: false, status: 404 }));
```

| Поле         | По умолчанию                     | Смысл                                                                                             |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `body`       | без тела                         | объект, массив, число, boolean или `null` становятся JSON с `application/json`; прочее — как есть |
| `status`     | `200`, или `500` при `ok: false` | статус; недопустимый для платформы (`0`, `600`) бросает ошибку самой платформы                    |
| `ok`         | выводится из `status`            | сокращение для класса статуса; `ok`, не согласный со `status`, бросает ошибку                     |
| `statusText` | `''`                             | как передан                                                                                       |
| `headers`    | —                                | любой `HeadersInit`; `content-type` отсюда важнее JSON-ового                                      |
| `url`        | `''`                             | что возвращает `response.url`; fetch-бэкенд Angular считает это URL запроса                       |

Правила для тела:

- Строка отправляется как есть, а не как JSON-строка.
- `null` — это JSON `null`. `undefined` или отсутствие `body` означает «без тела».
- `Blob`, `ArrayBuffer`, типизированные массивы, `FormData`, `URLSearchParams` и `ReadableStream`
  уходят в конструктор без изменений. Под jsdom передавайте строку или байты вместо `Blob` и
  `FormData`: `Response` из Node не умеет читать их версии из jsdom.
- `{ body: null, status: 204 }` бросает ошибку: у 204, 205 и 304 тела нет.

```ts
await stubResponse({ body: null }).json(); // → null, content type application/json
await stubResponse({ body: undefined }).text(); // → '', без content type, .json() отклоняется
await stubResponse({}).text(); // → то же: опущенное тело — это отсутствие тела
```

**Частая ошибка:** `stubResponse({ ok: true })` ради JSON-тела `{ ok: true }`. `ok` — поле
`stubResponse`, оно задаёт статус; JSON передаётся в `body`: `stubResponse({ body: { ok: true } })`.

**Частая ошибка:** `mockResolvedValue(stubResponse(…))` отдаёт один и тот же объект на каждый вызов,
а тело читается только один раз. Второй `response.json()` отклоняется с «Body is unusable».
Создавайте ответ на каждый вызов:

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stubResponse({ body: user }));
```

Работает везде, где есть глобальный `Response`: Node, jsdom (использует `Response` из Node),
happy-dom, Bun и `node:test`. В других местах бросает `TypeError` с именем отсутствующего
конструктора. Каждая ошибка заканчивается исправлением и ссылкой на этот раздел.

### Рядом с MSW {#next-to-msw}

`blockNetwork` работает рядом с `setupServer()` из [MSW](https://mswjs.io). Пока `fetch` держит
перехватчик из `@mswjs/interceptors` (`setupServer()` из MSW или nock 14), `blockNetwork` не трогает
`fetch`. После `server.close()` блокировка `fetch` возвращается.

| Запрос                               | MSW обработал | MSW не обработал                   |
| ------------------------------------ | ------------- | ---------------------------------- |
| `fetch`, `HttpClient` (fetch)        | ответ MSW     | решает `onUnhandledRequest` из MSW |
| `XMLHttpRequest`, `HttpClient` (XHR) | ответ MSW     | заблокирован, с URL в сообщении    |

Так что под MSW судьбу необработанного `fetch` решает MSW. Одного `onUnhandledRequest: 'error'` мало:
он пропускает каждый URL, похожий на статический файл (`.svg`, `.png`, шрифты, `.css`, `.js`,
`.json`). Зарегистрируйте последним обработчик на всё:

```ts
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const server = setupServer(
  ...handlers,
  http.all('*', () => HttpResponse.error()), // всё, что пропустили обработчики выше, падает без сети
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`server.use(…)` в спеке добавляет обработчики в начало, поэтому обработчик на всё остаётся последним.
`resetHandlers()` его сохраняет: он передан в `setupServer`. Оставьте и `blockNetwork: true`: он
закрывает `sendBeacon` и файлы, которые сервер не запускают.

## 6. Как вернуть глобалы таймеров, которые фейки унесли с собой {#_6-putting-back-timer-globals-the-fakes-took-with-them}

Включено по умолчанию (`restoreTimerGlobals`). После каждого теста возвращает глобалы таймеров
(например, `Date`), которые удалило снятие фейковых таймеров. Значение, которое спека поставила
намеренно, не перезаписывается.

В DOM-среде `vi.useRealTimers()` может удалить глобал вместо восстановления. В happy-dom он удаляет
`Date`. При `isolate: false` следующий файл падает внутри `useFakeTimers` самого Vitest:

```text
TypeError: Cannot read properties of undefined (reading 'now')
 ❯ hijackMethod node_modules/@sinonjs/fake-timers/src/fake-timers-src.js
 ❯ Object.useFakeTimers node_modules/vitest/dist/chunks/vi.js
 ❯ src/app/billing/invoice.component.spec.ts:24:6
```

Файл в этом стеке — просто тот, что выполнялся следующим.

```ts
import { getWatchedTimerGlobals, restoreTimerGlobals } from 'vitest-auto-spy/setup';

restoreTimerGlobals(); // безопасно в любой момент и сколько угодно раз
getWatchedTimerGlobals(); // имена, захваченные в этой среде
```

Настоящие глобалы запоминаются при первом импорте библиотеки, раньше, чем спека успеет поставить
фейки. [`setupFakeTimers()`](./fake-timers) делает ту же починку в своём `afterEach`, с
`setupAutoSpy()` или без него.

## 7. Как назвать файл, запечатавший глобал {#_7-naming-the-file-that-sealed-a-global}

Выключено по умолчанию (`guardGlobals: 'off'`). Если включить, сообщает о тесте, который добавил
глобальному объекту свойство, которое потом уже никто не удалит.

`Object.defineProperty(document, 'cookie', { value, writable: true })` — частый способ подменить
глобал браузера. Он делает свойство неконфигурируемым, потому что `configurable` по умолчанию
`false`. При `isolate: false` это свойство наследует каждый следующий файл воркера, и ничто не
указывает на файл-виновник.

```ts
setupAutoSpy({ guardGlobals: 'throw' }); // или 'warn', пока чистите большой набор тестов
```

```text
[vitest-auto-spy] "app info > reads the cookie" (src/app/diagnostics/app-info.spec.ts) redefined document.cookie as non-configurable (Object.defineProperty defaults configurable to false), so no later file can put it back.
Patch it with mockValueProp(document, 'cookie', value) instead: it records what it replaced and undoes it after the test.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_7-naming-the-file-that-sealed-a-global
```

Исправление в отчёте зависит от того, что определили: для значения — `mockValueProp`, для геттера —
`mockReadonlyPropGetter`, для геттера с сеттером — `mockAccessorsProp`.

**Что проверяется:** `globalThis`, `document`, `navigator`, `location`, `screen` и прототипы
`Element`, `HTMLElement`, `HTMLCanvasElement`, `HTMLMediaElement`, `Node` и `EventTarget`.
Ключи-символы тоже.

**Чего не видно:** существующее свойство, переопределённое на месте с `configurable: false`.
Проверка сообщает только о новых свойствах, которые нельзя удалить, — так обычно и выглядит такая
заглушка.

`guardGlobalPatches(reaction)` экспортируется, чтобы поставить ту же проверку точечно.

Как и когда идёт проверка: [Подробнее](#global-guard-in-depth).

## 8. Как падать на реджекте, который проглотил zone.js {#_8-failing-on-a-rejection-zone-js-swallowed}

Выключено по умолчанию (`strayRejections: false`). Если включить, отклонённый промис, который никто
не обработал, роняет тест, а не проходит молча. Опция для Angular-проектов, где загружен zone.js.

zone.js подменяет глобальный `Promise`. Необработанный реджект он печатает через `console.error` и
на этом всё. Vitest о нём не узнаёт, и файл проходит. Так прячутся обычные ошибки:

```ts
it('renders once compiled', () => {
  TestBed.compileComponents().then(() => expect(component.ready).toBe(true)); // не выполнится
});
```

Тест заканчивается раньше колбэка, и упавшая проверка превращается в необработанный реджект. То же
бывает с `async`-хелпером без `await` и с ошибкой внутри `import('…').then(…)` в коде приложения.

```ts
import 'zone.js';

import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strayRejections: true });
```

```text
[vitest-auto-spy] 1 promise rejection went unhandled in "TaskListComponent > renders once compiled", and zone.js swallowed it into console.error:
  - AssertionError: expected false to be true
An assertion that settles after its test has ended cannot fail it, so that test passed without it. Return or await the promise — `.then(() => expect(…))` or an async helper called without await is the usual cause.
```

Отчёт называет тест, в котором реджект всплыл. Это может быть более поздний тест, чем тот, что его
создал. Совет в конце зависит от вида ошибки: для упавшей проверки и для брошенной ошибки он разный.

Что важно:

- **zone.js уже должен быть загружен.** Библиотека его не импортирует. Импортируйте `zone.js` в
  начале setup-файла или используйте билдер `@angular/build:unit-test`, который его загружает. Без
  zone.js вызов бросает ошибку.
- **Нативные реджекты не затрагиваются.** На них Vitest падает и так. Библиотека не добавляет
  слушатель `process.on('unhandledRejection')`: второй слушатель заглушил бы слушатель Vitest.
- **Реджект, о котором Vitest уже сообщил, второй раз не показывается.** Упавшая проверка в
  `async`-тесте видна один раз — как падение теста.

Части тоже экспортируются. Каждая принимает тот же необязательный хост, что и функции для таймеров:

```ts
import { countStrayRejections, flushStrayRejections, trackStrayRejections } from 'vitest-auto-spy/setup';

const stop = trackStrayRejections(); // повторный вызов безопасен; отмена возвращает прежний обработчик

afterEach(() => {
  const stray = flushStrayRejections(); // { reason, assertion, testName }[], и список снова пуст

  expect(stray).toEqual([]);
});
```

`countStrayRejections()` бросает ошибку, если отслеживания нет. `flushStrayRejections()` в этом
случае возвращает пустой массив, поэтому оставшаяся уборка не падает после выключения опции.

**Частая ошибка:** читать только `countStrayRejections()`. Счётчик ничего не очищает, и пойманные
ошибки копятся весь воркер. Читайте через `flushStrayRejections()` или доверьте это `setupAutoSpy()`.
См. [Два буфера, которые вычерпывает уборка](#the-two-buffers-teardown-drains).

Правило линтера [`no-floating-assertion`](/ru/utilities/eslint-plugin) ловит самый частый случай ещё
до запуска.

## 9. Подрезка реестра моков, который никто не опустошает {#_9-pruning-the-mock-registry-nothing-empties}

Выключено по умолчанию (`pruneMockRegistry: false`). Держит большой прогон с `isolate: false`
быстрым и лёгким по памяти.

Vitest добавляет каждый `vi.fn()` и `vi.spyOn()` в один внутренний список, чтобы до них дотянулся
`vi.clearAllMocks()`. Оттуда их никто не удаляет. При `isolate: false` список растёт весь прогон:

- `clearMocks: true` перед каждым тестом обходит все моки всех прошлых файлов и к концу прогона
  работает всё медленнее;
- память воркера держит все моки прогона вместе с записанными аргументами.

```ts
setupAutoSpy({ pruneMockRegistry: true }); // оставить только моки, которые живут дольше файла
```

В конце каждого файла удаляются моки, которые этот файл создал в тестах и хуках. Моки, созданные при
импорте модулей, остаются — например, `vi.fn()` в общем `*.mock.ts`. Если до реестра не удаётся
безопасно добраться, ничего не удаляется.

**Частая ошибка:** общий модуль моков, который впервые загрузил динамический `import()` внутри
теста. Его моки выглядят как моки теста и были бы удалены. Пометьте их:

```ts
// fixtures/navigation.mock.ts — его импортируют шесть файлов спек
import { keepMockRegistered } from 'vitest-auto-spy/setup';

export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
```

Как библиотека добирается до реестра и почему такое разделение безопасно:
[Подробнее](#mock-registry-in-depth).

### Моки, которые он оставляет, он же и охраняет {#the-mocks-it-keeps-it-also-guards}

`vi.resetAllMocks()` стирает поведение каждого зарегистрированного мока. `vi.fn()`, получивший
поведение через `.mockReturnValue(…)` или `.mockReturnThis()`, после этого возвращает `undefined`.
При `isolate: false` `vi.resetAllMocks()` в одной спеке ломает общий мок для другого файла:

```
TypeError: Cannot read properties of undefined (reading 'info')
  app.component.ts:316   AppComponent.syncAllProcesses
```

С `pruneMockRegistry` библиотека запоминает поведение каждого оставленного мока. Перед каждым тестом
она возвращает это поведение, если оно пропало. Мок, который тест намеренно изменил, и мок без
поведения она не трогает.

**Частая ошибка:** проверять это через `vi.restoreAllMocks()`. Этот вызов проблему не вызывает, и
проверка выходит зелёной. Вызывает её `vi.resetAllMocks()`.

Части экспортируются, чтобы использовать их отдельно:

| Функция                             | Что делает                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trackMockRegistry()`               | Ставит те же хуки самостоятельно                                                                                                                                |
| `keepRegisteredMocks()`             | Помечает все зарегистрированные сейчас моки как долгоживущие                                                                                                    |
| `keepMockRegistered(mock)`          | Помечает один мок как долгоживущий и возвращает его                                                                                                             |
| `pruneMockRegistry()`               | Одна уборка сейчас; возвращает, сколько удалено                                                                                                                 |
| `restoreLongLivedImplementations()` | Возвращает пропавшее поведение; возвращает, скольким                                                                                                            |
| `getMockRegistrySize()`             | Сколько моков в реестре; `undefined`, если реестр не найден                                                                                                     |
| `captureMockRegistry()`             | Один раз на воркер захватывает реестр моков Vitest; возвращает `Set` или `undefined`, если захват не подтвердился. Попутно очищает записанные вызовы всех моков |
| `resetMockRegistryTracking()`       | Забывает захват и все пометки долгоживущих моков. В воркере не нужна; она для тестов самого отслеживания                                                        |

### Свой подрезчик оставляет сторожевой мок {#a-pruner-of-your-own-keeps-the-sweep-sentinel}

Если вы пишете свою подрезку реестра, оставляйте каждую запись с
`Symbol.for('vitest-auto-spy.sweepSentinel')`. Через этот мок `vi.clearAllMocks()` и
`clearMocks: true` добираются до спаев библиотеки. Удалите его — и они молча перестанут очищаться.

```ts
for (const mock of captured) {
  if (Symbol.for('vitest-auto-spy.sweepSentinel') in mock) continue; // уборка библиотеки
  if (!keep.has(mock)) captured.delete(mock);
}
```

С `pruneMockRegistry: true` или `trackMockRegistry()` в том же прогоне библиотека возвращает
сторожевой мок перед каждым тестом и один раз на воркер предупреждает:

```text
[vitest-auto-spy] Something removed this library's sweep mock from Vitest's mock registry — most likely a hand-written registry pruner. It has been put back: without it vi.clearAllMocks() and clearMocks: true stop clearing every spy this library builds.
Make the pruner keep any entry that carries Symbol.for('vitest-auto-spy.sweepSentinel'), or use setupAutoSpy({ pruneMockRegistry: true }).
```

Эта починка работает только в Vitest 4 и более ранних версиях. Набор тестов, который подрезает реестр только
своим кодом, починки не получает; такой подрезчик находит `doctor` —
[`mock-registry-capture-drops-sentinel`](./cli#mock-registry-capture-drops-sentinel). В Vitest 5
захват реестра можно убрать совсем.

## 10. Строгие спаи для всего набора тестов {#_10-strict-doubles-for-the-whole-suite}

Выключено по умолчанию (`strict: false`). Если включить, каждый спай, созданный после этого,
бросает ошибку, когда вызывают метод, который никто не настроил. Без опции метод возвращает
`undefined`, и тест падает позже, далеко от причины.

```ts
setupAutoSpy({ strict: true }); // ненастроенный метод бросает ошибку и называет себя
```

Ошибка называет класс, метод и аргументы. Тот же переключатель для одного спая —
`createSpyFromClass(UserService, { strict: true })`.

| Опция               | Тип                              | По умолчанию | Смысл                                                                  |
| ------------------- | -------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `strict`            | `boolean` \| `'survey'`          | `false`      | Ненастроенные вызовы бросают ошибку; `'survey'` только считает их      |
| `onUnstubbedCall`   | `(call) => unknown`              | —            | Вызывается на ненастроенный вызов; результат становится ответом        |
| `unconfiguredReads` | `'off'` \| `'warn'` \| `'throw'` | `'off'`      | Сообщает о геттерах и потоках строгого спая, которые никто не настроил |
| `onUnstubbedRead`   | `(read) => void`                 | —            | Получает эти находки вместо отчёта — для обзора                        |

Собственная настройка спая важнее, в том числе явный `strict: false`. Так можно освободить одну
большую зависимость.

`onUnstubbedCall` позволяет записать пробелы до того, как включить ошибку:

```ts
setupAutoSpy({ onUnstubbedCall: ({ className, method }) => console.warn(`unstubbed ${className}.${method}`) });
```

Ненастроенный геттер строгого спая всё равно возвращает `undefined`, а observable-свойство без
данных ничего не выдаёт. `unconfiguredReads` сообщает о них после теста:

```ts
setupAutoSpy({ strict: true, unconfiguredReads: 'warn' }); // по умолчанию 'off'; 'throw' роняет тест
```

Что считается настроенным и полный порядок приоритетов —
[Строгий режим](/ru/core/strict-mode#reads-nobody-configured).

**Попробовать на части набора тестов** можно через переменную окружения `VITEST_AUTO_SPY_STRICT`.
Она принимает `1`/`true`, `0`/`false` и `survey` и важнее опции `strict`. Другие значения
игнорируются.

```bash
VITEST_AUTO_SPY_STRICT=1 npx vitest run src/app/cards   # строго на этот прогон; 0 выключает
```

**`strict: 'survey'`** (или `VITEST_AUTO_SPY_STRICT=survey`) — шаг перед `true`. Ничего не падает.
В конце каждого файла в stderr выводится список вызовов и чтений, которые строгий режим отклонил бы:

```
[vitest-auto-spy] strict survey — src/app/cards/card.component.spec.ts: what strict mode would have refused.
Calls nobody configured (seed them in `returns`, or `registerAutoSpyDefaults` in the setup file):
  NotificationsService.open ×12
  SvgIconService.getIcon ×4
```

Спай, созданный без класса и без `name`, указан строкой, где его создали:
`createAutoMock(card.component.spec.ts:42)`. Второй `setupAutoSpy()` в другом setup-файле тоже
работает.

Опция действует в пределах файла, который её задал: в его `afterAll` она снимается. Простой
`setupAutoSpy()` без `strict` и `onUnstubbedCall` не трогает уже заданное значение.

## 11. Бюджет хуков, которого у Jest был всего один {#_11-the-hook-budget-jest-had-only-one-of}

Включено по умолчанию (`hookTimeoutHint`). Когда `beforeEach` упирается в таймаут, потому что
`hookTimeout` меньше `testTimeout`, к ошибке добавляется фраза об этом.

В Jest один таймаут на хуки и тесты. В Vitest есть отдельный `hookTimeout`, по умолчанию 10 000 мс.
Набор тестов, который перенёс из Jest `testTimeout: 30000`, даёт хукам треть времени. Vitest при этом
приписывает таймаут хука тесту (`× should create 10045ms`), и это похоже на медленный тест.
Подсказка добавляет:

```text
[vitest-auto-spy] hookTimeout is 10000ms while testTimeout is 30000ms, so this hook ran on a smaller budget than the test body it prepares — Vitest resolves `hookTimeout` on its own and defaults it to 10000ms. Set `hookTimeout` next to `testTimeout` in the runner config.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_11-the-hook-budget-jest-had-only-one-of
```

Исправление — в конфиге Vitest:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

Подсказка молчит, если бюджеты равны, и для хука со своим лимитом (`beforeEach(fn, 300)`). С
`beforeAll` она не помогает: такой таймаут Vitest показывает как упавший набор и `afterEach` не
запускает.

```ts
setupAutoSpy({ hookTimeoutHint: false }); // выключить
```

**Частая ошибка:** после переезда с Jest большинство файлов помечены медленными. Это
`slowTestThreshold`: в Jest `5` секунд, в Vitest `300` миллисекунд. Меняется только отчёт.

## 12. Таймаут, который объясняют часы, а не код {#_12-a-timeout-the-clock-explains-not-the-code}

Включено по умолчанию (`frozenClockHint`). Когда тест упирается в таймаут при установленных
фейковых таймерах, а на них ждут колбэки, подсказка говорит, что часы никто не сдвинул.

Под фейковыми таймерами `await new Promise((r) => setTimeout(r, 10))` сам не завершится. Vitest
сообщает обычный таймаут и советует увеличить его, а это не поможет:

```text
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument …
```

Подсказка добавляет настоящую причину:

```text
[vitest-auto-spy] the clock is frozen and 1 callback is queued on it, so this did not run out of time — nothing advanced the clock, and raising the timeout cannot help. Advance it (`await vi.advanceTimersByTimeAsync(ms)`, `await vi.runAllTimersAsync()`) or use real timers for this test.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_12-a-timeout-the-clock-explains-not-the-code
```

Она молчит, если часы настоящие или очередь фейковых часов пуста. Если среди ждущих колбэков есть
`setImmediate`, добавляется фраза о нём.

**Частая ошибка: HTTP-спека зависает.** `vi.useFakeTimers()` по умолчанию подменяет `setImmediate`.
Express отвечает на несовпавший маршрут через `setImmediate`, поэтому 404 так и не отправляется. В
таком файле «тест завис» значит «маршрут не совпал». Уберите `setImmediate` из `toFake`: см.
[Фейковые таймеры](./fake-timers#taking-setimmediate-out-of-tofake).

Особенно это важно с [`globalFakeTimers`](#fake-timers-for-the-whole-run): там в спеке нигде не
сказано, что часы фейковые.

```ts
setupAutoSpy({ frozenClockHint: false }); // выключить
```

Спеку, чей собственный `afterEach` вызывает `vi.useRealTimers()`, подсказка не видит: этот хук
выполняется раньше, и часы уже настоящие. Отчёта тогда нет.

## 13. Версия билдера, которая ест память, названная прямо в прогоне {#_13-the-builder-version-that-eats-memory-named-in-the-run}

Включено по умолчанию (`angularBuildHint`). Под `@angular/build:unit-test` версий
`>=22.1.5 <22.1.7` выводит одну строку в stderr, один раз на воркер. Эти версии собирают тесты без
разделения кода, и `--coverage` занимает память, пока прогон не убьют. Обновите `@angular/build`,
чтобы это исправить.

```ts
setupAutoSpy({ angularBuildHint: false }); // выключить
```

Вне билдера, вне этих версий и там, где установленную версию не прочитать, строка не выводится. Ту же
проблему показывает [проверка `doctor`](/ru/utilities/cli#doctor-—-defects-that-never-fail)
`angular-build-splitting-off`, а объясняет
[гайд по unit-test-билдеру Angular](/ru/guides/angular-unit-test-builder#when-the-unit-test-build-has-code-splitting-off).

`isAngularUnitTestBuilder()` говорит, идёт ли прогон под этим билдером. Используйте её в setup-файле,
который запускают и билдер, и обычный Vitest. Билдер настраивает `TestBed` раньше любого setup-файла,
и второй `initTestEnvironment()` бросил бы «Cannot set base providers because it has already been
called»:

```ts
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
// или ваш собственный вызов initTestEnvironment()
import { isAngularUnitTestBuilder, setupAutoSpy } from 'vitest-auto-spy/setup';

if (!isAngularUnitTestBuilder()) {
  setupTestBed(); // только обычный Vitest; билдер это уже сделал
}

setupAutoSpy();
```

**Частая ошибка:** билдер выполняет этот файл, только если цель перечисляет его в `setupFiles`.
[`doctor`](/ru/utilities/cli#doctor-—-defects-that-never-fail) сообщает `builder-setup-unreached`,
когда это не так.

Как библиотека узнаёт билдер и читает версию: [Подробнее](#angular-build-hint-in-depth).

## 14. Web Storage, которое раннер так и не передал {#_14-web-storage-the-runner-never-handed-over}

Включено по умолчанию (`restoreWebStorage`). Следит, чтобы `localStorage` и `sessionStorage`
работали под jsdom и happy-dom. На новых версиях Node Vitest не копирует их из DOM-среды:

| Node  | `localStorage` под Vitest   |
| ----- | --------------------------- |
| 24.19 | работает                    |
| 25.9  | `setItem is not a function` |
| 26.7  | `undefined`                 |

Падают только спеки, которые трогают хранилище, поэтому обычно это выглядит как «CI перешёл на
новый Node, и умерли несвязанные спеки».

Починка записывает тестовый ключ, читает его и удаляет. Хранилище, которое это выдержало, не
трогается, так что ваша собственная заглушка остаётся. Не выдержавшее заменяется: хранилищем самого
окна, если это отдельный объект, иначе простым хранилищем в памяти. В среде `node` ничего не
ставится: там Web Storage нет.

```ts
import { restoreWebStorage } from 'vitest-auto-spy/setup';

restoreWebStorage(); // безопасно в любой момент и сколько угодно раз
restoreWebStorage({ view: null }); // «окна нет»: ничего не ставит
```

Почему Vitest теряет хранилище: [Подробнее](#web-storage-in-depth).

### Хранилище, которое спека ставит себе сама — `stubWebStorage` {#stub-web-storage}

`stubWebStorage(name, options?)` из `vitest-auto-spy/dom-stubs` ставит свежее хранилище на один
тест. Используйте его, когда спеке нужно пустое или заранее заполненное хранилище и его содержимое в
виде обычного объекта. В `setupAutoSpy()` оно не входит.

```ts
import { type WebStorageStub, stubWebStorage } from 'vitest-auto-spy/dom-stubs';

let local: WebStorageStub;

beforeEach(() => {
  local = stubWebStorage('localStorage', { items: { token: 'abc' } }); // или 'sessionStorage'
});

it('forgets the token on logout', () => {
  session.logout();

  expect(local.snapshot()).toEqual({});
});
```

- `getItem`, `setItem`, `removeItem`, `clear`, `key` и `length` ведут себя как у платформы. Ключи и
  значения приводятся к строкам.
- `snapshot()` возвращает копию, а не живое представление.
- Хранилище ставится на `globalThis`, а также на `document.defaultView`, если это отдельный объект.
  Используется `mockValueProp`, поэтому `restoreMockedProps()` после теста возвращает прежнее
  хранилище.
- В отличие от починки, заглушка заменяет то, что есть, и ставится и в среде `node`.

Доступ по имени свойства (`localStorage.token`, `Object.keys(localStorage)`), события `storage` и
квота не поддерживаются.

**Частая ошибка:** ставить заглушку в `beforeAll`. После первого теста её снимут. Ставьте в
`beforeEach`.

## 15. Ключ на `Object.prototype`, из-за которого прогон перестаёт собирать тесты {#_15-the-key-on-object-prototype-that-stops-the-run-collecting}

Включено по умолчанию (`prototypePollution: 'throw'`). Снимает перечисляемый ключ, который тест
оставил на `Object.prototype`, `Array.prototype` или `Function.prototype`, и сообщает о нём.

Такой ключ ломает Vitest, пока тот собирает тесты следующего файла:

```text
TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function
```

Стека нет. При `isolate: false` не собирается ни один следующий файл воркера. Итог может показать
ноль упавших тестов над кодом, который не выполнялся.

```ts
setupAutoSpy(); // prototypePollution: 'throw'; 'warn' снимает ключ и только сообщает
```

```text
[vitest-auto-spy] "CheckoutOpenService > closes on destroy" (src/app/checkout/checkout-open.service.spec.ts) left "ngOnDestroy" (a function) on Object.prototype as an enumerable property.
It has been taken off: left there, it stops every later spec file in this worker from collecting. Define it on the prototype of the class it belongs to, or with enumerable: false.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_15-the-key-on-object-prototype-that-stops-the-run-collecting
```

Отчёт называет тест и вид значения, путь — от корня проекта. Ключ, найденный в конце файла вне
теста, приписывается файлу.

**Частая ошибка:** патчить `Object.getPrototypeOf(instance)`, когда `instance` — обычный объект,
например провайдер `useValue` или спай. Его прототип — сам `Object.prototype`:

```ts
const proto = Object.getPrototypeOf(instance); // для обычного объекта это Object.prototype
proto['ngOnDestroy'] = function () { … };      // теперь свойство есть у каждого объекта
```

Патчите прототип класса этого объекта.

Ключи, которые в среде уже были, например ваш полифил, не трогаются. Ключ, записанный в
собственном `beforeAll` или `afterAll` файла, тоже попадает в отчёт.
`guardPrototypePollution(reaction)` ставит ту же проверку отдельно.

### Ключ, который оставил предыдущий файл {#the-key-an-earlier-file-left-behind}

Ключ, записанный во время импорта файла спеки, сбора его тестов или в его `afterAll`, ускользает от
хуков этого файла. Тогда падает следующий файл. Поэтому `setupAutoSpy()` проверяет прототипы ещё и
при каждом запуске setup-файла, до сбора следующего файла. Он снимает то, что оставил прошлый файл,
и пишет в stderr:

```text
[vitest-auto-spy] "ngOnDestroy" was left on Object.prototype by the previous spec file of this worker, src/app/checkout/checkout-open.service.spec.ts — while it was imported, collected or in an afterAll — and has been taken off.
Left on, the key stops every later spec file in the worker from collecting: Vitest walks a file's hooks with for…in. In that file, patch the prototype of the class an object came from, never Object.getPrototypeOf(someObjectLiteral).
```

Названный файл — тот, чей setup выполнялся перед этим в том же воркере. Эта проверка никогда не
бросает ошибку: ключ записал не текущий файл. Ключ, который нельзя удалить, принимается в базовую
линию, и вы услышите о нём один раз.

Это может сделать только вызов из setup-файла; `guardPrototypePollution` в файле спеки не может.

## 16. Вывод в консоль, который никто не поглотил {#_16-console-output-nothing-absorbed}

Выключено по умолчанию (`strayConsole: 'off'`). Если включить, тест, который пишет в консоль, а
спая для этого вывода нет, падает. Вывод зелёного теста — это либо баг, который никто не проверил,
либо шум, за которым не видно следующего настоящего падения.

```ts
setupAutoSpy({ strayConsole: 'throw' });
```

```text
[vitest-auto-spy] "CartService > reports a failed load" wrote to console.error 1 time and nothing absorbed it:
  - console.error: Error: load failed {"id":7}
      at CartService.load (src/app/cart.service.ts:41:15)
Absorb what the test expects — useConsoleSpies() in the describe, then assert consoleErrorSpy — or fix the code if the output is a defect.
```

Ожидаемый вывод поглощайте спаями [`/console`](./console) и проверяйте их. `useConsoleSpies()` в
`describe` ставит их перед каждым тестом и снимает после:

```ts
import { consoleErrorSpy, useConsoleSpies } from 'vitest-auto-spy/console';

describe('CartService', () => {
  useConsoleSpies();

  it('reports a failed load', () => {
    service.load();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error), { id: 7 });
  });
});
```

Чтобы покрыть сразу все тесты файла, один раз вызовите `installConsoleSpies()` в начале файла.

| Опция      | Тип                              | По умолчанию | Смысл                                                        |
| ---------- | -------------------------------- | ------------ | ------------------------------------------------------------ |
| `reaction` | `'throw'` \| `'warn'` \| `'off'` | `'throw'`    | В объектной форме; `'warn'` печатает, не роняя тест          |
| `allow`    | `(string \| RegExp)[]`           | `[]`         | Вывод, который можно пропустить; строка ищется как подстрока |

**Что поглощает вывод:**

| В тесте                                                              | Результат                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `installConsoleSpies()` из `vitest-auto-spy/console`, затем проверка | поглощено; спай не передаёт вызов дальше                |
| `vi.spyOn(console, 'error').mockImplementation(() => undefined)`     | поглощено                                               |
| `vi.spyOn(console, 'error')` без реализации                          | **лишний вывод**; спай записывает вызов, потом печатает |
| ничего                                                               | **лишний вывод**                                        |

**Что считается выводом:** `log`, `info`, `warn`, `error`, `debug`, `trace`, `table`, `dir`,
`dirxml`, `timeLog`, `timeEnd`, `count`; `group` / `groupCollapsed` — только с меткой; `assert` —
только при ложном условии. `time`, `groupEnd` и `countReset` ничего не печатают и не отслеживаются.
Вывод прямо в `process.stdout` или `process.stderr` не виден.

**Отчёт.** Он цитирует метод и до трёх строк вывода (по 200 символов, пять вызовов, потом
`… and N more`). Если при обрезке пропал URL, первый пропавший URL дописывается. Отчёт показывает
первый кадр стека вне `node_modules`, а для вывода зависимости — прямого вызывающего. Для каждого
метода он называет нужный спай (`consoleErrorSpy`, `consoleWarnSpy`, …). Для
`vi.spyOn(console, 'error')` без реализации он пишет:
`vi.spyOn(console, 'error') calls through — add .mockImplementation(() => undefined).`

**Вывод вне теста** роняет файл в `afterAll`. Это вывод во время импорта, в `beforeAll` /
`afterAll`, из колбэка, сработавшего после конца теста, или в тесте, чей `afterEach` не выполнился.
Отчёт называет момент (`while the file was being imported`, `in a beforeAll`,
`after a test had ended`) и даёт совет для него. Для вывода при импорте он называет модуль и строку,
которую нужно исправить. Только если эта строка внутри `node_modules`, он предлагает `allow`. При
`isolate: false` вывод при импорте приписывается первому файлу воркера, который импортирует этот
модуль.

**Известные причины объясняются** в строке `Likely cause:`. Например, `NG0912` из Angular значит, что
в бандле две копии одного компонента:

```text
[vitest-auto-spy] src/app/checkout.component.spec.ts wrote to console.warn 1 time while the file was being imported and nothing absorbed it:
  - console.warn: NG0912: Component ID generation collision detected. Components 'UiRadioGroupComponent' and '_UiRadioGroupComponent' … https://angular.dev/errors/NG0912
      at Function.<static_initializer> (src/app/ui/radio-group.component.ts:210:44)
Likely cause:
  - Angular gave `UiRadioGroupComponent` and `_UiRadioGroupComponent` (selector `ui-radio-group`) one component id, so the bundle holds two copies of one component — … Import the component from one place.
Written while src/app/ui/radio-group.component.ts was evaluated, before any hook — no spy can absorb it; fix it at src/app/ui/radio-group.component.ts:210:44. Under isolate: false it is reported on the first file of the worker that imports that module.
```

Для любого другого кода Angular `NGxxxx` отчёт даёт ссылку, которую напечатал Angular.

**Что ещё:**

- Каждый метод консоли, который тест подменил, после теста возвращается. Подменённый в теле
  `describe`, в `beforeAll` или на уровне модуля — после файла.
- Пока проверка включена, импорт `vitest-auto-spy/console` ничего не ставит. Ставьте спаи через
  `installConsoleSpies()`, как показано выше. Спаи, поставленные более ранним импортом, снимаются,
  когда проверка включается. Файл, который импортирует спай, но не ставит его, получает падение и
  фразу с исправлением.
- Собственные предупреждения библиотеки лишним выводом не считаются: `propsOutsideHooks`,
  `guardGlobals`, `prototypePollution`, `unconfiguredReads`, строгий вызов, ошибку которого проглотил
  тест, отчёт о копиях, отчёты о неверной настройке, подстраховка уборки из раздела 1 и уведомление о
  `test.concurrent`. Под `strayConsole: 'throw'` они остаются предупреждениями. `vi.spyOn(console, 'warn')` в вашем тесте по-прежнему их ловит. Чтобы
  они падали в месте вызова, есть
  [`misconfiguration: 'throw'`](#misconfiguration-reports-that-fail-at-the-call).
- Больше ничего не меняется: вывод по тестам в Vitest, `onConsoleLog` и вывод упавших тестов прежние.
- Консоль самой DOM-среды (консоль страницы happy-dom, виртуальная консоль jsdom) тоже
  отслеживается. Например, `Not implemented: navigation` приписывается тесту, который это вызвал, со
  строкой `Likely cause:`.
- Называется тот файл, который написал вывод, даже если отчёт перед ним упал.
- С включённым `strayRejections` реджект, проглоченный zone.js, печатается через `console.error`.
  Первым идёт отчёт о реджекте, и он побеждает.

**`allow` — крайняя мера.** Только для шума среды, до которого не дотянется ни одна спека, и никогда
для вывода вашего кода:

```ts
setupAutoSpy({ strayConsole: { allow: ['Download the React DevTools', /^Lit is in dev mode/] } });
```

RegExp ищется по строке, флаги `g` / `y` ни на что не влияют. `{ reaction: 'warn' }` помогает
оценить большой набор тестов, прежде чем включать проверку. `guardStrayConsole(reaction)` ставит ту
же проверку отдельно.

**Частая ошибка: `NG0912` при `isolate: false` и сбросе графа модулей.** Когда Angular-набор тестов
заново вычисляет бандлы спек между файлами, Angular печатает `NG0912` при импорте, и ни одна спека не
может это поглотить. Разрешите только его: `allow: [/NG0912/]`. По умолчанию он не разрешён: без
сброса он указывает на настоящий дубликат.

### Iframe, который под happy-dom должен остаться незагруженным {#an-iframe-that-must-stay-unloaded-under-happy-dom}

happy-dom 20 не умеет оставить iframe с удалённым `src` одновременно незагруженным и тихим.
`disableIframePageLoading` пишет `NotSupportedError` на каждый iframe (и вызывает `error`).
`navigation.disableChildFrameNavigation` молчит, но вызывает `load`, и ветку «страница так и не
загрузилась» не достать. Два выхода, оба на файл. Поглотить вывод:

```ts
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { consoleErrorSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies());

it('gives up when the logout page never loads', async () => {
  await service.logout(); // `load` так и не приходит

  expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'NotSupportedError' }));
});
```

Или поставьте `// @vitest-environment jsdom` в начале файла: jsdom оставляет удалённый `src`
незагруженным, тихим и без `load`. Хелпера в `dom-stubs` для этого нет.

## 17. Атрибут, оставленный на общем документе {#_17-an-attribute-left-on-the-shared-document}

Если включить, сообщает о любом атрибуте, который тест добавил, изменил или удалил на `<html>`,
`<head>` или `<body>`, и возвращает его значение, каким оно было до теста. По умолчанию выключено
(`documentPollution: 'off'`); `preset: 'strict'` включает его как `'throw'`.

При `isolate: false` все файлы спек воркера рендерят в один документ. Например, компонент ставит
`data-reset-focus` на `<body>` и не снимает его. Другой сервис выходит раньше, когда совпадает
`[data-reset-focus]`, и его спека падает — но только когда оба файла попали в один воркер.

```ts
setupAutoSpy({ documentPollution: 'throw' }); // 'warn' возвращает документ и только сообщает
```

```text
[vitest-auto-spy] "KeyboardComponent > renders the layout" (libs/keyboard/src/lib/keyboard.component.spec.ts) left the shared document changed:
  - <body> data-reset-focus="" added
It has been put back, because every later spec file in this worker shares this document. Undo it in the teardown of what set it: ngOnDestroy / DestroyRef.onDestroy of the component, or destroy the fixture that owns it.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_17-an-attribute-left-on-the-shared-document
```

Совет про Angular выводится, только если Angular обнаружен. Иначе совет — `afterEach` в спеке или
`afterAll` для изменения вне теста. Изменение в `beforeAll`, которое не откатили, приписывается
файлу.

| Форма                                                         | Что делает                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `'throw'` / `'warn'` / `'off'`                                | Реакция; `'warn'` пишет в stderr и всё равно возвращает документ                           |
| `{ reaction }`                                                | То же; без него `'throw'`                                                                  |
| `{ nodes: true }`                                             | Ещё и дочерние элементы `<head>` и `<body>`: добавленные удаляются, удалённые возвращаются |
| `{ ignoreAttributes: ['aria-hidden', /^data-cdk-/] }`         | Атрибуты, которые не трогать, по точному имени или RegExp                                  |
| `{ nodes: true, ignoreNodes: 'style, link[rel=stylesheet]' }` | Дочерние элементы, которые не трогать, CSS-селектором                                      |

`nodes` по умолчанию выключено. Библиотека, которая вставляет стили при первом импорте, делает это
один раз на воркер, и проверка узлов обвинила бы первый импортировавший тест.

Пустые `class` и `style` считаются отсутствием атрибута. `classList.add`, а потом `classList.remove`
оставляют `class=""`, и об этом не сообщается. Любое другое пустое значение — изменение:
`data-reset-focus=""` — это флаг, который совпадает с `[data-reset-focus]`.

Проверка идёт после того, как `TestBed` уничтожил фикстуры, поэтому то, что компонент убирает при
уничтожении, в отчёт не попадает.

Чего не видно:

- изменения во время импорта файла спеки (оно уже в базовой линии);
- фикстуры, которую держит живой `teardown: { destroyAfterEach: false }`. Она уничтожается в
  следующем тесте, поэтому её остатки приписываются тесту, который её отрендерил. Включите
  `destroyAfterEach` или добавьте атрибут в `ignoreAttributes`;
- `document.title`, фокуса, cookie и `customElements`.

Что обычно находится в Angular-наборе тестов: блокировка прокрутки от незакрытой модалки, класс темы
или платформы, `lang` / `dir` от i18n-сервиса, флаг `data-*` от менеджера фокуса. Закройте или
уничтожьте то, что это поставило. `ignoreAttributes` — только для атрибута, который ставят один раз
намеренно.

`guardDocumentPollution(option)` ставит ту же проверку отдельно.

Почему проверка идёт именно там и сколько стоит: [Подробнее](#document-guard-in-depth).

## 18. Спай на Web Storage, который раннер не может снять {#_18-a-spy-on-storage-the-runner-cannot-take-off}

Включено по умолчанию (`restoreStorageSpies`). В конце каждого файла снимает спаи, оставшиеся на
методах `localStorage` / `sessionStorage`.

Под happy-dom `mockRestore()` для `vi.spyOn(localStorage, 'setItem')` молча ничего не делает. Спай
остаётся, и `vi.spyOn` в следующей спеке получает тот же мок со старыми вызовами. Тогда
«not to have been called» падает через раз.

```ts
setupAutoSpy(); // restoreStorageSpies: true; уборка — в конце каждого файла
```

- Работает на границе файлов, а не тестов: спай из `beforeAll` остаётся на все тесты этого файла.
- `restoreStorageSpies()` выполняет уборку один раз и возвращает починенные хранилища.
- `restoreStorageSpies: false` выключает её — для набора тестов, который намеренно держит спай на
  хранилище весь воркер.
- Снимаются только настоящие моки. Чистое хранилище или намеренная замена не трогаются.

**Частая ошибка:** проверять через `vi.restoreAllMocks()`, снят ли спай. Здесь этот вызов тоже молча
ничего не делает, и проверка выглядит зелёной.

## 19. Слушатели, переживающие свой файл {#_19-listeners-that-outlive-their-file}

Выключено по умолчанию (`strayListeners: false`). Если включить, снимает слушатели `window` и
`document`, которые файл добавил и не убрал. При `isolate: false` они срабатывают в следующем файле,
на моках и DOM, для которых не писались.

```ts
setupAutoSpy({ strayListeners: true });
```

Слушатели, добавленные при импорте модулей (разовая инициализация фреймворка), остаются. Всё, что
файл добавил позже, снимается в конце этого файла.

Чтобы уронить файл вместо тихой уборки:

```ts
setupAutoSpy({ strayListeners: true, onStrayListeners: ({ removed }) => expect(removed).toBe(0) });
```

`onStrayListeners: 'throw'` делает то же с отчётом, где каждый слушатель записан как
`keydown on document, added in "<test>" at <frames[0]>`. У записи есть `type` и `target`, а также те
же поля `test` / `outsideTest`, что у таймера.

Части экспортируются из `vitest-auto-spy/setup`:

| Функция                    | Что делает                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `trackStrayListeners()`    | Оборачивает `addEventListener` / `removeEventListener`; повтор безопасен; возвращает отмену      |
| `baselineStrayListeners()` | Помечает то, что зарегистрировано сейчас, как оставляемое (шаг `beforeAll` по умолчанию)         |
| `removeStrayListeners()`   | Снимает всё, что добавлено после базовой линии; возвращает, сколько                              |
| `countStrayListeners()`    | Сколько ещё висит; бросает ошибку до вызова `trackStrayListeners()`                              |
| `describeStrayListeners()` | Цель, тип, файл спеки и до пяти кадров для каждого лишнего слушателя (список `onStrayListeners`) |

**Частая ошибка:** под jsdom слушатель с `{ once: true }`, который уже сработал, считается, пока его
не снимут. Снимать его безопасно. happy-dom снимает его сам.

Если включён и `strayTimers`, оба отчёта идут после отмены таймеров и снятия слушателей. Оба
выполняются, даже если первый упал. Два падения приходят одним `AggregateError`, и Vitest показывает
их как две ошибки.

## 20. Глобалы, возвращаемые на границе файла {#_20-globals-put-back-at-the-file-boundary}

Выключено по умолчанию (`restoreGlobals: false`). Если включить, в конце файла возвращает каждый
глобал, который этот файл изменил.

`unstubGlobals` откатывает `vi.stubGlobal`, а `restoreMocks` — `vi.spyOn(globalThis, …)`. Обычное
присваивание вроде `global.ResizeObserver = stub` не откатывает ничто. При `isolate: false` его
читает каждый следующий файл.

```ts
setupAutoSpy({ restoreGlobals: true });
```

- Один снимок на воркер, его делает первый вызов `setupAutoSpy`. Снимок делает
  `captureGlobalBaseline()`; её следующие вызовы ничего не делают. `restoreGlobals()` выполняет уборку
  и возвращает изменённые ключи.
- Глобалы, добавленные после снимка, остаются, так что фреймворк, который ставит глобал при импорте,
  его не теряет. Это касается и глобала, которого нет в окружении, например `ResizeObserver` под
  jsdom: тест, который его присвоил, его добавил, и он не снимается. Вызовите
  [`fillMissingDomApis()`](#members-the-dom-environment-leaves-out-filled-before-the-snapshot) до
  `setupAutoSpy()`, чтобы глобал был в снимке и возвращался.
- `location`, `document`, `window`, `frames`, `global`, `parent`, `self` и `top` никогда не
  записываются обратно: присваивание им переходит по адресу или меняет окружение.
- Обёртки самой библиотеки (от `strayTimers`, `strayListeners`) сохраняются. Заглушки `blockNetwork`
  и так снимаются после каждого теста.
- Оставшиеся фейковые часы снимаются до уборки.

`guardGlobals` ([раздел 7](#_7-naming-the-file-that-sealed-a-global)) закрывает то, что эта опция
починить не может: свойство, ставшее неконфигурируемым.

### Члены, которых нет в DOM-среде, заполняются до снимка {#members-the-dom-environment-leaves-out-filled-before-the-snapshot}

Если setup-файл добавляет `PointerEvent` или `ResizeObserver` руками после снимка, `restoreGlobals` и
`guardGlobals` винят в этом первый тест. Сначала вызовите [`fillMissingDomApis()`](./element-stub) из
`vitest-auto-spy/dom-stubs`. Она добавляет то, чего нет в jsdom и happy-dom (`PointerEvent`, пустой
`ResizeObserver`, `scrollTo` / `scrollBy` / `scrollIntoView`, `document.doctype`), только где этого
нет, и возвращает имена добавленного.

```ts
// vitest.setup.ts
import { fillMissingDomApis } from 'vitest-auto-spy/dom-stubs';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

fillMissingDomApis();
setupAutoSpy();
```

## 21. TestBed, оставленный грязным в конце файла {#_21-a-testbed-left-dirty-at-file-end}

Включено по умолчанию (`cleanTestBed: 'warn'`). Как только какая-нибудь спека импортирует
`vitest-auto-spy/angular`, в конце каждого файла проверяется Angular `TestBed`. Ещё настроенный тестовый модуль, живые фикстуры или
спай на методе `TestBed` попадают в отчёт и сбрасываются. Следующий файл начинает с чистого листа.
Без Angular ничего не выполняется.

```ts
setupAutoSpy({ cleanTestBed: 'throw' }); // по умолчанию 'warn', 'off' — пропустить
```

```text
[vitest-auto-spy] src/app/cart.spec.ts left the TestBed dirty: a testing module is still instantiated and 1 fixture still alive; TestBed.inject is still a spy. It has been reset now; under isolate: false the next file in this worker would have inherited it.
```

Состояние `enableAngularDiagnostics` для файла сбрасывается там же.

**Частая ошибка:** в раннере нет глобального `afterEach`. Angular регистрирует свой сброс `TestBed`,
только если глобальный `afterEach` есть. Его даёт любой из вариантов: `globals: true`, `setupTestBed()`
или `setupAngularTestEnv()`. Спай на `TestBed`
снимайте в том тесте, который его поставил: `mockRestore()` или `vi.restoreAllMocks()`.

## Одна оценка на всё — `preset: 'strict'` {#one-grade-for-everything-preset-strict}

`preset: 'strict'` включает все проверки на самом строгом уровне. Опция, переданная в том же объекте,
всё равно важнее, поэтому `{ preset: 'strict', guardGlobals: 'warn' }` ослабляет ровно одну.

```ts
setupAutoSpy({ preset: 'strict' });
```

| Опция                  | Под `preset: 'strict'`                         | По умолчанию без него                       |
| ---------------------- | ---------------------------------------------- | ------------------------------------------- |
| `duplicateCopies`      | `'throw'`                                      | `'throw'`                                   |
| `propsOutsideHooks`    | `'throw'`                                      | `'warn'`                                    |
| `guardGlobals`         | `'throw'`                                      | `'off'`                                     |
| `prototypePollution`   | `'throw'`                                      | `'throw'`                                   |
| `documentPollution`    | `'throw'`                                      | `'off'`                                     |
| `strayConsole`         | `'throw'`                                      | `'off'`                                     |
| `misconfiguration`     | `'throw'`                                      | `'warn'`                                    |
| `swallowedStrictCalls` | `'throw'`                                      | `'throw'` при `strict: true`, иначе `'off'` |
| `cleanTestBed`         | `'throw'`                                      | `'warn'`                                    |
| `strayTimers`          | `true`                                         | `false`                                     |
| `strayRejections`      | `true`, если загружен zone.js, иначе выключено | `false`                                     |

Что не входит в пресет и почему:

- **`strict`**: меняет то, что возвращает ненастроенный вызов. Это решение о том, как вы пишете
  спаи, а не уровень отчёта.
- **`unconfiguredReads`**: сторона чтения у `strict`. На существующем наборе тестов начните с обзора
  (`onUnstubbedRead`).
- **`blockNetwork`**: меняет то, что видит проверяемый код.
- **`restoreMocks`**: снимает и заглушки `vi.spyOn` из `beforeAll`.
- **Падение на лишних таймерах**: падает целый файл. Таймер, поставленный после конца одного файла,
  засчитывается следующему, поэтому упасть может файл, который ничего не ставил. Поле `file` у
  каждого таймера называет настоящего владельца. Сначала прочитайте список `timers`, потом включите
  `onStrayTimers: 'throw'`.
- **`enableAngularDiagnostics()`**: живёт в `vitest-auto-spy/angular/diagnostics` и требует сначала
  окружение `TestBed`. Вызовите его в том же setup-файле.

Сколько пресет стоит на тест — [Производительность](/ru/core/performance).

## Отчёты о неверной настройке, которые падают в месте вызова {#misconfiguration-reports-that-fail-at-the-call}

`misconfiguration: 'throw'` превращает предупреждения библиотеки о неверном использовании её API в
ошибки в месте вызова, со стеком на вашей строке настройки.

```ts
setupAutoSpy({ misconfiguration: 'throw' });
```

Это касается:

- опечатки в `onlyMethodsToSpyOn`;
- `gettersToSpyOn` / `settersToSpyOn`, где указан метод;
- ключа `returns`, которому не соответствует ни один спай (включая `then` и `constructor` у
  `createAutoMock`);
- `injectSpy`, получившего настоящий экземпляр;
- записи в `jasmine.DEFAULT_TIMEOUT_INTERVAL`;
- устаревшего `providedMethodNames`.

По умолчанию каждое из них — `console.warn`, а некоторые печатаются только один раз. `'throw'` падает
при каждом случае. Настройка действует на весь процесс и снимается после файла, который её задал.
Предупреждение `injectSpy` «got a real …» печатается один раз на токен в каждом файле спеки.

## Два буфера, которые вычерпывает уборка {#the-two-buffers-teardown-drains}

Две проверки хранят находки в списке, пока их кто-нибудь не прочитает:

- `trackStrayRejections()` хранит каждый проглоченный реджект вместе с ошибкой и стеком;
- `mockReadonlyProp` и родственные функции хранят каждый патч вместе с объектом и заменённым
  значением.

`setupAutoSpy()` очищает оба после каждого теста. Растут они, только если вы собрали части руками и
читаете их лишь через счётчики. **Счётчик ничего не очищает.** Читайте через
`flushStrayRejections()` / `restoreMockedProps()` или доверьте уборку `setupAutoSpy()`.

Откаченный патч отпускает свой объект и значение. `countMockedProps()` вызывать дёшево.

## Под `test.concurrent` {#under-test-concurrent}

Уборка под `test.concurrent` работает, но проверки консоли и документа могут обвинить не тот тест.
Когда два теста идут одновременно, находка в консоли или документе может достаться соседнему тесту
или стереться раньше, чем её увидят. Первый параллельный тест воркера печатает одно предупреждение:

```text
[vitest-auto-spy] "CartComponent > loads" runs as test.concurrent, and setupAutoSpy()'s per-test guards judge one test at a time: a console or document finding can land on the other test in flight, or be cleared before it is seen.
Run this file's tests sequentially, or give the files that keep test.concurrent a setup with strayConsole: 'off' and documentPollution: 'off'. Said once per worker.
```

Файлы, которым нужны эти проверки, запускайте последовательно, а параллельным файлам дайте setup с
`strayConsole: 'off'` и `documentPollution: 'off'`.

Возврат свойств отслеживается по каждому тесту, поэтому остаётся верным. Отчёт о ненастроенных
чтениях ждёт последнего из параллельных тестов и называет их все
([Чтения, которые никто не настроил](../core/strict-mode#reads-nobody-configured)).

## Как переставлять заглушку на каждый тест {#reinstalling-a-stub-for-every-test}

`installPerTest(install)` ставит заглушку перед каждым тестом и отдаёт функцию, которая возвращает
текущую.

```ts
import { stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';
import { installPerTest } from 'vitest-auto-spy/setup';

const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));

it('loads the section once it scrolls into view', () => {
  fixture.detectChanges();

  expect(observers().last.targets).toEqual([host]);
});
```

Это нужно, потому что каждая заглушка библиотеки снимается после каждого теста. Заглушка,
поставленная один раз в теле `describe` или в `beforeAll`, со второго теста исчезает.

То же с setup-файлом проекта, который ставит заглушки по умолчанию в своём `beforeEach`. Этот хук
выполняется перед каждым тестом, уже после `beforeAll` спеки, и заменяет то, что поставил
`beforeAll`. `beforeEach` в самой спеке выполняется после него и побеждает.

Функция-читатель в каждом тесте возвращает новый объект. Если ничего не установлено, она бросает
`installPerTest: nothing is installed yet` и говорит, когда её вызвали: до первого теста, после конца
теста или из хука, зарегистрированного раньше `installPerTest()`.

## Патч, поставленный не в тот хук, перестаёт действовать {#a-patch-put-in-the-wrong-hook-stops-applying}

Патч `mock*Prop` действует до конца того теста, в котором выполнился. Поэтому патч в теле
`describe` или в `beforeAll` живёт только в первом тесте:

```ts
describe('modal', () => {
  const modal = new Modal();

  mockValueProp(modal, 'onClose', () => 'patched'); // ← выполняется один раз, при сборе тестов

  it('one', () => expect(modal.onClose()).toBe('patched')); // ✅
  it('two', () => expect(modal.onClose()).toBe('patched')); // ❌ 'real'
});
```

Исправление в одну строку: перенесите вызов в `beforeEach`.

`propsOutsideHooks` сообщает об этом: по умолчанию `'warn'`, `'throw'` — упасть на первом тесте,
`'off'` — выключить. При `restoreProps: false` ничего не снимается и ни о чём не сообщается.

```ts
setupAutoSpy({ propsOutsideHooks: 'throw' });
```

```text
[vitest-auto-spy] mockValueProp(…, 'onClose') on an object in src/app/modal.spec.ts ran outside a per-test hook, so the sweep after the first test took it off for good and every later test reads the real member.
Move the call into beforeEach, so it is applied again for each test.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#a-patch-put-in-the-wrong-hook-stops-applying
```

Отчёт называет цель, когда может (`globalThis`, `document`, функция или прототип), и описывает её
иначе (`on an object`, `on a Modal`). Он срабатывает один раз на объект и свойство в каждом файле
спеки.

Без `setupAutoSpy` ту же настройку задаёт `reportPropsOutsideHooks(reaction)` из `vitest-auto-spy`.
Её тип экспортируется как `OutsideHookReaction`.

Почему патч не ставится заново сам: [Подробнее](#why-a-patch-is-not-re-applied).

## Фейковые таймеры на весь прогон {#fake-timers-for-the-whole-run}

`globalFakeTimers` ставит фейковые таймеры на каждый тест и держит их между тестами — как
`fakeTimers: { enableGlobally: true }` в Jest. В Vitest такой настройки нет.

```ts
setupAutoSpy({ globalFakeTimers: true }); // или объект конфига `vi.useFakeTimers()`
```

Опция для набора тестов, перенесённого из Jest-проекта, где был включён `enableGlobally`.

- Передайте конфиг вроде `{ toFake: ['setTimeout', 'Date'] }` вместо `true`, чтобы сузить набор.
- Оба конца защищены: спека, которая сама вызывает `vi.useRealTimers()`, не ломает следующий файл.
- Часы остаются фейковыми и между тестами, поэтому вложенный `beforeAll` не падает с
  `the timers APIs are not mocked`.
- Фейки снимаются окончательно в `afterAll` и не переживают файл.

Для одного `describe`, а не всего прогона, используйте
[`setupFakeTimers(config, { betweenTests: true })`](./fake-timers).

**Частая ошибка:** `true` вместе с настоящим HTTP-обработчиком. `toFake` по умолчанию включает
`setImmediate`, и 404 от Express превращается в 30-секундный таймаут. Передайте конфиг без него: см.
[как убрать `setImmediate` из `toFake`](./fake-timers#taking-setimmediate-out-of-tofake).

С `strayTimers` опция не сочетается: таймеры фейковых часов не считаются (см.
[раздел 4](#_4-cancelling-timers-that-outlive-their-file)).

### Один тест на фейковых таймерах — `withFakeTimers` {#one-test-on-fake-timers-—-withfaketimers}

`withFakeTimers(fn, config?)` из `vitest-auto-spy/setup` выполняет одно тело на фейковых таймерах и
возвращает настоящие, чем бы оно ни закончилось: возвратом, исключением или реджектом. Возвращает то
же, что `fn`, а для асинхронного тела — промис.

```ts
import { advanceTimers, withFakeTimers } from 'vitest-auto-spy/setup';

it('retries after a second', () =>
  withFakeTimers(async () => {
    poller.start();
    await advanceTimers(1_000);
    expect(api.fetch).toHaveBeenCalledTimes(2);
  }));
```

Внутри `setupFakeTimers()` или `globalFakeTimers` она работает на уже установленных фейках и
оставляет их. Переданный там `config` бросает ошибку:

```text
[vitest-auto-spy] withFakeTimers(fn, config) found fake timers already installed, and cannot put them back after installing its own config. Drop the config to run on the installed fakes, or call it outside setupFakeTimers().
```

Поверх `mockSystemTime()` она начинает с подменённого времени и заканчивает на настоящих таймерах.

## Общие фикстуры — это функции, а не константы {#shared-fixtures-are-functions-not-constants}

При `isolate: false` модуль выполняется один раз на воркер. Экспортированный объект с `vi.fn()` —
один набор спаев на все файлы, которые его импортируют. Симптом — 30-секундный таймаут в разном
файле на каждом прогоне. Экспортируйте фабрику:

```ts
// ❌ константа: один набор спаев на весь воркер
export const mockActionContext = { actions: { navigateToSection: vi.fn() } };

// ✅ фабрика: свой набор на каждый вызов
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
```

То же с фикстурой провайдера: `{ provide: X, useValue: { load: vi.fn() } }` — константа, если её не
возвращает функция.

Файл спеки ничего не должен экспортировать. При `isolate: false` экспортирующий файл спеки
импортируют соседи, и он теряет свои тесты. Общие спаи кладите в `*.mock.ts` рядом со спеками.

Правило линтера [`no-shared-module-level-mock`](/ru/utilities/eslint-plugin) находит такие места
само.

## Порядок хуков отличается от Jest {#hook-order-differs-from-jest}

Vitest выполняет хуки `afterEach` от самого внутреннего и последнего зарегистрированного. Jest
выполнял их в порядке объявления. Поэтому в наборе тестов, перенесённом из Jest, уборка setup-файла
идёт раньше собственного `afterEach` спеки. Чтобы вернуть порядок Jest, задайте
`sequence: { hooks: 'list' }` в конфиге Vitest.

## Хуки принадлежат тому файлу, в котором выполнился этот вызов {#the-hooks-belong-to-the-file-this-call-ran-in}

Всё, что ставит `setupAutoSpy()`, — это хуки. Vitest выполняет setup-файл заново перед каждым файлом
спеки, и хуки, зарегистрированные в этот момент, принадлежат этому файлу спеки. Поэтому обычно у
каждого файла свои хуки.

Если модуль setup кешируется между файлами (известная причина — ниже), вызов выполняется один раз. Тогда у каждого следующего
файла воркера хуков нет: ни возврата свойств, ни `blockNetwork`, ни уборки таймеров, ни глобальных
фейковых таймеров. Симптом проявляется в другом месте, например
`A function to advance timers was called but the timers APIs are not mocked` в спеке, которая
проходит, если запустить её одну.

`setupAutoSpy()` сообщает об этом одной строкой на воркер в stderr:

```text
[vitest-auto-spy] setupAutoSpy() registered its hooks for src/a.spec.ts and not for src/b.spec.ts, which runs after it in the same worker: …
```

Вызов из файла спеки (например, внутри `describe`) никогда не считается ошибкой. Вызывать
`setupAutoSpy()` только для части файлов спек тоже можно: проверка видит, что модуль setup
выполнился для файла заново, и молчит.

**Известная причина:** `@angular/build:unit-test` до 22.2.0 с `--coverage`. Выглядит как «coverage
сломал тесты». Обновите `@angular/build` до 22.2.0 или новее. На старом билдере:

- запускайте coverage с изоляцией по файлам: `ng test <project> --coverage --isolate` или
  `isolate: true` в конфиге для этого случая. Билдер берёт `test.isolate` из конфига, если цель не
  задаёт свой `isolate`;
- или вызывайте `setupAutoSpy()` из того, что выполняется для каждого файла.

На любой версии держите вызов на верхнем уровне самого setup-файла. Модуль, который setup-файл
импортирует ради побочных эффектов, может попасть в общий чанк и выполниться один раз на воркер.

## Setup-файл, которому досталась собственная копия Angular {#the-setup-file-that-gets-its-own-copy-of-angular}

Setup-файл, который вызывает `initTestEnvironment`, выполняется раньше, чем импортируется
библиотека. Если setup-файл и спеки по-разному разрешают `@angular/core`, в процессе оказываются две
копии Angular. `TestBed` setup-файла принадлежит одной, а все спеки работают с другой.

Симптомы о копиях ничего не говорят. Один из них:

```text
[vitest-auto-spy] No mock adapter registered: a spy was built before 'vitest-auto-spy' was imported. This is Vitest — import the factories from 'vitest-auto-spy', in the spec or once in the `setupFiles` entry.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/installation#vitest
```

Другие: `configureTestingModule` принимается, но компонент всё равно получает настоящий сервис;
`overrideProvider` не применяется; `NG0203` появляется в обычном контексте внедрения.

Исправляется в конфиге Vitest:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['@angular/core', '@angular/common', '@angular/platform-browser', '@angular/compiler', 'rxjs'],
  },
  test: {
    server: { deps: { inline: ['vitest-auto-spy'] } },
  },
});
```

- `dedupe` заставляет каждый импорт этих пакетов вести в один файл.
- `server.deps.inline` заставляет Vitest обрабатывать библиотеку так же, как ваши спеки, и
  setup-файл со спеками получают одну копию. Старый `test.deps.inline` верхнего уровня переехал сюда
  в Vitest 1 и больше не существует (проверено по типам Vitest 5.0).
- `rxjs` в списке, потому что `Observable` из одной копии не проходит `instanceof` другой.

Сначала посмотрите [отчёт о копиях](#_2-one-copy-of-the-library-in-the-process). Вторая установка
или одна установка, загруженная и как ESM, и как CommonJS, встречаются чаще, и `dedupe` им не нужен.
Этот раздел — для случая, когда отчёт показывает один и тот же пакет, разрешённый дважды.

## Подробнее {#in-depth}

Как устроены опции выше. Чтобы ими пользоваться, это не нужно.

### Восстановление свойств, когда хук упал {#restoring-properties-when-a-hook-throws}

Vitest выполняет хуки `afterEach` в обратном порядке регистрации. Setup-файл регистрирует свой хук
первым, поэтому он выполняется последним. Если собственный `afterEach` спеки падает, следующие хуки
не выполняются:

```ts
// в файле спеки, поэтому выполняется раньше хука библиотеки
afterEach(() => vi.restoreAllMocks()); // ← падает, и уборка ниже не происходит
```

Так было на практике. Спеку перевели на
`provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })`. Восстановленный геттер стал
возвращать `undefined`, `ngOnDestroy` вызвал его как сигнал, и `TypeError` оборвал цепочку хуков.
Патч утёк, а падение появилось в другом `describe` как ошибка шаблона.

Поэтому библиотека ещё регистрирует колбэк `onTestFinished`. Vitest вызывает его после всей цепочки
`afterEach`. Он ничего не делает, если `afterEach` отработал; иначе возвращает свойства и
предупреждает в том тесте, где это случилось.

### Таймеры: подробнее {#stray-timers-in-depth}

- Отмена распознаётся не только через `clearTimeout(handle)`. В Node библиотека может отменить через
  `clearTimeout(+handle)` или `handle.close()`. Оба варианта считаются отменой.
- `promisify(setTimeout)` продолжает работать: обёртка переносит собственный `promisify` из Node.
- jsdom отвечает на каждый `setItem`, `removeItem` и `clear` в Web Storage настоящим
  `setTimeout(…, 0)` для события `storage`. Поэтому у файла, который только пишет в `localStorage`,
  всё равно есть таймеры в очереди. Собственная проверка хранилища в библиотеке выполняется внутри
  `withoutStrayTimerTracking`.
- `trackStrayTimers()` ставится целиком или никак: если хост отказал в одном из пяти патчей,
  остальные откатываются.
- Стек снимается, когда таймер ставят, не глубже сорока кадров под обёрткой, чтобы zone или
  планировщик rxjs посередине их не съели. Форматируется он только для лишних таймеров.
- Колбэк, поставленный после уборки прошлого файла, засчитывается следующему. Поле `file` говорит,
  какой файл поставил его на самом деле.
- Таймеры undici раньше роняли файлы с `setTimeout 499 ms … at new Promise (<anonymous>)`. Чей
  таймер, решает ближайший кадр стека вне этого пакета и zone.js.
- Стоимость отслеживания одного таймера — на [странице производительности](/ru/core/performance).
- Когда `strayTimers` выключен, собственный отчёт Vitest «Async Leaks» показывает во фрейме кода
  `setTimeout` из вашей спеки. Обёртки таймеров библиотеки проходят через `vi.defineHelper`, поэтому
  Vitest убирает кадры внутри `vitest-auto-spy`, а не показывает их вместо вашей строки.

### Охрана глобалов: подробнее {#global-guard-in-depth}

- Базовая линия снимается один раз на файл, в `beforeAll`.
- Пока проверка включена, `Object.defineProperty`, `Object.defineProperties` и
  `Reflect.defineProperty` запоминают, какой из отслеживаемых объектов получил неконфигурируемое
  определение. После каждого теста сравниваются только эти объекты, поэтому тест, который ничего не
  запечатал, ничего не стоит.
- Раз на файл, после всех `afterAll`, все отслеживаемые объекты сравниваются полностью. Так ловится
  патч в `afterAll`, `var` в нестрогом режиме или `defineProperty`, захваченный до начала файла.
  Такой патч приписывается файлу.
- В конце файла три функции возвращаются на место.
- Проверять каждое существующее свойство каждого объекта после каждого теста дороже, чем вся
  остальная проверка (у одного `globalThis` сотни имён). Поэтому переопределение существующего имени
  не отслеживается.
- Типичный случай —
  `Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn() })`: в jsdom
  такого члена нет, патч добавляет неконфигурируемое свойство, и `mockValueProp` в следующем файле
  падает с `Cannot redefine property`.

### Реестр моков: подробнее {#mock-registry-in-depth}

- Реестр Vitest — это `Set` на уровне модуля внутри `@vitest/spy`. При `isolate: true` он
  пересоздаётся на каждый файл, при `isolate: false` — один на воркер.
- API для него нет. Библиотека ненадолго подменяет `Set.prototype.forEach` на время вызова
  `vi.clearAllMocks()`: `forEach` передаёт сам набор третьим аргументом. Захват сверяется с пробным
  моком; без совпадения ничего не удаляется.
- Разделение: всё, что лежит в реестре, когда начинаются хуки файла, создано при импорте модулей и
  остаётся. Всё добавленное позже принадлежит файлу и уходит с ним. Наивная подрезка удалила бы мок
  из общего `*.mock.ts` после первого файла, и второй файл упал бы на вызовах предыдущего.
- `mockReset` возвращает реализацию, только если её передали в `vi.fn(implementation)`. В
  `@vitest/spy` это записано как `resetToMockImplementation ? mockImplementation : undefined`.
- Пропавшее поведение возвращается в `beforeEach`, потому что Vitest применяет `restoreMocks` /
  `mockReset` / `clearMocks` раньше хуков `beforeEach`.
- В Vitest 4 `vi.restoreAllMocks()` обходит отдельный список, куда пишет только `vi.spyOn`. Поэтому
  проблему со сбросом он не вызывает.

### Подсказка о билдере Angular: подробнее {#angular-build-hint-in-depth}

- Билдер узнаётся по маркеру, который его собственный setup-файл оставляет на `globalThis`
  (`Symbol.for('@angular/cli/vitest-mock-patch')`), раньше любого пользовательского setup-файла.
  Обычный прогон Vitest ничего не читает.
- Под билдером версия берётся из ближайшего `node_modules/@angular/build/package.json` над рабочей
  папкой. Это единственное место, где библиотека читает диск: один файл, только чтение, через
  `process.getBuiltinModule`, поэтому `/setup` загружается и там, где нет `process`. На Node без
  `getBuiltinModule` (до 20.16 / 22.3) подсказка молчит.
- Билдер по умолчанию запускает Vitest с `isolate: false`, поэтому флаг на `globalThis` оставляет
  одно сообщение на воркер.
- Расход памяти на затронутых версиях — на [странице производительности](/ru/core/performance).

### Web Storage: подробнее {#web-storage-in-depth}

Vitest копирует глобалы DOM-среды на `globalThis` через один фильтр:

```js
if (k in global) return KEYS.includes(k);
```

`Storage` в `KEYS` есть, а `localStorage` и `sessionStorage` — нет. Пока в Node не было своего Web
Storage, `k in global` был ложным, и оба копировались. Собственный Web Storage в Node сделал ключ
существующим, фильтр теперь спрашивает `KEYS`, и хранилище среды не приходит. Фильтр работает до
кода конкретной среды, поэтому jsdom и happy-dom ломаются одинаково.

Починка проверяет хранилище, пользуясь им, потому что каждая версия Node ломает его по-своему: в
Node 25 есть `setItem`, который бросает ошибку, в Node 26 нет ничего.

Починка спаев на хранилище (раздел 18) трогает только метод, про который `vi.isMockFunction` говорит,
что это мок. С прототипом она не сравнивает: `Storage` в jsdom превращает `defineProperty` метода в
сохранённую запись, и проверка по прототипу без конца переписывала бы хранилище, которое просто
выглядит странно. Мок чинится; чистое хранилище, намеренная замена и лишняя запись jsdom остаются как
есть.

### Охрана прототипов: подробнее {#prototype-guard-in-depth}

Vitest собирает хуки файла обходом объекта через `for…in`, поэтому перечисляемый ключ на
`Object.prototype` принимается за список хуков и разворачивается. Стека у ошибки нет: все её кадры
внутри `dist` самого Vitest, а их Vitest из стеков убирает. В одном большом наборе тестов из-за этого
отчёт показывал `145 failed | 1613 passed` файлов над `11880 passed | 0 failed` тестов, и число
менялось от прогона к прогону. Таблица mime в `superagent` (`typeMap[type].map is not a function`)
ломалась так же.

Базовая линия снимается в `beforeAll` файла и сверяется ещё раз после всех `afterAll`.

### Охрана документа: подробнее {#document-guard-in-depth}

Проверка не идёт в `afterEach`. Setup-файл регистрирует свои хуки после хуков `TestBed`, а
`afterEach` выполняются в обратном порядке, поэтому проверка в `afterEach` шла бы раньше, чем
`TestBed` уничтожит фикстуры. Она сообщала бы о каждом атрибуте и `<style>`, которые Angular убирает
при уничтожении. Проверка теста идёт из `onTestFinished`, после всей цепочки `afterEach`. Проверка
файла — после всех `afterAll`.

Стоимость на тест: несколько микросекунд на атрибуты; `nodes` растёт с числом дочерних элементов.
Цифры — на [странице производительности](/ru/core/performance).

Зачем нужна эта охрана. При `isolate: false` все файлы спек в воркере рисуют в один документ jsdom, и
между файлами его никто не сбрасывает. В проекте, где это нашли, эффект компонента клавиатуры ставил
`data-reset-focus` на `document.body` и не снимал. Сервис навигации в другом месте выходит раньше,
если `document.querySelector('[data-reset-focus]')` что-то находит. Поэтому спека сервиса падала на
34 из 209 тестов примерно в одном полном прогоне из шести: только когда два файла попадали в один
воркер, и никогда сама по себе. Другие проверки этого не видели: ничего не запечатали, не добавили в
прототип и не оставили работать.

Охрана находит утечки и в коде приложения. В Angular-приложении на 850 спек она нашла два
компонента, которые оставляли `style="cursor: grabbing"` на `<body>`, если их уничтожали посреди
перетаскивания, и два теста, которые проходили только благодаря CSS-переменной, оставленной
предыдущим тестом.

Пустой `class` или `style` считается отсутствием атрибута: `classList.add`, а затем
`classList.remove` оставляют `class=""` там, где его не было. В одном проекте этот след дал 9 из
первых 32 падений.

### Необработанные отклонения: подробнее {#stray-rejections-in-depth}

Колбэк, который выполняется после конца своего теста, проверяет утверждение слишком поздно: тест уже
показан зелёным. Если такое утверждение падает, падение видно только как отклонение промиса, которое
никто не обработал. То же бывает с `async`-хелпером, вызванным без `await`, и с `TypeError` внутри
`import('…').then(…)` в коде приложения. В одном перенесённом Angular-монорепозитории (1688 файлов
спек, 11 587 тестов, всё зелёное, код выхода 0) за этим скрывались шесть настоящих дефектов. Два из
них были просто ложными утверждениями.

### Охрана консоли: подробнее {#console-guard-in-depth}

- Охрана оборачивает `console` и передаёт каждый вызов дальше без изменений. Метки Vitest
  `stdout | file > test`, `onConsoleLog` и вывод упавшего теста остаются прежними. Это проверено на
  Vitest 4.1 и 5.0: охрана в setup-файле, два файла спек в одном воркере при `isolate: false`.
- Собственная консоль DOM-среды тоже учитывается. Консоль страницы happy-dom и виртуальная консоль
  jsdom получили консоль воркера, когда среда создавалась, до того как Vitest подменил
  `globalThis.console`. Поэтому их строки попадали в stderr зелёного прогона. Охрана направляет эту
  консоль в ту, за которой следит. Тогда
  `NotSupportedError: Failed to load iframe page … Iframe page loading is disabled` из happy-dom или
  `Not implemented: navigation` из jsdom приписываются тесту, который их вызвал, со строкой
  `Likely cause:`. Спай консоли или шаблон `allow` принимает их, как любую другую строку.

### Возврат глобалов: подробнее {#globals-restore-in-depth}

Возврат на границе файла обходит две ловушки:

- **Дескриптор — ещё не всё.** DOM-среда ставит свойства window на `globalThis` как пары
  getter/setter, которые пересылают значение в отдельную таблицу. `global.ResizeObserver = stub`
  вызывает setter и оставляет дескриптор прежним. Возврат, который только переопределяет
  дескрипторы, сообщил бы «ничего не менялось», а заглушка продолжала бы отвечать. Поэтому
  сохранённое значение возвращается через тот же setter.
- **Обёртки самой библиотеки остаются.** `strayTimers` обернул `setTimeout`, а `strayListeners` —
  `addEventListener`. Возврат всех оригиналов снял бы это отслеживание на первой же границе файла.
  Библиотека помечает свои обёртки, и возврат их пропускает.

### Охрана слушателей: подробнее {#listener-guard-in-depth}

Охрана делит слушателей так же, как чистка реестра моков (раздел 9). `beforeAll` помечает
слушателей, которые уже висят на `window` и `document`: их зарегистрировали при импорте модулей,
например при разовой настройке фреймворка. `afterAll` снимает всё, что добавлено после этого. Особого
случая для первого файла нет: слушатель, поставленный при импорте, попадает в базовую линию того
файла, который его импортировал, и переживает все следующие уборки.

### Глобальные фейковые таймеры: подробнее {#global-fake-timers-in-depth}

Оба конца глобальных фейковых таймеров защищены — эту половину рукописная пара хуков обычно упускает.
Иначе спека, которая сама управляет часами, дошла бы до второго `vi.useRealTimers()`. В happy-dom
этот второй вызов оставляет среду без `clearInterval`, и это ломается при уборке следующего файла, а
виноватым оказывается он.

### Почему билдер до 22.2 выполняет setup-файл один раз {#why-the-builder-before-22-2-runs-the-setup-file-once}

`@angular/build:unit-test` до 22.2.0 с coverage отдаёт каждый файл тестов, включая setup-файлы, как
маленькую обёртку, которая импортирует собранный бандл. Модуль setup остаётся загруженным в общей
среде, и его верхний уровень больше не выполняется. Без coverage тот же прогон в порядке, поэтому
кажется, что «coverage сломал тесты». `@angular/build` 22.2.0 это исправляет (pull request 34143 в
angular-cli): setup-файлы больше не оборачиваются, и их хуки регистрируются для каждого файла спеки и
под `--coverage`.

### Почему патч не ставится заново {#why-a-patch-is-not-re-applied}

`restoreMockedProps()` существует, чтобы патч не пережил свой файл. Патч, который ставил бы себя
заново в каждом тесте, при `isolate: false` пережил бы файл. Поэтому библиотека сообщает о проблеме,
а не меняет правило. Отчёт ведётся по объекту, а не по имени свойства: два файла часто патчат
одноимённый член у разных объектов.
