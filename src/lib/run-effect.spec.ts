import { type EffectRef, effect, signal, ɵSIGNAL } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { runEffect } from './run-effect';

/** Build a real effect without a fixture — `runInInjectionContext` is all `effect()` needs. */
function createEffect(body: () => void): EffectRef {
  return TestBed.runInInjectionContext(() => effect(body));
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

  it('rejects a value that is not an EffectRef', () => {
    expect(() => runEffect({} as EffectRef)).toThrow(/not an EffectRef returned by effect\(\)/);
  });

  it('says what to do instead when the Angular version keeps the body elsewhere', () => {
    const effectRef = createEffect(() => undefined);
    // `EffectRef` is an interface, so it has no implicit index signature — widen to `object` first.
    const target: object = effectRef;
    const holder: Partial<Record<symbol, Record<string, unknown>>> = target;
    const node = holder[ɵSIGNAL];

    delete node?.['fn'];

    expect(() => runEffect(effectRef)).toThrow(/stores the effect body somewhere this helper does not know about/);
  });

  it('explains an unassigned field instead of failing on a property read', () => {
    expect(() => runEffect(undefined as unknown as EffectRef)).toThrow(/not an EffectRef returned by effect\(\)/);
  });

  it('links to the Angular adapter docs', () => {
    expect(() => runEffect({} as EffectRef)).toThrow(/Docs: https:\/\/.*\/adapters\/angular/);
  });
});
