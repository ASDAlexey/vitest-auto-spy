---
title: Проверки на Observable
description: expectEmission, expectEmissions, expectNoEmission, expectCompletion и expectError - проверки потока, которые падают, если поток молчит.
---

# Проверки на Observable

`expect(...)` внутри колбэка `subscribe()` проходит, если поток ничего не выдал: колбэк не вызывается,
и проверять нечего. Эти хелперы делают проверкой само ожидание. Вы их `await`, и они падают с понятным
сообщением, если поток молчит, падает с ошибкой или завершается раньше времени.

```ts
import { expectEmission, expectError } from 'vitest-auto-spy';

it('updates the total', async () => {
  const total = expectEmission(cart.total$, { skip: 1 }); // сначала начать ждать; текущее значение пропустить
  cart.add(item);
  await expect(total).resolves.toBe(42);
});

it('refuses to check out an empty cart', async () => {
  const error = await expectError(cart.checkout());
  expect(error).toEqual(new Error('empty cart'));
});
```

Хелперы импортируются из основного `vitest-auto-spy`, rxjs во время выполнения им не нужен.

| Хелпер                                   | Чем выполняется промис                   | Когда падает                                                         |
| ---------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `expectEmission(source$, opts?)`         | первым значением                         | ничего не пришло вовремя, поток упал с ошибкой или завершился пустым |
| `expectEmissions(source$, count, opts?)` | первыми `count` значениями, массивом     | пришло меньше `count`, поток упал с ошибкой или завершился раньше    |
| `expectAllEmissions(source$, opts?)`     | всеми значениями, когда поток завершится | поток не завершился вовремя или упал с ошибкой                       |
| `expectNoEmission(source$, opts?)`       | `void`                                   | что-то пришло, пока поток должен был молчать                         |
| `expectNoEmissionSync(source$, opts?)`   | ничем (возвращает `void`, бросает)       | что-то пришло во время подписки и выполнения `advance`               |
| `expectCompletion(source$, opts?)`       | `void`                                   | поток ещё работает, когда истёк таймаут, или упал с ошибкой          |
| `expectError(source$, opts?)`            | ошибкой, ровно той, что бросили          | поток завершился или молчит вместо того, чтобы упасть                |

```ts
await expect(expectEmission(component.visible$)).resolves.toBe(true); // первое значение, не список
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // список из трёх
await expectNoEmission(source$, { timeout: 50 }); // тишина 50 мс
await expectCompletion(service.purgeCache()); // поток завершился
```

