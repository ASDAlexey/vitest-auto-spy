# vitest-auto-spy — Waiting

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 11. Waiting: four queues, and which tool drives each

Under Jest these were hard to tell apart; under Vitest with a real bundler they are four separate
mechanisms, and a test that waits on the wrong one fails with a message that names none of them.

| What is pending | What drives it | What does **not** |
| --- | --- | --- |
| change detection | `fixture.detectChanges()` | anything `await`ed |
| effects + `afterNextRender` + CD | `await stable(fixture)` (`…/angular`) | `detectChanges()` alone |
| timers, debounces, polling | `await advanceTimers(ms)` (`…/setup`) | `await Promise.resolve()` |
| a dynamic `import()`, native `async` in a dep | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, microtasks |
| an `httpResource()` / `resource()` / `rxResource` | `await settleResource(r)` (`…/angular`) | `flushEventLoopUntil` — it never ticks |

```ts
import { flushEventLoop, settleDynamicImport } from 'vitest-auto-spy';

fixture.debugElement.query(By.css('.open')).nativeElement.click(); // production code: await import(…)
await settleDynamicImport(() => import('./profile-select.modal'));
```

Three rules worth stating outright, because each of them cost a day somewhere:

- **`afterNextRender` does not run on `detectChanges()`.** A component that fills a form there is
  still empty when the assertion reads it. `await stable(fixture)` (or `await fixture.whenStable()`)
  is what runs the after-render phase.
- **`fixture.whenRenderingDone()` is not a stronger `whenStable()`.** With an animation renderer
  installed it degrades to `Promise.resolve()`. Use `stable(fixture)`.
- **`fakeAsync` / `tick()` / `flushMicrotasks()` never reach the module loader.** Spinning
  `await Promise.resolve()` ten times looks like it works and instead lands the continuation after
  teardown — a green run with `NG0205: Injector has already been destroyed` in "Unhandled Errors"
  and a non-zero exit code.

**`stable()` and `flushEffects()` are not zoneless-only, and their tick runs inside the `NgZone` so
that they are not.** `TestBed.createComponent` builds the component inside `ngZone.run(…)`, so an
`effect()` its constructor registers records the zone's inner zone as its own. A bare `TestBed.tick()`
from a test body runs in the runner's zone, so Angular hops back into the recorded one to run a
**dirty** effect, and leaving that hop takes the zone from unstable to stable.
`provideZoneChangeDetection()` — which `@angular/build:unit-test` installs for every suite that loads
zone.js — answers `NgZone.onMicrotaskEmpty` with `ApplicationRef._tick()`, guarded against its own
scheduler but not against `ApplicationRef._runningTick`, so the tick already on the stack is
re-entered: `NG0101: ApplicationRef.tick is called recursively`. Angular hands that to `ErrorHandler`
instead of throwing it at the call site, so a suite that does not fail on console output stays green
with the change detection it asked for unfinished. Measured on an Angular 22 suite of 1771 spec files:
451 `componentRef.setInput` calls rewritten to `setInputs` turned **57 green files red** on `NG0101`,
and none of them after the tick moved inside the zone. Under zoneless `NgZone` is a `NoopNgZone` whose
`run` is a straight call, so it costs nothing there. One thing is genuinely new for a zone-based
consumer: leaving the zone reports it stable, so the same subscriber ticks once more — counted on
`ApplicationRef.afterTick`, one `flushEffects()` is 1 → 2 application ticks, which is what
`fixture.detectChanges()` has always done in the same position. Do not "simplify" either helper back
to a bare `TestBed.tick()`; `src/zone-tests/stable.zone-test.ts` is the guard.

`flushEventLoopUntil(isDone, { turns, label })` is the same thing with a condition and a budget —
for a chunk becoming reachable, an SDK reporting itself ready, a queue draining. Use it instead of a
hand-tuned turn count: the count depends on the dependency, not on the spec, and a condition that
never holds fails naming the `label` rather than hanging until the runner's timeout. For real I/O —
a socket round-trip, a child process — pass `{ timeoutMs, label }` instead of `turns`: it polls the
real clock every 10 ms, unaffected by fake timers, and replaces a hand-rolled `waitFor(predicate, ms)`.

**Not for an Angular `resource()` / `httpResource()`.** Those need a change-detection _tick_, and
this helper only takes event-loop turns — a resource awaited through it finishes the whole budget
having issued zero requests. `settleResource(resource, { turns, label, allowIdle })` from
`vitest-auto-spy/angular` is that wait.

`flushEventLoop(turns?)` takes real event-loop turns even while the timers are faked, without
touching the clock. It is the honest name for the `await vi.advanceTimersByTimeAsync(0)` trick,
which reads as "move the timers" in a test that has no timers and gets deleted as noise.
