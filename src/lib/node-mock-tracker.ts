/**
 * Keeping `node:test`'s process-wide `MockTracker` from holding every spy the library ever made.
 *
 * `node:test` exports one lazily-built `MockTracker` as `mock`, and every `mock.fn()` is pushed onto
 * its private `#mocks` array so that `mock.reset()` can restore them later. Nothing is ever spliced
 * out: `restoreAll()` walks the array without emptying it, `reset()` is the only line that assigns
 * `#mocks = []`, and there is no per-entry removal. So a spy stays reachable from a module-level
 * object for the life of the process even after the spec that made it is gone, and with it
 * everything the spy closed over — its recorded arguments, and through them whole object graphs.
 * Measured on Node v24.19.0: 200 000 spies created and dropped, then forced collections, held
 * **148.5 MB**.
 *
 * The registry cannot be pruned the way {@link ../lib/mock-registry} prunes `@vitest/spy`'s. That
 * one works because `vi.clearAllMocks()` iterates a plain `Set` and `Set.prototype.forEach` hands
 * the set to its callback; `#mocks` is a hard private field appended through the **primordial**
 * `ArrayPrototypePush`, which ignores prototype patches, and no public method removes one entry.
 *
 * What is available instead is a boundary. `MockTracker` is an ordinary class — `mock.constructor`
 * **is** it — and `createNodeMockAdapter()` already takes the tracker as a parameter, so the library
 * can own an instance the user never shares and simply let go of it. That is the whole mechanism:
 * spies are created on a private tracker, and per test the tracker is **replaced** with a fresh one.
 * The retired instance and its array become garbage together. Measured the same way, on the same
 * machine: 600 000 spies routed through private trackers left **4.7 MB** against a 4.4 MB baseline.
 *
 * **Replace rather than `reset()`, and that is the point of the design.** `MockTracker#reset()`
 * always runs `restoreAll()` first — the two cannot be separated through the public surface — so a
 * `mockImplementation()` a spec applied to a spy that is still in use would be undone underneath it.
 * Dropping the tracker instead touches no spy at all: a `node:test` mock keeps recording calls and
 * keeps its implementation after its tracker is gone, because the tracker exists only for
 * restore/reset. That is also why none of `mock-registry.ts`'s long-lived classification is needed
 * here — there is no way for a dropped spy to start misbehaving, so there is nothing to exempt.
 *
 * **Why it is opt-in, and why every step is guarded.** `mock.constructor` is the constructor of a
 * value a public API returns, not documented API. It has been `MockTracker` at v22.21.0, v24.19.0
 * and v26.8.1, but it is not a contract, and this module is reached by every `vitest-auto-spy/node`
 * consumer on import. So a tracker is constructed only when {@link trackNodeMocks} asks for one, the
 * construction is probed before a single spy is routed at it, and every failure — a constructor that
 * is not one, a throw, a runtime that is not `node:test` at all — leaves spies going to the
 * runtime's own `mock` exactly as they do today. A slower run beats a broken one.
 */
import type { NodeMock, NodeTestApi } from './node-adapter';
import type { Func } from './types';

/**
 * The slice of `node:test` this module needs, declared structurally so the spec — which runs under
 * Vitest, where `node:test` cannot be imported — can hand over a stand-in.
 *
 * `afterEach` is optional because it is only the convenience half: without it the sweep has to be
 * called by hand, and everything else still works.
 */
export interface NodeTestHost {
  readonly mock: NodeTestApi;
  afterEach?(hook: () => void): void;
}

/** Undo {@link trackNodeMocks}: spies go back to the runtime's own tracker from the next one on. */
export type StopTrackingNodeMocks = () => void;

/** The runtime's `node:test` surface, installed by the `/node` entry on import. */
let host: NodeTestHost | undefined;

/** The tracker the library owns, or `undefined` while spies still go to the runtime's global one. */
let owned: NodeTestApi | undefined;

/** Spies handed out by the current private tracker — what {@link pruneNodeMocks} reports dropping. */
let created = 0;

/**
 * Whether the per-test sweep is already installed.
 *
 * Claimed once per process, like the scheduler wrapping in `stray-timers.ts`: `node:test` has no way
 * to remove a hook, so a second `trackNodeMocks()` must not stack a second `afterEach`. The hook is
 * written to be a no-op whenever tracking is off, which is what makes {@link stopTracking} safe
 * despite the hook outliving it.
 */
let sweepInstalled = false;

/**
 * View a value the probe has just exercised as the tracker it proved to be.
 *
 * The one assertion in this module, and it is the boundary between a runtime probe and the type
 * system: {@link probeTracker} has called `fn()` on this value and read the recorded call back off
 * the mock it returned, which is the whole of {@link NodeTestApi}. Nothing weaker than an assertion
 * carries that proof into a type.
 */
function asNodeTestApi(tracker: object): NodeTestApi {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the docblock: the shape was verified by calling it, and a probe's result cannot be expressed as a narrowing.
  return tracker as NodeTestApi;
}

/**
 * Confirm `candidate` is a usable tracker, or answer `undefined`.
 *
 * Deliberately more than a `typeof` check on `fn`: the value comes from an undocumented
 * `constructor`, so the probe creates a mock, calls it, and reads the call back. Anything that does
 * not record is not a `MockTracker`, whatever it is named. A non-callable `fn()` result throws here
 * and is caught by {@link constructPrivateTracker} — unusable either way.
 */
