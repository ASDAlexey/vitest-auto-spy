import { afterAll, onTestFailed } from 'vitest';

/**
 * `it.fails` passes on any error, a TypeError in the library included. Called once per file, this
 * returns a check for the body of an `it.fails`: the file fails in `afterAll` unless that test
 * failed with a message matching `expected`.
 */
export function expectFailures(): (expected: RegExp | string) => void {
  const mismatches: string[] = [];

  afterAll(() => {
    if (mismatches.length > 0) {
      throw new Error(`${mismatches.length} it.fails test(s) failed for the wrong reason:\n${mismatches.join('\n')}`);
    }
  });

  return (expected) => {
    onTestFailed(({ task }) => {
      const messages = (task.result?.errors ?? []).map((error) => String(error.message));
      const matches = (message: string): boolean => (typeof expected === 'string' ? message.includes(expected) : expected.test(message));

      if (!messages.some(matches)) {
        mismatches.push(`- "${task.name}" expected ${String(expected)}, got: ${messages.join(' | ') || 'no message'}`);
      }
    });
  };
}
