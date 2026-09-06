---
title: Проверки на Observable
description: expectEmission, expectEmissions, expectNoEmission и expectCompletion — проверки, которые падают, когда поток молчит.
---

# Проверки на Observable

`expect(...)` внутри колбэка `subscribe()` — самый распространённый способ написать тест, который
проходит, ничего при этом не проверяя: если поток не эмитит, колбэк не выполняется, ни одно ожидание
не вычисляется, и тест зелёный и пустой. Эти хелперы переворачивают ситуацию — **проверкой является
сам `await`**.

```ts
import { expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toBe(true); // первое ЗНАЧЕНИЕ, а не список
await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // сама задача, а не `[task]`
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // вот тут список
await expectNoEmission(source$, { timeout: 50 }); // проверяет молчание
await expectCompletion(service.purgeCache()); // проверяет завершение
```

| Хелпер                                   | Возвращает                             | Отклоняется, когда                                                                       |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `expectEmission(source$, opts?)`         | первое значение                        | ничего не пришло вовремя, поток упал с ошибкой или завершился пустым                     |
| `expectEmissions(source$, count, opts?)` | первые `count` значений массивом        | вовремя пришло меньше `count`, поток упал с ошибкой или завершился недобрав              |
| `expectNoEmission(source$, opts?)`       | `void`                                 | что-нибудь пришло, хотя должно было быть тихо                                             |
| `expectCompletion(source$, opts?)`       | `void`                                 | поток всё ещё работает, когда истёк таймаут, или упал с ошибкой                          |
| `expectError(source$, opts?)`            | ошибку, без обёртки                    | поток завершился или промолчал вместо того, чтобы упасть                                 |

## Тип эмитируемого значения выводится сам {#the-emitted-type-is-inferred}

`expectEmission(of(1))` — это `Promise<number>`, а `expectEmissions(of(1), 2)` — `Promise<number[]>`,
в том числе через ангуляровский `toObservable()` и через `Subject`, в который пишет спека. До 3.4.0
оба возвращали `Promise<unknown>`: тип параметра хелпера совпадал с перегруженным `subscribe` из rxjs
так, что не выводилось ничего; вызов компилировался, `resolves.toBe(1)` проходил, и потеря вылезала
только когда кто-нибудь читал поле у дождавшегося значения. Никакой ручной аргумент типа больше не
нужен.

## Какие источники подходят {#which-sources-work}

Источник определяется по утиной типизации, поэтому в рантайме здесь ничто не зависит от rxjs.
Принимаются два контракта подписки, и в ангуляровской кодовой базе нужны оба:

| Источник                                                                | Что принимает `subscribe` |
| ----------------------------------------------------------------------- | ------------------------- |
| rxjs `Observable` / `Subject`, ангуляровский `toObservable()`, `EventEmitter` | объект-наблюдатель        |
| `output()` из Angular — `OutputEmitterRef` — и прочие колбэчные API      | голый колбэк              |

Второй вариант раньше зависал. `OutputEmitterRef.subscribe(callback)` сохраняет то, что ему дали, и
зовёт это на `emit()` внутри `try/catch`, отправляющего сбои в ангуляровский `ErrorHandler`, поэтому
переданный объект-наблюдатель не давал вообще никакой видимой ошибки — просто
`await expectEmission(component.selectionChange)` ждал сторожевой таймер.

## `expectCompletion` — когда дело не в значении {#expectcompletion-—-when-the-value-is-not-the-point}

Сохранение, очистка кеша, `Observable<void>`, `Subject`, который закрывает teardown. `firstValueFrom`
отклоняет такой поток rxjs-овским `EmptyError`, а обходной путь, к которому люди приходят,
`lastValueFrom(source$, { defaultValue: undefined })`, читается так, будто интересно тут значение по
умолчанию, — тогда как вся проверка звучит как «оно завершилось».

```ts
await expectCompletion(service.purgeCache());
await expectCompletion(closed$, { label: 'closed$', timeout: 2_000 });
```

Эмиссии его не роняют — он проверяет завершение и ничего не говорит о том, что было до. Когда важна
тишина, берите `expectNoEmission`.

## `expectError` — когда предмет проверки и есть сбой {#expecterror-—-when-the-failure-is-the-subject}