function probeTracker(candidate: object): NodeTestApi | undefined {
  const create: unknown = Reflect.get(candidate, 'fn');

  if (typeof create !== 'function') {
    return undefined;
  }

  const probe: unknown = Reflect.apply(create, candidate, []);

  if (typeof probe !== 'function') {
    return undefined;
  }

  probe();

  const calls: unknown = Reflect.get(Object(Reflect.get(probe, 'mock')), 'calls');

  return Array.isArray(calls) && calls.length === 1 ? asNodeTestApi(candidate) : undefined;
}

/**
 * Build a fresh private `MockTracker`, or `undefined` if this runtime will not give one up.
 *
 * `mock.constructor` is the only route to the class — it is not exported, and importing anything
 * from `node:internal/…` is not a thing a published package may do. Everything after it is guarded,
 * because that route is undocumented.
 */
function constructPrivateTracker(): NodeTestApi | undefined {
  const runtime = host;

  if (runtime === undefined) {
    return undefined;
  }

  // The `constructor` read is inside the `try` with everything else: it is a property lookup on an
  // object this module does not own, and an accessor that throws is exactly the sort of surprise the
  // fallback exists for.
  try {
    const Tracker: unknown = Reflect.get(runtime.mock, 'constructor');

    return typeof Tracker === 'function' ? probeTracker(Object(Reflect.construct(Tracker, []))) : undefined;
  } catch {
    return undefined;
  }
}

/** The stop handed back by a successful {@link trackNodeMocks}, shared so calling it twice is free. */
const stopTracking: StopTrackingNodeMocks = () => {
  owned = undefined;
  created = 0;
};

/** The stop handed back when tracking could not start — the library carries on unchanged. */
const stopNothing: StopTrackingNodeMocks = () => undefined;

/** Install the sweep once, if the host gave us a hook to install it on. */
function installSweep(): void {
  const runtime = host;

  if (sweepInstalled || runtime?.afterEach === undefined) {
    return;
  }

  sweepInstalled = true;
  runtime.afterEach(() => {
    pruneNodeMocks();
  });
}

/**
 * Wrap the runtime's `node:test` surface in the tracker the adapter is built on, and remember the
 * surface so {@link trackNodeMocks} can reach it later.
 *
 * The returned object resolves the real tracker **per call** rather than closing over one, which is
 * the seam the whole feature hangs off: `createNodeMockAdapter()` is built once, on import, long
 * before anyone can decide whether they want a private tracker.
 *
 * Called by the `/node` entry. A second call replaces the host and forgets any tracking, which is
 * what this module's own spec needs and no consumer ever does.
 */
export function createSwappableNodeTracker(nodeTest: NodeTestHost): NodeTestApi {
  host = nodeTest;
  owned = undefined;
  created = 0;

  return {
    fn: (implementation?: Func): NodeMock => {
      const tracker = owned;

      if (tracker === undefined) {
        return nodeTest.mock.fn(implementation);
      }

      created += 1;

      return tracker.fn(implementation);
    },
  };
}

/**
 * Drop the private tracker and start a fresh one, and report how many spies went with it.
 *
 * Answers `0` when tracking is off, and when a replacement could not be built — in which case the
 * current tracker is kept, because a tracker that grows is better than no tracker at all.
 *
 * Installed on `afterEach` by {@link trackNodeMocks}; call it directly to sweep at some other
 * moment, such as the end of a file in a suite that runs its tests concurrently.
 */
export function pruneNodeMocks(): number {
  if (owned === undefined) {
    return 0;
  }

  const fresh = constructPrivateTracker();

  if (fresh === undefined) {
    return 0;
  }

  const dropped = created;

  owned = fresh;
  created = 0;

  return dropped;
}

/**
 * Give this library a `MockTracker` of its own, so its spies never enter the process-wide one.
 *
 * Opt-in: a `node:test` suite that does nothing keeps today's behaviour exactly. Idempotent — a
 * second call installs nothing further and hands back the same stop — and reversible, which is the
 * shape `trackStrayTimers()` and `trackMockRegistry()` already use.
 *
 * Spies created **before** this call stay on the runtime's tracker; call it once, as early as the
 * file's imports allow.
 *
 * If the runtime will not give up its `MockTracker` class, this is a no-op that reports itself as
 * one by handing back a stop that does nothing — spies keep going to `node:test`'s own tracker, and
 * `mock.reset()` keeps freeing them.
 *
 * @returns The undo. Spies created after it go back to the runtime's tracker.
 *
 * @example
 * ```js
 * import { before, describe } from 'node:test';
 * import { trackNodeMocks } from 'vitest-auto-spy/node';
 *
 * before(() => {
 *   trackNodeMocks();
 * });
 * ```
 */
export function trackNodeMocks(): StopTrackingNodeMocks {
  if (owned !== undefined) {
    return stopTracking;
  }

  const tracker = constructPrivateTracker();

  if (tracker === undefined) {
    return stopNothing;
  }

  owned = tracker;
  created = 0;
  installSweep();

  return stopTracking;
}

/**
 * How many spies the private tracker is currently holding, or `0` when tracking is off.
 *
 * For diagnostics and for a suite that wants the sweep to fail loudly rather than quietly — the
 * number `pruneNodeMocks()` is about to return.
 *
 * It counts spy *functions*, not spy objects, and a `createSpyFromClass()` spy materialises its
 * methods on first access — so a spy whose methods a test never touched contributes nothing, which
 * is also why it costs nothing.
 */
export function countNodeMocks(): number {
  return owned === undefined ? 0 : created;
}

/**
 * Forget the host, the private tracker and the sweep claim.
 *
 * A real run never needs this — the entry installs the host once and the sweep lives as long as the
 * process. This module's own spec does, because it has to exercise an unset host, a hostile
 * constructor and a working tracker in one process.
 */
export function resetNodeMockTracking(): void {
  host = undefined;
  owned = undefined;
  created = 0;
  sweepInstalled = false;
}
