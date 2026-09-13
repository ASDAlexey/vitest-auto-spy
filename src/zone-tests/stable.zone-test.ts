/**
 * `stable()` and `setInputs()` against a real `NgZone` — the mode the main suite cannot have.
 *
 * The failure these exist for is `NG0101: ApplicationRef.tick is called recursively`, and it takes
 * four things at once, which is why it went unseen for three releases. `TestBed.createComponent`
 * builds the component inside `ngZone.run(…)`, so an `effect()` its constructor registers records
 * the zone's inner zone. A tick started from a test body runs in the runner's zone, so
 * `runEffectsInView` hops back into the recorded one to run a **dirty** effect; leaving that hop
 * takes the zone from unstable to stable, `NgZone.onMicrotaskEmpty` says so, and the subscriber
 * `provideZoneChangeDetection()` installs calls `ApplicationRef._tick()` — which is guarded against
 * its own scheduler and not against the tick already on the stack.
 *
 * Every ingredient is ordinary: the Angular CLI's unit-test builder adds
 * `provideZoneChangeDetection()` to any suite that loads zone.js, and a component with one `effect()`
 * is not exotic. What is not ordinary is noticing it — the error is handed to `ErrorHandler` rather
 * than thrown at the call site, so a suite that does not fail on console output stays green while
 * the change detection it asked for did not finish.
 */
import { Component, ErrorHandler, NgZone, type Type, effect, input, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { setInputs } from '../lib/set-inputs';
import { stable } from '../lib/zoneless';

@Component({
  selector: 'plain-probe',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
})
class PlainComponent {
  readonly label = input('initial');
}

@Component({
  selector: 'effect-probe',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
})
class EffectComponent {
  readonly label = input('initial');
  readonly seen = signal<string[]>([]);

  constructor() {
    effect(() => {
      this.seen.update((all) => [...all, this.label()]);
    });
  }
}

const reported: unknown[] = [];

class RecordingErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    reported.push(error);
  }
}

function render<T>(component: Type<T>): ComponentFixture<T> {
  reported.length = 0;
  TestBed.configureTestingModule({ imports: [component], providers: [{ provide: ErrorHandler, useClass: RecordingErrorHandler }] });

  return TestBed.createComponent(component);
}

/** What Angular reported instead of throwing — the only place the recursive tick is visible. */
function recursiveTicks(): number {
  return reported.filter((error) => error instanceof Error && error.message.includes('NG0101')).length;
}

describe('a bare TestBed.tick, which is what stable() used to do', () => {
  it('re-enters itself when a dirty effect makes it hop into the zone', () => {
    const fixture = render(EffectComponent);

    fixture.componentRef.setInput('label', 'next');
    TestBed.tick();

    expect(recursiveTicks()).toBe(1);
  });

  it('is quiet when the tick dirties no effect', () => {
    const fixture = render(EffectComponent);
    fixture.detectChanges();
    reported.length = 0;

    TestBed.tick();

    expect(recursiveTicks()).toBe(0);
  });

  it('is quiet when it runs inside the zone, which is the repair', () => {
    const fixture = render(EffectComponent);

    fixture.componentRef.setInput('label', 'next');
    TestBed.inject(NgZone).run(() => TestBed.tick());

    expect(recursiveTicks()).toBe(0);
    expect(fixture.componentInstance.seen()).toEqual(['next']);
  });
});

describe('stable and setInputs under a real NgZone', () => {
  it('renders a component that has no effect at all', async () => {
    const fixture = render(PlainComponent);

    await setInputs(fixture, { label: 'next' });

    expect(recursiveTicks()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('next');
  });

  it('takes the first change detection of a component that has one', async () => {
    const fixture = render(EffectComponent);

    await setInputs(fixture, { label: 'next' });

    expect(recursiveTicks()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('next');
    expect(fixture.componentInstance.seen()).toEqual(['next']);
  });

  it('runs an effect a later input change dirties', async () => {
    const fixture = render(EffectComponent);
    fixture.detectChanges();
    reported.length = 0;

    fixture.componentRef.setInput('label', 'next');
    await stable(fixture);

    expect(recursiveTicks()).toBe(0);
    expect(fixture.componentInstance.seen()).toEqual(['initial', 'next']);
  });
});
