/**
 * `stable` / `flushEffects` exist because `fixture.detectChanges()` runs one pass and never flushes
 * effects. These specs assert exactly that difference: state that only an effect produces is
 * missing before the helper and present after it — on the `TestBed.tick()` path and on the
 * `ApplicationRef.tick()` fallback taken by Angular versions below 20.
 */
import { Component, effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { mockValueProp } from './prop-mock';
import { renderShallow } from './render-shallow';
import { flushEffects, stable } from './zoneless';

@Component({ selector: 'app-effects', template: '' })
class EffectsComponent {
  readonly source = signal(0);
  readonly seen: number[] = [];

  constructor() {
    effect(() => this.seen.push(this.source()));
  }
}

describe('stable', () => {
  it('flushes the effect a bare detectChanges() leaves pending', async () => {
    const { fixture, component } = renderShallow(EffectsComponent);

    component.source.set(5);

    expect(component.seen).not.toContain(5);

    await stable(fixture);

    expect(component.seen).toContain(5);
  });
});

describe('flushEffects', () => {
  it('runs pending effects synchronously, without a fixture to await', () => {
    const { component } = renderShallow(EffectsComponent);

    component.source.set(7);
    flushEffects();

    expect(component.seen).toContain(7);
  });

  it('falls back to ApplicationRef.tick() when TestBed.tick() is not available', () => {
    const source = signal(0);
    const seen: number[] = [];

    TestBed.runInInjectionContext(() => effect(() => seen.push(source())));

    // `PropertyKey` (not the literal) selects the escape-hatch overload, so `undefined` is accepted
    // for a member the public type declares as a method.
    const tick: PropertyKey = 'tick';
    const restore = mockValueProp(TestBed, tick, undefined);

    source.set(9);
    flushEffects();
    restore();

    expect(seen).toContain(9);
    expect(typeof TestBed.tick).toBe('function');
  });
});
