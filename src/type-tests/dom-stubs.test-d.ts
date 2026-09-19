/**
 * Type-level tests for the `/dom-stubs` entry.
 *
 * Every installer here answers a handle a spec drives by hand, so the shape of the handle and of
 * the options is the feature. Two of the option objects differ in one letter — `stubIntersectionObserver`
 * takes a switch and `stubResizeObserver` takes a builder — and a silent widening (either options
 * type accepting the other's key, an entry builder taking `any`) would keep every runtime spec
 * green while the guidance under a spec's cursor stopped meaning anything.
 */
import { describe, expectTypeOf, it } from 'vitest';

import {
  type ObserverStub,
  intersectionEntry,
  mutationRecord,
  resizeEntry,
  stubAbortController,
  stubIntersectionObserver,
  stubMediaElement,
  stubMutationObserver,
  stubObserver,
  stubResizeObserver,
  stubWebStorage,
} from '../dom-stubs';

declare const host: Element;
declare const video: HTMLMediaElement;
declare const node: Node;

describe('stubObserver', () => {
  it('stands in for one of the three observer globals, at the entry type the caller claims', () => {
    const observers = stubObserver<IntersectionObserverEntry>('IntersectionObserver');

    expectTypeOf(observers).toEqualTypeOf<ObserverStub<IntersectionObserverEntry, unknown>>();
    expectTypeOf(observers.last.emit).toBeCallableWith([intersectionEntry(host, true)]);
    expectTypeOf(observers.last.targets).toEqualTypeOf<unknown[]>();
  });

  it('rejects a global it does not know, and an autoEmit that is not a builder', () => {
    // @ts-expect-error -- three observer globals exist; a fourth is a different stub
    stubObserver<IntersectionObserverEntry>('PerformanceObserver');
    // @ts-expect-error -- `autoEmit` builds the entry it delivers; it is not a switch here
    stubObserver<IntersectionObserverEntry>('IntersectionObserver', { autoEmit: 'always' });
  });
});

describe('stubIntersectionObserver', () => {
  it("answers the browser's own entry and target types", () => {
    expectTypeOf(stubIntersectionObserver()).toEqualTypeOf<ObserverStub<IntersectionObserverEntry, Element>>();
    expectTypeOf(stubIntersectionObserver({ autoEmit: true }).last.targets).toEqualTypeOf<Element[]>();
  });

  it('takes one switch, and only that', () => {
    // The ported-suite mode is a switch because the entry it builds is the helper's own.
    // @ts-expect-error -- `autoEmit` reports every target as visible; it is not a builder here
    stubIntersectionObserver({ autoEmit: 'yes' });
    // @ts-expect-error -- no such option
    stubIntersectionObserver({ rootMargin: '10px' });
  });
});

describe('stubResizeObserver and stubMutationObserver', () => {
  it('take a builder, not the IntersectionObserver switch', () => {
    stubResizeObserver({ autoEmit: (target) => resizeEntry(target) });
    stubMutationObserver({ autoEmit: (target) => mutationRecord(target) });

    expectTypeOf(stubResizeObserver().last.targets).toEqualTypeOf<Element[]>();
    expectTypeOf(stubMutationObserver().last.targets).toEqualTypeOf<Node[]>();

    // Both deliver the entry the callback is handed, so the builder cannot be a switch — the
    // opposite of `stubIntersectionObserver`, and the one-letter difference worth pinning.
    // @ts-expect-error -- the entry has to be built, not assumed visible
    stubResizeObserver({ autoEmit: true });
    // @ts-expect-error -- same for the mutation half
    stubMutationObserver({ autoEmit: true });
  });

  it('hand the builder the target the platform would', () => {
    // @ts-expect-error -- a resize target is an Element; a Node is the MutationObserver's word
    stubResizeObserver({ autoEmit: (target: Node) => resizeEntry(target) });
  });
});

