---
title: Заглушка медиаэлемента
description: stubMediaElement заставляет video и audio играть, сообщать длительность и отправлять события, которые слушает компонент, - jsdom этого не делает.
---

# Заглушка медиаэлемента

`stubMediaElement()` делает `<video>` и `<audio>` рабочими в тесте под jsdom: `play()` завершается,
у `duration` есть значение, а смена состояния отправляет события, которые слушает ваш компонент.
Нужна для компонентов плеера, рекламы или субтитров.

```ts
import { stubMediaElement } from 'vitest-auto-spy/dom-stubs';

let media: ReturnType<typeof stubMediaElement>;

beforeEach(() => {
  media = stubMediaElement({ duration: 120 });
});

it('marks the video finished', () => {
  const fixture = TestBed.createComponent(PlayerComponent);
  fixture.detectChanges();

  const video = fixture.nativeElement.querySelector('video');

  media.set(video, { ended: true }); // отправляет `pause`, затем `ended`

  expect(media.play).toHaveBeenCalledTimes(1);
  expect(fixture.componentInstance.finished()).toBe(true);
});
```

Без неё jsdom даёт пустую оболочку:

| Что делает проверяемый код       | Что делает jsdom                                         |
| -------------------------------- | -------------------------------------------------------- |
| `await video.play()`             | бросает `Not implemented: HTMLMediaElement.play()`       |
| `video.duration`                 | `NaN`, а присваивание бросает ошибку                     |
| `video.canPlayType('video/mp4')` | `''` для любого типа, и проверка поддержки говорит «нет» |
| `video.readyState`               | всегда `0`                                               |
| `video.error`                    | свойства нет вовсе                                       |
| `video.load()`                   | ничего                                                   |

| Опция         | Тип                                   | По умолчанию       | Смысл                                                   |
| ------------- | ------------------------------------- | ------------------ | ------------------------------------------------------- |
| `duration`    | `number`                              | `0`                | Длительность каждого элемента, пока вы не зададите свою |
| `canPlayType` | `(type: string) => CanPlayTypeResult` | `() => 'probably'` | Что отвечает `canPlayType(type)`                        |

**Частая ошибка:** ставить заглушку один раз в теле `describe` или в `beforeAll`. После первого
теста её снимут. Ставьте в `beforeEach`, как выше, или через
[`installPerTest`](/ru/utilities/setup#reinstalling-a-stub-for-every-test).

## Как им управлять {#driving-one}

`media.set(element, state)` меняет состояние элемента и отправляет события, которые отправил бы
браузер. Используйте его вместо присваивания полей: обработчики `durationchange`, `timeupdate` или
`ended` в компоненте выполняются, только когда приходит событие.

```ts
media.set(video, { readyState: 1 }); // отправляет `loadedmetadata`
media.set(video, { currentTime: 119 }); // отправляет `timeupdate`
media.set(video, { ended: true }); // отправляет `pause`, `ended`
```

| Поле в `set`            | Какое событие    |
| ----------------------- | ---------------- |
| `duration`              | `durationchange` |
| `readyState` ≥ 1        | `loadedmetadata` |
| `currentTime`           | `timeupdate`     |
| `ended: true`           | `pause`, `ended` |
| `error`, не равный null | `error`          |

Несколько полей в одном вызове отправляют несколько событий в порядке таблицы.

- `ended: false` и `error: null` ничего не отправляют: они сбрасывают состояние, а у браузера для
  этого нет события.
- `ended: true` ещё и ставит `paused` в `true` и отправляет `pause` раньше `ended`, как браузер при
  воспроизведении до конца. Если передать `paused` в том же вызове, останется ваше значение.
- `media.state(element)` возвращает текущее состояние: `duration`, `currentTime`, `paused`, `ended`,
  `readyState` и `error`.

## Перемотка так, как её делает компонент {#seeking-the-way-the-component-does}

Плеер, который перематывает в начало, присваивает поле напрямую, и это тоже работает:

```ts
component.restart(); // video.currentTime = 0

expect(media.state(video).currentTime).toBe(0);
expect(component.progress()).toBe(0); // его собственный обработчик `timeupdate` выполнился
```

Присваивание `currentTime` отправляет `timeupdate` так же, как `media.set(video, { currentTime: 0 })`.

## Состояние — на каждый элемент своё {#state-is-per-element}

У каждого элемента своё состояние, поэтому реклама и основное видео могут сообщать разную
длительность:

```ts
media.set(advert, { duration: 15 });

expect(advert.duration).toBe(15);
expect(content.duration).toBe(120); // значение опции по умолчанию
```

`duration` начинается со значения опции `duration` или с `0`. Это никогда не `NaN`, так что
компонент, который ждёт известной длительности, получает её с первого чтения.

Состояние принадлежит текущему вызову `stubMediaElement()`. Элемент, который пережил свой тест
(хранится в переменной модуля или остался в `<body>` при `isolate: false`), начинает заново со
значений той заглушки, что установлена сейчас.

## `play`, `pause`, `load`, `canPlayType` {#play-pause-load-canplaytype}

Это моки вашего тест-раннера (в Vitest — `vi.fn()`), общие для всех медиаэлементов, поэтому работают все матчеры:

```ts
expect(media.pause).toHaveBeenCalledTimes(1);
```

- `play()` возвращает выполненный промис, а не `undefined`. Код часто вызывает на нём `.catch()`,
  чтобы проглотить ошибку автозапуска, и на `undefined` эта строка упала бы. Ещё он отправляет `play`
  и `playing`.
- `play.mock.instances[0]` говорит, какой элемент запустили.
- `canPlayType` по умолчанию отвечает `'probably'`. Чтобы один кодек не поддерживался, передайте
  свою функцию:

```ts
stubMediaElement({ canPlayType: (type) => (type.includes('vp9') ? '' : 'probably') });
```

## Установка и откат {#installation-and-undo}

Заглушка ставится на `HTMLMediaElement.prototype`. Поэтому она покрывает и элемент, который ваш код
создаёт сам через `document.createElement('video')`, — до такого заглушка на отдельный элемент не
дотянулась бы.

Она ставится через `mockValueProp` / `mockReadonlyPropGetter`, поэтому `restoreMockedProps()` после
каждого теста возвращает настоящий прототип. [`setupAutoSpy()`](/ru/utilities/setup) и так это
делает. Без этого самописный `Object.defineProperty` на прототипе утекает в следующий файл.