**Частая ошибка:** запустить поток раньше, чем начали ждать. Значение, выданное до подписки хелпера,
теряется, и ожидание падает с «the stream completed after 0 emissions» или по таймауту. Сначала вызовите
хелпер и сохраните промис, потом запускайте, потом `await` (как в первом примере). Если потоку нужно
сдвинуть часы, см. [`advance`](#advance-—-the-window-between-subscribing-and-awaiting).

## Параметры {#options}

Каждый хелпер принимает один и тот же объект параметров последним аргументом:

| Параметр  | По умолчанию                        | Смысл                                                                                                                                                     |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeout` | `1000` (`0` для `expectNoEmission`) | сколько мс ждать значения. В `expectNoEmission` — сколько должна длиться тишина; `0` — одна макрозадача. В остальных `0` или `Infinity` — без ограничения |
| `label`   | нет                                 | имя потока в сообщении о падении вместо `source$`                                                                                                         |
| `skip`    | `0`                                 | пропустить первые `N` значений. `BehaviorSubject` / `shareReplay` при подписке сразу отдают текущее значение; `skip: 1` его пропускает                    |
| `until`   | нет                                 | ждать первого значения, прошедшего предикат; остальные всё равно считаются в сообщении о падении                                                          |
| `advance` | нет                                 | колбэк, который выполняется один раз — после подписки и до того, как вернётся промис                                                                      |

Чтобы поменять `timeout` по умолчанию на весь прогон, вызовите `setEmissionTimeout(ms)` в setup-файле
(см. [Сторожевой таймер идёт по реальному времени](#the-watchdog-runs-on-real-time-—-even-under-fake-timers)).

## `await` не опционален {#the-await-is-not-optional}

Каждый хелпер подписывается в момент вызова и сообщает результат через промис. Если его не `await`,
подписку никто не закроет, и проверка не случится.

[`setupAutoSpy()`](/ru/utilities/setup) закрывает каждое ожидание, открытое к концу теста, раньше любой
другой уборки, и называет его:

```text
[vitest-auto-spy] "cart > saves" never awaited 1 emission wait (saved$), so its assertion never ran.
Await it, or return it from the test. Its subscription is torn down now.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions
```

Как исправить: `await` вызов или сохраните его в переменную и `await` её до конца теста. Сам промис
остаётся неразрешённым: его тест закончился, и поймать отказ некому.

## Как выбрать нужную эмиссию {#choosing-which-emission-counts}

`skip` и `until` переносят условие в проверку, а не в поток:

```ts
await expect(expectEmission(isXl$, { skip: 1 })).resolves.toBe(true); // shareReplay / BehaviorSubject
await expect(expectEmission(params$, { until: (p) => p.channelId === expected })).resolves.toEqual(…);
await expect(expectEmissions(ids$, 2, { until: (id) => id > 5 })).resolves.toEqual([6, 7]);
```

`source$.pipe(skip(1))` или `pipe(filter(…))` отобрали бы те же значения, но сообщение о падении было бы
хуже. С параметрами неподходящие значения всё равно **считаются**, поэтому таймаут пишет
`4 emissions within 1000 ms`, а не `0 received`. Видно, что «сработало не то», а не «ничего не
сработало». Сообщение упоминает и `skip`: `expected 1 after skipping 5`.

Предикат вызывается по разу на значение ([производительность](/ru/core/performance)).

**Частая ошибка:** `expectEmissions(source$, 0)`. Такой вызов отвергается сразу: ни один поток не
выполнит счёт меньше единицы. Следите за этим, когда число вычисляется, например
`expectEmissions(source$, expected.length)` с пустым списком. Тишину проверяйте через
`expectNoEmission(source$)`.

## `expectCompletion` — когда дело не в значении {#expectcompletion-—-when-the-value-is-not-the-point}

Для сохранения, очистки, `Observable<void>` или `Subject`, который закрывает уборка. `firstValueFrom`
отклоняет такой поток ошибкой `EmptyError` из rxjs.

```ts
import { expectCompletion } from 'vitest-auto-spy';

await expectCompletion(service.purgeCache());
await expectCompletion(closed$, { label: 'closed$', timeout: 2_000 });
```

Выданные значения ему не мешают: он проверяет только, что поток завершился. Чтобы проверить, что ничего
не выдано, используйте `expectNoEmission`.

`expectAllEmissions` тоже ждёт завершения и выполняется **всеми** значениями. Он нужен для «выдаёт ровно
это и ничего после». `expectEmissions(source$, n)` так проверить не может: он останавливается на `n`:

```ts
import { expectAllEmissions } from 'vitest-auto-spy';

await expect(expectAllEmissions(source$.pipe(trueMap()))).resolves.toEqual([true, true]);
```

`skip` и `until` выбирают, какие значения собирать, как и у остальных хелперов.

## `expectError` — когда предмет проверки и есть сбой {#expecterror-—-when-the-failure-is-the-subject}

`expectError` выполняется **самой** ошибкой, ровно той, что бросил поток. Используйте его, когда тест
про ошибку:

```ts
import { expectError } from 'vitest-auto-spy';

await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UpstreamStatusError);
```

- Он ждёт ошибку, как бы поздно она ни пришла. Поток, который сначала выдаёт значения, а потом падает,
  тоже здесь разрешится.
- Он падает с именем потока, если поток завершился или молчит.

Остальные хелперы оборачивают ошибку потока в **новый** `Error` с именем потока, поэтому
`rejects.toBe(originalError)` на них не сработает. Исходная ошибка лежит в `cause`, так что
`rejects.toMatchObject({ cause: original })` работает, но `expectError` разворачивать не нужно.
`firstValueFrom(source$).rejects` тоже подходит.

## `expectNoEmissionSync` — тишина в спеке без `await` {#expectnoemissionsync-—-silence-in-a-spec-with-no-await}

`expectNoEmissionSync(source$, { skip, until, advance, label })` проверяет тишину без `await`. Он
подписывается, выполняет `advance`, отписывается и сразу бросает, если что-то пришло:

```ts
import { expectNoEmissionSync } from 'vitest-auto-spy';

