---
title: Call log
description: createLog — one call-order journal every collaborator reports to, so the ORDER of calls across objects is itself the value a spec asserts, instead of per-method spies that each know they ran and none knows when.
---

# Call log

```ts
import { createLog } from 'vitest-auto-spy';

const log = createLog<'drop-cache' | 'flush-telemetry' | 'stop-engine'>();

engine.onShutdown(log.fn('drop-cache'));
engine.onShutdown(log.fn('flush-telemetry'));
engine.onShutdown(log.fn('stop-engine'));

engine.shutdown();

expect(log.result()).toBe('drop-cache; flush-telemetry; stop-engine');
```

A spy answers whether its one method ran. Order across collaborators is a different question — it
lives _between_ the spies, and the shapes available for it degrade quickly:

- one `toHaveBeenCalled` per spy passes in any of the six orders three calls can arrive in — three
  green checks that would accept the sequence backwards;
- `toHaveBeenCalledBefore` pins it only pairwise, a chain that grows with the square of the
  collaborators — and it says nothing about a call the spec forgot to name;
- an array of timestamps the spec maintains by hand is a journal with none of the assertions.

One journal the code under test writes into makes the sequence a single comparable value, and a
failure prints the real order as a diff rather than `expected spy to be called before spy`.

Ported from Angular's own `Log` (`packages/core/testing/src/logger.ts`) — the class Angular keeps
three copies of across core, router and forms, because it is the idiomatic answer wherever the
subject is a sequence: lifecycle hooks, guards, resolvers, teardown.

## The members

| Member       | What it does                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| `add(value)` | append one entry — a collaborator's report of where it got to                       |
| `fn(value)`  | a callback that records `value` when it runs — for handlers, hooks, guard methods   |
| `clear()`    | drop every entry: a fresh journal without a fresh identity                          |
| `items`      | the entries so far, in order — each read an independent copy                        |
| `result()`   | the journal as one line: entries joined with `'; '`, `''` when nothing was recorded |

`fn()` is typed as taking nothing, so it slots wherever a handler fits and ignores whatever the
caller passes it — the places that want a callback, not a call.

`T` is constrained to strings on purpose: what `fn()` labels a callback with is a name, a word a
human reads in `result()`. A literal union makes the vocabulary part of the type —
`createLog<'init' | 'ready' | 'destroy'>()` rejects a step the log never declared, where the
unconstrained journal would record the typo and hand back a green test.

## The Angular recipe: the log is the collaborator

The journal's worth is highest when the production code records its own sequence into it. Through
DI, that is one provider:

```ts
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

const log = createLog<'init' | 'ready' | 'destroy'>();

TestBed.configureTestingModule({ providers: [{ provide: PANEL_LOG, useValue: log }] });
TestBed.createComponent(Panel).destroy();

expect(log.result()).toBe('init; ready; destroy');
```

Nothing here knows Angular or any runner — the module imports nothing — so the same journal works
unchanged on Vitest, `bun test` and `node:test`, and in a plain unit test without a `TestBed` at all.
