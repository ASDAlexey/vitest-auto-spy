---
title: Фейковые таймеры
description: setupFakeTimers объединяет установку и снятие часов, а advanceTimers дочищает микротаски, которые одиночный advance оставляет висеть.
---

# Фейковые таймеры {#fake-timers}

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

Два куска бойлерплейта, которые рано или поздно пишет каждая сюита, проверяющая дебаунс, поллинг или
ретраи, — и один баг, который в них прячется.

## `setupFakeTimers(config?)` {#setupfaketimers-config}

Ставит часы в `beforeEach` и возвращает их в `afterEach`.

Когда это два отдельных хука, второй — как раз тот, который сюита забывает: оставшиеся замороженными
часы утекают в каждый следующий файл того же воркера и всплывают там как посторонний тест, висящий
на `setTimeout`, который никогда не сработает. Связать их одним вызовом — в этом весь смысл хелпера.

Оба хука защищены. Двойная установка или снятие не делает круг туда-обратно: сюита, которая сама
управляет часами, или вложенный `describe`, вызывающий этот хелпер ещё раз, иначе доходит до второго
`vi.useRealTimers()` — а тот оставляет окружение без `clearInterval`, и это взрывается при тирдауне
того файла, который случится следующим.

Этот `afterEach` также возвращает на место любой таймерный глобал, который снятие не восстановило,
а удалило. В happy-dom `Date` наследуется из realm окружения, поэтому `vi.useRealTimers()` удаляет
его, а не переприсваивает; при `isolate: false` следующий файл затем умирает внутри собственного
`useFakeTimers` Vitest. Полная история — в разделе [«Гигиена тестового прогона»](./setup#_6-putting-back-timer-globals-the-fakes-took-with-them),
включая самостоятельный `restoreTimerGlobals()`.

Необязательный `config` передаётся в `vi.useFakeTimers()` дословно и типизирован по собственной
сигнатуре Vitest, поэтому следует за всем, что принимает установленная версия:

```ts
setupFakeTimers({ toFake: ['setTimeout'] }); // leave Date and queueMicrotask real
```

### Изъятие `setImmediate` из `toFake` {#taking-setimmediate-out-of-tofake}

Значение `toFake` по умолчанию в Vitest — _все_ таймеры, какие есть у окружения, кроме
`process.nextTick` и `queueMicrotask` (Vitest 4.1.9). В Node это включает `setImmediate`, и именно
`setImmediate` — тот, чьё отсутствие ощущается далеко за пределами таймерного кода.

Роутер Express завершает запрос без совпадений через `setImmediate(done, layerError)`
(`router/index.js:203`). С замороженными часами этот колбэк ставится в очередь и никогда не
исполняется, поэтому запрос, который должен вернуться с `404`, висит, пока раннер не сдаётся:

```text
Test timed out in 30000ms
```

Никто, увидев это на HTTP-вызове, не пойдёт искать ошибку в роутинге — естественное прочтение:
зависший сокет, а настоящий дефект лежит тремя слоями в стороне. **Сюите, которая гоняет настоящий
HTTP-хендлер, нужно вывести `setImmediate` из `toFake`.** Перечислите нужные таймеры; всё
неперечисленное останется настоящим:

```ts
setupFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
```

Для целого прогона тот же объект уходит в [`setupAutoSpy`](./setup#fake-timers-for-the-whole-run):

```ts
setupAutoSpy({ globalFakeTimers: { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] } });
```

Сужение `toFake` — это лекарство; `vi.useRealTimers()` внутри файла — нет. Он разоружает часы, против
которых написана остальная часть файла — а с `betweenTests` или `globalFakeTimers` и остальная часть
прогона, — а защищённая постановка выше существует для того, чтобы попытка это сделать не утащила за
собой ещё и тирдаун, а не чтобы сделать это поддерживаемым путём выхода.

## Между тестами тоже — `betweenTests` {#between-the-tests-as-well-—-betweentests}

```ts
setupFakeTimers(undefined, { betweenTests: true });
```

По умолчанию выключено: вызов в скоупе принадлежит своему `describe` и обязан оставить часы такими,
какими нашёл. Включённым — часы остаются фейковыми и в паузах _между_ тестами, что и делал
Jest-овский `fakeTimers.enableGlobally` и против чего была написана перенесённая с него сюита.

Постановки в одном `beforeEach` для этого мало, и разрыв не гипотетический: `beforeAll` внутри
**вложенного** `describe` выполняется _после_ `afterEach` предыдущего теста и встречает то, что тот
хук оставил после себя. Блок, готовящий там свои образцы данных — скажем, гоняющий часы анимации
через `vi.advanceTimersByTimeAsync`, — падает с `A function to advance timers was called but the
timers APIs are not mocked`, причём в наборе, чьи собственные тесты таймеров вообще не трогают.

Поэтому фейки перевзводятся в `afterEach` сразу после снятия и снимаются окончательно в `afterAll` —
это та граница, которая важна при `isolate: false`, где часы, пережившие свой файл, встретили бы
импорты следующего. Каждый тест всё равно стартует с чистого листа: снятие отбрасывает всё, что
запланировал предыдущий.

Для целого прогона [`setupAutoSpy({ globalFakeTimers: true })`](./setup#fake-timers-for-the-whole-run)
включает это из сетап-файла — опция существует ровно для этого случая и сама передаёт
`betweenTests`.

## `advanceTimers(ms?)` {#advancetimers-ms}

`vi.advanceTimersByTime()` плюс шаг, который легко упустить.

Продвижение исполняет таймерные колбэки синхронно, но то, что они _ставят в очередь_, ещё сидит в
очереди микротасков к моменту следующей строки: резолвнувшийся промис, продолжение после `await`,
RxJS-овский `delay()`, отдающий управление обратно. Ассерт затем читает состояние с того момента,
когда колбэк ещё не завершился, и тест падает так, будто в коде под тестом гонка.

```ts
// Fails like a race in the code under test:
vi.advanceTimersByTime(300);
expect(search.query).toHaveBeenCalled();

// Awaits the queue the callback filled:
await advanceTimers(300);
expect(search.query).toHaveBeenCalled();
```

Поэтому она `async` — возвращаемое значение нужно ждать через `await`.

`ms` по умолчанию `0` — шаг «исполнить всё уже назревшее, потом дочистить микротаски», ровно то,
что нужно `setTimeout(fn, 0)` или цепочке резолвнувшихся промисов.

На настоящих таймерах она бросает ошибку, называющую лекарство, вместо того чтобы позволить Vitest
упасть глубже с `timers are not mocked`.

::: tip Angular
Пара к нему — [`stable(fixture)`](../adapters/angular#zoneless-waiting): `advanceTimers` двигает
часы, а `stable` дочищает эффекты и change detection, которые эти часы запустили.
:::
