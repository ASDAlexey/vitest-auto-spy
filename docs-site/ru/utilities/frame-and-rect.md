---
title: Кадры и размеры элементов
description: stubAnimationFrame и stubElementRect — requestAnimationFrame по расписанию спеки и getBoundingClientRect, который отдаёт размеры; оба снимаются автоматически.
---

# Кадры и размеры элементов

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

jsdom и happy-dom ничего не раскладывают и планируют кадры на собственных таймерах. Код, который
измеряет элемент или ждёт кадра, встречает спеку, где `window.requestAnimationFrame` присвоен руками,
а `getBoundingClientRect` возвращает неполный литерал. И то и другое протекает в следующий файл при
`isolate: false`, а литерал сходит за `DOMRect` только потому, что недостающие поля никто не читает.

## `stubAnimationFrame(options?)` {#stubanimationframe-options}

Подменяет `requestAnimationFrame` и `cancelAnimationFrame` спаями, у которых расписание задаёт спека.

| `mode`                       | Запрошенный кадр выполняется                                   |
| ---------------------------- | -------------------------------------------------------------- |
| `'immediate'` (по умолчанию) | до возврата из `requestAnimationFrame`, с `performance.now()`  |
| `'queued'`                   | на `flush(timestamp?)`, с одной меткой времени для всех кадров |

Что есть у хэндла:

- `pending` — сколько запрошенных кадров ещё не выполнено.
- `flush(timestamp?)` — выполнить все запрошенные к этому моменту кадры как один кадр браузера. Метка
  времени по умолчанию — `performance.now()`. Кадр, отменённый более ранним колбэком того же `flush`,
  не выполняется.
- `requestAnimationFrame` / `cancelAnimationFrame` — установленные спаи, для
  `expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(handle)`.
- `restore()` — вернуть прежние глобалы и выбросить ожидающие кадры до конца теста.

**Кадр, запрошенный изнутри выполняющегося кадра, ждёт следующего `flush()`** в обоих режимах — так
же, как в браузере он ждёт следующего кадра. Цикл анимации, который сам запрашивает свой следующий
кадр, продвигается на один шаг за `flush()`; в режиме `'immediate'` первый шаг выполняется сразу, и
рекурсии не случается.

Колбэк, который бросает исключение, останавливает `flush`. Кадры после него остаются в ожидании, и
следующий `flush()` их выполнит. Передайте `onError`, чтобы перехватить бросок: колбэк получает то,
что было брошено, и исключение не распространяется из `flush()` (а в режиме `'immediate'` — из
самого `requestAnimationFrame`). Бросьте его обратно изнутри, чтобы сохранить умолчание для ошибки,
которую не хотели проглотить:

```ts
const frames = stubAnimationFrame({
  onError: (error) => {
    if (!isExpectedReentrancy(error)) {
      throw error;
    }
  },
});
```

## `stubElementRect(element, rect?)` {#stubelementrect-element-rect}

Заставляет `element.getBoundingClientRect()` возвращать размеры. `rect` — это `DOMRectInit`: `x`,
`y`, `width` и `height`, каждое по умолчанию `0`.

```ts
stubElementRect(mapContainer, { width: 800, height: 600 });

mapContainer.getBoundingClientRect(); // DOMRect { x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600, … }
```

Каждый вызов возвращает новый `DOMRect`, как и браузер, поэтому `top`, `right`, `bottom` и `left`
всегда согласованы с четырьмя заданными числами. Патчится только переданный элемент, соседние
по-прежнему отвечают нулями. Вызов возвращает функцию отмены, которая заодно несёт установленный
спай как `.getBoundingClientRect`, — для теста, которому нужно убедиться, что измерение вообще
произошло, а не только задать его результат:

```ts
const stub = stubElementRect(settingsTab, { width: 240 });

component.selectTab('settings');

expect(stub.getBoundingClientRect).toHaveBeenCalled();
```

## Как они снимаются {#taking-them-off}

Оба ставятся через `mockValueProp`. `restoreMockedProps()`, который `setupAutoSpy()` запускает после
каждого теста, возвращает прежние глобалы и собственный метод элемента. Ставьте их в `beforeEach` или
в самом тесте. Вызов в `beforeAll` или в теле `describe` снимается после первого теста, и остальные
его уже не видят. `stubAnimationFrame` патчит ещё и `document.defaultView`, если это отдельный от
`globalThis` объект, как под happy-dom. `view: null` патчит только `globalThis`.
