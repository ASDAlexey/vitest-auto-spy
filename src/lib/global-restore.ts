/**
 * Putting raw global assignments back at the file boundary.
 *
 * With `isolate: false` a worker keeps one module graph and one set of globals for every spec file it
 * runs. `vi.stubGlobal` is covered by Vitest's own `unstubGlobals` and `vi.spyOn` by `restoreMocks`,
 * but a plain assignment — `global.ResizeObserver = stub`, `global.fetch = fake` — is tracked by
 * nothing: the replacement answers for every later file in the worker, and the file that meets it is
 * never pointed at the file that planted it. One snapshot of the globals, taken before any spec has
 * run, is what makes the repair possible.
 *
 * **The descriptor is not the whole story, and the DOM environment is why.** Vitest installs a jsdom
 * or happy-dom window's properties on `globalThis` as accessor pairs forwarding to the window:
 * `global.ResizeObserver = stub` runs the setter, which parks the stub behind the getter, and leaves
 * the descriptor exactly as it was. A restore that only compares and re-defines descriptors reports
 * "nothing changed" while the stub keeps answering. The value has to go back through the same setter,
 * which is the second leg of {@link restoreGlobals} below.
 *
 * The net catches *changed* globals, not *added* ones. A framework that installs a global at import
 * time must not lose it at the first file boundary, so keys that did not exist at capture are never
 * deleted and never re-defined — reporting additions is `guardGlobalPatches`' half, when configured.
 * That asymmetry is deliberate: a restore that undoes additions would fight the imports it runs
 * alongside, and one that ignored deletions would leave every later file meeting `undefined`.
 */
import { isOwnedPatch } from './owned-patch';

/**
 * Keys no restore may touch. Assigning `location` or `document` does not replace a value so much as
 * navigate, or hand the environment a different document than the one it is running in — recorded
 * nowhere, repaired never — and re-defining `window` or `global` would swap the identity every later
 * spec reads them under.
 */
const UNRESTORABLE_GLOBALS = new Set<PropertyKey>(['document', 'frames', 'global', 'location', 'parent', 'self', 'top', 'window']);

/** One key's half of the baseline: the descriptor as captured, plus what the getter answered then. */
interface Baseline {
  readonly descriptor: PropertyDescriptor;
  /**
   * The value read through the descriptor at capture — for an accessor, from behind the getter. This
   * is what the write-back puts back; `undefined` when the getter throws, which is also what such a
   * global reads as at restore time, so the two agree and nothing is written.
   */
  readonly through: unknown;
  /**
   * Whether two reads at capture agreed. happy-dom's `CSS` getter builds a fresh object per read,
   * which no comparison can tell from a replacement, so such a key only gets the descriptor leg.
   */
  readonly stable: boolean;
}

/**
 * Keyed by host, and parked on `globalThis` rather than in module scope.
 *
 * A `vi.resetModules()` re-instantiates this file while the globals it snapshotted stay replaced;
 * module scope would forget the baseline and a re-capture would launder the replacement into the
 * worker's truth. The global map remembers across re-instantiation, which is what makes
 * {@link captureGlobalBaseline} idempotent in the only sense that matters: the first snapshot wins.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyGlobalBaselines__: Map<object, Map<PropertyKey, Baseline>> | undefined;
}

function registry(): Map<object, Map<PropertyKey, Baseline>> {
  return (globalThis.__vitestAutoSpyGlobalBaselines__ ??= new Map());
}

/**
 * Whether `key` falls outside the net: the runner's bookkeeping, under a `__vitest` name or a
 * registered `$$jest` symbol (`expect`'s matcher state lives there), and never rolled back. Every
 * other symbol global is as replaceable as a named one and is snapshotted like any other key.
 */
function isSkipped(key: PropertyKey): boolean {
  if (typeof key === 'symbol') {
    return Symbol.keyFor(key)?.startsWith('$$jest') ?? false;
  }

  return UNRESTORABLE_GLOBALS.has(key) || (typeof key === 'string' && key.startsWith('__vitest'));
}

/** Read `host[key]` without trusting it: a getter that throws must not take the capture or the restore down with it. */
function readValue(host: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(host, key);
  } catch {
    return undefined;
  }
}

