/**
 * Property mocking — replace a property (readonly field, getter, accessor pair, `signal()` /
 * `computed()` result) with a stub, and put the original descriptor back afterwards.
 *
 * Nothing here is Angular-specific: the helpers patch plain objects, class prototypes and globals.
 * `vitest-auto-spy/angular` re-exports them because that is where they were introduced, and the
 * core barrel exports them too so a React/Vue/Node suite can use the same undo bookkeeping.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { getMockAdapter } from './mock-adapter';
import { isCannotRedefine, redefineFailure } from './redefine-failure';
import type { PropStubValue } from './types';

/** Undoes a single `mock*Prop` patch; calling it more than once is a no-op. */
export type RestoreProp = () => void;

/** Real implementations to put behind the spied accessors of {@link mockAccessorsProp}. */
export interface AccessorImplementations {
  get?: () => unknown;
  set?: (value: never) => void;
}

/** One property patch applied by the `mock*Prop` helpers, with the descriptor it replaced. */
interface PatchedProp {
  object: object;
  property: PropertyKey;
  descriptor: PropertyDescriptor | undefined;
  /** Set by the patch's own undo, so the sweep skips it — see {@link rememberProp}. */
  undone: boolean;
  /** Which test was running when the patch was applied — see {@link beginPropEpoch}. */
  epoch: number;
}

/**
 * Which test is running, counted rather than named.
 *
 * A patch is undone by the sweep that runs after the test **during which it was applied**, whenever
 * it was created. So one written in a `describe` body — or in `beforeAll` — is taken off after the
 * first test of the block and never put back: test one passes, every test after it reads the real
 * member, and the failure is `X is not a function` several tests away from the line that caused it.
 * Reproduced in six files of one suite at once, during a bulk move onto `mockValueProp`.
 *
 * Comparing the epoch a patch was made in with the epoch the sweep runs in is what tells the two
 * apart, and it needs nothing from the runner beyond the `beforeEach` `setupAutoSpy` already
 * installs: a patch made inside a per-test hook carries the current epoch, one made outside carries
 * an older one.
 *
 * The counter shares the journal's home on `globalThis` and has to: `setupAutoSpy` ships only from
 * `vitest-auto-spy/setup` and `mockValueProp` only from the core entries, so the hook that advances
 * the epoch and the call that stamps one are always in different bundles. A module-scoped counter
 * left every correctly-placed patch stamped `0` against a sweep counting from its own copy, and the
 * report fired on exactly the code it exists to bless.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyPropEpoch__: { current: number } | undefined;
}

let sharedEpoch: { current: number } | undefined;

function propEpoch(): { current: number } {
  return (sharedEpoch ??= globalThis.__vitestAutoSpyPropEpoch__ ??= { current: 0 });
}

/**
 * Start a new per-test epoch. Called from `setupAutoSpy`'s `beforeEach`, before anything else.
 *
 * A suite that does not call `setupAutoSpy` never advances it, so nothing is ever reported there —
 * correct, because without the sweep a `describe`-body patch stays where it was put.
 */
export function beginPropEpoch(): void {
  propEpoch().current += 1;
}

/**
 * The patch log lives on `globalThis`, not in module scope, so that it survives a module-graph
 * reset: a spec calling `vi.resetModules()` (directly or through `vi.mock`) gets a fresh copy of
 * this module, and a module-scoped array would leave `restoreMockedProps()` restoring an empty one.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyPatchedProps__: PatchedProp[] | undefined;
}

function getPatchedProps(): PatchedProp[] {
  return (globalThis.__vitestAutoSpyPatchedProps__ ??= []);
}

/**
 * Record the descriptor a helper has just overwritten and hand back the undo for *this* patch
 * alone — for the common case of a stub that must come off inside one test rather than at the end
 * of the file. {@link restoreMockedProps} undoes whatever is left.
 */
function rememberProp<T>(object: T, property: PropertyKey, descriptor: PropertyDescriptor | undefined): RestoreProp {
  const patch: PatchedProp = {
    // The helpers only ever patch objects; the cast bridges the generic `T` of the public API.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `T` is unconstrained on the public signatures, but every caller passes an object (a service instance, a class prototype or a global).
    object: object as object,
    property,
    descriptor,
    undone: false,
    epoch: propEpoch().current,
  };

  getPatchedProps().push(patch);

  return () => {
    // Marked rather than spliced out of the journal: `indexOf` + `splice` is linear in the number of
    // patches taken so far, which turns a spec that stubs in a loop into quadratic work. A second
    // call (directly, or after `restoreMockedProps` swept the journal) must stay a no-op either way.
    if (patch.undone) {
      return;
    }

    patch.undone = true;
    restorePatch(patch);
  };
}

