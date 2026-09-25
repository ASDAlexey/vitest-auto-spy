import { expect } from 'vitest';

import { displayPath } from './message-text';

/** `"suite > test" (a.spec.ts)` while a test runs, the file alone in a file-level hook. */
export function describeCulprit(): string {
  const { currentTestName, testPath } = expect.getState();
  const file = testPath === undefined ? 'this file' : displayPath(testPath);

  return currentTestName === undefined ? file : `"${currentTestName}" (${file})`;
}
