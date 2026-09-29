import { afterEach, describe, expect, it } from 'vitest';

import { useConsoleSpies } from '../console';
import { misconfigurationThrows, reportMisconfiguration, setMisconfigurationReaction } from './misconfiguration';

describe('the misconfiguration grade', () => {
  const { consoleWarnSpy } = useConsoleSpies();

  afterEach(() => {
    setMisconfigurationReaction(undefined);
  });

  it('prints by default', () => {
    reportMisconfiguration('a typo');

    expect(misconfigurationThrows()).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith('a typo');
  });

  it('fails at the call site when set to throw, for every bundle in the process', () => {
    setMisconfigurationReaction('throw');

    expect(globalThis.__vitestAutoSpyMisconfiguration__).toBe('throw');
    expect(() => reportMisconfiguration('a typo')).toThrow('a typo');
  });
});