Остальные хелперы заворачивают падение потока в **новую** `Error`, в сообщении которой назван поток.
Это правильно, когда докладываешь о сбое, которого никто не ждал, и бесполезно, когда сбой и есть то,
что тестируется: `rejects.toBe(originalError)`, `rejects.toBeInstanceOf(UdmsStatusError)` и точное
`expect(err.message).toBe('websso fail')` — всё это падает об обёртку.

`expectError` возвращает **саму** ошибку ровно такой, какой её бросили, поэтому каждая из этих
проверок становится обычной:

```ts
await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UdmsStatusError);
```

Он ждёт ошибку, как бы поздно она ни пришла, — поток, который сперва эмитит, а потом падает, всё
равно разрешится здесь по сбою — и падает, назвав поток, если тот вместо этого завершился или
промолчал. Обёрнутые сбои остальных хелперов теперь тоже несут оригинал в `cause`, так что
`rejects.toMatchObject({ cause: original })` работает; предпочтительнее всё же `expectError`, которому
разворачивать ничего не надо. `firstValueFrom(source$).rejects` тоже остаётся вполне рабочим.

## Как выбрать нужную эмиссию {#choosing-which-emission-counts}

`skip` и `until` переносят интересующее условие в саму проверку, а не в источник.

```ts
await expect(expectEmission(isXl$, { skip: 1 })).resolves.toBe(true); // shareReplay / BehaviorSubject
await expect(expectEmission(params$, { until: (p) => p.channelId === expected })).resolves.toEqual(…);
await expect(expectEmissions(ids$, 2, { until: (id) => id > 5 })).resolves.toEqual([6, 7]);
```

`source$.pipe(skip(1))` и `pipe(filter(…))` говорят то же самое и стоят импорта rxjs в спеке, весь
смысл которой был в том, что он ей не нужен, — но настоящая разница в падении. Не подошедшие эмиссии
всё равно **считаются**, поэтому таймаут читается как `4 emission(s) received`, а не `0`, и «сработало
не то» остаётся отличимым от «не сработало ничего». `filter` перед хелпером это выбрасывает.

## `advance` — окно между подпиской и ожиданием {#advance-—-the-window-between-subscribing-and-awaiting}

Потоку, который двигают `debounceTime`, ретрай или опрос, часы надо прокрутить _после_ того, как
кто-то подписался, а `await` отдаёт управление раньше, чем выполнится следующий оператор:

```ts
await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
```

Это заменяет форму, к которой спеки приходят иначе — сохранить промис в переменную, прокрутить часы,
потом дождаться, — которая верна и молча ломается в тот момент, когда кто-нибудь добавит `await`
строкой выше. Это колбэк, а не флаг `advanceTimers: true`, потому что эти хелперы живут в **ядре**, в
котором нет тест-раннера: `vi`, `bun:test` и `node:test` крутят свои часы по-разному, и только спека
знает, на каком из них она.

## Параметры {#options}

| Параметр  | По умолчанию                        | Комментарий                                                                                                         |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `timeout` | `1000` (`0` для `expectNoEmission`) | Сколько миллисекунд ждать значения — или, в `expectNoEmission`, сколько должна держаться тишина. `0` снимает сторожа |
| `label`   | —                                   | Имя, которое попадёт в сообщение о падении вместо общего «the observable»                                            |
| `skip`    | `0`                                 | Пропустить первые `N` эмиссий — устаревшее первое значение `shareReplay` / `BehaviorSubject`                          |
| `until`   | —                                   | Ждать первую эмиссию, удовлетворяющую предикату; остальные всё равно считаются в отчёте о падении                    |
| `advance` | —                                   | Выполняется один раз, после того как подписка создана, и до того, как промис отдан наружу                            |

### Сторожевой таймер идёт по реальному времени — даже под фейковыми таймерами {#the-watchdog-runs-on-real-time-—-even-under-fake-timers}

Это сделано намеренно, и причин две. Хелпер _и есть_ проверка, поэтому его часы должны быть тем
единственным, что спека остановить не может; а виртуальный сторож гонялся бы с таймерами, которые
спека крутит: `expectEmission(source$, { timeout: 200 })`, за которым идёт
`vi.advanceTimersByTime(5_000)`, сработал бы на 200 виртуальных мс и отклонил бы поток, до которого
спека как раз собиралась докрутить.

