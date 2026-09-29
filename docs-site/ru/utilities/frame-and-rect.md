---
title: Кадры и размеры элементов
description: stubAnimationFrame выполняет requestAnimationFrame, когда скажет спека, а stubElementRect заставляет getBoundingClientRect возвращать размеры; оба снимаются после теста.
---

# Кадры и размеры элементов

Две заглушки для кода, который измеряет элементы или ждёт следующего кадра. jsdom и happy-dom ничего
не раскладывают, поэтому любой элемент имеет размер 0 × 0, а кадры запускают на своих таймерах, и спека не знает, когда
кадр сработает.

- `stubAnimationFrame()` выполняет колбэки `requestAnimationFrame`, когда скажет спека.
- `stubElementRect()` заставляет `getBoundingClientRect()` одного элемента возвращать заданные
  размеры.

```ts
import { stubAnimationFrame, stubElementRect } from 'vitest-auto-spy/dom-stubs';

it('scrolls the selected row into view after the next frame', () => {
  const frames = stubAnimationFrame({ mode: 'queued' });

  stubElementRect(viewport, { height: 300 });
  list.select(42);

  expect(frames.pending).toBe(1);

  frames.flush();

  expect(list.firstVisibleRow()).toBe(42);
});
```

Обе снимаются после каждого теста. Самописный `window.requestAnimationFrame = …` или неполный объект
из `getBoundingClientRect` при `isolate: false` утекают в следующий файл.

## `stubAnimationFrame(options?)` {#stubanimationframe-options}

Подменяет `requestAnimationFrame` и `cancelAnimationFrame` спаями, чьё расписание задаёт спека.

| Опция     | Тип                         | По умолчанию           | Смысл                                                             |
| --------- | --------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `mode`    | `'immediate'` \| `'queued'` | `'immediate'`          | Когда выполняется запрошенный кадр; см. ниже                      |
| `onError` | `(error) => void`           | —                      | Получает то, что бросил колбэк, вместо того чтобы ошибка вылетела |
| `view`    | `object` \| `null`          | `document.defaultView` | Ещё и этот объект окна; `null` — только `globalThis`              |

| `mode`        | Запрошенный кадр выполняется                                   |
| ------------- | -------------------------------------------------------------- |
| `'immediate'` | до возврата из `requestAnimationFrame`, с `performance.now()`  |
| `'queued'`    | по `flush(timestamp?)`, с одной меткой времени для всех кадров |

Что есть у возвращённого объекта:

| Член                                            | Что это                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pending`                                       | Сколько запрошенных кадров ещё не выполнено                                                          |
| `flush(timestamp?)`                             | Выполняет все уже запрошенные кадры как один кадр браузера; метка по умолчанию — `performance.now()` |
| `flushAll(timestamp?)`                          | Выполняет кадры, пока ждущих не останется, включая запрошенные изнутри кадра                         |
| `lastHandle`                                    | Номер, который вернул последний `requestAnimationFrame`; до первого — `undefined`                    |
| `requestAnimationFrame`, `cancelAnimationFrame` | Установленные спаи, типы `Mock<RequestAnimationFrameFn>` / `Mock<CancelAnimationFrameFn>`            |
| `restore()`                                     | Возвращает прежние глобалы и отбрасывает ждущие кадры раньше конца теста                             |

Что важно знать:

- **Кадр, запрошенный внутри выполняющегося кадра, ждёт следующего `flush()`** — в обоих режимах,
  как в браузере. Цикл анимации продвигается на шаг за один `flush()`. В режиме `'immediate'` первый
  шаг выполняется сразу, а кадр, запрошенный изнутри, не запускается тут же повторно.
- **Кадр, отменённый предыдущим колбэком того же `flush()`, не выполняется.**
- **`flushAll()` останавливается после 1000 кругов** и бросает ошибку. Туда доходит только цикл,
  который бесконечно запрашивает кадры; такой проходите по шагу через `flush()`.
- **Колбэк, который бросил ошибку, останавливает `flush()`.** Кадры после него остаются в очереди, и
  следующий `flush()` их выполнит. С `onError` ошибка уходит в вашу функцию (в режиме `'immediate'` —
  вместо того чтобы вылететь из `requestAnimationFrame`). Бросьте её снова внутри, если такую ошибку
  глотать не собирались:

```ts
const frames = stubAnimationFrame({
  onError: (error) => {
    if (!isExpectedReentrancy(error)) {
      throw error;
    }
  },
});
```

**Частая ошибка:** проверять отмену по номеру-литералу вроде `1`. Номера начинаются выше 2^30,
поэтому сравнивайте с `lastHandle`:

```ts
expect(frames.cancelAnimationFrame).toHaveBeenLastCalledWith(frames.lastHandle);
```

Номера такие большие, чтобы заглушка отличала свои от номеров окружения. Отмена номера, который
заглушка не выдавала, уходит в настоящий `cancelAnimationFrame`. Это важно, если заглушку ставят
после рендера: у zoneless Angular уже может ждать настоящий кадр, и его отмена до него дойдёт.

## `stubElementRect(element, rect?)` {#stubelementrect-element-rect}

Заставляет `element.getBoundingClientRect()` возвращать размеры. `rect` — это `DOMRectInit`: `x`, `y`,
`width` и `height`, каждое по умолчанию `0`.

```ts
stubElementRect(mapContainer, { width: 800, height: 600 });

mapContainer.getBoundingClientRect(); // DOMRect { x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600, … }
```

- Каждый вызов возвращает новый `DOMRect`, как в браузере. `top`, `right`, `bottom` и `left` всегда
  совпадают с четырьмя числами.
- Патчится только этот элемент; остальные по-прежнему отдают нули.
- Возвращает функцию отмены. На ней же лежит установленный спай `.getBoundingClientRect`, чтобы
  проверить, что измерение было:

```ts
const stub = stubElementRect(settingsTab, { width: 240 });

component.selectTab('settings');

expect(stub.getBoundingClientRect).toHaveBeenCalled();
```

`vi.resetAllMocks()` или `mockReset()` посреди теста очищают вызовы и сохраняют размеры, при любом
движке спаев. То же верно для спаев `stubAnimationFrame`.

**Частая ошибка в Bun:** там `mockReset()` сбрасывает размеры, и элемент возвращает `undefined`.
После сброса вызовите `stubElementRect` снова.

## Как они снимаются {#taking-them-off}

Обе ставятся через `mockValueProp`. `restoreMockedProps()`, который `setupAutoSpy()` вызывает после
каждого теста, возвращает прежние глобалы и собственный метод элемента.

Ставьте их в `beforeEach` или в самом тесте. Вызов в `beforeAll` или в теле `describe` снимется после
первого теста, и в остальных его не будет.

`stubAnimationFrame` также патчит `document.defaultView`, если это отдельный от `globalThis` объект,
как под happy-dom. `view: null` патчит только `globalThis`.
