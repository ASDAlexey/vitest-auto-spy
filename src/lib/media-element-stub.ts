/**
 * A `<video>` / `<audio>` that behaves enough like one to test against.
 *
 * jsdom implements the media elements as a shell: `play()` throws "Not implemented", `duration` is
 * `NaN` with no setter, `canPlayType()` answers `''` for every type, `readyState` never leaves 0,
 * `error` is not on the prototype at all, and `load()` does nothing. Nothing there can be assigned
 * to either, because each one is an accessor on the prototype — so every player, advertising or
 * subtitle suite arrives at the same forty lines of `Object.defineProperty` against
 * `HTMLMediaElement.prototype`, and each copy leaks the patch into the next file.
 *
 * The two details that make the hand-written version subtly wrong are worth naming:
 *
 *  1. **The state has to be per element.** A patch that closes over one `duration` variable reports
 *     the same duration for the ad and for the content, which is precisely the pair a player spec
 *     exists to tell apart. Here every element gets its own record, keyed weakly.
 *  2. **Changing a property is not the same as reporting it.** Production code listens for
 *     `durationchange` / `timeupdate` / `ended`; assigning the field alone leaves those handlers
 *     unrun, and the component stays on its initial state while the assertion reads the element and
 *     sees the new value. {@link MediaElementStub.set} dispatches the event the browser would.
 *
 * The patch is installed through {@link mockValueProp} / {@link mockReadonlyPropGetter}, so
 * `restoreMockedProps()` — which `setupAutoSpy()` runs after every test — puts the real prototype
 * back.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { type MockFn, getMockAdapter } from './mock-adapter';
import { mockReadonlyPropGetter, mockValueProp } from './prop-mock';

/** The readable state of one stubbed media element. */
export interface MediaElementState {
  /** Seconds. Starts at the stub's `duration` option (`0` by default), not at the platform's `NaN`. */
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  /** `HAVE_NOTHING` (0) … `HAVE_ENOUGH_DATA` (4), as the platform numbers them. */
  readyState: number;
  error: MediaError | null;
}

/** What {@link stubMediaElement} installs beyond the defaults. */
export interface MediaElementStubOptions {
  /** Duration every element reports until a spec sets its own. Default `0`. */
  duration?: number;
  /** Answer for `canPlayType(type)`. Default `() => 'probably'`, the opposite of jsdom's blanket `''`. */
  canPlayType?: (type: string) => CanPlayTypeResult;
}

/** The handle a spec drives the stubbed elements through. */
export interface MediaElementStub {
  /** The `play()` spy — shared by every media element, so `mock.instances[0]` identifies which one played. */
  readonly play: MockFn;
  /** The `pause()` spy. */
  readonly pause: MockFn;
  /** The `load()` spy. */
  readonly load: MockFn;
  /** The `canPlayType()` spy — reconfigure it per test to make one codec unsupported. */
  readonly canPlayType: MockFn;
  /** The current state of one element, as the code under test reads it. */
  state(element: HTMLMediaElement): MediaElementState;
  /**
   * Move an element to a new state and fire the events the browser fires with it.
   *
   * `duration` → `durationchange`, `currentTime` → `timeupdate`, `ended: true` → `ended`,
   * `error` → `error`, `readyState` ≥ 1 → `loadedmetadata`. Several fields in one call produce
   * several events, in that order.
   */
  set(element: HTMLMediaElement, state: Partial<MediaElementState>): void;
}

const DEFAULT_STATE: Omit<MediaElementState, 'duration'> = {
  currentTime: 0,
  paused: true,
  ended: false,
  readyState: 0,
  error: null,
};

/**
 * Per-element state, weakly keyed so a fixture torn down mid-run is still collectable — and owned by
 * the install rather than by the module.
 *
 * Module scope made the record outlive the stub that created it: an element held in module scope by
 * a spec, or left in `<body>` under `isolate: false`, kept the `duration` and `currentTime` of the
 * test that first read it, and a later `stubMediaElement({ duration: 30 })` had no effect on it. The
 * accessors reach the record through the `read` closure, so nothing needs it to be shared.
 */
function createStates(duration: number): (element: HTMLMediaElement) => MediaElementState {
  const states = new WeakMap<HTMLMediaElement, MediaElementState>();

  return (element: HTMLMediaElement): MediaElementState => {
    const existing = states.get(element);

    if (existing) {
      return existing;
    }

    const created: MediaElementState = { ...DEFAULT_STATE, duration };
    states.set(element, created);

    return created;
  };
}

/**
 * Which events one state change announces, in the order the platform emits them.
 *
 * Only a field the caller actually passed announces itself, and `ended: false` / `error: null`
 * announce nothing: those are how a state is *cleared*, and the platform has no event for that.
 */
const ANNOUNCEMENTS: readonly ((next: Partial<MediaElementState>) => string | undefined)[] = [
  (next): string | undefined => (next.duration === undefined ? undefined : 'durationchange'),
  (next): string | undefined => (next.readyState !== undefined && next.readyState >= 1 ? 'loadedmetadata' : undefined),
  (next): string | undefined => (next.currentTime === undefined ? undefined : 'timeupdate'),
  // The platform pauses an unlooped element when it reaches its end, and the `pause` event arrives
  // before `ended`. `applyState` fills the flag in, so a component listening for `pause` hears it.
  (next): string | undefined => (next.ended === true && next.paused === true ? 'pause' : undefined),
  (next): string | undefined => (next.ended ? 'ended' : undefined),
  (next): string | undefined => (next.error ? 'error' : undefined),
];