describe('stubMediaElement', () => {
  it('seeds duration and the codec answer, and drives state through `set`', () => {
    const media = stubMediaElement({ duration: 30, canPlayType: () => 'probably' });

    expectTypeOf(media.state(video).duration).toEqualTypeOf<number>();
    expectTypeOf(media.state(video).error).toEqualTypeOf<MediaError | null>();
    expectTypeOf(media.set(video, { currentTime: 10, ended: true })).toBeVoid();
  });

  it('rejects the shapes the element would not answer with', () => {
    // @ts-expect-error -- duration is seconds
    stubMediaElement({ duration: 'thirty' });
    // @ts-expect-error -- the platform answers '', 'maybe' or 'probably' — nothing else
    stubMediaElement({ canPlayType: () => 'possibly' });
    // @ts-expect-error -- no such option
    stubMediaElement({ autoplay: true });
    // @ts-expect-error -- `set` moves to readable state, not to a player command
    stubMediaElement().set(video, { play: true });
  });
});

describe('stubWebStorage', () => {
  it('installs one of the two storages, seeded with strings', () => {
    const local = stubWebStorage('sessionStorage', { items: { token: 'abc' }, view: null });

    expectTypeOf(local.storage).toEqualTypeOf<Storage>();
    expectTypeOf(local.snapshot()).toEqualTypeOf<Record<string, string>>();
    expectTypeOf(stubWebStorage().storage).toEqualTypeOf<Storage>();
  });

  it('names the two storages there are, and seeds strings only', () => {
    // @ts-expect-error -- `localStore` is not a global the platform offers
    stubWebStorage('localStore');
    // @ts-expect-error -- storage holds strings; the platform would coerce, the types do not pretend
    stubWebStorage('localStorage', { items: { count: 3 } });
    // @ts-expect-error -- `view` is a window or nothing
    stubWebStorage('localStorage', { view: 'window' });
    // @ts-expect-error -- no such option
    stubWebStorage('localStorage', { quota: 5 });
  });
});

describe('stubAbortController', () => {
  it('replaces both halves and says so with void', () => {
    expectTypeOf(stubAbortController()).toBeVoid();
  });

  it('takes nothing', () => {
    // @ts-expect-error -- the realm is the whole configuration
    stubAbortController({ realm: 'jsdom' });
  });
});

describe('the entry builders', () => {
  it('intersectionEntry takes the element, the verdict and the fields a component reads', () => {
    expectTypeOf(intersectionEntry(host, true)).toEqualTypeOf<IntersectionObserverEntry>();
    expectTypeOf(intersectionEntry(host, false, { time: 5 })).toEqualTypeOf<IntersectionObserverEntry>();

    // @ts-expect-error -- the verdict is a boolean; the ratio is derived from it
    intersectionEntry(host, 'visible');
    // @ts-expect-error -- overrides are fields of the entry itself
    intersectionEntry(host, true, { element: host });
  });

  it('mutationRecord takes the nodes that moved, as nodes', () => {
    expectTypeOf(mutationRecord(host, { addedNodes: [node], attributeName: 'aria-hidden' })).toEqualTypeOf<MutationRecord>();
    expectTypeOf(mutationRecord(host, { type: 'childList', removedNodes: [node], oldValue: 'x' })).toEqualTypeOf<MutationRecord>();

    // @ts-expect-error -- the record carries nodes, not selectors
    mutationRecord(host, { addedNodes: ['span'] });
    // @ts-expect-error -- attributeName names an attribute
    mutationRecord(host, { attributeName: 7 });
  });

  it('resizeEntry takes the numbers a component reads, and only numbers', () => {
    expectTypeOf(resizeEntry(host, { width: 100, height: 50 })).toEqualTypeOf<ResizeObserverEntry>();
    expectTypeOf(resizeEntry(host)).toEqualTypeOf<ResizeObserverEntry>();

    // @ts-expect-error -- a size is a number
    resizeEntry(host, { width: 'wide' });
    // @ts-expect-error -- the three boxes are derived; there is no `depth` to set
    resizeEntry(host, { depth: 1 });
  });
});
