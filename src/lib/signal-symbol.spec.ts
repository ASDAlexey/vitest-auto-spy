import { signal, ɵSIGNAL } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { findSignalSymbol, readSignalSymbol, signalSymbol } from './signal-symbol';

describe('findSignalSymbol', () => {
  it('takes the exported symbol when Angular still exports it', () => {
    expect(signalSymbol()).toBe(ɵSIGNAL);
    expect(signalSymbol()).toBe(ɵSIGNAL);
  });

  it('falls back to the symbol a signal carries when the export is gone', () => {
    const key = Symbol('SIGNAL');
    const create = (): unknown => Object.assign(() => 0, { [key]: {} });

    expect(findSignalSymbol({ signal: create })).toBe(key);
  });

  it('answers a key no signal carries when neither the export nor a function-shaped signal is there', () => {
    const bare = findSignalSymbol({});
    const objectSignal = findSignalSymbol({ signal: () => ({}) });
    const unbranded = findSignalSymbol({ signal: () => () => 0 });

    expect(typeof bare).toBe('symbol');
    expect(Reflect.get(signal(0), bare)).toBeUndefined();
    expect(objectSignal).not.toBe(ɵSIGNAL);
    expect(unbranded).not.toBe(ɵSIGNAL);
  });
});

describe('readSignalSymbol', () => {
  it('reads the reactive node off a signal', () => {
    const value = signal(1);

    expect(readSignalSymbol(value)).toBe(Reflect.get(value, ɵSIGNAL));
    expect(readSignalSymbol({})).toBeUndefined();
  });
});
