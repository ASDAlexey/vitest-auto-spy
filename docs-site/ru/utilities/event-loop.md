---
title: Ожидание и часы
description: flushEventLoop, flushEventLoopUntil, settleDynamicImport, mockSystemTime и useCountingClock — четыре очереди ожидания и инструмент, который двигает каждую.
---

# Ожидание и часы {#waiting-and-the-clock}

```ts
import { flushEventLoop, settleDynamicImport } from 'vitest-auto-spy';

fixture.debugElement.query(By.css('.open')).nativeElement.click(); // production: await import(…)
await settleDynamicImport(() => import('./profile-select.modal'));

expect(dialog.open).toHaveBeenCalled();
```

## Четыре очереди {#four-queues}

Под Jest их было трудно различить, потому что `import()` компилировался в `require()`, а фейковые
таймеры обычно были глобальными. Под Vitest с настоящим бандлером это четыре отдельных механизма,
и тест, ждущий не ту очередь, падает с сообщением, которое не называет ни одну из них.

| Что ожидает                                    | Что им управляет                                  | Что **не** сработает                      |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| change detection                               | `fixture.detectChanges()`                          | любой `await`                             |
| эффекты, `afterNextRender`, затем CD           | `await stable(fixture)`                            | один только `detectChanges()`             |
| таймеры, дебаунсы, поллинг                     | `await advanceTimers(ms)`                          | `await Promise.resolve()`                 |
| динамический `import()`, нативный `async` в зависимостях | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, микротаски |

## `flushEventLoop(turns?)` {#flusheventloop-turns}

Даёт рантайму настоящие обороты event loop, что бы ни делали таймеры, и не трогает часы.

Сюита, перенесённая с Jest, обычно гоняет каждый тест с включёнными фейковыми таймерами, и
очевидного способа сказать «дай рантайму один раз вздохнуть» не остаётся:

- `await Promise.resolve()`, сколько угодно раз, дочищает только микротаски. Он никогда не продвигает
  динамический `import()` и никогда не продвигает нативную `async`-функцию внутри `node_modules` —
  обе продолжаются в таске, а не в микротаске.
- `setTimeout` — фейковый, поэтому планирование через него не планирует ничего.
- `await vi.advanceTimersByTimeAsync(0)` работает, но в тесте без таймеров читается как «подвинуть
  таймеры», и следующий читатель выкидывает его как шум. Это не гипотеза: ровно это произошло
  с самодельной версией этого хелпера в сюите, ради которой он появился.

Внутри он планирует таск через `MessageChannel`, который ни одна реализация фейковых таймеров не
подменяет. Он отдаёт оборот _таски_ и сознательно не исполняет ожидающие колбэки `setTimeout` — те
приходят из другого источника тасков, а хелпер, который исполнял бы и их, был бы
`advanceTimersByTime` под другим именем.

Он не ответ для `httpResource()` / `resource()` / `rxResource`, которым нужен **тик** change
detection, а не оборот event loop, — ожидание для них это
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource). Для чего этот хелпер
действительно правильный — случай на шаг ниже: работа, чья доставка пересекает границу между
zone-патченными и нативными промисами, где фиксированное число вызовов `await Promise.resolve()` —
догадка, которая случайно держится ровно до тех пор, пока не перестанет.

## `flushEventLoopUntil(isDone, options?)` {#flusheventloopuntil-isdone-options}

```ts
client.warmUp();

await flushEventLoopUntil(() => client.isReady(), { label: 'the SDK handshake' });

expect(client.session()).toBeDefined();
```

Берёт настоящие обороты, пока условие не выполнится, и останавливается — форма, стоящая за каждым
самодельным хелпером «дождаться»: лениво загруженный чанк становится достижимым, SDK сообщает
о готовности, очередь дочищается.

::: warning Не для Angular-ресурса
Раньше на этом месте показывали `httpResource()`, и тот пример никогда не работал.
`flushEventLoopUntil` берёт обороты event loop и никогда не делает **тик**, а `httpResource` не
отправляет ни одного запроса, пока кто-нибудь тик не сделает, — по замерам, ресурс, ожидаемый таким
способом, выбирает весь бюджет, не сделав ни одного запроса, и затем падает с сообщением, что
условие так и не выполнилось. Ожидание для этого —
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource) из
`vitest-auto-spy/angular`.
:::

