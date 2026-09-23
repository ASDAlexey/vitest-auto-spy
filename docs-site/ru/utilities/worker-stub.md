---
title: Заглушка Worker
description: stubWorker — подменить Worker, который создаёт тестируемый код, на такой, чей скрипт — сама спека, и автоматически получить настоящий глобал обратно.
---

# Заглушка Worker

```ts
import { stubWorker } from 'vitest-auto-spy/dom-stubs';

it('answers each request with its own reply', async () => {
  const workers = stubWorker<TreeRequest, TreeResponse>({
    respond: (request) => ({ requestId: request.requestId, nodes: [] }),
  });
  const service = TestBed.inject(TreeWorkerService);

  const reply = await firstValueFrom(service.visibleNodes({ requestId: 'req-1', value: 'park' }));

  expect(reply).toEqual({ requestId: 'req-1', nodes: [] });
  expect(workers.last.messages).toEqual([{ requestId: 'req-1', value: 'park' }]);
});
```

Ни jsdom, ни happy-dom не исполняют скрипт воркера, а в Node глобала `Worker` нет вовсе. Код, который
его создаёт, — `new Worker(new URL('./tree.worker', import.meta.url))` — встречает спеку, которой
приходится перехватить конструктор, запомнить слушателей и подделать ответ. Самописные заглушки
ошибаются в одних и тех же трёх местах.

## Один слот для слушателя {#one-listener-slot}

Самописная заглушка превращает `addEventListener('message', handler)` в `onmessage = handler`. Второй
подписчик молча вытесняет первого, а `removeEventListener` ничего не делает. Ломается как раз код,
который сопоставляет ответы по request id — по слушателю на каждый запрос, — и его спека этого не видит.

`stubWorker()` ставит `EventTarget`: слушатели накапливаются, `{ once: true }` и `removeEventListener`
работают, а `onmessage` / `onmessageerror` / `onerror` вызываются рядом с ними, с воркером в `this`.

## Ответ, который приходит слишком рано {#the-reply-that-arrives-too-early}

Заглушка, вызывающая обработчик изнутри `postMessage`, доставляет ответ раньше, чем `postMessage`
вернёт управление, — так не делает ни один браузер. Подписчик, добавленный строкой ниже, в проде не
срабатывает никогда, а в спеке — всегда.

`respond` вызывается микрозадачей после возврата из `postMessage`: асинхронно, как на платформе, но без
необходимости двигать фейковые таймеры. Верните ответ или `undefined`, чтобы промолчать. Исключение
превращается в событие `error`, как необработанное исключение в настоящем воркере:

```ts
stubWorker({
  respond: () => {
    throw new Error('out of memory');
  },
});
```

## Заглушка, которую никто не снимает {#the-stub-nobody-takes-off}

Присвоенная прямо в `globalThis.Worker`, заглушка переживает файл и достаётся следующему при
`isolate: false`. Здесь установка идёт через `mockValueProp`, поэтому `restoreMockedProps()` — его
[`setupAutoSpy()`](./setup) вызывает после каждого теста — возвращает прежний `Worker` или убирает
его, если в окружении его не было.

## Управление со стороны воркера {#driving-it-from-the-worker-s-side}

`stubWorker()` возвращает хэндл над воркерами, созданными после установки: `instances` и `last` для
обычного случая с одним воркером — он бросает ошибку, если тестируемый код не создал ни одного, вместо
падения позже на `undefined`.

| Поле                       | Что это                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `url`, `options`           | аргументы конструктора, `url` приведён к строке — `URL` тоже               |
| `host`                     | объект, который вернул `new Worker(…)`, для сравнения по ссылке            |
| `messages`                 | все отправленные сообщения — в том виде, в каком их получил воркер         |
| `postMessage`, `terminate` | спаи этих двух методов                                                     |
| `terminated`               | был ли вызван `terminate()`; завершённый воркер не принимает и не отвечает |
| `emit(data)`               | событие `message` на хосте, синхронно                                      |
| `fail(error)`              | событие `error` с полями `message` и `error`                               |

Без `respond` воркер инертен, и спека отвечает через `emit()` в выбранный момент — так проверяется ответ
на чужой request id или несколько ответов на одно сообщение:

```ts
const workers = stubWorker<TreeRequest, TreeResponse>();
const reply = firstValueFrom(service.visibleNodes({ requestId: 'req-1', value: 'park' }));

workers.last.emit({ requestId: 'req-0', nodes: ['stale'] });
workers.last.emit({ requestId: 'req-1', nodes: ['fresh'] });

expect(await reply).toEqual({ requestId: 'req-1', nodes: ['fresh'] });
```

`emit()` на завершённом воркере бросает ошибку: браузер отбросил бы сообщение, так что спека, которая
шлёт его в уже закрытый воркер, проверяет невозможную ситуацию.

## Сообщения копируются {#messages-are-copied}

Сообщения проходят через `structuredClone` в обе стороны, как их копирует платформа. Объект, изменённый
после `postMessage`, записан таким, каким был отправлен; буферы из `transfer` отсоединяются; отправка
колбэка или DOM-узла падает с тем же `DataCloneError`, что и в браузере, — а не проходит спеку, чтобы
упасть в проде.

## Чего она не делает {#what-it-does-not-do}

Файл воркера не загружается и не исполняется. Логику воркера тестируйте как обычные функции,
экспортированные из него, а сторону страницы — против этой заглушки; две половины сходятся только
в формах сообщений, которые задают параметры типа `stubWorker<TIn, TOut>()`.
