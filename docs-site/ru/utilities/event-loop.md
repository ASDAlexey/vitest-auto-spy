---
title: Ожидание и часы
description: flushEventLoop, flushEventLoopUntil и settleDynamicImport ждут работу, до которой не достаёт промис; mockSystemTime и useCountingClock задают, что показывает Date.
---

# Ожидание и часы {#waiting-and-the-clock}

Эти хелперы ждут работу, до которой не дотягивается `await Promise.resolve()`, и управляют тем, что
показывают часы. Они нужны, когда тест нажимает кнопку, которая грузит код через `import()`, ждёт
готовности SDK или проверяет дату.

```ts
import { settleDynamicImport } from 'vitest-auto-spy';

it('opens the profile dialog', async () => {
  fixture.debugElement.query(By.css('.open')).nativeElement.click(); // в коде: await import(…)
  await settleDynamicImport(() => import('./profile-select.modal'));

  expect(dialog.open).toHaveBeenCalled();
});
```

`flushEventLoop`, `flushEventLoopUntil` и `settleDynamicImport` импортируются из `vitest-auto-spy`.
Хелперы часов — из `vitest-auto-spy/setup`.

## Четыре очереди {#four-queues}

Проверяемый код может оставить четыре разных вида отложенной работы. Если тест ждёт не ту, сообщение
об ошибке не подскажет, какую надо было ждать. Выбирайте хелпер по тому, что осталось в очереди
(«CD» — change detection в Angular):

| Что осталось в очереди                                 | Что это выполняет                                  | Что **не** выполняет                      |
| ------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------- |
| change detection                                       | `fixture.detectChanges()`                          | один только `await`                       |
| эффекты, `afterNextRender`, затем CD                   | `await stable(fixture)`                            | один `detectChanges()`                    |
| таймеры, дебаунсы, опросы                              | `await advanceTimers(ms)`                          | `await Promise.resolve()`                 |
| динамический `import()`, нативный `async` в библиотеке | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, микротаски |

Каждая строка — отдельный механизм, и ожидание одного вида не покрывает другой.

## `flushEventLoop(turns?)` {#flusheventloop-turns}

Даёт среде выполнения один или несколько настоящих витков цикла событий. Работает одинаково и с
фейковыми таймерами, часы не двигает.

```ts
import { flushEventLoop } from 'vitest-auto-spy';

service.start(); // вызывает нативную async-функцию внутри node_modules
await flushEventLoop();

expect(service.ready).toBe(true);
```

| Параметр | Тип      | По умолчанию | Смысл                             |
| -------- | -------- | ------------ | --------------------------------- |
| `turns`  | `number` | `1`          | Сколько витков цикла событий дать |

Почему привычные приёмы не работают:

- `await Promise.resolve()` выполняет только микротаски — короткую очередь промисов. Динамический
  `import()` и нативная `async`-функция внутри `node_modules` продолжаются в следующем витке цикла
  событий, поэтому не двигаются.
- Под фейковыми таймерами `setTimeout` фейковый, и планирование через него ничего не делает.
- `await vi.advanceTimersByTimeAsync(0)` работает, но читается как «сдвинуть таймеры» в тесте без
  таймеров. Следующий читатель удалит его как мусор.

Ждущие колбэки `setTimeout` он не выполняет; для них есть
[`advanceTimers`](./fake-timers#advancetimers-ms).

**Частая ошибка:** использовать его для `httpResource()`, `resource()` или `rxResource` в Angular.
Им нужен шаг change detection, а не виток цикла событий. Используйте
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource).

## `flushEventLoopUntil(isDone, options?)` {#flusheventloopuntil-isdone-options}

Даёт настоящие витки цикла событий, пока `isDone()` не вернёт `true`, и останавливается. Если этого
не происходит, тест падает с вашим `label` в сообщении. Подходит для «подождать, пока X будет
готов»: лениво загружаемый чанк, рукопожатие SDK, опустевшая очередь.

```ts
import { flushEventLoopUntil } from 'vitest-auto-spy';

client.warmUp();

await flushEventLoopUntil(() => client.isReady(), { label: 'the SDK handshake' });

expect(client.session()).toBeDefined();
```

| Опция       | Тип      | По умолчанию      | Смысл                                                               |
| ----------- | -------- | ----------------- | ------------------------------------------------------------------- |
| `turns`     | `number` | `20`              | Сколько витков пробовать, прежде чем упасть                         |
| `timeoutMs` | `number` | —                 | Вместо этого опрашивать настоящие часы каждые 10 мс столько времени |
| `label`     | `string` | `'the condition'` | Чего вы ждали; попадает в текст падения                             |

