import { type EffectRef, type Signal, computed, effect, linkedSignal, signal, ɵSIGNAL } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { restoreMockedProps } from './prop-mock';
import { runEffect } from './run-effect';
import { trackEffectRuns, trackRecomputations } from './track-signal-runs';
import { flushEffects } from './zoneless';

/** `EffectRef` is an interface, so it has no implicit index signature — widen to `object` first. */
function reactiveNode(effectRef: EffectRef): Record<string, unknown> {
  const target: object = effectRef;
  const holder: Partial<Record<symbol, Record<string, unknown>>> = target;

  return holder[ɵSIGNAL] as Record<string, unknown>;
}

describe('trackRecomputations', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('counts the computation, not the reads', () => {
    const price = signal(10);
    const total = computed(() => price() * 2);

    const runs = trackRecomputations(total);

    expect([total(), total(), total()]).toEqual([20, 20, 20]);
    expect(runs.count).toBe(1);

    price.set(20);

    expect(total()).toBe(40);
    expect(runs.count).toBe(2);
  });

  it('counts nothing when a signal the computation never reads changes', () => {
    const price = signal(10);
    const filter = signal('open');
    const total = computed(() => price() * 2);

    total();

    const runs = trackRecomputations(total);

    filter.set('closed');
    total();

    expect(runs.count).toBe(0);
  });

  it('counts a linkedSignal the same way', () => {
    const source = signal(1);
    const mirrored = linkedSignal(() => source() * 10);

    mirrored();

    const runs = trackRecomputations(mirrored);

    source.set(2);

    expect(mirrored()).toBe(20);
    expect(runs.count).toBe(1);
  });

  it('stops counting, and leaves the computation working', () => {
    const price = signal(1);
    const total = computed(() => price() * 2);
    const runs = trackRecomputations(total);

    price.set(2);
    total();
    runs.stop();

    price.set(3);

    expect(total()).toBe(6);
    expect(runs.count).toBe(1);
  });

  it('takes a second stop() as the no-op it is', () => {
    const total = computed(() => 1);
    const runs = trackRecomputations(total);

    runs.stop();
    runs.stop();

    expect(total()).toBe(1);
    expect(runs.count).toBe(0);
  });

  it('is undone by restoreMockedProps(), for a spec that never reaches stop()', () => {
    const price = signal(1);
    const total = computed(() => price() * 2);
    const runs = trackRecomputations(total);

    restoreMockedProps();

    price.set(2);
    total();

    expect(runs.count).toBe(0);
  });

  it('rejects a value that is not a signal', () => {
    expect(() => trackRecomputations(42 as unknown as Signal<number>)).toThrow(/it is not a signal/);
  });

  it('says which handle to pass when given the computed value instead of the computed', () => {
    const total = computed(() => 1);

    expect(() => trackRecomputations(total() as unknown as Signal<number>)).toThrow(/not trackRecomputations\(component\.total\(\)\)/);
  });

  it('sends a plain writable signal to the helper that fits it', () => {
    expect(() => trackRecomputations(signal(1))).toThrow(/track the computed\(\) that reads it/);
  });

  it('links to the Angular adapter docs', () => {
    expect(() => trackRecomputations(signal(1))).toThrow(/Docs: https:\/\/.*\/adapters\/angular/);
  });
});

describe('trackEffectRuns', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('counts the runs the scheduler asks for', () => {
    const trigger = signal(0);
    const effectRef = TestBed.runInInjectionContext(() => effect(() => trigger()));

    flushEffects();

    const runs = trackEffectRuns(effectRef);

    trigger.set(1);
    flushEffects();
    trigger.set(2);
    flushEffects();

    expect(runs.count).toBe(2);
  });

  it('counts a run asked for by runEffect', () => {
    const effectRef = TestBed.runInInjectionContext(() => effect(() => undefined));
    const runs = trackEffectRuns(effectRef);

    runEffect(effectRef);

    expect(runs.count).toBe(1);
  });

  it('counts nothing when a signal the effect never reads changes', () => {
    const watched = signal(0);
    const unrelated = signal('open');
    const effectRef = TestBed.runInInjectionContext(() => effect(() => watched()));

    flushEffects();

    const runs = trackEffectRuns(effectRef);

    unrelated.set('closed');
    flushEffects();

    expect(runs.count).toBe(0);
  });

  it('stops counting, and leaves the effect running', () => {
    let bodyRuns = 0;
    const trigger = signal(0);
    const effectRef = TestBed.runInInjectionContext(() =>
      effect(() => {
        trigger();
        bodyRuns += 1;
      }),
    );

    flushEffects();

    const runs = trackEffectRuns(effectRef);

    runs.stop();
    trigger.set(1);
    flushEffects();

    expect([runs.count, bodyRuns]).toEqual([0, 2]);
  });

  it('rejects a value that is not an EffectRef', () => {
    expect(() => trackEffectRuns({} as EffectRef)).toThrow(/not an EffectRef returned by effect\(\)/);
  });

  it('says what to count instead when the Angular version keeps the body elsewhere', () => {
    const effectRef = TestBed.runInInjectionContext(() => effect(() => undefined));

    delete reactiveNode(effectRef)['fn'];

    expect(() => trackEffectRuns(effectRef)).toThrow(/keeps the effect body somewhere this helper does not know about/);
  });

  it('links to the Angular adapter docs', () => {
    expect(() => trackEffectRuns({} as EffectRef)).toThrow(/Docs: https:\/\/.*\/adapters\/angular/);
  });
});
