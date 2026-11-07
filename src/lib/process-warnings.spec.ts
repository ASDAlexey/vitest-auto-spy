import { afterEach, describe, expect, it } from 'vitest';

import { withoutProcessWarnings } from './process-warnings';

describe('withoutProcessWarnings', () => {
  const real: unknown = Reflect.get(globalThis, 'process');

  afterEach(() => {
    Reflect.set(globalThis, 'process', real);
  });

  it('puts emitWarning back even when the work throws', () => {
    const emit = process.emitWarning;

    expect(() =>
      withoutProcessWarnings(() => {
        expect(process.emitWarning).not.toBe(emit);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(process.emitWarning).toBe(emit);
  });

  it('just runs the work where there is no emitWarning to mute, or it cannot be replaced', () => {
    Reflect.set(globalThis, 'process', {});

    expect(withoutProcessWarnings(() => 'no emitWarning')).toBe('no emitWarning');

    Reflect.set(globalThis, 'process', Object.freeze({ emitWarning: () => undefined }));

    expect(withoutProcessWarnings(() => 'frozen')).toBe('frozen');
  });
});
