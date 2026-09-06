---
title: Заглушка медиаэлемента
description: stubMediaElement — <video> / <audio>, который играет, сообщает длительность и шлёт события, которые слушает компонент, а jsdom не шлёт.
---

# Заглушка медиаэлемента

::: tip Переехало в 4.0.0
Раньше это экспортировалось из корневого входа. Реэкспорт в ESM жадный, и ни один раннер не
тряхнёт дерево тестового файла, поэтому каждая спека в каждом проекте — включая Node-сервисы —
исполняла DOM-заглушки ради `createSpyFromClass`. Теперь они живут за `vitest-auto-spy/dom-stubs`:
**−0,159 мс** на каждом файле спеки, который их не импортирует, **+0,155 мс** на тех, что
импортируют, и минус 20,3 кБ у `dist`. Хелперы те же, сигнатуры те же; `restoreMockedProps()` и
`setupAutoSpy()` из корня по-прежнему возвращают на место всё, что здесь пропатчено.
:::

```ts
import { stubMediaElement } from 'vitest-auto-spy/dom-stubs';

const media = stubMediaElement({ duration: 120 });
```

jsdom реализует медиаэлементы как оболочку, и любая сюита про плеер, рекламу или субтитры упирается в
один и тот же список:

| Что делает тестируемый код       | Что делает jsdom                                     |
| -------------------------------- | ---------------------------------------------------- |
| `await video.play()`             | бросает `Not implemented: HTMLMediaElement.play()`   |
| `video.duration`                 | `NaN`, и это аксессор — присваивание бросает         |
| `video.canPlayType('video/mp4')` | `''` на любой тип, так что детект возможностей — нет |
| `video.readyState`               | `0`, навсегда                                        |
| `video.error`                    | его вообще нет на прототипе                          |
| `video.load()`                   | ничего                                               |

И спека пишет сорок строк `Object.defineProperty` по `HTMLMediaElement.prototype` — которые утекают в
следующий файл, потому что снимать их некому.

## Как им управлять {#driving-one}

```ts
const fixture = TestBed.createComponent(PlayerComponent);
fixture.detectChanges();

const video = fixture.nativeElement.querySelector('video');

media.set(video, { readyState: 1 }); // шлёт `loadedmetadata`
media.set(video, { currentTime: 119 }); // шлёт `timeupdate`
media.set(video, { ended: true }); // шлёт `ended`

expect(media.play).toHaveBeenCalledTimes(1);
expect(component.finished()).toBe(true);
```

`set` — та часть, которую написанный руками патч обычно делает неправильно. Продакшен-код слушает
`durationchange` / `timeupdate` / `ended`; одно лишь присваивание поля оставляет эти обработчики
неисполненными, так что компонент остаётся в начальном состоянии, а ассерт читает элемент и видит
новое значение — расхождение, которое выглядит как баг в компоненте.

| Поле, переданное в `set` | Какое событие шлётся |
| ------------------------ | -------------------- |
| `duration`               | `durationchange`     |
| `readyState` ≥ 1         | `loadedmetadata`     |
| `currentTime`            | `timeupdate`         |
| `ended: true`            | `ended`              |
| ненулевой `error`        | `error`              |

`ended: false` и `error: null` не объявляют ничего: они сбрасывают состояние, а события для этого у
платформы нет.

## Состояние — на каждый элемент своё {#state-is-per-element}

```ts
media.set(advert, { duration: 15 });

expect(advert.duration).toBe(15);
expect(content.duration).toBe(120); // значение опции по умолчанию
```

Патч, который замыкается на одной переменной `duration`, сообщает одинаковую длительность и для
рекламы, и для контента — ровно для той пары, ради различения которой спека плеера и существует. У
каждого элемента своя запись, по слабой ссылке, и `media.state(element)` её читает.

## `play`, `pause`, `load`, `canPlayType` {#play-pause-load-canplaytype}

Это моки раннера, общие для всех медиаэлементов, поэтому применим любой матчер:

```ts
expect(media.pause).toHaveBeenCalledTimes(1);
```

`play()` резолвит промис, а не возвращает `undefined` — продакшен-код сплошь и рядом вешает `.catch()`
на результат, чтобы проглотить отказ автоплея, и на `undefined` из jsdom эта строка бросает. Заодно
он шлёт `play` и `playing`, потому что компонент может ждать любое из двух.

`canPlayType` по умолчанию отвечает `'probably'`, а если какой-то кодек должен быть неподдержанным —
принимает реализацию:

```ts
stubMediaElement({ canPlayType: (type) => (type.includes('vp9') ? '' : 'probably') });
```

## Установка и откат {#installation-and-undo}

Патч ложится на `HTMLMediaElement.prototype`, поэтому покрывает и элемент, который продакшен-код
создаёт сам через `document.createElement('video')`, — случай, до которого поэкземплярная заглушка не
дотягивается. Ставится он через `mockValueProp` / `mockReadonlyPropGetter`, так что
`restoreMockedProps()` — который [`setupAutoSpy()`](/ru/utilities/setup) гоняет после каждого теста —
возвращает настоящий прототип.

Ставьте его в `beforeEach` или через
[`installPerTest`](/ru/utilities/setup#reinstalling-a-stub-for-every-test): заглушка, поставленная
один раз на уровне `describe`, будет снята после первого же теста.
