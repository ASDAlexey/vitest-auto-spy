---
title: Фейковые таймеры
description: setupFakeTimers включает фейковые таймеры для describe и снимает их после каждого теста; advanceTimers двигает часы и ждёт промисы, которые запустили таймеры.
---

# Фейковые таймеры {#fake-timers}

Эти хелперы помогают проверить дебаунс, опрос или повтор запроса, не дожидаясь реального времени.
`setupFakeTimers()` включает фейковые таймеры для `describe` и всегда выключает их обратно.
`advanceTimers(ms)` двигает часы и ждёт промисы, которые запустили колбэки таймеров.

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

describe('SearchComponent', () => {
  setupFakeTimers();

  it('debounces the query', async () => {
    component.onInput('ab');
    await advanceTimers(300);
    expect(search.query).toHaveBeenCalledWith('ab');
  });
});
```

## `setupFakeTimers(config?)` {#setupfaketimers-config}

Ставит фейковые таймеры в `beforeEach` и снимает их в `afterEach`. Вызывайте внутри `describe` или в
начале файла спеки.

```ts
setupFakeTimers(); // стандартный набор фейков Vitest
setupFakeTimers({ toFake: ['setTimeout'] }); // подменяется только setTimeout; Date остаётся настоящим
```

| Параметр               | Тип                         | По умолчанию | Смысл                                                                                        |
| ---------------------- | --------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `config`               | конфиг `vi.useFakeTimers()` | —            | Передаётся в `vi.useFakeTimers()` как есть                                                   |
| `options.betweenTests` | `boolean`                   | `false`      | Держит часы фейковыми и между тестами; см. [ниже](#between-the-tests-as-well-—-betweentests) |

Почему один вызов, а не два своих хука:

- **Снятие не забыть.** Оставленные фейковые часы утекают в следующие файлы того же воркера. Там
  это выглядит как посторонний тест, который висит на `setTimeout`, так и не сработавшем.
- **Двойная установка или снятие безопасны.** Вложенный `describe` может вызвать `setupFakeTimers`
  ещё раз: лишнее снятие не оставит окружение сломанным для следующего файла.
- **Удалённые глобалы таймеров возвращаются.** Под happy-dom `vi.useRealTimers()` удаляет `Date`, а
  не восстанавливает. `afterEach` возвращает его. Подробнее —
  [Гигиена тестового прогона](./setup#_6-putting-back-timer-globals-the-fakes-took-with-them).

**Переданный config всегда применяется.** Если вы передали config, ставятся ваши фейки, даже когда
фейки уже работают: во вложенном `describe`, под
[`globalFakeTimers`](./setup#fake-timers-for-the-whole-run) или после `mockSystemTime()`. Вызов
**без** config оставляет те фейки, что уже работают: их поставил внешний `describe` или глобальный
setup.

**Частая ошибка:** вызывать `vi.useRealTimers()` в файле, чтобы выйти из фейковых таймеров. Остаток
файла всё ещё рассчитан на фейковые таймеры, а с `betweenTests` или `globalFakeTimers` — и остаток
прогона. Вместо этого сузьте `toFake`.

### Изъятие `setImmediate` из `toFake` {#taking-setimmediate-out-of-tofake}

По умолчанию Vitest подменяет все таймеры, кроме `process.nextTick` и `queueMicrotask`. В Node это
включает `setImmediate`, а он важен и за пределами кода с таймерами.

Express завершает запрос без подходящего маршрута через `setImmediate`. На замороженных часах этот
колбэк не выполняется, и запрос, который должен вернуть `404`, висит, пока раннер не сдастся:

```text
Test timed out in 30000ms
```

Это похоже на зависший сокет, а не на ошибку маршрута. **Если спека гоняет настоящий
HTTP-обработчик, уберите `setImmediate` из `toFake`.** Перечислите таймеры, которые нужно
подменить; остальные останутся настоящими:

```ts
setupFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
```

Если фейковые таймеры нужны только одному тесту в файле, можно оставить файл на настоящих таймерах и
обернуть этот тест в [`withFakeTimers`](#one-test-—-withfaketimers-fn-config).

Для всего прогона передайте тот же объект в [`setupAutoSpy`](./setup#fake-timers-for-the-whole-run):

```ts
setupAutoSpy({ globalFakeTimers: { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] } });
```

## `advanceTimers(ms?)` {#advancetimers-ms}

Двигает фейковые таймеры на `ms` вперёд и ждёт, пока завершатся промисы, которые запустили колбэки
таймеров. Всегда пишите `await`.

```ts
import { advanceTimers } from 'vitest-auto-spy/setup';

// Падает так, будто в проверяемом коде гонка:
vi.advanceTimersByTime(300);
expect(search.query).toHaveBeenCalled();

