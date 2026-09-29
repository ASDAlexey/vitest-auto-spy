---
title: Заглушка Worker
description: stubWorker подменяет Worker, который создаёт ваш код, на такой, чьи ответы задаёт спека, и после теста возвращает настоящий глобал.
---

# Заглушка Worker

`stubWorker()` подменяет глобальный `Worker` на один тест. Ваш код создаёт воркер как обычно, а
что воркер ответит, решает спека. Нужна для сервиса, который общается с Web Worker: jsdom и
happy-dom никогда не выполняют скрипты воркеров, а в Node глобала `Worker` нет вовсе.

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

`TIn` и `TOut` в `stubWorker<TIn, TOut>()` — типы сообщений, которые отправляет страница и которыми
отвечает воркер.

| Опция     | Тип                                        | По умолчанию | Смысл                                                                                                                                                |
| --------- | ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `respond` | `(data: TIn, worker) => TOut \| undefined` | —            | Ваш «скрипт воркера»: что вернёт, то и будет ответом; `undefined` — ничего не отправлять. `worker` — [экземпляр](#driving-it-from-the-worker-s-side) |

- `respond` выполняется в микротаске после возврата из `postMessage`: асинхронно, как настоящий
  воркер, но двигать фейковые таймеры для этого не нужно.
- Если `respond` бросает ошибку, страница получает событие `error`, как при непойманном исключении в
  настоящем воркере:

```ts
stubWorker({
  respond: () => {
    throw new Error('out of memory');
  },
});
```

- Без `respond` воркер сам не отвечает. Отвечайте из спеки через
  [`emit()`](#driving-it-from-the-worker-s-side).

## Управление со стороны воркера {#driving-it-from-the-worker-s-side}

`stubWorker()` возвращает хендл. `instances` — воркеры, созданные после установки заглушки; `last`
— последний, для обычного случая с одним воркером. Если ваш код не создал ни одного, `last` бросает
ошибку, а не падает позже на `undefined`.

| Член                       | Что это                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `url`, `options`           | аргументы конструктора; `url` строкой, даже если передали `URL`              |
| `host`                     | объект, который вернул `new Worker(…)`, для сравнения по ссылке              |
| `messages`                 | все сообщения, отправленные до сих пор, в том виде, как их получил воркер    |
| `postMessage`, `terminate` | спаи на эти два метода                                                       |
| `terminated`               | был ли вызван `terminate()`; остановленный воркер не принимает и не отвечает |
| `emit(data)`               | сразу отправляет странице событие `message`                                  |
| `fail(error)`              | отправляет событие `error` с `message` и `error`                             |

Без `respond` отвечайте через `emit()` в тот момент, который выберете сами. Так можно проверить
ответ на чужой номер запроса или несколько ответов на одно сообщение:

```ts
const workers = stubWorker<TreeRequest, TreeResponse>();
const reply = firstValueFrom(service.visibleNodes({ requestId: 'req-1', value: 'park' }));

workers.last.emit({ requestId: 'req-0', nodes: ['stale'] });
workers.last.emit({ requestId: 'req-1', nodes: ['fresh'] });

expect(await reply).toEqual({ requestId: 'req-1', nodes: ['fresh'] });
```

**Частая ошибка:** `emit()` на остановленном воркере. Это бросает ошибку: браузер отбросил бы
сообщение, и спека проверяла бы то, чего не бывает.

## Слушателей может быть несколько {#one-listener-slot}

Самописная заглушка обычно превращает `addEventListener('message', handler)` в
`onmessage = handler`. Тогда второй слушатель молча заменяет первый, а `removeEventListener` ничего
не делает. Код, который держит по слушателю на каждый ждущий запрос, ломается, а спека этого не
видит.

`stubWorker()` даёт странице настоящий `EventTarget`: слушатели складываются, `{ once: true }` и
`removeEventListener` работают. `onmessage`, `onmessageerror` и `onerror` тоже вызываются, с
воркером в качестве `this`.

## Ответ, который приходит слишком рано {#the-reply-that-arrives-too-early}

Заглушка, которая вызывает обработчик прямо внутри `postMessage`, доставляет ответ раньше, чем
`postMessage` вернул управление. Ни один браузер так не делает. Слушатель, добавленный строкой ниже
отправки, в продакшене получает ответ, а в спеке его пропускает. `respond` выполняется в микротаске после
`postMessage`, поэтому такого не случится.

## Заглушка, которую никто не снимает {#the-stub-nobody-takes-off}

Заглушка, присвоенная прямо в `globalThis.Worker`, при `isolate: false` доживает до следующего файла.
`stubWorker()` ставится через `mockValueProp`, поэтому `restoreMockedProps()` после каждого теста
возвращает прежний `Worker` или удаляет его, если в окружении его не было.
[`setupAutoSpy()`](./setup) и так вызывает это после каждого теста.

## Сообщения копируются {#messages-are-copied}

Сообщения в обе стороны проходят через `structuredClone`, как в браузере:

- данные, изменённые после `postMessage`, записаны такими, какими их отправили;
- буферы из `transfer` отсоединяются;
- отправка функции или DOM-узла падает с тем же `DataCloneError`, что и в браузере, а не проходит в
  спеке, чтобы упасть в продакшене.

## Чего она не делает {#what-it-does-not-do}

Она не загружает и не выполняет файл воркера. Логику воркера проверяйте как обычные функции,
экспортированные из него, а сторону страницы — с этой заглушкой. Связывают эти две части только
типы сообщений, которые задают параметры `stubWorker<TIn, TOut>()`.