Вручную это пишут как фиксированное число оборотов, подбираемое пробами до зелёной сюиты, — что
и медленнее, чем нужно (оно всегда ждёт максимум), и тихо хрупко: ещё одна передача управления
внутри зависимости, и число снова неверно.

Бюджет оборотов (по умолчанию 20) — то, что отличает это от `while (true)`. Условие, которое никогда
не становится истинным, — обычный способ ошибиться в использовании: запрос так и не отправили,
стаб так и не настроили, — и тест, висящий до таймаута раннера, валит файл, а не ожидание. Ошибка
вместо этого называет `label`:

```text
[vitest-auto-spy] flushEventLoopUntil: the SDK handshake was still not ready after 20 real
event-loop turns. Three causes, in the order they turn out to be true. The work started but a
dynamic `import()` had not finished … Or the work never started …. Or it is waiting on a timer
rather than on the event loop — timers stay frozen here, and only `advanceTimers()` moves them.
```

Первый из трёх — тот, что дороже всех в диагностике, поэтому он назван первым: **холодный** чанк
берёт больше оборотов, чем бюджет, и выдаёт это то, что в файле падает только _первый_ такой тест,
а все последующие проходят на тёплом кэше модулей. Это читается как флак, но флаком не является —
ответ в том, чтобы дождаться модуль, а не считать обороты, через
[`settleDynamicImport`](#settledynamicimport-load-turns) ниже.

## `settleDynamicImport(load, turns?)` {#settledynamicimport-load-turns}

```ts
const module = await settleDynamicImport(() => import('@scope/lazy-feature'));
```

Две ситуации, один механизм.

Продакшн-код, делающий `await import('./thing')` по клику, оставляет спеку без промиса, который
можно ждать. Ожидание здесь _того же_ спецификатора резолвится в тот же экземпляр модуля,
а настоящие обороты, которые идут следом, дают дочиститься собственному продолжению компонента.

Вторая — забандленная Angular-сюита, где символ, реэкспортированный через barrel, читается как
`undefined`, пока его чанк не вычислен. Ожидание импорта как раз его и вычисляет — и, в отличие
от голого `await import('…')` с комментарием, имя говорит, зачем строка здесь, а именно это мешает
следующему проходу «удалить неиспользуемую строку» её выкинуть.

Крутить вместо этого `await Promise.resolve()` хуже, чем не ждать вовсе: тесты зеленеют,
а продолжение приземляется после тирдауна, выдавая восемь записей `NG0205: Injector has already
been destroyed` под «Unhandled Errors», ни одного упавшего теста и ненулевой код выхода.

## Часы {#the-clock}

```ts
import { mockSystemTime, useCountingClock, withSystemTime } from 'vitest-auto-spy/setup';
```

### `mockSystemTime(time)` и `withSystemTime(time, body)` {#mocksystemtime-time-and-withsystemtime-time-body}

Замораживают часы независимо от того, запущены ли уже фейковые таймеры. С установленными фейками это
`vi.setSystemTime`; без них ставятся фейки только на `Date`, и таймеры остаются настоящими.

**Ассерт, содержащий дату, обязан выставить часы.** Иначе ожидаемая строка вычисляется из
`new Date()`, и тест начинает падать сам по себе через несколько дней после написания — что
читается как регрессия, но ею не является.

Перенесённый `jest.spyOn(global, 'Date')` — не тот путь. Фейковые таймеры уже владеют этим
глобалом, поэтому он бросает `Date is not a constructor` со стектрейсом в продакшн-коде и без
единого упоминания таймеров.

### `useCountingClock(options?)` {#usecountingclock-options}

```ts
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

Под фейковыми таймерами каждый вызов внутри одного теста отчитывает одно и то же «сейчас», поэтому
спека, ассертящая **порядок** или **длительность** — аналитические батчи, трейсинговые спаны,
rate limiter, TTL-кэш, дедупликация по времени, — вообще не может выразить своё ожидание.

Ручной патч `Date.now` не выживает в сюите, где фейки включены глобально: `vi.useFakeTimers()`
ставит _свежий_ `Date` на каждый вызов, поэтому патч уровня модуля или из `beforeAll` остаётся
сидеть на объекте, который больше никто не читает, а наивный откат (`afterEach(() => { Date.now
= saved })`) перецепляет `now` мёртвых часов к живым, где он и ломает более поздний файл.
`useCountingClock` и `mockNow` переприменяются на каждый тест и отдают откат
`restoreMockedProps()`, который записал точный объект, который патчил.
