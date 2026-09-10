/**
 * `prefer-observer-stub`, checked from both ends.
 *
 * The flagged shapes are transcribed from a monorepo of 1 758 spec files, where 14 places replaced
 * one of the three observer globals by hand — a class with a `vi.fn()` in `disconnect`, a
 * `vi.fn(() => ({ observe() {} }))`, a `vi.stubGlobal`, a `vi.spyOn` on the constructor. The silent
 * ones are transcribed from the same search: every line that matched the shape and had to stay
 * silent is here, because that is the number a rule this narrow is judged on. Two of them are
 * application code (a polyfill being installed for real), and one is the `afterEach` that puts the
 * original back — the shape closest to a report, and the one that would double every finding.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'prefer-observer-stub';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: 'error' },
      },
    ],
    'component.spec.ts',
  );
}

/** How many reports a snippet draws — the only number most of these cases are about. */
function count(code: string): number {
  return verify(code).length;
}

/** The text of the first report, for the cases about what the message has to say. */
function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('prefer-observer-stub', () => {
  it('flags the twenty-line hand-rolled stub this rule exists for', () => {
    // Verbatim shape from the monorepo: save, class of empty methods with a spy in `disconnect`,
    // double cast, restore. One report, on the assignment.
    const code = `
      let originalIntersectionObserver: typeof IntersectionObserver;
      let disconnectSpy: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        disconnectSpy = vi.fn();
        originalIntersectionObserver = global.IntersectionObserver;
        global.IntersectionObserver = class {
          observe(): void {}
          unobserve(): void {}
          disconnect(): void {
            disconnectSpy();
          }
        } as unknown as typeof IntersectionObserver;
      });

      afterEach(() => {
        global.IntersectionObserver = originalIntersectionObserver;
      });
    `;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('stubIntersectionObserver');
  });

  it('names the helper and the entry builder that match the observer being replaced', () => {
    expect(message('globalThis.ResizeObserver = class {};')).toContain('stubResizeObserver');
    expect(message('globalThis.ResizeObserver = class {};')).toContain('resizeEntry');
    expect(message('globalThis.MutationObserver = class {};')).toContain('mutationRecord');
  });

  it('says the restore is not the author’s to write, which is the gap the rule exists to close', () => {
    const text = message('globalThis.IntersectionObserver = class {};');

    expect(text).toContain('restoreMockedProps()');
    expect(text).toContain('Do not write the restore.');
  });

  it('flags a runner mock written into the global, bare or configured', () => {
    expect(count('global.IntersectionObserver = jest.fn(() => ({ observe() {} }));')).toBe(1);
    expect(count('global.ResizeObserver = vi.fn().mockImplementation(() => ({ observe() {} }));')).toBe(1);
  });

  it('flags a plain function and a string key, which are the same assignment spelled differently', () => {
    expect(count('globalThis["IntersectionObserver"] = function () {};')).toBe(1);
    expect(count('window.MutationObserver = () => ({ observe() {} });')).toBe(1);
  });

  it('follows a name to the class or the const above the hook', () => {
    expect(count('class RecordingObserver { observe(): void {} }\nwindow.IntersectionObserver = RecordingObserver;')).toBe(1);
    expect(count('const mockObserver = class { observe(): void {} };\nglobal.MutationObserver = mockObserver as never;')).toBe(1);
    expect(count('function FakeObserver(): void {}\nglobal.ResizeObserver = FakeObserver as never;')).toBe(1);
  });

  it('reads through a cast on the receiver, which is how a spec silences the DOM lib type', () => {
    expect(count('(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {};')).toBe(1);
  });

  it('flags the two runner spellings of the same fake', () => {
    expect(count("class RecordingObserver {}\nvi.stubGlobal('IntersectionObserver', RecordingObserver);")).toBe(1);
    expect(count("vi.spyOn(globalThis, 'MutationObserver').mockImplementation((cb) => ({ observe() {} }));")).toBe(1);
    expect(message("vi.spyOn(globalThis, 'MutationObserver');")).toContain('cannot call it');
  });

  it('leaves the restore alone, so one hand-rolled stub is one report and not two', () => {
    // The `let` is written twice — the save and the restore — so the value it holds at the
    // assignment is not knowable, which is exactly the reading that keeps this line silent.
    expect(count('let original: unknown;\noriginal = globalThis.IntersectionObserver;\nglobalThis.IntersectionObserver = original;')).toBe(
      0,
    );
    expect(count('function restore(original: unknown): void {\n  globalThis.ResizeObserver = original;\n}')).toBe(0);
  });

  it('leaves a real implementation being installed alone — that is application code, not a double', () => {
    expect(count("import ResizeObserver from 'resize-observer-polyfill';\nwindow.ResizeObserver = ResizeObserver;")).toBe(0);
    expect(count('const Polyfill = 1;\nglobalThis.IntersectionObserver = Polyfill;')).toBe(0);
    expect(count('globalThis.IntersectionObserver = loadPolyfill();')).toBe(0);
    expect(count('globalThis.MutationObserver = Unresolved;')).toBe(0);
  });

  it('leaves any other global alone', () => {
    expect(count('globalThis.fetch = vi.fn();')).toBe(0);
    expect(count('globalThis.matchMedia = class {};')).toBe(0);
    expect(count("vi.stubGlobal('fetch', vi.fn());")).toBe(0);
    expect(count("vi.spyOn(globalThis, 'fetch');")).toBe(0);
  });

  it('leaves a receiver that is not the global object alone', () => {
    expect(count('const host: Record<string, unknown> = {};\nhost.IntersectionObserver = class {};')).toBe(0);
    expect(count('createWindow().ResizeObserver = class {};')).toBe(0);
    expect(count("vi.spyOn(fakeWindow, 'MutationObserver');")).toBe(0);
    expect(count('const observers = stubIntersectionObserver();')).toBe(0);
  });

  it('leaves a key it cannot read alone, and reads a global rather than writing to one', () => {
    expect(count('globalThis[key] = class {};')).toBe(0);
    expect(count('globalThis[0] = class {};')).toBe(0);
    expect(count('expect(globalThis.MutationObserver).toHaveBeenCalledTimes(1);')).toBe(0);
    expect(count('let IntersectionObserver = class {};')).toBe(0);
  });

  it('survives a call written with the arguments missing', () => {
    expect(count('vi.stubGlobal();')).toBe(0);
    expect(count("vi.stubGlobal('IntersectionObserver');")).toBe(0);
    expect(count('vi.stubGlobal(name, class {});')).toBe(0);
    expect(count('vi.spyOn();')).toBe(0);
    expect(count('vi.spyOn(globalThis);')).toBe(0);
  });
});
