import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { createWindowSpies } from '../angular-doubles';
import { createWindowDouble, provideWindowDouble } from './platform-doubles';

describe('createWindowSpies', () => {
  it('seeds nested void methods, preserves spy identity and leaves the real window untouched', () => {
    const realReload = window.location.reload;
    const realPostMessage = window.parent.postMessage;
    const spies = createWindowSpies({ location: ['reload'], parent: ['postMessage'] });
    const win = createWindowDouble({ ...spies, location: { ...spies.location, hostname: 'tv.kion.ru' } });

    expect(win.location.reload()).toBeUndefined();
    expect(win.parent.postMessage({ type: 'close' }, '*')).toBeUndefined();
    expect(win.location.reload).toBe(spies.location.reload);
    expect(win.parent.postMessage).toBe(spies.parent.postMessage);
    expect(spies.location.reload).toHaveBeenCalledExactlyOnceWith();
    expect(spies.parent.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'close' }, '*');
    expect(spies.location.reload.getMockName()).toBe('window.location.reload');
    expect(win.location.hostname).toBe('tv.kion.ru');
    expect(win.location.origin).toBe(window.location.origin);
    expect(window.location.reload).toBe(realReload);
    expect(window.parent.postMessage).toBe(realPostMessage);
  });

  it('works as provider overrides and creates fresh spies on each call', () => {
    const WINDOW = new InjectionToken<Window>('window');
    const spies = createWindowSpies(['close', 'focus']);
    const other = createWindowSpies(['close']);
    TestBed.configureTestingModule({ providers: [provideWindowDouble(WINDOW, spies)] });
    const win = TestBed.inject(WINDOW);

    spies.close.mockImplementation(() => {
      win.focus();
    });
    win.close();
    expect(spies.close).toHaveBeenCalledOnce();
    expect(spies.focus).toHaveBeenCalledOnce();
    expect(other.close).not.toHaveBeenCalled();
    expect(createWindowSpies([])).toEqual({});
    expect(createWindowSpies({})).toEqual({});
  });
});