store.dispatch(noop());
expectNoEmissionSync(store.saved$, { skip: 1 }); // пропустить повторённое значение
```

- Он доказывает тишину только для синхронного кода. Потоку, который выдаёт по таймеру, нужен
  асинхронный `expectNoEmission`.
- Завершившийся поток считается успехом.
- Принимает все параметры, кроме `timeout`. Падает так же, как асинхронные хелперы: на ошибке потока, на
  бросившем `advance` и на источнике, на который нельзя подписаться.

## `advance` — окно между подпиской и ожиданием {#advance-—-the-window-between-subscribing-and-awaiting}

Потоку на `debounceTime`, повторах или опросе нужно сдвинуть часы _после_ того, как кто-то подписался.
`advance` выполняется сразу после подписки хелпера:

```ts
await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
```

Без него пришлось бы сохранить промис в переменную, сдвинуть часы и потом `await`. Это работает, но
молча ломается, как только кто-нибудь добавит `await` строкой выше.

`advance` — колбэк, а не флаг `advanceTimers: true`: Vitest, `bun:test` и `node:test` двигают часы
по-разному, и знает, какой из них работает, только ваш тест.

Если колбэк бросит ошибку, ожидание упадёт со своим сообщением, исходная ошибка будет в `cause`, а
подписка закроется:

```
purchased$: the `advance` callback threw: Error: no fake timers installed
```

## Какие источники подходят {#which-sources-work}

Подходит всё, у чего есть метод `subscribe`; от rxjs во время выполнения ничего не зависит. Принимаются
два способа подписки, и в Angular-проекте нужны оба:

| Источник                                                                   | `subscribe` принимает |
| -------------------------------------------------------------------------- | --------------------- |
| `Observable` / `Subject` из rxjs, `toObservable()` Angular, `EventEmitter` | объект-наблюдатель    |
| `output()` Angular (`OutputEmitterRef`) и другие API на колбэках           | обычный колбэк        |

Источник, на который нельзя подписаться, падает с собственным сообщением хелпера:

```
saved$ is not subscribable ([1,2]). Pass the observable itself, not the value it emits, and check
that the spy feeding it was configured.
```

**Частая ошибка:** передать значение вместо потока или член спая, который никто не настроил. Для
`Promise` есть своё сообщение: `await` его напрямую или передайте observable, из которого он получен.
Обычно по ошибке передают `firstValueFrom(source$)`.

## Тип эмитируемого значения выводится сам {#the-emitted-type-is-inferred}

`expectEmission(of(1))` — это `Promise<number>`, а `expectEmissions(of(1), 2)` — `Promise<number[]>`.
Это работает и через `toObservable()` Angular, и через `Subject`. Аргумент типа не нужен.

## Синхронный источник останавливается там, где разрешилось ожидание {#a-synchronous-source-stops-where-the-wait-settles}

Хелперы умеют отписаться прямо внутри значения, которое их разрешило, как `firstValueFrom`. Поэтому
синхронный источник перестаёт выдавать значения, как только хелпер получил нужное:

```ts
import { from, of, repeat, tap } from 'rxjs';

const seen = vi.fn();

