---
title: Worker stub
description: stubWorker replaces the Worker your code creates with one whose replies come from the spec, and puts the real global back after the test.
---

# Worker stub

`stubWorker()` replaces the global `Worker` for one test. Your code creates a worker as usual, and
the spec decides what the worker replies. Use it for a service that talks to a Web Worker:
jsdom and happy-dom never run worker scripts, and Node has no `Worker` global at all.

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

`TIn` and `TOut` in `stubWorker<TIn, TOut>()` are the message types the page sends and the worker
replies with.

| Option    | Type                                       | Default | Meaning                                                                                                                                        |
| --------- | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `respond` | `(data: TIn, worker) => TOut \| undefined` | —       | Your "worker script": its return value is the reply; `undefined` sends nothing. `worker` is the [instance](#driving-it-from-the-worker-s-side) |

- `respond` runs on a microtask after `postMessage` returns: asynchronous like a real worker, but
  you do not need to advance fake timers for it.
- If `respond` throws, the page gets an `error` event, like an uncaught exception in a real worker:

```ts
stubWorker({
  respond: () => {
    throw new Error('out of memory');
  },
});
```

- Without `respond`, the worker never answers by itself. You reply from the spec with
  [`emit()`](#driving-it-from-the-worker-s-side).

## Driving it from the worker's side

`stubWorker()` returns a handle. `instances` lists the workers created since the stub was installed;
`last` is the newest, for the usual single worker. `last` throws if your code created none, instead
of failing later on `undefined`.

| Member                     | What it is                                                                  |
| -------------------------- | --------------------------------------------------------------------------- |
| `url`, `options`           | the constructor arguments; `url` as a string, also when a `URL` was passed  |
| `host`                     | the object `new Worker(…)` returned, for identity checks                    |
| `messages`                 | every message posted so far, as the worker received it                      |
| `postMessage`, `terminate` | spies on the two methods                                                    |
| `terminated`               | whether `terminate()` ran; a terminated worker neither receives nor answers |
| `emit(data)`               | sends a `message` event to the page, right away                             |
| `fail(error)`              | sends an `error` event with `message` and `error`                           |

Without `respond`, answer with `emit()` when you choose. Use it to test a reply for another request's
id, or several replies to one message:

```ts
const workers = stubWorker<TreeRequest, TreeResponse>();
const reply = firstValueFrom(service.visibleNodes({ requestId: 'req-1', value: 'park' }));

workers.last.emit({ requestId: 'req-0', nodes: ['stale'] });
workers.last.emit({ requestId: 'req-1', nodes: ['fresh'] });

expect(await reply).toEqual({ requestId: 'req-1', nodes: ['fresh'] });
```

**Common mistake:** `emit()` on a terminated worker. It throws: a browser would drop the message, so
the spec would be testing something that cannot happen.

## One listener slot

A hand-written stub usually turns `addEventListener('message', handler)` into
`onmessage = handler`. Then a second listener silently replaces the first, and
`removeEventListener` does nothing. Code that keeps one listener per pending request breaks, and the
spec cannot see it.

`stubWorker()` gives the page a real `EventTarget`: listeners add up, and `{ once: true }` and
`removeEventListener` work. `onmessage`, `onmessageerror` and `onerror` are called too, with the
worker as `this`.

## The reply that arrives too early

A stub that calls the handler inside `postMessage` delivers the reply before `postMessage` returns.
No browser does that. A listener attached one line after the post then gets the reply in production
but misses it in the spec. `respond` runs on a microtask, after `postMessage` returns, so this cannot happen.

## The stub nobody takes off

A stub assigned to `globalThis.Worker` directly survives into the next file under `isolate: false`.
`stubWorker()` installs through `mockValueProp`, so `restoreMockedProps()` puts back the previous
`Worker` after each test, or removes it where the environment had none.
[`setupAutoSpy()`](./setup) already runs that after every test.

## Messages are copied

Messages go through `structuredClone` in both directions, as in the browser:

- a payload you change after `postMessage` is recorded as it was posted;
- buffers listed in `transfer` are detached;
- posting a function or a DOM node fails with the same `DataCloneError` the browser throws, instead
  of passing in the spec and failing in production.

## What it does not do

It does not load or run your worker file. Test the worker's logic as plain functions exported from
it, and the page's side with this stub. The two halves meet only through the message types, which
`stubWorker<TIn, TOut>()` spells out.
