---
title: Worker stub
description: stubWorker — replace the Worker the code under test constructs with one whose script is the spec, and get the real global back automatically.
---

# Worker stub

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

Neither jsdom nor happy-dom runs a worker script, and Node has no `Worker` global at all. Code that
builds one — `new Worker(new URL('./tree.worker', import.meta.url))` — meets a spec that has to
intercept the construction, remember the listeners and fake the reply. The copies of that stub that
projects write for themselves go wrong in the same three ways.

## One listener slot

The hand-written stub turns `addEventListener('message', handler)` into `onmessage = handler`. The
second subscriber silently replaces the first, and `removeEventListener` does nothing. Code that
correlates replies by request id — one listener per pending call — is exactly the code that breaks,
and its spec cannot see it.

`stubWorker()` installs an `EventTarget`: listeners stack, `{ once: true }` and
`removeEventListener` work, and `onmessage` / `onmessageerror` / `onerror` are called beside them
with the worker as `this`.

## The reply that arrives too early

A stub that calls the handler from inside `postMessage` delivers the reply before `postMessage`
returns, which no browser does. A subscriber attached a line after the post never runs in production
and always runs in the spec.

`respond` is called on a microtask after `postMessage` returns — asynchronous like the platform, but
without fake timers having to be advanced for it. Return the reply, or `undefined` to stay silent. A
throw becomes an `error` event, as an uncaught exception in a real worker does:

```ts
stubWorker({
  respond: () => {
    throw new Error('out of memory');
  },
});
```

## The stub nobody takes off

Assigned to `globalThis.Worker` directly, a stub survives into the next file under
`isolate: false`. Installation here goes through `mockValueProp`, so `restoreMockedProps()` — which
[`setupAutoSpy()`](./setup) runs after every test — puts back the previous `Worker`, or removes it
where the environment had none.

## Driving it from the worker's side

`stubWorker()` returns a handle over the workers constructed since it was installed:
`instances`, and `last` for the usual single worker — it throws when the code under test has built
none, instead of failing later against `undefined`.

| Member                     | What it is                                                                  |
| -------------------------- | --------------------------------------------------------------------------- |
| `url`, `options`           | the constructor arguments, `url` stringified — `URL` objects included       |
| `host`                     | the object `new Worker(…)` returned, for identity checks                    |
| `messages`                 | every message posted so far, as the worker received it                      |
| `postMessage`, `terminate` | the spies behind the two methods                                            |
| `terminated`               | whether `terminate()` ran; a terminated worker neither receives nor answers |
| `emit(data)`               | a `message` event on the host, delivered synchronously                      |
| `fail(error)`              | an `error` event carrying `message` and `error`                             |

Without `respond` the worker is inert, and the spec answers through `emit()` at a moment it
chooses — the way to test a reply for someone else's request id, or several replies to one message:

```ts
const workers = stubWorker<TreeRequest, TreeResponse>();
const reply = firstValueFrom(service.visibleNodes({ requestId: 'req-1', value: 'park' }));

workers.last.emit({ requestId: 'req-0', nodes: ['stale'] });
workers.last.emit({ requestId: 'req-1', nodes: ['fresh'] });

expect(await reply).toEqual({ requestId: 'req-1', nodes: ['fresh'] });
```

`emit()` on a terminated worker throws: the browser would drop the message, so a spec emitting into
a worker the code already tore down is asserting on something that cannot happen.

## Messages are copied

Messages pass through `structuredClone` in both directions, the way the platform copies them. A
payload mutated after `postMessage` is recorded as it was posted, buffers listed in `transfer` are
detached, and posting a callback or a DOM node fails with the same `DataCloneError` the browser
throws — rather than passing the spec and failing in production.

## What it does not do

It does not load or run the worker file. Test the worker's logic as plain functions exported from
it, and the page's side against this stub; the two halves meet only through the message shapes,
which the `stubWorker<TIn, TOut>()` type parameters spell out.
