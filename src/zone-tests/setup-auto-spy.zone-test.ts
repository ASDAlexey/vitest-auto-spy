/**
 * `setupAutoSpy()` under zone.js: the net runs from `aroundEach`, which wraps every hook and the test
 * body, and must not take the body out of the proxy zone `fakeAsync` needs.
 */
import { fakeAsync, tick } from '@angular/core/testing';

import { mockValueProp } from '../lib/prop-mock';
import { setupAutoSpy } from '../lib/setup-auto-spy';

setupAutoSpy({ duplicateCopies: 'off', preset: 'strict' });

const target = { value: 'real' };

describe('setupAutoSpy with fakeAsync', () => {
  let prepared = false;

  beforeEach(fakeAsync(() => {
    setTimeout(() => {
      prepared = true;
    }, 1);
    tick(1);
  }));

  it('keeps fakeAsync working in the body and in a hook', fakeAsync(() => {
    let fired = false;

    setTimeout(() => {
      fired = true;
    }, 1000);
    tick(1000);

    expect(prepared).toBe(true);
    expect(fired).toBe(true);
    mockValueProp(target, 'value', 'patched');
  }));

  it('restored the patch the fakeAsync test made', () => {
    expect(target.value).toBe('real');
  });
});
