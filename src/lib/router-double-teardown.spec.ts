import { NavigationEnd } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import '../angular';
import { type RouterDouble, collectRouterEvents, createRouterDouble } from './router-double';

const teardown = vi.hoisted(() => ({ missing: false }));

vi.mock('./runner-hooks', async (importOriginal) => {
  const real = await importOriginal<typeof import('./runner-hooks')>();

  return { ...real, getTestFinishedHook: () => (teardown.missing ? undefined : real.getTestFinishedHook()) };
});

describe('collectRouterEvents teardown', () => {
  let double: RouterDouble;
  let recording: ReturnType<typeof collectRouterEvents>;

  it('records while the test that started it runs', async () => {
    double = createRouterDouble();
    recording = collectRouterEvents(double.router.events);

    await double.emitNavigation('/checkout');

    recording.expect([[NavigationEnd, '/checkout']]);
  });

  it('stops recording once that test has finished', async () => {
    await double.emitNavigation('/cart');

    recording.expect([[NavigationEnd, '/checkout']]);
  });

  it('keeps recording on a runner with no per-test teardown, instead of failing', async () => {
    teardown.missing = true;

    const own = createRouterDouble();
    const events = collectRouterEvents(own.router.events);

    teardown.missing = false;
    await own.emitNavigation('/checkout');

    expect(events.events).toHaveLength(1);
  });
});