await expect(expectEmission(from([1, 2, 3, 4, 5]).pipe(tap(seen)))).resolves.toBe(1);
expect(seen).toHaveBeenCalledTimes(1); // один раз, а не пять

await expect(expectEmission(of(1).pipe(repeat()))).resolves.toBe(1); // бесконечный источник, разрешился
```

- Спай в `tap`, `finalize` или `defer` **не** вызывается для значений после принятого. Столько же
  вызовов сделал бы настоящий подписчик.
- `expectEmissions(source$, 3)` берёт ровно три и останавливается.
- `expectNoEmission` падает на первом значении, не дожидаясь конца последовательности.

## Сообщения о падении {#failure-messages}

Каждое падение начинается с упавшего вызова (`expectEmission(saved$)` или `expectEmission(source$)`
без `label`), говорит, что сделал поток, и называет одну вещь, которую стоит проверить:

```
[vitest-auto-spy] expectEmission(saved$): no value within 1000 ms (0 received). Nothing triggered the
stream — check the call that should make it emit, or the spy feeding it (`nextWith`).
Docs: https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions#failure-messages
```

| Что случилось                                   | Что пишет сообщение                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| значения пришли, но не то, что ждали            | считает их и показывает первые пять: `3 emissions (1, 2, 3) within 1000 ms, expected 1 matching`; указывает на `until`    |
| значений слишком мало                           | `the stream completed after 7 emissions (1, 2, 3, 4, 5, … 2 more), expected 9`                                            |
| не завершился вовремя                           | `did not complete within 20 ms (3 emissions received: 1, 2, 3)`                                                           |
| завершился пустым                               | значение, скорее всего, выдано до подписки хелпера (см. ниже)                                                             |
| поток упал с ошибкой                            | цитирует ошибку и указывает на [`expectError`](#expecterror-—-when-the-failure-is-the-subject); исходная ошибка в `cause` |
| `expectNoEmission` получил повторённое значение | называет его повтором (`BehaviorSubject`, `shareReplay`, `startWith`) и предлагает `{ skip: 1 }`                          |
| `expectNoEmission` получил значение позже       | связывает его с тем, что запустил тест                                                                                    |
| задан `skip`                                    | `expected 1 after skipping 5`                                                                                             |
| неверен сам вызов                               | источник без подписки, бросивший `advance`, `expectEmissions(source$, 0)` (см. выше)                                      |

Поток, завершившийся пустым, почти всегда выдал значение до того, как кто-то подписался:

```
[vitest-auto-spy] expectEmission(saved$): the stream completed after 0 emissions, expected 1. The value
was most likely emitted before this subscribed: start the wait first (hold the promise), then trigger.
```

Под фейковыми таймерами таймаут добавляет одно предложение: замороженные часы тогда — самая вероятная
причина тишины. С настоящими таймерами его нет:

```
… Timers are fake and 2 callbacks wait on it: advance them inside the wait,
`{ advance: () => vi.advanceTimersByTime(ms) }` — this watchdog runs on real time and never advances them.
```

### Фрейм кода открывает строку вашей спеки {#the-code-frame-opens-your-spec-line}

Падение указывает на строку `await expectEmission(…)` в вашей спеке, а не на код библиотеки. Хелпер
запоминает стек при вызове и прикрепляет его к падению, которое строит позже.

Так делается только для собственных ошибок хелперов. Ошибка, которой выполняется `expectError`,
принадлежит коду под тестом и сохраняет свой стек, поэтому указывает туда, где случился сбой.

### Сторожевой таймер идёт по реальному времени — даже под фейковыми таймерами {#the-watchdog-runs-on-real-time-—-even-under-fake-timers}

Ограничение по времени идёт по настоящим часам, даже если тест использует фейковые таймеры. Хелпер _и
есть_ проверка, поэтому тест не должен уметь остановить его часы. Ограничение на фейковых часах к тому
же гонялось бы с таймерами, которые двигает тест: `expectEmission(source$, { timeout: 200 })`, а затем
`vi.advanceTimersByTime(5_000)` истекло бы на 200 фейковых мс, раньше значения, к которому двигался тест.

Цена: с глобальными фейковыми таймерами _падающее_ ожидание тратит одну настоящую секунду. Не
отвечайте на это `{ timeout: 0 }` в каждом вызове: так ограничение пропадает, и следующий молчащий
поток повиснет до таймаута самого раннера без внятного сообщения. Лучше один раз понизить умолчание:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // часы заморожены; настоящая секунда ничего не даёт
```

