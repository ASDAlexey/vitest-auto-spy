/**
 * `setupAutoSpy()` over a file whose `test` carries fixtures. Vitest reads every hook's source in such
 * a file, and the library's per-test hooks once named their context parameter: every test here failed
 * with `FixtureParseError` before its body ran.
 */
import { test as base, expect } from 'vitest';

import { mockValueProp } from './prop-mock';
import { setupAutoSpy } from './setup-auto-spy';

setupAutoSpy({ duplicateCopies: 'off' });

const settings = { theme: 'light' };

const test = base.extend('answer', () => 42);

test('hands the fixture over and patches a prop', ({ answer }) => {
  mockValueProp(settings, 'theme', 'dark');

  expect(answer).toBe(42);
  expect(settings.theme).toBe('dark');
});

test('finds the patch restored by the hooks that parsed', ({ answer }) => {
  expect(answer).toBe(42);
  expect(settings.theme).toBe('light');
});