/**
 * Whether two descriptors agree on the three slots a spec can move by assignment or `defineProperty`.
 * `enumerable` and friends are deliberately not compared: a flag-only change has not moved what the
 * global answers, and chasing it would only give the non-configurable repair more to be wrong about.
 */
function sameMembers(current: PropertyDescriptor, baseline: PropertyDescriptor): boolean {
  return Object.is(current.value, baseline.value) && Object.is(current.get, baseline.get) && Object.is(current.set, baseline.set);
}

/**
 * Snapshot `host`'s own globals as this worker's baseline.
 *
 * Call once, as early as the setup file runs — the snapshot has to predate every spec. A second call
 * for the same host does nothing: the first snapshot is the worker's truth, and re-snapshotting after
 * a spec has already replaced a global would adopt the replacement as the baseline.
 *
 * Skipped at capture, and therefore never restored: the identity globals listed above, and every
 * string key the runner bookkeeps under a `__vitest` prefix — this library parks its own registries
 * there too, and state that must survive the file boundary is exactly what must not be rolled back.
 *
 * @param host Defaults to the real globals. Pass a stand-in to baseline a specific object instead.
 */
export function captureGlobalBaseline(host: object = globalThis): void {
  const baselines = registry();

  if (baselines.has(host)) {
    return;
  }

  const snapshot = new Map<PropertyKey, Baseline>();

  for (const key of Reflect.ownKeys(host)) {
    if (isSkipped(key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(host, key);

    if (descriptor) {
      const through = readValue(host, key);

      snapshot.set(key, { descriptor, through, stable: Object.is(through, readValue(host, key)) });
    }
  }

  baselines.set(host, snapshot);
}

/**
 * Put every global the file changed back to the baseline.
 *
 * Two legs per key, in order. First the descriptor: a live descriptor that has moved — replaced, or
 * deleted outright, which the re-definition itself repairs — is put back with `defineProperty`.
 * Then the value: when the descriptor never moved but it is an accessor, and the value behind the
 * getter has, the captured value is written back through the same setter. That second leg is the one
 * a DOM environment actually exercises; see the module docblock for the forwarding-accessor trap.
 *
 * Quiet by design. A global a spec made non-configurable cannot be repaired from outside and is left
 * as it is — the guard family reports those, and a restore that threw would take the worker down for
 * one already-doomed file. The library's own wrappers are stepped around first: `trackStrayTimers`
 * has `setTimeout` wrapped and `trackStrayListeners` has `addEventListener`, and those must survive
 * the boundary to do their job. The check reads the live value before anything else, which covers the
 * write-back leg too — a wrapper installed through a forwarding setter leaves the descriptor alone
 * exactly the way a DOM stub does, and would otherwise be reverted by the value going back.
 *
 * @param host Defaults to the real globals. Pass the stand-in you baselined.
 *
 * @returns The keys this call actually changed — descriptor restored, or captured value written back.
 *          `[]` when there is no baseline for `host`, or when nothing moved.
 */
export function restoreGlobals(host: object = globalThis): readonly PropertyKey[] {
  const snapshot = registry().get(host);

  if (!snapshot) {
    return [];
  }

  const changed: PropertyKey[] = [];

  for (const [key, baseline] of snapshot) {
    const live = readValue(host, key);

    if (isOwnedPatch(live)) {
      continue;
    }

    const current = Object.getOwnPropertyDescriptor(host, key);
    let touched = false;

    if (!current || !sameMembers(current, baseline.descriptor)) {
      try {
        Object.defineProperty(host, key, baseline.descriptor);
        touched = true;
      } catch {
        // Non-configurable: unrepairable from outside, and the guard family's to report.
        continue;
      }
    }

    if (typeof baseline.descriptor.get === 'function' && baseline.stable && !Object.is(live, baseline.through)) {
      try {
        // `Reflect.set` answers false for an accessor with no setter instead of throwing — a
        // read-only global is as untouchable as a non-configurable one, and just as quiet here.
        if (Reflect.set(host, key, baseline.through)) {
          touched = true;
        }
      } catch {
        // A setter that refuses the write. Left as it is.
      }
    }

    if (touched) {
      changed.push(key);
    }
  }

  return changed;
}