Цена в том, что в сюите под глобальными фейковыми таймерами _падающая_ проверка тратит настоящую
секунду, прежде чем отчитаться. Отвечать на это `{ timeout: 0 }` в каждой точке вызова не надо: так
сторож отключается, и следующий молчащий поток повиснет до собственного таймаута раннера без единого
сообщения, которое стоило бы читать. Вместо этого один раз понизьте значение по умолчанию:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // часы заморожены; настоящая секунда ничего не даёт
```

`setEmissionTimeout` действует на весь процесс и не трогает `expectNoEmission`, чьё ожидание — это
окно тишины, а не сторожевой таймер.

## Сообщения о падении {#failure-messages}

Поток, который промолчал, падает с меткой и таймаутом; упавший с ошибкой — с этой ошибкой; а
завершившийся пустым так и говорит:

```
saved$ did not emit within 1000 ms (0 emission(s) received). Either the stream never fired — check
the trigger and any provider spy feeding it — or it is slower than the timeout; raise it with
`{ timeout: … }`. This wait is real time even under fake timers, on purpose: a virtual watchdog would
race the timers your spec advances. Lower it with `setEmissionTimeout(100)` in the setup file rather
than disabling it with `{ timeout: 0 }`, which leaves the next silent stream with no message at all.
```

```
saved$ completed after 0 emission(s), expected 1. A completed-but-empty stream is the usual sign
that the value was produced before the subscription.
```

### Фрейм кода открывает строку вашей спеки {#the-code-frame-opens-your-spec-line}

Эти хелперы строят своё падение внутри колбэка `subscribe` или таймера, много позже возврата из
вызова, — поэтому стек, который видел раннер, раньше начинался в `node_modules/vitest-auto-spy/…` и
не нёс ни одного фрейма спеки, а фрейм кода в отчёте указывал на этот пакет. Теперь стек снимается на
входе в хелпер, до всякой подписки, и прикрепляется к падению, когда то наконец собрано, — так что
репортер открывает именно строку `await expectEmission(…)` в вашей спеке.

Перепривязываются только те ошибки, которые хелперы делают сами. Ошибка, которую возвращает
[`expectError`](#expecterror-—-when-the-failure-is-the-subject), принадлежит тестируемому коду и
сохраняет стек, с которым была создана: переписать его значило бы увести читателя от места, где сбой
на самом деле произошёл.

`vi.defineHelper`, который покрывает хелпер, бросающий, пока фрейм вызывающего ещё на стеке, здесь не
годится: его фрейм `__VITEST_HELPER__` оказывается **последним**, и парсер Vitest затем выбрасывает
весь стек вместе с фреймом кода.

## Замерено: четыре формы против четырёх потоков {#measured-four-forms-against-four-streams}

Утверждение выше — что `expect()` внутри `subscribe()` это самый распространённый способ написать
тест, который ничего не проверяет, — можно проверить, вот оно и проверено. Один файл спеки, одна и та
же проверка, написанная четырьмя способами, против четырёх потоков: один эмитит не то значение, один
падает с ошибкой, один завершается ничего не выдав, и один не делает вообще ничего.

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

    it('2. new Promise(done) + subscribe', () =>
      new Promise<void>((done) => {
        make().subscribe((v) => {
          expect(v).toBe(999);
          done();
        });
      }), 1200);

    it('3. await firstValueFrom', async () => {
      expect(await firstValueFrom(make())).toBe(999);
    }, 1200);

    it('4. await expectEmission', async () => {
      expect(await expectEmission(make(), { label: 'source$', timeout: 300 })).toBe(999);
    }, 1200);
  });
}
```

Шестнадцать тестов, и каждый проверяет заведомо ложное. Падают двенадцать:

```text
 Test Files  1 failed (1)
      Tests  12 failed | 4 passed (16)
     Errors  4 errors
```

Проходят четыре — это все четыре строки `bare subscribe`, во всех сценариях.