/**
 * A descriptor that may name `set: undefined` explicitly — `exactOptionalPropertyTypes` rejects that
 * on the lib type, and leaving `set` out is what the readonly helpers must not do.
 */
type PatchDescriptor = Omit<PropertyDescriptor, 'set'> & { set?: ((value: never) => void) | undefined };

/**
 * Overwrite one property, record the undo, and say something useful when the property refuses.
 *
 * A bare `TypeError: Cannot redefine property: injectDomainMetrics` names neither the object, nor
 * the reason the property is locked, nor the repair. The accessor spies behind the adapter have
 * explained that failure for a while; these helpers reach the same `Object.defineProperty` and used
 * to hand the unhelpful text straight back.
 *
 * **The journal entry is made only after the define has succeeded**, and the order is the whole
 * point. Recording first and compensating on failure is the obvious shape and is wrong twice over:
 * the compensation would write the original descriptor back to the property that has just refused a
 * write, so it throws in turn and replaces the diagnosis with its own error — and a patch that never
 * happened would otherwise sit in the journal until the next `restoreMockedProps()` reported a
 * teardown failure for it, turning one confusing message into two.
 */
function applyPatch<T>(object: T, property: PropertyKey, descriptor: PatchDescriptor): RestoreProp {
  const previous = Object.getOwnPropertyDescriptor(object, property);

  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `PatchDescriptor` names `set: undefined`, which `exactOptionalPropertyTypes` forbids on the lib type; the runtime shape is what `defineProperty` wants.
    Object.defineProperty(object, property, descriptor as PropertyDescriptor);
  } catch (error) {
    if (isCannotRedefine(error)) {
      throw redefineFailure(
        `Cannot mock the property '${String(property)}': it is not configurable, so it cannot be redefined.`,
        Object(object),
        error,
      );
    }

    throw error;
  }

  return rememberProp(object, property, previous);
}

/** Put one recorded descriptor back, or drop the property when the helper introduced it. */
function restorePatch({ object, property, descriptor }: PatchedProp): void {
  if (descriptor) {
    Object.defineProperty(object, property, descriptor);

    return;
  }

  Reflect.deleteProperty(object, property);
}

/**
 * One message for everything a sweep could not put back.
 *
 * Every failure is reported rather than the first: they are independent patches, and a suite that
 * seals two properties needs to see both to know how much of its teardown is a lie.
 */
function describeRestoreFailures(failures: readonly string[]): string {
  return withDocs(
    `[vitest-auto-spy] restoreMockedProps() could not put ${failures.length} of the patched properties back:\n${failures.join('\n')}\n` +
      'A property that was redefined as non-configurable can never be restored — `Object.defineProperty` defaults ' +
      '`configurable` to `false`, so a plain redefinition of an already-mocked property seals it for the rest of the worker. ' +
      "`setupAutoSpy({ guardGlobals: 'throw' })` names the test that does it. Every other patch of this sweep was restored, and " +
      'the journal is empty either way — nothing here is replayed against a descriptor that has since moved on.',
    DOCS_LINKS.setup,
  );
}

/**
 * How many `mock*Prop` patches are still in place.
 *
 * The counterpart of `countStrayTimers()` / `countStrayRejections()`, and it answers one question:
 * did the teardown actually run? A patch that outlives its test is silent — the next test reads a
 * value somebody else installed, and the failure surfaces wherever that value happens to matter,
 * which is routinely a different `describe` and an error message about something else entirely.
 *
 * @example
 * ```ts
 * afterEach(() => expect(countMockedProps()).toBe(0));
 * ```
 */
export function countMockedProps(): number {
  return getPatchedProps().filter((patch) => !patch.undone).length;
}

/**
 * How a sweep reacts to a patch that was applied outside a per-test hook.
 *
 * `'warn'` by default, which is this package's channel for "you wrote something that does not do
 * what you think" — the same one `injectSpy` uses for a provider that is not a spy. `'throw'` is for
 * a suite that would rather fail on the first test than read a warning; `'off'` for one that has
 * decided its `beforeAll` patches are its own business.
 */
