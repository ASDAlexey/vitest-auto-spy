/**
 * The three resource matchers have to do what a pair of hand-written expectations does not: read the
 * status and the value *together*, so that the assertion this family exists to stop — comparing a
 * still-loading resource's default value and passing — fails instead.
 */
import { signal } from '@angular/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerResourceMatchers } from './resource-matchers';

beforeAll(() => {
  registerResourceMatchers();
});

/** A resource double built from signals, in the shape the matchers duck-type on. */
function resourceOf(
  status: string,
  value: unknown,
  error?: Error,
): { status: () => string; value: () => unknown; error: () => Error | undefined } {
  const statusSignal = signal(status);

  return { status: (): string => statusSignal(), value: (): unknown => value, error: (): Error | undefined => error };
}

describe('toBeLoading', () => {
  it('passes while the resource is in flight, in either loading status', () => {
    expect(resourceOf('loading', undefined)).toBeLoading();
    expect(resourceOf('reloading', [1])).toBeLoading();
  });

  it('negates for a settled resource', () => {
    expect(resourceOf('resolved', [1])).not.toBeLoading();
  });

  it('names the actual status on failure', () => {
    expect(() => expect(resourceOf('resolved', [])).toBeLoading()).toThrow(/expected the resource to be loading, status was.+resolved/s);
    expect(() => expect(resourceOf('loading', [])).not.toBeLoading()).toThrow(/expected the resource not to be loading/);
  });
});

describe('toHaveResourceValue', () => {
  it('compares the value of a resolved resource, deeply', () => {
    expect(resourceOf('resolved', [{ id: 1 }])).toHaveResourceValue([{ id: 1 }]);
    expect(resourceOf('local', 'draft')).toHaveResourceValue('draft');
  });

  it('negates', () => {
    expect(resourceOf('resolved', [1])).not.toHaveResourceValue([2]);
  });

  it('refuses a resource that has not resolved, even when the default value matches', () => {
    // The whole point: this is the assertion that used to pass while proving nothing.
    expect(() => expect(resourceOf('loading', [])).toHaveResourceValue([])).toThrow(
      /expected the resource to have resolved before comparing its value, but status was.+loading/s,
    );
  });

  it('mentions the error when the resource failed instead of resolving', () => {
    expect(() => expect(resourceOf('error', [], new Error('offline'))).toHaveResourceValue([])).toThrow(/`offline`/);
  });

  it('reports expected and actual on a value mismatch', () => {
    expect(() => expect(resourceOf('resolved', [1])).toHaveResourceValue([2])).toThrow(/expected the resource to have value/);
    expect(() => expect(resourceOf('resolved', [1])).not.toHaveResourceValue([1])).toThrow(/expected the resource not to have value/);
  });
});

describe('toHaveResourceError', () => {
  it('passes on a failed resource, with no argument', () => {
    expect(resourceOf('error', undefined, new Error('offline'))).toHaveResourceError();
  });

  it('matches the message by substring or regexp', () => {
    expect(resourceOf('error', undefined, new Error('offline: 503'))).toHaveResourceError('503');
    expect(resourceOf('error', undefined, new Error('offline: 503'))).toHaveResourceError(/^offline/);
  });

  it('negates on a mismatching message', () => {
    expect(resourceOf('error', undefined, new Error('offline'))).not.toHaveResourceError('timeout');
  });

  it('fails when the resource did not fail at all', () => {
    expect(() => expect(resourceOf('resolved', [])).toHaveResourceError()).toThrow(
      /expected the resource to have failed, status was.+resolved/s,
    );
  });

  it('reports the negated no-argument case', () => {
    expect(() => expect(resourceOf('error', undefined, new Error('offline'))).not.toHaveResourceError()).toThrow(
      /expected the resource not to have failed, but it failed with `offline`/,
    );
  });

  it('treats a failed resource with no error() as an empty message', () => {
    const bare = { status: (): string => 'error', value: (): unknown => undefined };

    expect(bare).not.toHaveResourceError('offline');
    expect(() => expect(bare).toHaveResourceValue(1)).toThrow(/no error/);
  });

  it('reports a message mismatch with both sides', () => {
    expect(() => expect(resourceOf('error', undefined, new Error('offline'))).toHaveResourceError('timeout')).toThrow(
      /expected the resource error to match/,
    );
    expect(() => expect(resourceOf('error', undefined, new Error('offline'))).not.toHaveResourceError('offline')).toThrow(
      /expected the resource error not to match/,
    );
  });
});

describe('every matcher, given something that is not a resource', () => {
  it('says so rather than throwing a TypeError', () => {
    const message = /expected a resource \(an object with `status\(\)` and `value\(\)`\)/;

    expect(() => expect([1, 2]).toBeLoading()).toThrow(message);
    expect(() => expect(null).toHaveResourceValue(1)).toThrow(message);
    expect(() => expect({ status: 'resolved' }).toHaveResourceError()).toThrow(message);
  });
});