|                           | `of(1)` — не то значение      | `throwError(boom)`                                 | `EMPTY`                                              | `NEVER`                               |
| ------------------------- | ----------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| 1. голый `subscribe`      | **зелёный** ⁽¹⁾               | **зелёный** ⁽¹⁾                                    | **зелёный**                                          | **зелёный**                           |
| 2. `new Promise(done)`    | `Test timed out in 1200ms`    | `Test timed out in 1200ms`                         | `Test timed out in 1200ms`                           | `Test timed out in 1200ms`            |
| 3. `await firstValueFrom` | `expected 1 to be 999` + дифф | `Error: boom`                                      | `EmptyError: no elements in sequence`                | `Test timed out in 1200ms`            |
| 4. `await expectEmission` | `expected 1 to be 999` + дифф | `source$ errored instead of emitting: Error: boom` | `source$ completed after 0 emission(s), expected 1…` | `source$ did not emit within 300 ms…` |

Читайте таблицу по столбцам — порядок в каждом одинаков: форма 1 не говорит ничего, форма 2 говорит
только, что кончилось время, форма 3 говорит, что случилось, форма 4 говорит, что случилось **и с
каким потоком**.

⁽¹⁾ Эти два зелёные, но не молчаливые. `of(1)` синхронный, поэтому проверка действительно выполняется
и действительно бросает — в колбэк `subscribe`, откуда rxjs перебрасывает её вне очереди. Приходит она
уже после сводки и приписывается тому тесту, на котором раннер случайно оказался:

```text
⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯
Vitest caught 4 unhandled errors during the test run.
AssertionError: expected 1 to be 999
The latest test that might've caused the error is "2. new Promise(done) + subscribe".
```

Код выхода 1, ни одного названного упавшего теста, а то имя, которое всё же печатается, принадлежит
другому тесту. И тут же отметьте, что делает остальные два столбца ещё хуже: как только источник
становится **асинхронным** — `timer()` под фейковыми таймерами, `httpResource`, что угодно за
планировщиком, — колбэк не выполняется вовсе, ничего не бросается, и файл целиком и тихо зелёный.
Синхронный случай — это ещё громкий.

### Как это писать {#how-to-write-it}

```ts
// ❌ зелёный, что бы поток ни делал
service.collect().subscribe((result) => {
  expect(result).toEqual(expected);
});

// ❌ джестовский колбэк `done`, переписанный под Vitest, — покупает зависание вместо диффа
it('collects', () =>
  new Promise<void>((done) => {
    service.collect().subscribe((result) => {
      expect(result).toEqual(expected);
      done();
    });
  }));

// ✅ чистый rxjs, когда источник синхронный или заведомо эмитит
expect(await firstValueFrom(service.collect())).toEqual(expected);

// ✅ когда может и не эмитить — падение назовёт поток и стоит своего таймаута, а не таймаута теста
expect(await expectEmission(service.collect(), { label: 'collect()' })).toEqual(expected);
```

Последние две обе верны, и `firstValueFrom` — это один импорт rxjs против библиотечного хелпера;
берите его всякий раз, когда поток заведомо сработает. Чего он не умеет — это столбец `NEVER`: он
отдаёт раннеру голый таймаут, то же самое падение, что и тест на подписке, без единого названного
observable и потратив на это 5 000 мс по умолчанию. У `EmptyError: no elements in sequence` та же
беда ступенью ниже — правда, и никакой помощи в поиске того, какой из четырёх потоков в файле был
пустым.

Обе формы с `❌` ловятся линтером: [`no-expect-in-subscribe`](../utilities/eslint-plugin) — первую,
[`no-done-callback`](../utilities/eslint-plugin) — вторую.

## rxjs не требуется {#no-rxjs-required}

Источник определяется по утиной типизации — годится что угодно с методом `subscribe`, — поэтому эти
хелперы живут в **ядре** и не тянут rxjs в рантайм. Они одинаково работают с rxjs-овскими
`Observable` и `Subject`, с результатами ангуляровского `toObservable()` и с самописными
subscribable.

Сторожевой таймер использует функции таймеров, снятые на момент импорта, поэтому `vi.useFakeTimers()`
его не заглушит: падение остаётся «поток не эмитил», а не «тест не уложился в таймаут». Синхронный
источник (`of(…)`, `BehaviorSubject`) разрешается и отписывается, ни разу не взведя таймер.

::: tip Пусть ловит линтер
Правило [`no-expect-in-subscribe`](../utilities/eslint-plugin) помечает `expect()` внутри колбэка
`subscribe()` и ведёт сюда.
:::
