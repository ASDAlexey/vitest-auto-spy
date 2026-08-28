import { describe, expect, it } from 'vitest';

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
