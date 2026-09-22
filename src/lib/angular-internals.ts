/**
 * The canary for the Angular internals this package reads.
 *
 * Several helpers here answer questions Angular publishes no API for: which requests a testing
 * module is still holding (`TestBed#_testModuleRef`), what a compiled component calls its inputs
 * (`ɵcmp.inputs`), whether anything has already read a signal (`ReactiveNode#consumers`). The peer
 * range is `>=20` with no upper bound, and the repository's gate pins exactly one Angular — so the
 * question that matters is not "is this private" but "what happens when it moves".
 *
 * Left alone, each of these fails **silently**: a renamed field reads as `undefined`, the check that
 * depended on it decides there is nothing to report, and a suite keeps passing with one fewer
 * assertion than its author thinks. That is the failure mode this module exists to remove. The
 * probes run once per worker, cost microseconds, and name the Angular version in the failure so the
 * upgrade that broke them is the first thing the reader sees.
 *
 * `assertRouteWiring` in `angular-router.ts` is the same idea for the router's constructors; this is
 * the shared one for `@angular/core`.
 */
import { signal, ɵSIGNAL } from '@angular/core';
import { getTestBed } from '@angular/core/testing';

import { angularInternalsError } from './angular-internals-error';

/** One shape, the check behind it, and what its absence would cost. */
interface Probe {
  what: string;
  consequence: string;
  ok: () => boolean;
}

const PROBES: Probe[] = [
  {
    what: 'TestBed#_testModuleRef',
    consequence:
      'The live testing module can no longer be told from a reset one, so `provideHttpTesting({ verifyOnTeardown })` and ' +
      '`enableAngularDiagnostics({ pendingRequests, shadowedProviders })` would report nothing at all.',
    ok: (): boolean => '_testModuleRef' in getTestBed(),
  },
  {
    what: 'ReactiveNode#consumers / #kind',
    consequence:
      '`mockSignalProp()` can no longer see whether a signal has been read, nor write through a read-only one, so a ' +
      'patch applied after the first read would be accepted and quietly change nothing.',
    ok: (): boolean => {
      const node: object = Object(Reflect.get(signal(0), ɵSIGNAL));

      return 'consumers' in node && Reflect.get(node, 'kind') === 'signal';
    },
  },
];

/** Memoised: the probes are a property of the loaded Angular, and that cannot change mid-worker. */
let failure: Error | undefined;
let checked = false;

/**
 * Check the internal shapes once per worker; throw with the Angular version when one has moved.
 *
 * Called lazily, from the first helper that depends on them, so a project that uses none of them
 * pays nothing and an Angular this package has not met yet fails at the call that needs it.
 */
export function assertAngularInternals(): void {
  if (!checked) {
    checked = true;

    const broken = PROBES.find((probe) => !probe.ok());

    failure = broken === undefined ? undefined : angularInternalsError(broken.what, broken.consequence);
  }

  if (failure) {
    throw failure;
  }
}

/** For the specs that pin the shapes: forget the memoised verdict so the probes run again. */
export function resetAngularInternalsCheck(): void {
  checked = false;
  failure = undefined;
}
