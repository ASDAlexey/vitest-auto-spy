import { Component, type EffectRef, computed, effect, signal, ɵSIGNAL } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { runEffect } from './run-effect';
import { flushEffects } from './zoneless';

/** Build a real effect without a fixture — `runInInjectionContext` is all `effect()` needs. */
function createEffect(body: (onCleanup: (fn: () => void) => void) => void): EffectRef {
  return TestBed.runInInjectionContext(() => effect(body));
}

/** `EffectRef` is an interface, so it has no implicit index signature — widen to `object` first. */
function reactiveNode(effectRef: EffectRef): Record<string, unknown> {
  const target: object = effectRef;
  const holder: Partial<Record<symbol, Record<string, unknown>>> = target;

  return holder[ɵSIGNAL] as Record<string, unknown>;
}

@Component({ template: '' })
class WatcherComponent {
  readonly trigger = signal(0);
  bodyRuns = 0;
  cleanupRuns = 0;

  readonly watch = effect((onCleanup) => {
    this.trigger();
    this.bodyRuns += 1;
    onCleanup(() => {
      this.cleanupRuns += 1;
    });
  });
}

describe('runEffect', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('runs the body once, on demand', () => {
    let runs = 0;
    const effectRef = createEffect(() => {
      runs += 1;
    });

    // The scheduler has not flushed yet, so nothing has happened on its own.
    expect(runs).toBe(0);

    runEffect(effectRef);

    expect(runs).toBe(1);
  });

  it('reads the signals as they stand at the moment of the call', () => {
    const label = signal('draft');
    const seen: string[] = [];
    const effectRef = createEffect(() => seen.push(label()));

    runEffect(effectRef);
    label.set('published');
    runEffect(effectRef);

    expect(seen).toEqual(['draft', 'published']);
  });

  it('runs the previous cleanup before the body, the way the scheduler does', () => {
    const fixture = TestBed.createComponent(WatcherComponent);
    fixture.detectChanges();
    flushEffects();

    const component = fixture.componentInstance;

    expect([component.bodyRuns, component.cleanupRuns]).toEqual([1, 0]);

    runEffect(component.watch);
    runEffect(component.watch);
    runEffect(component.watch);

    expect([component.bodyRuns, component.cleanupRuns]).toEqual([4, 3]);
  });

  it('keeps one registered cleanup on the node rather than one per call', () => {
    const fixture = TestBed.createComponent(WatcherComponent);
    fixture.detectChanges();
    flushEffects();

    runEffect(fixture.componentInstance.watch);
    runEffect(fixture.componentInstance.watch);

    expect(reactiveNode(fixture.componentInstance.watch)['cleanupFns']).toHaveLength(1);
  });

  it('leaves teardown with a single cleanup to run, not one per call', () => {
    const fixture = TestBed.createComponent(WatcherComponent);
    fixture.detectChanges();
    flushEffects();

    runEffect(fixture.componentInstance.watch);
    runEffect(fixture.componentInstance.watch);

    const component = fixture.componentInstance;
    const before = component.cleanupRuns;

    fixture.destroy();

    expect(component.cleanupRuns).toBe(before + 1);
  });

  it('does not hand the effect dependencies to whatever is computing at the call site', () => {
    const inner = signal(0);
    const outer = signal(0);
    const effectRef = createEffect(() => inner());

    let derivedRuns = 0;
    const derived = computed(() => {
      derivedRuns += 1;
      outer();
      runEffect(effectRef);

      return derivedRuns;
    });

    derived();
    inner.set(1);
    derived();

    expect(derivedRuns).toBe(1);
  });

  it('refuses an effect whose view has been destroyed', () => {
    const fixture = TestBed.createComponent(WatcherComponent);
    fixture.detectChanges();
    flushEffects();

    const component = fixture.componentInstance;

    fixture.destroy();

    expect(() => runEffect(component.watch)).toThrow(/this effect has been destroyed/);
    expect(component.bodyRuns).toBe(1);
  });

  it('refuses an effect that destroyed itself', () => {
    let runs = 0;
    const effectRef = createEffect(() => {
      runs += 1;
    });

    effectRef.destroy();

    expect(() => runEffect(effectRef)).toThrow(/effectRef\.destroy\(\) was called/);
    expect(runs).toBe(0);
  });

  it('names the repair in the destroyed message', () => {
    const effectRef = createEffect(() => undefined);

    effectRef.destroy();

    expect(() => runEffect(effectRef)).toThrow(/Move the call above fixture\.destroy\(\)/);
  });

  it('refuses a view effect that was destroyed on its own, with the view still alive', () => {
    const fixture = TestBed.createComponent(WatcherComponent);
    fixture.detectChanges();
    flushEffects();

    const component = fixture.componentInstance;

    component.watch.destroy();

    expect(() => runEffect(component.watch)).toThrow(/this effect has been destroyed/);
    expect(component.bodyRuns).toBe(1);
  });

  it('runs a view effect whose Angular version keeps its siblings somewhere new', () => {
    const fixture = TestBed.createComponent(WatcherComponent);
    fixture.detectChanges();
    flushEffects();

    const component = fixture.componentInstance;
    // No set on the view at all: the shape this helper reads is gone, so it must not guess "destroyed".
    reactiveNode(component.watch)['view'] = [1, 'two'];

    runEffect(component.watch);

    expect(component.bodyRuns).toBe(2);
  });

  it('runs a node that belongs to neither a scheduler nor a view', () => {
    let runs = 0;
    const effectRef = { [ɵSIGNAL]: { fn: () => (runs += 1), cleanup: () => undefined } } as unknown as EffectRef;

    runEffect(effectRef);

    expect(runs).toBe(1);
  });

  it('rejects a value that is not an EffectRef', () => {
    expect(() => runEffect({} as EffectRef)).toThrow(/not an EffectRef returned by effect\(\)/);
  });

  it('says what to do instead when the Angular version keeps the body elsewhere', () => {
    const effectRef = createEffect(() => undefined);

    delete reactiveNode(effectRef)['fn'];

    expect(() => runEffect(effectRef)).toThrow(/stores the effect body somewhere this helper does not know about/);
  });

  it('says the same when the cleanup has moved', () => {
    const effectRef = createEffect(() => undefined);

    // `cleanup` lives on the node's prototype, so shadowing it is what "moved away" looks like here.
    reactiveNode(effectRef)['cleanup'] = undefined;

    expect(() => runEffect(effectRef)).toThrow(/stores the effect body somewhere this helper does not know about/);

    // Put the prototype's own back, or the TestBed teardown that destroys the effect throws instead.
    delete reactiveNode(effectRef)['cleanup'];
  });

  it('explains an unassigned field instead of failing on a property read', () => {
    expect(() => runEffect(undefined as unknown as EffectRef)).toThrow(/not an EffectRef returned by effect\(\)/);
  });

  it('links to the Angular adapter docs', () => {
    expect(() => runEffect({} as EffectRef)).toThrow(/Docs: https:\/\/.*\/adapters\/angular/);
  });
});
