/**
 * Stray-rejection containment: the promise rejections zone.js prints and then swallows.
 *
 * zone.js replaces the global `Promise` with `ZoneAwarePromise`. A rejected one nobody handled is
 * pushed to `_uncaughtPromiseErrors` and drained in `api.microtaskDrainDone()`, which calls
 * `api.onUnhandledError(e)` — and that is a `console.error(...)` and nothing else. It therefore
 * never reaches Node's `process.on('unhandledRejection')`, the channel Vitest listens on, so the
 * runner is never told: a file that rejected a hundred promises still exits 0.
 *
 * What that hides is not exotic. One 11 587-test Angular suite, green and quiet apart from ~13 900
 * lines of stderr, was hiding six real defects of exactly this shape:
 *
 *  - `compileComponents().then(() => { expect(...) })` — 11 tests whose assertions never ran, two of
 *    them asserting something false;
 *  - an `async` helper called without `await` — 7 tests, one asserting `expect([...set]).toBe('a
 *    string')`, which cannot ever be true;
 *  - `firstValueFrom(cold$).then((value) => expect(value).toBeFalsy())` on an observable that had
 *    not emitted;
 *  - a `TypeError` thrown inside `import('…').then(…)` in *production* code.
 *
 * Every one of them was a passing test. An assertion that rejects after its test has finished
 * cannot fail it, and under zone.js nothing else fails either.
 *
 * zone.js leaves exactly one extension point, and in Node/jsdom nothing claims it: after the
 * `console.error` it calls `Zone[Zone.__symbol__('unhandledPromiseRejectionHandler')]`, if a
 * function is sitting there. zone.js installs its own only where `globalThis.PromiseRejectionEvent`
 * exists — which is how a rejection reaches a `window.addEventListener('unhandledrejection')` — so
 * this module chains to whatever it finds instead of replacing it.
 *
 * **Deliberately not a `process.on('unhandledRejection')` listener.** Vitest's own handler bails out
 * as soon as anyone else is listening (`if (processListeners(event).length > 1) return;`), so adding
 * one would *silence* the native rejections the runner already reports and fails runs for. Native
 * rejections are not the gap; the zone-swallowed ones are, and they are all this touches.
 */
import { expect } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';

/** The `Zone` class zone.js parks on the host, reduced to the one member this module needs. */
export interface ZoneStatic {
  // Method syntax, as in `SchedulerHost`: a consumer whose tsconfig pulls zone.js's own types in has
  // a *declared* `Zone` on the globals, and its `__symbol__` is then checked against this one.
  // Parameters compared bivariantly keep every version of that declaration assignable here without
  // the assertion this package bans.
  __symbol__(name: string): string;
}

/**
 * The globals a zone-patched run keeps its promise machinery on. Defaults to the real ones; a test
 * — or a project with an unusual environment — can pass a stand-in instead.
 *
 * `Promise` is required even though nothing here calls it, and that is not an accident: an
 * interface whose members are all optional is a *weak* type, and `typeof globalThis` — which
 * declares no `Zone`, because zone.js is not a dependency of this package — has no property in
 * common with one, so the default host could not satisfy it without the assertion this package
 * bans. `Promise` is the honest anchor to pick: the swallowing this module exists for happens
 * precisely because zone.js replaced that global.
 */
export interface RejectionHost {
  Promise: PromiseConstructor;
  /** zone.js's `Zone`. Absent from the type of the real globals, present on them at runtime. */
  Zone?: ZoneStatic;
}

/** Undo the claim made by {@link trackStrayRejections}, putting back whatever handler was there. */
export type StopTrackingRejections = () => void;

/** One promise rejection zone.js swallowed, captured at the moment it gave up on it. */
export interface StrayRejection {
  /** The value the promise rejected with, unwrapped from zone's `{ rejection, zone, task }` wrapper. */
  readonly reason: unknown;
  /** `true` when the reason looks like a failed matcher rather than a thrown error. */
  readonly assertion: boolean;
  /** The test the runner reported as running when the rejection surfaced; `''` when none was. */
  readonly testName: string;
}

/** What zone.js hands the handler — its own wrapper, or the bare reason when it rethrew the original. */
type RejectionHandler = (error: unknown) => void;

interface Tracking {
  readonly captured: StrayRejection[];
  readonly stop: StopTrackingRejections;
}

const HANDLER_SLOT = 'unhandledPromiseRejectionHandler';

const MISSING_ZONE =
  'trackStrayRejections() found no zone.js on the host (`Zone.__symbol__` is not there), so there is no handler slot to claim. ' +
  'This module never imports zone.js — a zoneless project must not pull it in — which means the consumer loads it first: ' +
  "`import 'zone.js';` at the top of the setup file, or, under `@angular/build:unit-test`, the builder's own entry point does " +
  'it. It throws rather than quietly doing nothing on purpose: without zone.js the global `Promise` is the platform one, whose ' +
  'unhandled rejections Vitest already reports and fails the run for, so a silent no-op here would read as "the check is on" ' +
  'while nothing was ever checked. Drop the option instead.';

/**
 * Keyed by host, and parked on `globalThis` rather than in module scope.
 *
 * A `vi.resetModules()` re-instantiates this file while the handler slot stays claimed; module
 * scope would forget that and chain a second wrapper onto the first, doubling every capture. The
 * global map remembers across re-instantiation, which is what makes {@link trackStrayRejections}
 * genuinely idempotent.
 */
declare global {
  // eslint-disable-next-line no-var -- a `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyTrackedRejections__: Map<RejectionHost, Tracking> | undefined;
}

function registry(): Map<RejectionHost, Tracking> {
  return (globalThis.__vitestAutoSpyTrackedRejections__ ??= new Map());
}

