import { afterAll, beforeEach, describe, expect, it } from 'vitest';

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
    expect(readTooEarly).toMatchObject({
      message: expect.stringMatching(
        /^\[vitest-auto-spy\] installPerTest: nothing is installed yet — read before the first test, at describe body time, when no stub exists yet\. Read it inside a test\.\nDocs: \S+#reinstalling-a-stub-for-every-test$/,
      ),
    });
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
    expect(readAfterTheLastTest).toMatchObject({
      message: expect.stringContaining(
        'read after "installPerTest, read after the test it belongs to > a block whose stub must not outlive its test > hands back the stub while the test runs" ended',
      ),
    });
  });
});

describe('installPerTest, read by a hook that runs before its own', () => {
  let readInTheHook: unknown;

  beforeEach(() => {
    try {
      handle();
    } catch (error) {
      readInTheHook = error;
    }
  });

  const handle = installPerTest(() => 'stub');

  it('names the test and says to read it later', () => {
    expect(readInTheHook).toMatchObject({
      message: expect.stringContaining(
        'read during "installPerTest, read by a hook that runs before its own > names the test and says to read it later" by a hook that runs before the one installPerTest() registered',
      ),
    });
  });
});
