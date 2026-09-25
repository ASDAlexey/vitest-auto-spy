/**
 * The name resolution every input-setting helper shares.
 *
 * Two halves: what a real compiled component says (aliases, and the inputs a `hostDirectives` entry
 * exposes — the ones `setInput` accepts and `ɵcmp.inputs` never lists), and what the reader does
 * with a definition whose shape is not the one this package was written against. The second half is
 * driven through hand-built definitions, because the whole point is a shape no Angular emits.
 */
import { Component, Directive, type Type, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { inputNames, resolveInputs } from './angular-inputs';
import { renderShallow } from './render-shallow';
import { setInputs } from './set-inputs';

@Directive({ selector: '[appTooltip]' })
class TooltipDirective {
  readonly text = input('none');
}

@Component({
  selector: 'app-button',
  template: '',
  hostDirectives: [{ directive: TooltipDirective, inputs: ['text: tip'] }],
})
class ButtonComponent {
  readonly label = input('go');
}

/** A definition of a shape no Angular emits — the only way to exercise the reader's refusals. */
function fake(definition: object, key: 'ɵcmp' | 'ɵdir' | 'ɵpipe' = 'ɵcmp'): Type<unknown> {
  const Fake = class {};

  Object.defineProperty(Fake, key, { value: definition });

  return Fake;
}

describe('input names, from a real definition', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('resolves an input a host directive exposes, which the component itself does not declare', async () => {
    const { fixture } = renderShallow(ButtonComponent);

    // @ts-expect-error — `tip` belongs to the host directive, so it is not a member of the component's type
    await setInputs(fixture, { tip: 'saved' });

    expect(fixture.debugElement.injector.get(TooltipDirective).text()).toBe('saved');
  });

  it('lists the host-directive name among the ones it declares', () => {
    expect([...new Set(inputNames('setInputs', ButtonComponent).values())]).toEqual(['label', 'tip']);
  });
});

describe('input names, from a definition of another shape', () => {
  it('refuses a definition whose inputs are not tuples, naming the Angular version', () => {
    const broken = fake({ inputs: { heading: 'heading' } });

    expect(() => inputNames('setInputs', broken)).toThrow(/@angular\/core \d+\.\d+\.\d+ no longer carries ɵcmp\.inputs/);
  });

  it('reads a directive definition when there is no component one', () => {
    const directive = fake({ inputs: { text: ['text', 0, null] } }, 'ɵdir');

    expect(inputNames('setInputs', directive).get('text')).toBe('text');
  });

  it('skips an input whose field is not a name', () => {
    const odd = fake({ inputs: { heading: [42, 0, null] } });

    expect([...inputNames('setInputs', odd).keys()]).toEqual(['heading']);
  });

  it('resolves a host-directive list the compiler left as a thunk, in its own binding-pair shape', () => {
    const lazy = fake({
      inputs: {},
      hostDirectives: [(): unknown[] => [{ directive: TooltipDirective, inputs: ['text', 'tip'] }]],
    });

    expect(inputNames('setInputs', lazy).get('tip')).toBe('tip');
  });

  it('ignores a host-directive entry that resolves to nothing usable', () => {
    const odd = fake({ inputs: {}, hostDirectives: [(): unknown => undefined, { inputs: 'text' }, {}] });

    expect([...inputNames('setInputs', odd).keys()]).toEqual([]);
  });

  it('follows a host directive that has host directives of its own, and stops at a cycle', () => {
    const first: { inputs: object; hostDirectives: unknown[] } = { inputs: {}, hostDirectives: [] };
    const second: { inputs: object; hostDirectives: unknown[] } = { inputs: {}, hostDirectives: [] };
    const First = fake(first, 'ɵdir');
    const Second = fake(second, 'ɵdir');

    // Each carries the other, which is the shape that made an unguarded walk recurse for ever.
    first.hostDirectives.push({ directive: Second, inputs: { text: 'fromSecond' } });
    second.hostDirectives.push({ directive: First, inputs: { text: 'fromFirst' } });

    expect([...inputNames('setInputs', First).keys()]).toEqual(['fromSecond', 'fromFirst']);
  });
});

describe('resolveInputs', () => {
  it('translates every key to the name setInput answers to', () => {
    const pairs = resolveInputs('renderShallow', ButtonComponent, { label: 'ok', tip: 'hint' });

    expect(pairs).toEqual([
      ['label', 'ok'],
      ['tip', 'hint'],
    ]);
  });

  it('names the caller and every key the component does not declare', () => {
    expect(() => resolveInputs('renderShallow', ButtonComponent, { labell: 'typo', missing: 1 })).toThrow(
      /renderShallow: ButtonComponent declares no input named 'labell', 'missing'\. Did you mean 'label' for 'labell'\?\nIts inputs are 'label', 'tip'\./,
    );
  });

  it('suggests the input a single typo was meant to be', () => {
    expect(() => resolveInputs('setInputs', ButtonComponent, { labl: 'typo' })).toThrow(
      /declares no input named 'labl'\. Did you mean 'label'\?\n/,
    );
  });

  it('suggests nothing when no declared name is close', () => {
    expect(() => resolveInputs('setInputs', ButtonComponent, { colour: 'red' })).toThrow(/declares no input named 'colour'\.\nIts inputs/);
  });

  it('says a pipe has no inputs, rather than calling it uncompiled', () => {
    expect(() => inputNames('setInputs', fake({ name: 'upper' }, 'ɵpipe'))).toThrow(
      /is a @Pipe, and a pipe has no inputs\.\nCall its transform\(\) directly/,
    );
  });
});
