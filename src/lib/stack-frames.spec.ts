import { describe, expect, it } from 'vitest';

import { mockValueProp } from './prop-mock';
import { captureStack, isEnvironmentFrame, isLibraryFrame, ownFrames, stackFrames } from './stack-frames';

const LIBRARY = 'at captureOrigin2 (file:///app/node_modules/vitest-auto-spy/dist/setup.js:2382:17)';
const PREBUNDLED = 'at scheduleTracked (file:///app/node_modules/.vite/deps/vitest-auto-spy_setup.js:90:3)';
const ZONE = 'at ZoneDelegate.scheduleTask (file:///app/node_modules/zone.js/fesm2015/zone.js:420:5)';
const INTERNAL = 'at listOnTimeout (node:internal/timers:581:17)';
const HELPER = 'at __VITEST_HELPER__ (file:///app/node_modules/vitest/dist/chunks/index.DGdajAO2.js:7335:23)';
const SPEC = 'at AngleComponent.open (/app/src/angle/angle.component.ts:31:7)';

describe('stackFrames', () => {
  it('keeps the frame lines of a V8 stack and nothing else', () => {
    expect(stackFrames(`Error\n    ${LIBRARY}\n    ${SPEC}`)).toEqual([LIBRARY, SPEC]);
    expect(stackFrames(undefined)).toEqual([]);
  });
});

describe('ownFrames', () => {
  it('quotes the project frame behind the built library and its dependencies', () => {
    expect(ownFrames([LIBRARY, PREBUNDLED, ZONE, INTERNAL, SPEC], 1)).toEqual([SPEC]);
  });

  it("falls back to dependency frames, never the library's own, when no project frame is left", () => {
    expect(ownFrames([LIBRARY, PREBUNDLED, ZONE, INTERNAL], 5)).toEqual([ZONE, INTERNAL]);
  });

  it("skips Vitest's defineHelper wrapper the way it skips the library", () => {
    expect(ownFrames([LIBRARY, HELPER, ZONE, INTERNAL], 1)).toEqual([ZONE]);
  });

  it('hands back the library frames when they are all there is', () => {
    expect(ownFrames([LIBRARY, PREBUNDLED], 5)).toEqual([LIBRARY, PREBUNDLED]);
  });
});

describe('isEnvironmentFrame', () => {
  it('knows jsdom, happy-dom and the selector engine jsdom ships with, on either path separator', () => {
    expect(isEnvironmentFrame('at Window.requestAnimationFrame (/app/node_modules/jsdom/lib/jsdom/browser/Window.js:616:9)')).toBe(true);
    expect(isEnvironmentFrame('at C:\\app\\node_modules\\happy-dom\\lib\\window\\BrowserWindow.js:1:1')).toBe(true);
    expect(isEnvironmentFrame('at /app/node_modules/@asamuzakjp/dom-selector/src/js/finder.js:1:1')).toBe(true);
    expect(isEnvironmentFrame(SPEC)).toBe(false);
  });
});

describe('captureStack', () => {
  function capturedHere(): { stack?: string } {
    return captureStack(capturedHere, 40);
  }

  it('starts below the boundary and puts the stack limit back', () => {
    const limit = Error.stackTraceLimit;
    const frames = stackFrames(capturedHere().stack);

    expect(Error.stackTraceLimit).toBe(limit);
    expect(frames[0]).toMatch(/stack-frames\.spec\.ts:\d+:\d+/);
    expect(frames.some((frame) => frame.includes('capturedHere'))).toBe(false);
  });

  it('falls back to an Error where the runtime has no captureStackTrace, and hides its own frame', () => {
    const restore = mockValueProp(Error, 'captureStackTrace', undefined);

    try {
      const [first] = stackFrames(captureStack(capturedHere, 40).stack);

      expect(first).toMatch(/captureStack/);
      expect(isLibraryFrame(String(first))).toBe(true);
    } finally {
      restore();
    }
  });
});