- `setEmissionTimeout` действует на весь процесс. На `expectNoEmission` он не влияет: там ожидание —
  окно тишины, а не ограничение.
- Он отвергает `NaN` и отрицательные числа. `0` и `Infinity` отключают ограничение намеренно.
- API таймеров не умеет ждать дольше 2³¹−1 мс, поэтому любой бесконечный `timeout` значит «без
  ограничения», как `0`.

#### zone.js — единственный фейкер, от которого захват не убежит {#zone-js-is-the-one-faker-a-capture-does-not-escape}

Хелперы сохраняют настоящий `setTimeout` при импорте, поэтому `vi.useFakeTimers()` не может остановить
ограничение. zone.js подменяет `setTimeout` раньше, ещё при загрузке. Поэтому при zone.js хелперы берут
исходную функцию, которую zone.js хранит под `__zone_symbol__setTimeout`. Внутри `fakeAsync` ни один
`tick()` тоже не может истечь ограничение. Без zone.js ничего не меняется.

## rxjs не требуется {#no-rxjs-required}

Хелперы принимают всё, у чего есть метод `subscribe`, поэтому лежат в основном импорте
`vitest-auto-spy` и не загружают rxjs во время выполнения. Они работают с `Observable` и `Subject` из
rxjs, результатами `toObservable()` Angular и самописными источниками.

Ограничение по времени использует функции таймеров, сохранённые при импорте, поэтому
`vi.useFakeTimers()` не может его заглушить: падение остаётся «поток не выдал значение», а не «тест
вышел по таймауту». Синхронный источник (`of(…)`, `BehaviorSubject`) разрешается и отписывается, не
запуская таймер.