export type OutsideHookReaction = 'off' | 'throw' | 'warn';

/** On `globalThis` for the reason the epoch is: the grader and the sweep sit in different bundles. */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyOutsideHookReaction__: OutsideHookReaction | undefined;
}

function outsideHookReaction(): OutsideHookReaction {
  return globalThis.__vitestAutoSpyOutsideHookReaction__ ?? 'warn';
}

/** Set by `setupAutoSpy`; exported so a suite can grade the report without the setup helper. */
export function reportPropsOutsideHooks(reaction: OutsideHookReaction): void {
  globalThis.__vitestAutoSpyOutsideHookReaction__ = reaction;
}

/**
 * What has already been reported, so a patch is named once rather than once per sweep.
 *
 * Keyed by the patched **object** rather than by the property name: under `isolate: false` two files
 * of one worker routinely patch a member of the same name on different objects, and a name-keyed set
 * would report the first and silence the second.
 */
const reportedOutsideHooks = new WeakMap<object, Set<PropertyKey>>();

/** Whether this object/property pair is worth reporting, remembering it if so. */
function firstReportOf({ object, property }: PatchedProp): boolean {
  const seen = reportedOutsideHooks.get(object) ?? new Set<PropertyKey>();

  reportedOutsideHooks.set(object, seen);

  if (seen.has(property)) {
    return false;
  }

  seen.add(property);

  return true;
}

/**
 * Say that a patch is about to be taken off and not put back.
 *
 * The report goes out **after** the sweep has restored everything, so the diagnosis never costs the
 * teardown it is diagnosing.
 */
function reportOutsideHook(patches: readonly PatchedProp[]): void {
  if (outsideHookReaction() === 'off') {
    return;
  }

  const fresh = patches.filter(firstReportOf).map((patch) => String(patch.property));

  if (fresh.length === 0) {
    return;
  }

  const message = withDocs(
    `[vitest-auto-spy] ${fresh.join(', ')} — patched outside a per-test hook, and the patch is now off for good.\n` +
      'A `mock*Prop` patch is undone by the sweep that runs after the test **during which it was applied**, whenever it was ' +
      'created. One written in a `describe` body or in `beforeAll` therefore survives exactly one test: the first passes, ' +
      'every test after it reads the real member, and the failure surfaces as `… is not a function` nowhere near the line ' +
      'that caused it.\n' +
      'Move the call into `beforeEach`, which is where a patch every test needs belongs — it costs one line and the patch ' +
      'is then re-applied for each test.',
    DOCS_LINKS.setup,
  );

  if (outsideHookReaction() === 'throw') {
    throw new Error(message);
  }

  // eslint-disable-next-line no-console -- a dev-time misconfiguration warning, the channel this library already uses for `injectSpy`'s not-a-spy report.
  console.warn(message);
}

/**
 * Undo every patch the `mock*Prop` helpers applied since the last call, newest first.
 *
 * Nothing calls this for you: `vi.restoreAllMocks()` knows about spies, not about properties these
 * helpers redefined. It matters most when the patched object outlives the spec file — a global
 * (`globalThis.crypto`, `window.getComputedStyle`), a class prototype, a singleton — which is
 * always the case under Vitest's `isolate: false`, where the next file inherits the environment.
 * Wire it into a global `afterEach`/`afterAll` in your setup file, or call `setupAutoSpy()`
 * (`vitest-auto-spy/setup`), which does it for you.
 *
 * @example
 * ```ts
 * restoreMockedProps(); // undoes every mock*Prop patch — vi.restoreAllMocks() does not
 * ```
 *
 * @throws if a patch cannot be undone (the property was later redefined as non-configurable). The
 *   other patches are restored first, and the journal is emptied whatever happens.
 */
