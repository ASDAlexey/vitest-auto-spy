/**
 * The emission helpers' watchdog, under a zone.
 *
 * Its whole promise is "this wait is real time even under fake timers, on purpose" — a safety net,
 * never a deadline the source has to beat. zone.js breaks that promise in a way a capture at import
 * time cannot see: the global `setTimeout` was already replaced when the module loaded, and the
 * replacement chooses its scheduler from `Zone.current` at *call* time. Inside `fakeAsync` the
 * watchdog therefore joined the virtual queue the spec was driving, so `tick()` towards a
 * `debounceTime` rejected the very stream it was advancing — "did not emit within 1000 ms", from a
 * message insisting the wait was real.
 */
import { fakeAsync, tick } from '@angular/core/testing';
import { Subject, debounceTime } from 'rxjs';

import { expectEmission, expectNoEmission } from '../lib/expect-emission';

describe('the emission watchdog inside fakeAsync', () => {
  it('does not reject a debounced stream the spec ticks past its timeout', fakeAsync(() => {
    const typed$ = new Subject<string>();
    const settled: string[] = [];
    const debounced$ = typed$.pipe(debounceTime(2_000));

    const pending = expectEmission(debounced$, { timeout: 1_000, label: 'debounced$' }).then(
      (value) => settled.push(`resolved: ${value}`),
      (error: Error) => settled.push(`rejected: ${error.message}`),
    );

    typed$.next('query');
    tick(1_500);

    expect(settled).toEqual([]);

    tick(500);
    // The wait itself resolves on a microtask; `tick(0)` drains those without moving the clock.
    tick(0);

    expect(settled).toEqual(['resolved: query']);
    void pending;
  }));

  it('keeps a quiet window quiet, however far the spec ticks', fakeAsync(() => {
    const source$ = new Subject<number>();
    const settled: string[] = [];

    void expectNoEmission(source$, { timeout: 0 }).then(
      () => settled.push('quiet'),
      (error: Error) => settled.push(`rejected: ${error.message}`),
    );

    tick(10_000);

    // The quiet window is a real macrotask, so it has not run yet — and, crucially, the clock the
    // spec just moved by ten seconds did not settle it either way.
    expect(settled).toEqual([]);
  }));
});
