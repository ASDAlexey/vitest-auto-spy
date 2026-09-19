/**
 * `adoptMock` refuses Node's `mock.fn()`: it cannot report its implementation, and `mock.restoreAll()`
 * would put that implementation back over the configuration without a word.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { adoptMock } from '../node';

describe('adoptMock on node:test', () => {
  it('refuses mock.fn() and names the factory to use instead', () => {
    const load = mock.fn((id: number) => `real ${id}`);

    assert.throws(() => adoptMock(load), /needs a mock that can report its implementation[\s\S]*createFunctionSpy\(\)/);
    assert.equal(load(1), 'real 1');
  });
});