export function restoreMockedProps(): void {
  const patchedProps = getPatchedProps();
  // A copy, walked newest first: the same property may have been patched more than once, and only
  // the descriptor recorded first is the original one. Reversing the journal in place would leave it
  // back-to-front for the next call if a restore throws mid-way, silently inverting that invariant.
  const pending = [...patchedProps].reverse();
  const failures: string[] = [];

  // Emptied before anything is put back, so a patch is attempted once even if it throws: replaying
  // it against a descriptor the failure left in place is how one broken restore becomes many.
  patchedProps.length = 0;

  const outsideHook: PatchedProp[] = [];

  for (const patch of pending) {
    if (patch.undone) {
      continue;
    }

    patch.undone = true;

    // Recorded before the restore, because the restore is what makes it unrecoverable: a patch made
    // in an epoch older than the one this sweep runs in was applied outside a per-test hook, so
    // nothing will put it back.
    if (patch.epoch < propEpoch().current) {
      outsideHook.push(patch);
    }

    try {
      restorePatch(patch);
    } catch (error) {
      failures.push(`  - ${String(patch.property)}: ${String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(describeRestoreFailures(failures));
  }

  reportOutsideHook(outsideHook);
}

/**
 * Override a readonly property (incl. `signal()` / `computed()`) with a static value.
 *
 * This is also the answer to `TS2540: Cannot assign to 'X' because it is a read-only property` on a
 * **getter**; for a `readonly` *field* of an object, use {@link mockValueProp}.
 *
 * The object may be the `Spy<T>` that `injectSpy` / `asSpy` returns: the value is checked against
 * the member's own type, not against the spy-decorated one, so a real signal is accepted.
 *
 * @example
 * ```ts
 * mockReadonlyProp(service, 'isReady', true);
 * mockReadonlyProp(service, 'count', signal(3)); // signals too
 * ```
 */
export function mockReadonlyProp<T, K extends keyof T>(object: T, property: K, value: PropStubValue<T[K]>): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockReadonlyProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp;
export function mockReadonlyProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp {
  // `set: undefined` is load-bearing: defineProperty over an existing get/set pair inherits the
  // missing attributes, so without it the real setter stays live and writes vanish into it silently.
  return applyPatch(object, property, { get: () => value, set: undefined, configurable: true });
}

/**
 * Override a readonly property with a dynamic getter.
 *
 * @example
 * ```ts
 * let label = 'A';
 *
 * mockReadonlyPropGetter(service, 'label', () => label);
 * label = 'B'; // service.label is now 'B'
 * ```
 */
export function mockReadonlyPropGetter<T, K extends keyof T>(object: T, property: K, getter: () => unknown): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockReadonlyPropGetter<T>(object: T, property: PropertyKey, getter: () => unknown): RestoreProp;
export function mockReadonlyPropGetter<T>(object: T, property: PropertyKey, getter: () => unknown): RestoreProp {
  // See mockReadonlyProp for why `set` must be named explicitly.
  return applyPatch(object, property, { get: getter, set: undefined, configurable: true });
}

/**
 * Override a property with a plain writable value — the counterpart of {@link mockReadonlyProp} for
 * members the code under test assigns to, and the way to stub a method on a real (non-spy) instance.
 *
 * It is the answer to `TS2540: Cannot assign to 'X' because it is a read-only property` when `X` is
 * a field: `component.account.isGuest = true` cannot be written, `mockValueProp(component.account,
 * 'isGuest', true)` can — and records the undo. (`TS2540` on a class **getter** is
 * {@link mockReadonlyProp}.)
 *
 * @example
 * ```ts
 * mockValueProp(service, 'retries', 3);
 * mockValueProp(globalThis, 'BackgroundWorker', createSpyClass(BackgroundWorker));
 * ```
 */
export function mockValueProp<T, K extends keyof T>(object: T, property: K, value: PropStubValue<T[K]>): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockValueProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp;
export function mockValueProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp {
  return applyPatch(object, property, { value, writable: true, configurable: true });
}

/**
 * Replace a property with spied `get`/`set` accessors (host-runner mocks). Pass `accessors` to give
 * either side a real implementation — the spy still records every read and write, which is what a
 * DOM property backed by an attribute (`input.valueAsNumber`, …) needs.
 *
 * @example
 * ```ts
 * const restore = mockAccessorsProp(service, 'theme');
 *
 * service.theme = 'dark';
 * expect(service.accessorSpies.setters.theme).toHaveBeenCalledWith('dark');
 * restore();
 * ```
 */
export function mockAccessorsProp<T, K extends keyof T>(object: T, property: K, accessors?: AccessorImplementations): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockAccessorsProp<T>(object: T, property: PropertyKey, accessors?: AccessorImplementations): RestoreProp;
export function mockAccessorsProp<T>(object: T, property: PropertyKey, accessors?: AccessorImplementations): RestoreProp {
  const adapter = getMockAdapter();

  return applyPatch(object, property, {
    get: adapter.createMockFn(accessors?.get),
    set: adapter.createMockFn(accessors?.set),
    configurable: true,
  });
}
