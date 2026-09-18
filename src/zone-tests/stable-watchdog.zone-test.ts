/**
 * `stable()`'s watchdog, under a zone.
 *
 * The timeout is a safety net for a fixture that never settles — "still unstable after 2000 ms" —
 * and never a deadline the code under test has to beat. zone.js breaks that in a way a capture at
 * import time cannot see: the global `setTimeout` was already replaced when this module loaded, and
 * the replacement picks its scheduler from `Zone.current` at *call* time. Inside `fakeAsync` the
 * watchdog therefore joined the virtual queue the spec was driving, so a `tick()` past the timeout
 * failed the wait with a message insisting the wait was real time.
 */
import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { mockValueProp, restoreMockedProps } from '../lib/prop-mock';
import { stable } from '../lib/zoneless';

@Component({
  selector: 'watchdog-probe',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
})
class WatchdogComponent {
  readonly label = signal('initial');
}

describe('the stable() watchdog inside fakeAsync', () => {
  afterEach(() => {
    restoreMockedProps();
    TestBed.resetTestingModule();
  });

  it('does not expire on virtual time the spec is driving', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [WatchdogComponent] });

    const fixture = TestBed.createComponent(WatchdogComponent);
    const settled: string[] = [];

    // A fixture whose `whenStable()` never settles is the shape of a request nobody flushed: without
    // it there is nothing for the watchdog to race, and the race is the whole subject here.
    mockValueProp(fixture, 'whenStable', () => new Promise<void>(() => undefined));

    void stable(fixture, { timeout: 50, label: 'the probe fixture' }).then(
      () => settled.push('stable'),
      (error: Error) => settled.push(`rejected: ${error.message}`),
    );

    tick(10_000);
    tick(0);

    // Ten virtual seconds past a 50 ms timeout: on the patched timer this had already rejected, and
    // a spec driving a component's own `setTimeout` was failed by its own `tick`.
    expect(settled).toEqual([]);
  }));
});