`isDone` должна быть синхронной. Она проверяется перед первым витком и после каждого. `turns` и `timeoutMs` вместе не
передаются; тип опций это запрещает.

Если условие так и не выполнилось, падение подсказывает, что проверить:

```text
[vitest-auto-spy] flushEventLoopUntil: the SDK handshake was still not ready after 20 real event-loop
turns. No timer is pending: if it waits on a dynamic import(), await it instead:
`await settleDynamicImport(() => import('./thing'))`; otherwise the call under test never ran, or its
stub was never configured.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/event-loop#flusheventloopuntil-isdone-options
```

Если на фейковых часах ждут колбэки, второе предложение говорит об этом:

```text
… 3 callbacks wait on the fake clock, and this helper never advances it — advance it instead:
`await advanceTimers(ms)`.
```

**Частая ошибка: падает только первый тест в файле.** Код ждёт динамический `import()`. В первый раз
чанк холодный, и витков нужно больше бюджета; следующие тесты берут модуль из кеша. Это не
нестабильный тест. Дождитесь модуля через [`settleDynamicImport`](#settledynamicimport-load-turns),
а не считайте витки.

::: warning Не для ресурса Angular
`flushEventLoopUntil` не запускает change detection, а `httpResource` не отправляет запрос, пока
change detection не прошёл. При таком ожидании он тратит весь бюджет, не сделав ни одного запроса.
Используйте [`settleResource()`](../adapters/angular#resources-httpresource-and-resource) из
`vitest-auto-spy/angular`.
:::

### Бюджет по времени, для настоящего ввода-вывода {#a-time-budget-for-real-i-o}

Для настоящего ввода-вывода (HTTP-запрос к серверу, который запустила спека, завершение дочернего
процесса, срабатывание наблюдателя за файлами) используйте `timeoutMs`. Такая работа занимает
миллисекунды, и витки — неподходящая мера.

```ts
await server.listen(0);
void request(server.url('/health'));

await flushEventLoopUntil(() => server.requests.length > 0, { timeoutMs: 1000, label: 'the health check' });
```

Условие проверяется каждые 10 мс по настоящим часам. Фейковые таймеры его не замораживают и не
ускоряют. Падение пишет `after 1000 ms of real time`. Это замена самописному `waitFor(predicate, ms)`.

## `settleDynamicImport(load, turns?)` {#settledynamicimport-load-turns}

Ждёт динамический `import()`, а затем даёт настоящие витки цикла событий. Возвращает модуль.

```ts
import { settleDynamicImport } from 'vitest-auto-spy';

const module = await settleDynamicImport(() => import('@scope/lazy-feature'));
```

| Параметр | Тип                | По умолчанию | Смысл                                           |
| -------- | ------------------ | ------------ | ----------------------------------------------- |
| `load`   | `() => Promise<T>` | —            | Тот же `import()`, что выполняет ваш код        |
| `turns`  | `number`           | `1`          | Сколько витков цикла событий дать после импорта |

Два случая:

- **Ваш код выполняет `await import('./thing')` по клику**, и у спеки нет промиса, который можно
  ждать. `import()` выполняется в спеке, поэтому путь пишется относительно файла спеки. Он ведёт к
  тому же модулю, что загрузил ваш код, а витки после него дают продолжиться коду компонента.
- **Angular-тесты собраны бандлером, и реэкспортированный символ читается как `undefined`**, пока
  не загружен кусок бандла (чанк), где он лежит. Ожидание импорта его загружает. Имя хелпера заодно
  объясняет следующему читателю, зачем здесь эта строка.

**Частая ошибка:** крутить вместо этого `await Promise.resolve()`. Тесты зеленеют, но код
продолжается уже после конца теста. Прогон заканчивается записями
`NG0205: Injector has already been destroyed` в «Unhandled Errors». Упавших тестов нет, а код выхода
ненулевой.

Правило линтера [`prefer-settle-dynamic-import`](/ru/utilities/eslint-rules#prefer-settle-dynamic-import)
находит голый `await import('…')` в спеке и предлагает эту обёртку как исправление.

## Часы {#the-clock}

```ts
import { mockNow, mockSystemTime, useCountingClock, withSystemTime } from 'vitest-auto-spy/setup';
```

### `mockSystemTime(time)` и `withSystemTime(time, body)` {#mocksystemtime-time-and-withsystemtime-time-body}

Задают текущую дату для теста. Используйте их всегда, когда проверка содержит дату. Без
фиксированной даты ожидаемое значение берётся из `new Date()`, и тест через несколько дней начинает
падать сам.

```ts
import { withSystemTime } from 'vitest-auto-spy/setup';

it('shows the renewal date', async () => {
  await withSystemTime('2025-04-30T00:00:00Z', async () => {
    await expect(subscription.renewalLabel()).resolves.toBe('renews 30.05.25');
  });
});
```

- `withSystemTime(time, body)` выполняет `body` в это время и потом возвращает часы, даже если
  `body` упал. `body` может быть синхронным или асинхронным; функция возвращает промис того, что
  вернул `body`. Если компонент читает дату при создании, создавайте его внутри `body`.
- `time` — это `Date`, число миллисекунд или строка с датой, как у `vi.setSystemTime`. Строка
  разбирается как `new Date(string)`; для UTC добавьте в конце `Z`.
- `mockSystemTime(time)` задаёт время и возвращает функцию отмены. Вызовите её сами, например в
  `afterEach`.
- Если фейковые таймеры уже установлены, обе функции двигают фейковые часы и оставляют фейки. Если
  спека сдвинула фейковые часы внутри блока, этот сдвиг сохраняется и после него.
- Без фейковых таймеров они подменяют только `Date`; таймеры остаются настоящими. Отмена снимает
  эти фейки.
- Повторный вызов отмены ничего не делает.

**Частая ошибка:** переносить `jest.spyOn(global, 'Date')`. Этим глобалом уже владеют фейковые
таймеры, и вызов бросает `Date is not a constructor` из кода приложения, без упоминания таймеров.

Когда подменён только `Date`, `advanceTimers()` не работает: см.
[Фейковые таймеры](/ru/utilities/fake-timers).

### `useCountingClock(options?)` {#usecountingclock-options}

`Date.now()` возвращает 1, 2, 3, … вместо времени. Счётчик сбрасывается перед каждым тестом.
Используйте, когда спека проверяет порядок или длительность: пачки аналитики, спаны трассировки,
ограничитель частоты, кеш с TTL. Без него под фейковыми таймерами все вызовы в одном тесте получают
одно и то же «сейчас», и проверять нечего.

```ts
import { useCountingClock } from 'vitest-auto-spy/setup';

describe('MetricsCollector', () => {
  const clock = useCountingClock();

  it('stamps each event with the next tick', () => {
    collector.push('a');
    collector.push('b');

    expect(sent()).toEqual([
      { name: 'a', at: 1 },
      { name: 'b', at: 2 },
    ]);
    expect(clock.value).toBe(3);
  });
});
```

| Опция   | Тип      | По умолчанию | Смысл                                        |
| ------- | -------- | ------------ | -------------------------------------------- |
| `start` | `number` | `1`          | Первое значение, которое вернёт `Date.now()` |
| `step`  | `number` | `1`          | Прибавляется при каждом чтении               |

У возвращённых часов есть `value` (что вернёт следующий `Date.now()`) и `reset()` (начать заново с
`start`). Вызывайте `useCountingClock` на уровне `describe`; хуки он ставит сам.

### `mockNow(source)` {#mocknow-source}

Подменяет `Date.now` вашей функцией перед каждым тестом блока и возвращает после. Вызывайте на
уровне `describe`. На нём построен `useCountingClock`.

```ts
import { mockNow } from 'vitest-auto-spy/setup';

describe('AnalyticsQueue', () => {
  let tick = 0;

  mockNow(() => (tick += 1));
});
```

**Частая ошибка:** патчить `Date.now` руками в наборе тестов, где фейковые таймеры включены везде.
`vi.useFakeTimers()` каждый раз ставит новый `Date`, и патч, сделанный один раз, остаётся на
объекте, который никто не читает. `mockNow` и `useCountingClock` патчат живой `Date` перед каждым
тестом и точно его откатывают.

## Таймауты хелперов не зависят от фейковых часов и zone.js {#a-watchdog-is-not-on-your-clock-and-not-on-your-zone}

Некоторые хелперы падают по таймауту намеренно: [`expectEmission` и его
семейство](/ru/core/observable-assertions), а также [`stable`](/ru/adapters/angular). Их таймаут
остаётся настоящим:

- **Фейковые таймеры его не останавливают.** Функции таймеров читаются один раз, при импорте, и
  `vi.useFakeTimers()` не может их заморозить. Падение остаётся «поток ничего не выдал», а не
  превращается в «тест не уложился по времени».
- **zone.js его не перехватывает.** Используется исходный `setTimeout`, который zone.js держит в
  стороне. Таймаут, поставленный внутри `fakeAsync`, остаётся на настоящем времени, и `tick()` не
  может его истечь.

Всё остальное, что планирует спека, принадлежит зоне — в этом и смысл
[работы внутри неё](/ru/utilities/zone).
