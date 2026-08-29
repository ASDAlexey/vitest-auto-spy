import { afterAll, describe, expect, it } from 'vitest';

import { installPerTest } from './install-per-test';

describe('installPerTest', () => {
  let built = 0;

  const handle = installPerTest(() => {
    built += 1;

    return { id: built };
  });

  it('installs before the first test', () => {
    expect(handle().id).toBe(1);
  });

  it('installs again for the next one, so nothing is shared across tests', () => {
    expect(handle().id).toBe(2);
  });
});

describe('installPerTest, read too early', () => {
  const early = installPerTest(() => 'never built');

  // Read here, in the describe body: inside an `it` the hook has already run, so this is the only
  // place from which the "nothing installed yet" path is reachable at all.
  let readTooEarly: unknown;

  try {
    early();
  } catch (error) {
    readTooEarly = error;
  }

  it('says which mistake was made', () => {
    expect(readTooEarly).toMatchObject({ message: expect.stringContaining('nothing is installed yet') });
  });
});

describe('installPerTest, read after the test it belongs to', () => {
  let readAfterTheLastTest: unknown;

  describe('a block whose stub must not outlive its test', () => {
    const handle = installPerTest(() => 'stub');

    it('hands back the stub while the test runs', () => {
      expect(handle()).toBe('stub');
    });

    // `afterAll` of this block runs once its `afterEach` has already dropped the handle — the only
    // place from which "the last test's stub is gone" is observable.
    afterAll(() => {
      try {
        handle();
      } catch (error) {
        readAfterTheLastTest = error;
      }
    });
  });

  it('drops the last test’s stub instead of holding it to the end of the run', () => {
    expect(readAfterTheLastTest).toMatchObject({ message: expect.stringContaining('nothing is installed yet') });
  });
});
