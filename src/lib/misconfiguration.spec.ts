import { afterEach, describe, expect, it, vi } from 'vitest';

import { misconfigurationThrows, reportMisconfiguration, setMisconfigurationReaction } from './misconfiguration';

describe('the misconfiguration grade', () => {
  afterEach(() => {
    setMisconfigurationReaction(undefined);
  });

  it('prints by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reportMisconfiguration('a typo');

    expect(misconfigurationThrows()).toBe(false);
    expect(warn).toHaveBeenCalledWith('a typo');
    warn.mockRestore();
  });

  it('fails at the call site when set to throw, for every bundle in the process', () => {
    setMisconfigurationReaction('throw');

    expect(globalThis.__vitestAutoSpyMisconfiguration__).toBe('throw');
    expect(() => reportMisconfiguration('a typo')).toThrow('a typo');
  });
});