::: tip Линтер
Правило [`no-expect-in-subscribe`](../utilities/eslint-plugin) помечает `expect()` внутри колбэка
`subscribe()` и ведёт сюда. Самописная форма `expectNoEmission` (`let`, который заполняет колбэк, и
проверка `toEqual([])`) — это то, о чём сообщает
[`no-vacuous-absence-assertion`](/ru/utilities/eslint-rules#no-vacuous-absence-assertion): она проходит
и когда поток выдал пустой список, и когда он не выдал ничего.
:::

## Замерено: четыре формы против четырёх потоков {#measured-four-forms-against-four-streams}

Коротко: `expect()` внутри `subscribe()` прошёл во всех четырёх случаях ниже, хотя каждая проверка
ложна. `await expectEmission` упал во всех четырёх и назвал поток.

Опыт: один файл спеки, одна и та же ложная проверка, записанная четырьмя способами, на четырёх потоках.
Один выдаёт не то значение, один падает с ошибкой, один завершается пустым, один не делает ничего.

```ts
const scenarios = {
  wrongValue: () => of(1),
  errors: () => throwError(() => new Error('boom')),
  completesEmpty: () => EMPTY,
  neverEmits: () => NEVER,
};

for (const [name, make] of Object.entries(scenarios)) {
  describe(name, () => {
    it('1. bare subscribe', () => {
      make().subscribe((v) => expect(v).toBe(999));
    });

    it(
      '2. new Promise(done) + subscribe',
      () =>
        new Promise<void>((done) => {
          make().subscribe((v) => {
            expect(v).toBe(999);
            done();
          });
        }),
      1200,
    );

    it('3. await firstValueFrom', async () => {
      expect(await firstValueFrom(make())).toBe(999);
    }, 1200);

    it('4. await expectEmission', async () => {
      expect(await expectEmission(make(), { label: 'source$', timeout: 300 })).toBe(999);
    }, 1200);
  });
}
```

Шестнадцать тестов, каждый проверяет ложное утверждение. Падают двенадцать:

```text
 Test Files  1 failed (1)
      Tests  12 failed | 4 passed (16)
     Errors  4 errors
```

Проходят четыре теста `bare subscribe`, по одному в каждом сценарии.

|                           | `of(1)`: не то значение       | `throwError(boom)`                                                              | `EMPTY`                                                                        | `NEVER`                                                         |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1. голый `subscribe`      | **зелёный** ⁽¹⁾               | **зелёный** ⁽¹⁾                                                                 | **зелёный**                                                                    | **зелёный**                                                     |
| 2. `new Promise(done)`    | `Test timed out in 1200ms`    | `Test timed out in 1200ms`                                                      | `Test timed out in 1200ms`                                                     | `Test timed out in 1200ms`                                      |
| 3. `await firstValueFrom` | `expected 1 to be 999` + дифф | `Error: boom`                                                                   | `EmptyError: no elements in sequence`                                          | `Test timed out in 1200ms`                                      |
| 4. `await expectEmission` | `expected 1 to be 999` + дифф | `expectEmission(source$): the stream errored instead of emitting: Error: boom…` | `expectEmission(source$): the stream completed after 0 emissions, expected 1…` | `expectEmission(source$): no value within 300 ms (0 received)…` |

В каждой колонке порядок одинаковый: форма 1 молчит, форма 2 говорит только, что вышло время, форма 3
говорит, что случилось, а форма 4 — что случилось **и с каким потоком**.

⁽¹⁾ Эти два зелёные, но не молчаливые. `of(1)` синхронный, поэтому проверка выполняется и бросает —
внутри колбэка `subscribe`. rxjs пробрасывает ошибку вне теста. Она приходит после итогов и
приписывается тому тесту, который в тот момент шёл:

```text
⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯
Vitest caught 4 unhandled errors during the test run.
AssertionError: expected 1 to be 999
The latest test that might've caused the error is "2. new Promise(done) + subscribe".
```

Код выхода — 1, но упавший тест не назван, а названный — вообще другой. С **асинхронным** источником
(`timer()` под фейковыми таймерами, `httpResource`, всё, что за планировщиком) хуже: колбэк не
вызывается вовсе, ничего не бросается, и файл тихо зелёный.

### Как это писать {#how-to-write-it}

```ts
// ❌ зелёный, что бы ни сделал поток
service.collect().subscribe((result) => {
  expect(result).toEqual(expected);
});

// ❌ колбэк `done` из Jest, перенесённый на Vitest: зависание вместо диффа
it('collects', () =>
  new Promise<void>((done) => {
    service.collect().subscribe((result) => {
      expect(result).toEqual(expected);
      done();
    });
  }));

// ✅ чистый rxjs, когда источник синхронный или точно выдаст значение
expect(await firstValueFrom(service.collect())).toEqual(expected);

// ✅ когда может и не выдать: падение называет поток и стоит таймаута хелпера, а не теста
expect(await expectEmission(service.collect(), { label: 'collect()' })).toEqual(expected);
```

Обе формы с `✅` верны. Берите `firstValueFrom`, когда поток точно выдаст значение. С колонкой `NEVER`
он не справится: раннер сообщит голый таймаут, без имени потока, через свои 5 000 мс по умолчанию.
`EmptyError: no elements in sequence` страдает тем же: сообщение верное, но не говорит, какой из
потоков в файле оказался пустым.

Обе формы с `❌` ловятся линтером: [`no-expect-in-subscribe`](../utilities/eslint-plugin) — первую,
[`no-done-callback`](../utilities/eslint-plugin) — вторую.
