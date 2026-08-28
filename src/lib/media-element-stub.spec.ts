/**
 * Each case is one of jsdom's media gaps: `play()` that throws instead of resolving, a `duration`
 * that is `NaN` and has no setter, a blanket `canPlayType() === ''`, and the events a component
 * listens for that a plain field assignment never fires.
 */
import { afterEach, describe, expect, it } from 'vitest';

// Registers the Vitest mock adapter, which the stubbed `play` / `pause` / `load` spies are built on.
import '../index';
import { createMock } from './create-mock';
import { stubMediaElement } from './media-element-stub';
import { mockValueProp, restoreMockedProps } from './prop-mock';

function video(): HTMLMediaElement {
  return document.createElement('video');
}

describe('stubMediaElement', () => {
  afterEach(restoreMockedProps);

  it('gives play() a promise to chain on, and reports the element as playing', async () => {
    const media = stubMediaElement();
    const element = video();

    await expect(element.play()).resolves.toBeUndefined();

    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.state(element).paused).toBe(false);
  });

  it('fires play and playing, so a component may wait for either', async () => {
    stubMediaElement();
    const element = video();
    const seen: string[] = [];

    element.addEventListener('play', () => seen.push('play'));
    element.addEventListener('playing', () => seen.push('playing'));

    await element.play();

    expect(seen).toEqual(['play', 'playing']);
  });

  it('pauses back', async () => {
    const media = stubMediaElement();
    const element = video();
    let paused = false;

    element.addEventListener('pause', () => {
      paused = true;
    });

    await element.play();
    element.pause();

    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(media.state(element).paused).toBe(true);
    expect(paused).toBe(true);
  });

  it('resets the element on load() and announces it', () => {
    const media = stubMediaElement();
    const element = video();
    let restarted = false;

    element.addEventListener('loadstart', () => {
      restarted = true;
    });

    media.set(element, { currentTime: 42, ended: true });
    element.load();

    expect(media.state(element)).toMatchObject({ currentTime: 0, ended: false, error: null });
    expect(media.load).toHaveBeenCalledTimes(1);
    expect(restarted).toBe(true);
  });

  it('answers canPlayType, and lets a spec make one codec unsupported', () => {
    stubMediaElement({ canPlayType: (type) => (type.includes('vp9') ? '' : 'probably') });
    const element = video();

    expect(element.canPlayType('video/mp4')).toBe('probably');
    expect(element.canPlayType('video/webm; codecs="vp9"')).toBe('');
  });

  it('answers "probably" by default, where jsdom answers nothing at all', () => {
    stubMediaElement();

    expect(video().canPlayType('video/mp4')).toBe('probably');
  });

  it('keeps the state of two elements apart', () => {
    const media = stubMediaElement({ duration: 120 });
    const advert = video();
    const content = video();

    media.set(advert, { duration: 15 });

    expect(advert.duration).toBe(15);
    expect(content.duration).toBe(120);
  });

  it('fires the event that goes with each changed field, and none for a cleared one', () => {
    const media = stubMediaElement();
    const element = video();
    const seen: string[] = [];

    ['durationchange', 'loadedmetadata', 'timeupdate', 'ended', 'error'].forEach((name) =>
      element.addEventListener(name, () => seen.push(name)),
    );

    media.set(element, { duration: 60, readyState: 1, currentTime: 30, ended: true, error: createMock<MediaError>({ code: 4 }) });

    expect(seen).toEqual(['durationchange', 'loadedmetadata', 'timeupdate', 'ended', 'error']);

    seen.length = 0;
    media.set(element, { readyState: 0, ended: false, error: null });

    expect(seen).toEqual([]);
  });

  it('exposes every field the code under test reads off the element', () => {
    const media = stubMediaElement();
    const element = video();
    const error = createMock<MediaError>({ code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' });

    media.set(element, { duration: 5, currentTime: 2, readyState: 4, ended: true, error });

    expect(element.duration).toBe(5);
    expect(element.currentTime).toBe(2);
    expect(element.readyState).toBe(4);
    expect(element.ended).toBe(true);
    expect(element.paused).toBe(true);
    expect(element.error).toBe(error);
  });

  it('puts the real prototype back, so the next file gets jsdom as it was', () => {
    const patched = stubMediaElement();

    expect(HTMLMediaElement.prototype.play).toBe(patched.play);

    restoreMockedProps();

    expect(HTMLMediaElement.prototype.play).not.toBe(patched.play);
    expect(Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration')?.get).toBeTypeOf('function');
  });

  it('says so when the environment has no DOM', () => {
    // The Bun / node:test case: the stub patches the prototype the DOM provides, and there is none.
    const name: PropertyKey = 'HTMLMediaElement';
    mockValueProp(globalThis, name, undefined);

    expect(() => stubMediaElement()).toThrow(/this environment has no HTMLMediaElement/);
  });
});
