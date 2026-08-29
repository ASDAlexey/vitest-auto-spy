import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushEventLoop, flushEventLoopUntil, settleDynamicImport } from './event-loop';
import { mockValueProp, restoreMockedProps } from './prop-mock';

/** Continues on a real macrotask, which is what microtask draining cannot reach. */
function resolvesOnARealTurn(): Promise<'done'> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (): void => {
      channel.port1.close();
      channel.port2.close();
      resolve('done');
    };
    channel.port2.postMessage(undefined);
  });
}

describe('flushEventLoop', () => {
  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  });

  it('lets a real event-loop turn happen while the timers are faked', async () => {
    vi.useFakeTimers();

    let settled = false;

    void resolvesOnARealTurn().then(() => {
      settled = true;
    });

    // The comparison that motivates the helper: microtasks alone never get there.
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);

    await flushEventLoop();

    expect(settled).toBe(true);
  });

  it('does not move the clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2025-04-30T00:00:00.000Z');

    await flushEventLoop(3);

    expect(new Date().toISOString()).toBe('2025-04-30T00:00:00.000Z');
  });

  it('takes as many turns as asked for', async () => {
    let hops = 0;

    const chain = async (): Promise<void> => {
      await resolvesOnARealTurn();
      hops += 1;
      await resolvesOnARealTurn();
      hops += 1;
    };

    void chain();
    await flushEventLoop(4);

    expect(hops).toBe(2);
  });

  it('falls back to the captured setTimeout on a runtime without MessageChannel', async () => {
    // `node:test` on an older Node, and any host that ships no MessageChannel — the fallback has to
    // be exercised somewhere, and removing the global is the only way to reach it from here.
    mockValueProp(globalThis, 'MessageChannel', undefined);

    let settled = false;

    void new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)).then(() => {
      settled = true;
    });

    await flushEventLoop();
    restoreMockedProps();

    expect(settled).toBe(true);
  });

  it('works with real timers too', async () => {
    let settled = false;

    void resolvesOnARealTurn().then(() => {
      settled = true;
    });

    await flushEventLoop();

    expect(settled).toBe(true);
  });
});

describe('settleDynamicImport', () => {
  it('resolves the module and hands its namespace back', async () => {
    const namespace = await settleDynamicImport(() => import('./create-mock'));

    expect(typeof namespace.createMock).toBe('function');
  });

  it('lets a continuation the code under test started drain as well', async () => {
    let loadedByProductionCode = false;

    // The shape the helper exists for: the spec has no handle on this promise.
    void import('./create-mock').then(() => {
      loadedByProductionCode = true;
    });

    await settleDynamicImport(() => import('./create-mock'));

    expect(loadedByProductionCode).toBe(true);
  });
});

describe('flushEventLoopUntil', () => {
  it('returns without taking a turn when the condition already holds', async () => {
    let checks = 0;

    await flushEventLoopUntil(() => {
      checks += 1;

      return true;
    });

    expect(checks).toBe(1);
  });

  it('stops on the turn the condition becomes true', async () => {
    let ready = false;

    void resolvesOnARealTurn().then(() => {
      ready = true;
    });

    await flushEventLoopUntil(() => ready);

    expect(ready).toBe(true);
  });

  it('fails with the label when the budget runs out', async () => {
    await expect(flushEventLoopUntil(() => false, { turns: 2, label: 'the product resource' })).rejects.toThrow(
      /the product resource was still not ready after 2 real event-loop turns/,
    );
  });

  it('falls back to "the condition" when no label is given', async () => {
    await expect(flushEventLoopUntil(() => false, { turns: 1 })).rejects.toThrow(/the condition was still not ready/);
  });
});

describe('the flushEventLoopUntil budget message', () => {
  it('names the cause that reads as a flake, and its fix', async () => {
    // A cold dynamic `import()` outruns the budget; the next test in the file passes off the module
    // cache, so only the first one fails and the whole thing looks intermittent.
    const failure = await flushEventLoopUntil(() => false, { turns: 1, label: 'the chunk' }).catch((error: unknown) => String(error));

    expect(failure).toContain('settleDynamicImport');
    expect(failure).toContain('the chunk');
    expect(failure).toContain('advanceTimers()');
  });
});
