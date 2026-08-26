import { afterEach, describe, expect, it } from 'vitest';

// Registers the Vitest mock adapter, which the stubs use to build their `observe` / `disconnect` spies.
import '../index';
import { intersectionEntry, stubIntersectionObserver, stubMutationObserver, stubObserver, stubResizeObserver } from './observer-stubs';
import { restoreMockedProps } from './prop-mock';

/** Stands in for the code under test: constructs the observer itself and keeps it private. */
class RevealDirective {
  visible = false;

  private readonly observer = new IntersectionObserver((entries: IntersectionObserverEntry[]) => {
    this.visible = entries.some((entry) => entry.isIntersecting);
  });

  observe(target: Element): void {
    this.observer.observe(target);
  }

  destroy(): void {
    this.observer.disconnect();
  }
}

describe('stubObserver', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('hands the spec the observer the code under test constructed', () => {
    const observers = stubIntersectionObserver();
    const directive = new RevealDirective();
    const element = document.createElement('div');

    directive.observe(element);

    expect(observers.last.targets).toEqual([element]);
    expect(observers.last.observe).toHaveBeenCalledWith(element);
  });

  it('drives the callback the code under test passed in', () => {
    const observers = stubIntersectionObserver();
    const directive = new RevealDirective();
    const element = document.createElement('div');

    directive.observe(element);

    expect(directive.visible).toBe(false);

    observers.last.emit([intersectionEntry(element, true)]);

    expect(directive.visible).toBe(true);
  });

  it('delivers a batch in one call, the way a fast scroll does', () => {
    const observers = stubIntersectionObserver();
    const seen: number[] = [];

    new IntersectionObserver((entries) => seen.push(entries.length));

    const first = document.createElement('div');
    const second = document.createElement('div');

    observers.last.emit([intersectionEntry(first, false), intersectionEntry(second, true)]);

    expect(seen).toEqual([2]);
  });

  it('records every construction in order', () => {
    const observers = stubIntersectionObserver();

    new IntersectionObserver(() => undefined);
    new IntersectionObserver(() => undefined);

    expect(observers.instances).toHaveLength(2);
    expect(observers.last).toBe(observers.instances[1]);
  });

  it('tracks unobserve and disconnect', () => {
    const observers = stubIntersectionObserver();
    const directive = new RevealDirective();
    const element = document.createElement('div');

    directive.observe(element);
    directive.destroy();

    expect(observers.last.disconnected).toBe(true);
    expect(observers.last.targets).toEqual([]);
  });

  it('removes a single target on unobserve and leaves the rest', () => {
    const observers = stubIntersectionObserver();
    const kept = document.createElement('div');
    const dropped = document.createElement('span');

    const observer = new IntersectionObserver(() => undefined);

    observer.observe(kept);
    observer.observe(dropped);
    observer.unobserve(dropped);

    expect(observers.last.targets).toEqual([kept]);
  });

  it('ignores unobserve for a target that was never observed', () => {
    const observers = stubIntersectionObserver();
    const observed = document.createElement('div');

    const observer = new IntersectionObserver(() => undefined);

    observer.observe(observed);
    observer.unobserve(document.createElement('span'));

    expect(observers.last.targets).toEqual([observed]);
  });

  it('answers takeRecords with an empty batch', () => {
    stubIntersectionObserver();

    expect(new IntersectionObserver(() => undefined).takeRecords()).toEqual([]);
  });

  it('names the mistake when nothing was constructed', () => {
    const observers = stubIntersectionObserver();

    expect(() => observers.last).toThrow(/has not constructed a IntersectionObserver/);
  });

  it('puts the real constructor back through restoreMockedProps', () => {
    const real = globalThis.IntersectionObserver;

    stubIntersectionObserver();

    expect(globalThis.IntersectionObserver).not.toBe(real);

    restoreMockedProps();

    expect(globalThis.IntersectionObserver).toBe(real);
  });

  it('stands in for ResizeObserver', () => {
    const observers = stubResizeObserver();
    let width = 0;

    const observer = new ResizeObserver((entries) => {
      width = entries[0]?.contentRect.width ?? 0;
    });

    observer.observe(document.createElement('div'));
    observers.last.emit([{ contentRect: { width: 320 } } as ResizeObserverEntry]);

    expect(width).toBe(320);
  });

  it('stands in for MutationObserver', () => {
    const observers = stubMutationObserver();
    let mutations = 0;

    new MutationObserver((records) => {
      mutations += records.length;
    });
    observers.last.emit([{} as MutationRecord, {} as MutationRecord]);

    expect(mutations).toBe(2);
  });

  it('is reachable generically by name', () => {
    const observers = stubObserver<ResizeObserverEntry>('ResizeObserver');

    new ResizeObserver(() => undefined);

    expect(observers.instances).toHaveLength(1);
  });
});

describe('intersectionEntry', () => {
  it('derives the ratio from the visibility', () => {
    const element = document.createElement('div');

    expect(intersectionEntry(element, true).intersectionRatio).toBe(1);
    expect(intersectionEntry(element, false).intersectionRatio).toBe(0);
  });

  it('carries the target and accepts the fields a component reads', () => {
    const element = document.createElement('div');
    const rect = new DOMRect(0, 0, 200, 100);

    const entry = intersectionEntry(element, true, { boundingClientRect: rect, time: 42 });

    expect(entry.target).toBe(element);
    expect(entry.boundingClientRect).toBe(rect);
    expect(entry.time).toBe(42);
  });
});
