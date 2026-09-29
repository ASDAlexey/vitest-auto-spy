---
title: Call log
description: createLog is one journal every collaborator writes to, so a spec can assert the order of calls across several objects as a single value.
---

# Call log

`createLog()` gives you a journal that several collaborators write to. The spec then asserts the
whole order of calls as one string. Use it when the order matters: shutdown steps, lifecycle hooks,
guards, resolvers, teardown.

```ts
import { createLog } from 'vitest-auto-spy';

it('shuts down in order', () => {
  const log = createLog<'drop-cache' | 'flush-telemetry' | 'stop-engine'>();

  engine.onShutdown(log.fn('drop-cache'));
  engine.onShutdown(log.fn('flush-telemetry'));
  engine.onShutdown(log.fn('stop-engine'));

  engine.shutdown();

  expect(log.result()).toBe('drop-cache; flush-telemetry; stop-engine');
});
```

A failure shows the real order as a diff.

Why not spies:

- one `toHaveBeenCalled` per spy passes in any order, even backwards;
- `toHaveBeenCalledBefore` compares only pairs, the chain grows fast with more collaborators, and it
  misses a call the spec forgot to name;
- an array of timestamps you keep by hand is a journal without the assertions.

It is modelled on Angular's own internal test `Log` class, which Angular uses for the same kind of
tests.

## The members

| Member       | What it does                                                                      |
| ------------ | --------------------------------------------------------------------------------- |
| `add(value)` | appends one entry: a collaborator reports where it got to                         |
| `fn(value)`  | returns a callback that records `value` when it runs; for handlers, hooks, guards |
| `clear()`    | removes every entry, keeping the same log object                                  |
| `items`      | the entries so far, in order; each read returns a new copy                        |
| `result()`   | the entries as one line joined with `'; '`, or `''` when nothing was recorded     |

The callback `fn()` returns ignores any arguments it is called with and returns `undefined`. So it
fits anywhere a callback is expected.

The type parameter is a union of string literals, such as `createLog<'init' | 'ready' | 'destroy'>()`.
Then a step the log does not declare is a compile error, so a typo cannot slip into the journal.

**Common mistake:** asserting on `items` with `toEqual` when you only need the order. `result()` gives
one string that reads well in a failure diff.

## Logging from existing spies

When the collaborators are spies you already have, make each spy write to the log and return what
your code needs:

```ts
import { createLog, createSpyFromClass } from 'vitest-auto-spy';

const log = createLog<'validate' | 'save' | 'navigate'>();
const steps = createSpyFromClass(StepService);
const router = createSpyFromClass(Router);

steps.validate.mockImplementation(() => {
  log.add('validate');
  return true;
});
steps.save.mockImplementation(async () => {
  log.add('save');
});
router.navigate.mockImplementation(async () => {
  log.add('navigate');
  return true;
});

await wizard.finish();

expect(log.result()).toBe('validate; save; navigate');
```

Each entry is written when the call happens, not when its promise resolves. Use `log.fn('step')` only
where the return value does not matter, such as event handlers and hooks.

## The Angular recipe: the log is the collaborator

If your app code can write its own steps into the log, you need no spies at all. With DI that is one
provider:

```ts
import { Component, InjectionToken, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type CallLog, createLog } from 'vitest-auto-spy';

const PANEL_LOG = new InjectionToken<CallLog<'init' | 'ready' | 'destroy'>>('panel log');

@Component({ selector: 'panel', template: '' })
class Panel {
  private readonly log = inject(PANEL_LOG);

  ngOnInit(): void {
    this.log.add('init');
  }

  ngAfterViewInit(): void {
    this.log.add('ready');
  }

  ngOnDestroy(): void {
    this.log.add('destroy');
  }
}

it('runs the lifecycle in order', () => {
  const log = createLog<'init' | 'ready' | 'destroy'>();

  TestBed.configureTestingModule({ providers: [{ provide: PANEL_LOG, useValue: log }] });
  TestBed.createComponent(Panel).destroy();

  expect(log.result()).toBe('init; ready; destroy');
});
```

The log knows nothing about Angular or the test runner. It works the same on Vitest, `bun test` and
`node:test`, and in a plain unit test without `TestBed`.