function defaultHost(): RejectionHost {
  return globalThis;
}

function isHandler(value: unknown): value is RejectionHandler {
  return typeof value === 'function';
}

/**
 * The host's zone.js, or an error saying how to get one.
 *
 * The type of `host.Zone` is optimistic — `typeof globalThis` declares no `Zone`, so the property is
 * never there as far as the compiler is concerned and always there at runtime once zone.js is
 * loaded. Probing for `__symbol__` is what reconciles the two, and it also refuses a global that
 * merely happens to be called `Zone`.
 */
function readZone(host: RejectionHost): ZoneStatic {
  const zone = host.Zone;

  if (!zone || typeof zone.__symbol__ !== 'function') {
    throw new Error(withDocs(MISSING_ZONE, DOCS_LINKS.setup));
  }

  return zone;
}

/**
 * Does this reason look like a failed `expect(...)` rather than a thrown error?
 *
 * Vitest and chai build assertion failures as `Error`s named `AssertionError`, and a failed matcher
 * additionally carries its report on `matcherResult`; either is enough, and asking for neither
 * drags chai into this file. The distinction earns its keep in the report: "an assertion ran too
 * late to fail its test" is a different bug from "a promise blew up and nobody looked".
 */
function isAssertionFailure(reason: unknown): boolean {
  if (typeof reason !== 'object' || reason === null) {
    return false;
  }

  return Reflect.get(reason, 'matcherResult') !== undefined || Reflect.get(reason, 'name') === 'AssertionError';
}

/**
 * Unwrap what zone.js hands over, and note which test was running when it did.
 *
 * The argument is zone's own `{ rejection, zone, task }` wrapper, except when the rejection was
 * queued with `throwOriginal`, where it is the bare reason. Reading `.rejection` when there is one
 * covers both without having to ask which case this is.
 *
 * The test name is what the runner believed at that moment, which is the honest thing to record: a
 * rejection from one file's test routinely surfaces during a later one, and the report says
 * "attributed to" rather than "thrown by" for exactly that reason.
 */
function describeRejection(error: unknown): StrayRejection {
  const wrapped: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'rejection') : undefined;
  const reason = wrapped ?? error;

  return { reason, assertion: isAssertionFailure(reason), testName: expect.getState().currentTestName ?? '' };
}

/**
 * Claim zone.js's unhandled-rejection hook, so what it swallows can be read back.
 *
 * Idempotent: calling it again for the same host returns the same stop function without chaining a
 * second handler onto the first. Call it once, as early as your setup file runs.
 *
 * Throws when the host has no zone.js — see the message, which explains why that is better than a
 * no-op. Nothing here imports zone.js: the consumer's setup file (or the Angular builder) loads it,
 * and this reads the global it left behind.
 *
 * @param host Defaults to the real globals. Pass a stand-in to watch a specific object instead.
 *
 * @returns The undo — it puts the previous handler back and forgets what was captured.
 *
 * @example
 * ```ts
 * // vitest.setup.ts — or let setupAutoSpy({ strayRejections: true }) do all of it for you
 * trackStrayRejections();
 * afterEach(() => expect(flushStrayRejections()).toEqual([]));
 * ```
 */
export function trackStrayRejections(host: RejectionHost = defaultHost()): StopTrackingRejections {
  const tracked = registry().get(host);

  if (tracked) {
    return tracked.stop;
  }

  const zone = readZone(host);
  const slot = zone.__symbol__(HANDLER_SLOT);
  const previous: unknown = Reflect.get(zone, slot);
  const captured: StrayRejection[] = [];

  Reflect.set(zone, slot, (error: unknown): void => {
    captured.push(describeRejection(error));

    // Chained rather than replaced: where `PromiseRejectionEvent` exists, the handler already in the
    // slot is zone.js's own, and it is what forwards the rejection to a
    // `window.addEventListener('unhandledrejection')` the code under test registered.
    if (isHandler(previous)) {
      previous(error);
    }
  });

  const stop: StopTrackingRejections = () => {
    // Put back what was there, or leave the slot as empty as it was found. zone.js only ever asks
    // whether it holds a function, but a module about not leaking state should not leak a key.
    if (isHandler(previous)) {
      Reflect.set(zone, slot, previous);
    } else {
      Reflect.deleteProperty(zone, slot);
    }

    registry().delete(host);
  };

  registry().set(host, { captured, stop });

  return stop;
}

/**
 * How many swallowed rejections have piled up so far — the assertion a suite reaches for when it
 * wants one to fail the run rather than scroll past in stderr.
 *
 * @example
 * ```ts
 * afterEach(() => expect(countStrayRejections()).toBe(0));
 * ```
 */
export function countStrayRejections(host: RejectionHost = defaultHost()): number {
  const tracked = registry().get(host);

  if (!tracked) {
    throw new Error(withDocs('countStrayRejections() needs trackStrayRejections() to have run first.', DOCS_LINKS.setup));
  }

  return tracked.captured.length;
}

/**
 * Take what was captured and start again from empty.
 *
 * Belongs in `afterEach`, where a non-empty result is the failure: whatever is in it rejected while
 * that test was the one running. Forgiving about an untracked host — a project that turned the
 * option off should not have its teardown throw at it.
 *
 * @example
 * ```ts
 * afterEach(() => {
 *   const stray = flushStrayRejections();
 *
 *   if (stray.length > 0) {
 *     throw new Error(`${stray.length} rejection(s) nobody handled: ${stray.map((one) => String(one.reason)).join(', ')}`);
 *   }
 * });
 * ```
 */
export function flushStrayRejections(host: RejectionHost = defaultHost()): StrayRejection[] {
  const tracked = registry().get(host);

  return tracked ? tracked.captured.splice(0) : [];
}