// Ждёт то, что колбэк поставил в очередь:
await advanceTimers(300);
expect(search.query).toHaveBeenCalled();
```

`vi.advanceTimersByTime()` выполняет колбэки таймеров, но то, что они ставят в очередь
(выполненный промис, продолжение после `await`, `delay()` из rxjs), на следующей строке ещё не
выполнено. `advanceTimers` дожидается всего этого, включая длинную цепочку `.then()` и таймер,
поставленный из промиса. Таймеры, которые наступают в пределах `ms`, выполняются по порядку, и
промисы, запущенные одним, завершаются до следующего. Поэтому `await advanceTimers(10_000)` дважды
прогоняет интервал в 5 секунд.

| Параметр | Тип      | По умолчанию | Смысл                                                           |
| -------- | -------- | ------------ | --------------------------------------------------------------- |
| `ms`     | `number` | `0`          | На сколько сдвинуть часы; `0` выполняет только то, что уже пора |

`advanceTimers()` без аргумента — это шаг, который нужен `setTimeout(fn, 0)` или цепочке
выполненных промисов.

**Частая ошибка:** вызывать её на настоящих таймерах. То же после одного `mockSystemTime()`: он
подменяет только `Date`. Она бросает ошибку и советует вызвать `setupFakeTimers()`:

```text
[vitest-auto-spy] advanceTimers() requires fake timers, and the timers in this test are real. Call setupFakeTimers() once in the setup file, or vi.useFakeTimers() in this test.
```

::: tip Angular
Используйте в паре с [`stable(fixture)`](../adapters/angular#zoneless-waiting): `advanceTimers`
двигает часы, а `stable` выполняет эффекты и change detection, которые за этим последовали.
:::

## Один тест — `withFakeTimers(fn, config?)` {#one-test-—-withfaketimers-fn-config}

Выполняет одну функцию на фейковых таймерах и возвращает настоящие, чем бы она ни закончилась:
возвратом, исключением или реджектом. Подходит, когда часы нужны только одному тесту в файле.

```ts
import { advanceTimers, withFakeTimers } from 'vitest-auto-spy/setup';

it('retries after a second', () =>
  withFakeTimers(async () => {
    poller.start(); // первый запрос сразу
    await advanceTimers(1_000); // срабатывает повтор
    expect(api.fetch).toHaveBeenCalledTimes(2);
  }));
```

- Возвращает то же, что `fn`, а для асинхронной `fn` — промис.
- `config` уходит в `vi.useFakeTimers()`, как у `setupFakeTimers`.
- Внутри `setupFakeTimers()` или [`globalFakeTimers`](./setup#fake-timers-for-the-whole-run)
  работает на уже установленных фейках и оставляет их.
- Если действует `mockSystemTime()`, начинает с подменённого времени и заканчивает на настоящих
  таймерах.

**Частая ошибка:** передавать `config` в `withFakeTimers` внутри `describe`, где уже есть
`setupFakeTimers()`. Это бросает ошибку: установленные часы потом было бы не вернуть. Уберите
`config`.

## Между тестами тоже — `betweenTests` {#between-the-tests-as-well-—-betweentests}

Держит часы фейковыми и в паузах между тестами, как `fakeTimers.enableGlobally` в Jest. Нужно
набору тестов, перенесённому с Jest, который на эту настройку опирался.

```ts
setupFakeTimers(undefined, { betweenTests: true });
```

Без этого `beforeAll` во вложенном `describe` работает на настоящих таймерах: он выполняется после
того, как `afterEach` предыдущего теста снял фейки. Если он двигает часы анимации, то падает с
`A function to advance timers was called but the timers APIs are not mocked`.

С этим фейки ставятся заново сразу после того, как `afterEach` их снял, и снимаются окончательно в
`afterAll`. Поэтому они не переживают файл. Каждый тест всё равно начинает с пустой очереди
таймеров.

По умолчанию выключено: вызов внутри `describe` должен оставить часы такими, какими их нашёл.

Для всего прогона используйте
[`setupAutoSpy({ globalFakeTimers: true })`](./setup#fake-timers-for-the-whole-run) — он включает
`betweenTests` сам.

## Замораживание только часов {#freezing-the-clock-alone}

Чтобы задать только текущее время, используйте
[`mockSystemTime(time)` и `withSystemTime(time, body)`](./event-loop). При установленных фейковых
таймерах они двигают фейковые часы. Без них подменяют только `Date` и оставляют таймеры настоящими.

В обоих случаях часы потом возвращаются. Если спека сдвинула фейковые часы внутри блока, этот сдвиг
сохраняется: блок, который прокрутил часы на минуту, оставит их на минуту позже, чем до блока.

::: warning `countStrayTimers()` слепа под фейковыми таймерами
`vi.useFakeTimers()` ставит свой `setTimeout` поверх отслеживания [лишних таймеров](./setup), и
ничего из запланированного фейковыми часами не считается. `expect(countStrayTimers()).toBe(0)`
ничего не доказывает в файле на замороженных часах. Опция `strayTimers` не работает вместе с
`globalFakeTimers` и с `setupFakeTimers`. Очередь самих фейковых часов показывает `vi.getTimerCount()`.
:::
