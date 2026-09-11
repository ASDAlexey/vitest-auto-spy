/**
 * The survey a suite runs before turning the report on: a suite-wide `onUnstubbedRead` hears every
 * unconfigured read, strict double or not. A file of its own, because the handler is armed while the
 * file is collected and only one block per file can own that window.
 */
import { describe, expect, it } from 'vitest';

import '../index';
import { createSpyFromClass } from './create-spy-from-class';
import { setupAutoSpy } from './setup-auto-spy';
import type { UnstubbedRead } from './types';
import { resolveReadGuard } from './unconfigured-reads';

class Session {
  get user(): string {
    return 'real';
  }
}

describe('setupAutoSpy({ onUnstubbedRead })', () => {
  const seen: UnstubbedRead[] = [];

  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, onUnstubbedRead: (read) => seen.push(read) });

  it('lets a test read a getter nothing configured, on a double that is not even strict', () => {
    expect(createSpyFromClass(Session, { gettersToSpyOn: ['user'] }).user).toBeUndefined();
  });

  it('handed that read to the survey once the test ended', () => {
    expect(seen).toEqual([{ className: 'Session', member: 'user', kind: 'getter', count: 1 }]);
  });
});

describe('after the survey block', () => {
  it('finds the handler released', () => {
    expect(resolveReadGuard('Session', {})).toBeUndefined();
  });
});
