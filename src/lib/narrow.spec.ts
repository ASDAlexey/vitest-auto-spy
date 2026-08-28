/**
 * The value of these helpers is the failure message, so that is what the specs assert on: a
 * narrowing that only threw `Assertion failed` would be no cheaper than the type assertion it
 * replaces.
 */
import { describe, expect, it } from 'vitest';

import { narrow } from './narrow';

interface OpenLink {
  type: 'open';
  params: { id: string };
}

interface CloseLink {
  type: 'close';
}

type Link = CloseLink | OpenLink;

/** Through a function, so control-flow analysis does not narrow the fixture before `narrow` sees it. */
function closedLink(): Link {
  return { type: 'close' };
}

describe('narrow', () => {
  it('narrows through a type guard', () => {
    const link: Link = { type: 'open', params: { id: '7' } };
    const open = narrow(link, (candidate): candidate is OpenLink => candidate.type === 'open');

    expect(open.params.id).toBe('7');
  });

  it('prints what the value actually was', () => {
    const link = closedLink();

    expect(() => narrow(link, (candidate): candidate is OpenLink => candidate.type === 'open', 'an open link')).toThrow(
      /expected an open link, but the value is Object \{ type \}/,
    );
  });

  it('falls back to the predicate source when no label is given', () => {
    expect(() => narrow(1, (candidate) => candidate > 2)).toThrow(/candidate > 2/);
  });
});

describe('narrow.byKey', () => {
  it('picks the branch that has the key', () => {
    const link: Link = { type: 'open', params: { id: '7' } };

    expect(narrow.byKey(link, 'params').params).toEqual({ id: '7' });
  });

  it('names the key and the shape when it is absent', () => {
    const link = closedLink();

    expect(() => narrow.byKey(link, 'params')).toThrow(/expected an object with a 'params' property, but the value is Object \{ type \}/);
  });

  it('describes a primitive and a nullish value too', () => {
    expect(() => narrow.byKey(null, 'params')).toThrow(/the value is null/);
    expect(() => narrow.byKey(42, 'params')).toThrow(/the value is number 42/);
  });

  it('lists at most twelve keys', () => {
    const wide = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`key${index}`, index]));

    expect(() => narrow.byKey(wide, 'params')).toThrow(/key11, …/);
  });
});

describe('narrow.observable', () => {
  it('keeps the element type, which rxjs isObservable drops', () => {
    const maybeAsync: boolean | { subscribe: () => void } = { subscribe: (): void => undefined };
    const source = narrow.observable(maybeAsync);

    expect(typeof source.subscribe).toBe('function');
  });

  it('says what it got instead', () => {
    expect(() => narrow.observable(true)).toThrow(/expected an Observable, but the value is boolean true/);
  });
});