function missingMediaElement(): Error {
  return new Error(
    withDocs(
      '[vitest-auto-spy] stubMediaElement(): this environment has no HTMLMediaElement. The stub patches the ' +
        'prototype the DOM provides, so it needs a DOM — run the spec under `environment: "jsdom"` / `"happy-dom"`, ' +
        'or install one from the preload (`vitest-auto-spy/bun-angular` does).',
      DOCS_LINKS.mediaElement,
    ),
  );
}

/**
 * Make every `<video>` and `<audio>` in the test answer like a real one.
 *
 * ```ts
 * const media = stubMediaElement({ duration: 120 });
 *
 * const fixture = TestBed.createComponent(PlayerComponent);
 * fixture.detectChanges();
 *
 * const video = fixture.nativeElement.querySelector('video');
 *
 * media.set(video, { readyState: 1 });          // fires `loadedmetadata`
 * media.set(video, { currentTime: 119 });       // fires `timeupdate`
 * media.set(video, { ended: true });            // fires `ended`
 *
 * expect(media.play).toHaveBeenCalledTimes(1);
 * expect(component.finished()).toBe(true);
 * ```
 *
 * The patch is on the prototype, so it also covers the element production code creates itself with
 * `document.createElement('video')` — which is the case a per-instance stub cannot reach.
 */
export function stubMediaElement(options: MediaElementStubOptions = {}): MediaElementStub {
  if (typeof HTMLMediaElement === 'undefined') {
    throw missingMediaElement();
  }

  const duration = options.duration ?? 0;
  const prototype = HTMLMediaElement.prototype;
  const adapter = getMockAdapter();
  const read = createStates(duration);

  const play = adapter.createMockFn(function (this: HTMLMediaElement): Promise<void> {
    const state = read(this);

    state.paused = false;
    state.ended = false;
    // `play` and `playing` both, because a component may wait for either — and the platform emits
    // both once playback is actually running, which under a stub is immediately.
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));

    // A resolved promise, not `undefined`: production code routinely does `.catch()` on the result
    // to swallow an autoplay rejection, and jsdom's `undefined` makes that line throw instead.
    return Promise.resolve();
  }, 'play');

  const pause = adapter.createMockFn(function (this: HTMLMediaElement): void {
    read(this).paused = true;
    this.dispatchEvent(new Event('pause'));
  }, 'pause');

  const load = adapter.createMockFn(function (this: HTMLMediaElement): void {
    const state = read(this);

    state.currentTime = 0;
    state.ended = false;
    state.error = null;
    this.dispatchEvent(new Event('loadstart'));
  }, 'load');

  const canPlayType = adapter.createMockFn(
    (type: string) => (options.canPlayType ?? ((): CanPlayTypeResult => 'probably'))(type),
    'canPlayType',
  );

  mockValueProp(prototype, 'play', play);
  mockValueProp(prototype, 'pause', pause);
  mockValueProp(prototype, 'load', load);
  mockValueProp(prototype, 'canPlayType', canPlayType);

  // Accessors rather than values: the code under test reads `video.duration`, and a data property
  // would be shared by every element on the prototype.
  installStateAccessors(prototype, read);

  return {
    play,
    pause,
    load,
    canPlayType,
    state: read,
    set: (element: HTMLMediaElement, next: Partial<MediaElementState>): void => applyState(read(element), element, next),
  };
}

/** Expose every field of the per-element record as the property the platform names. */
function installStateAccessors(prototype: HTMLMediaElement, read: (element: HTMLMediaElement) => MediaElementState): void {
  const fields: (keyof MediaElementState)[] = ['duration', 'currentTime', 'paused', 'ended', 'readyState', 'error'];

  fields.forEach((field) => {
    mockReadonlyPropGetter(prototype, field, function (this: HTMLMediaElement): unknown {
      return read(this)[field];
    });
  });

  // The platform's `currentTime` is get,set, and a seek (`video.currentTime = 0` to restart) has to
  // reach the record and fire `timeupdate`. Adding `set` over the getter above is enough: a
  // partial descriptor inherits the missing half, and the restore journal puts the platform's own
  // pair back untouched.
  Object.defineProperty(prototype, 'currentTime', {
    set(this: HTMLMediaElement, next: number): void {
      applyState(read(this), this, { currentTime: next });
    },
    configurable: true,
  });
}

function applyState(state: MediaElementState, element: HTMLMediaElement, next: Partial<MediaElementState>): void {
  // `ended: true` on its own means the element ran to its end, which pauses it: a component reading
  // `paused` after the `ended` event used to see `false`, a state the platform never produces.
  const changes = next.ended === true && next.paused === undefined ? { ...next, paused: true } : next;

  Object.assign(state, changes);

  ANNOUNCEMENTS.forEach((announce) => {
    const event = announce(changes);

    if (event !== undefined) {
      element.dispatchEvent(new Event(event));
    }
  });
}
