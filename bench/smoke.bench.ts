/**
 * The one benchmark the harness itself is tested with. Run by `npm run bench:smoke`, in seconds.
 *
 * It measures nothing anybody should quote — two arms, a few hundred iterations, no warm-up worth
 * the name. Its job is to be a real `vitest bench` run of a real bench file that goes through the
 * real reporter, so that a runner upgrade which changes the benchmark API (Vitest 5 removed both
 * `--outputJson` and the `bench` export) fails in a lane that costs a minute instead of in the
 * ten-minute one nobody runs. Keep it cheap; keep it using every part of the API the real files use.
 */
import { test } from 'vitest';

import { createSpyFromClass } from '../src/index';
import { captureMockRegistry, pruneMockRegistry } from '../src/setup';

captureMockRegistry();

class SmokeSubject {
  m0(): number {
    return 0;
  }

  m1(): number {
    return 1;
  }
}

test('harness smoke', async ({ bench }) => {
  await bench.compare(
    bench('eager (lazySpies: false)', () => {
      createSpyFromClass(SmokeSubject, { lazySpies: false });
      pruneMockRegistry();
    }),
    bench('lazy (lazySpies: true, the default)', () => {
      createSpyFromClass(SmokeSubject, { lazySpies: true });
      pruneMockRegistry();
    }),
    { iterations: 300, time: 0, warmupIterations: 30, warmupTime: 0 },
  );
});
