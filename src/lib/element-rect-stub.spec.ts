import { afterEach, describe, expect, it } from 'vitest';

import '../index';
import { stubElementRect } from './element-rect-stub';
import { restoreMockedProps } from './prop-mock';

describe('stubElementRect', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('reports the box it was given, with the edges derived from it', () => {
    const element = document.createElement('div');

    stubElementRect(element, { x: 10, y: 20, width: 800, height: 600 });

    const rect = element.getBoundingClientRect();

    expect(rect).toBeInstanceOf(DOMRect);
    expect(rect.toJSON()).toEqual({ x: 10, y: 20, width: 800, height: 600, top: 20, left: 10, right: 810, bottom: 620 });
  });

  it('fills what was left out with zero, and hands out a fresh rect on every call', () => {
    const element = document.createElement('div');

    stubElementRect(element, { height: 40 });

    const first = element.getBoundingClientRect();

    expect(first.toJSON()).toEqual({ x: 0, y: 0, width: 0, height: 40, top: 0, left: 0, right: 0, bottom: 40 });
    expect(element.getBoundingClientRect()).not.toBe(first);

    stubElementRect(element);

    expect(element.getBoundingClientRect().height).toBe(0);
  });

  it('touches only the element it was given, and puts its own method back', () => {
    const element = document.createElement('div');
    const other = document.createElement('div');
    const restore = stubElementRect(element, { width: 100 });

    expect(other.getBoundingClientRect().width).toBe(0);

    restore();

    expect(Object.hasOwn(element, 'getBoundingClientRect')).toBe(false);
    expect(element.getBoundingClientRect().width).toBe(0);
  });

  it('hands out the installed spy alongside the restore, for a measurement a test must assert happened', () => {
    const element = document.createElement('div');
    const stub = stubElementRect(element, { width: 100 });

    element.getBoundingClientRect();

    expect(stub.getBoundingClientRect).toHaveBeenCalledOnce();
  });
});
