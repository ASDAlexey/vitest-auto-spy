import { afterEach, describe, expect, it } from 'vitest';

// Registers the Vitest mock adapter, which the stubs use to build their `observe` / `disconnect` spies.
import '../index';
import {
  intersectionEntry,
  mutationRecord,
  resizeEntry,
  stubIntersectionObserver,
  stubMutationObserver,
  stubObserver,
  stubResizeObserver,
} from './observer-stubs';
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

describe('stubObserver options', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('records the init object the code under test passed', () => {
    const observers = stubIntersectionObserver();

    new IntersectionObserver(() => undefined, { rootMargin: '-20% 0px -70% 0px' });

    expect(observers.last.options).toEqual({ rootMargin: '-20% 0px -70% 0px' });
  });

  it('leaves `options` undefined when the constructor was given none', () => {
    const observers = stubResizeObserver();

    new ResizeObserver(() => undefined);

    expect(observers.last.options).toBeUndefined();
  });

  it('reports every observed target as visible under autoEmit', () => {
    stubIntersectionObserver({ autoEmit: true });

    const directive = new RevealDirective();

    directive.observe(document.createElement('div'));

    // The Jest-era behaviour a ported suite depends on: visible by the time `observe()` returns.
    expect(directive.visible).toBe(true);
  });

  it('builds the auto-emitted entry itself for the generic installer', () => {
    const seen: number[] = [];

    stubObserver<ResizeObserverEntry, Element>('ResizeObserver', {
      autoEmit: (target: Element): ResizeObserverEntry => resizeEntry(target, { width: 320 }),
    });

    new ResizeObserver((entries) => seen.push(entries[0]?.contentRect.width ?? 0)).observe(document.createElement('div'));

    expect(seen).toEqual([320]);
  });
});

describe('mutationRecord', () => {
  it('gives addedNodes a real NodeList without moving the nodes', () => {
    const host = document.createElement('div');
    const span = document.createElement('span');

    document.body.append(host);
    host.append(span);

    const record = mutationRecord(host, { addedNodes: [span] });

    expect(record.addedNodes.length).toBe(1);
    expect(record.addedNodes.item(0)).toBe(span);
    expect(record.addedNodes[0]).toBe(span);
    expect([...record.addedNodes]).toEqual([span]);
    expect([...record.addedNodes.values()]).toEqual([span]);
    expect([...record.addedNodes.keys()]).toEqual([0]);
    expect([...record.addedNodes.entries()]).toEqual([[0, span]]);
    // The fragment-based shortcut would have torn `span` out of the fixture here.
    expect(span.parentElement).toBe(host);

    host.remove();
  });

  it('iterates with forEach, including the parent argument', () => {
    const host = document.createElement('div');
    const span = document.createElement('span');
    const record = mutationRecord(host, { addedNodes: [span] });
    const seen: [Node, number, NodeList][] = [];

    record.addedNodes.forEach((node, index, parent) => seen.push([node, index, parent]));

    expect(seen).toEqual([[span, 0, record.addedNodes]]);
    expect(record.addedNodes.item(5)).toBeNull();
  });

  it('defaults to a childList mutation, and to attributes when a name is given', () => {
    const host = document.createElement('div');

    expect(mutationRecord(host).type).toBe('childList');
    expect(mutationRecord(host, { attributeName: 'class' })).toMatchObject({ type: 'attributes', attributeName: 'class' });
    expect(mutationRecord(host, { type: 'characterData', oldValue: 'a' })).toMatchObject({ type: 'characterData', oldValue: 'a' });
  });

  it('drives a stubbed MutationObserver end to end', () => {
    const observers = stubMutationObserver();
    const host = document.createElement('div');
    const span = document.createElement('span');
    let added = 0;

    new MutationObserver((records) => {
      added += records[0]?.addedNodes.length ?? 0;
    });
    observers.last.emit([mutationRecord(host, { addedNodes: [span], removedNodes: [] })]);

    expect(added).toBe(1);
    restoreMockedProps();
  });
});

describe('resizeEntry', () => {
  it('derives every box from the same numbers', () => {
    const element = document.createElement('div');
    const entry = resizeEntry(element, { width: 320, height: 200, x: 10, y: 5 });

    expect(entry.target).toBe(element);
    expect(entry.contentRect).toMatchObject({ width: 320, height: 200, left: 10, top: 5, right: 330, bottom: 205 });
    expect(entry.contentRect.toJSON()).toEqual({ x: 10, y: 5, width: 320, height: 200 });
    expect(entry.borderBoxSize[0]).toEqual({ blockSize: 200, inlineSize: 320 });
    expect(entry.devicePixelContentBoxSize).toBe(entry.contentBoxSize);
  });

  it('defaults to a zero box', () => {
    expect(resizeEntry(document.createElement('div')).contentRect).toMatchObject({ width: 0, height: 0, x: 0, y: 0 });
  });
});
