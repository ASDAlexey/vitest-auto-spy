/**
 * `Object.defineProperty` in a spec, checked from both sides: the reports, and the descriptors a
 * suggestion cannot reproduce exactly — which get the report alone.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-object-define-property';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string): string {
  return verify(code)[0]?.message ?? '';
}

/** What the editor would offer for the first report. */
function suggestionsFor(code: string): string[] {
  return (verify(code)[0]?.suggestions ?? []).map((suggestion) => suggestion.desc);
}

/** The source as it would read after accepting the first report's first suggestion. */
function applySuggestion(code: string): string {
  const suggestion = verify(code)[0]?.suggestions?.[0];

  if (!suggestion) {
    return code;
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('no-object-define-property', () => {
  it('flags both defineProperty and defineProperties', () => {
    expect(lint("Object.defineProperty(service, 'ready', { value: true });")).toHaveLength(1);
    expect(lint('Object.defineProperties(service, descriptors);')).toHaveLength(1);
  });

  it('leaves other Object statics alone', () => {
    expect(lint('Object.assign(service, { ready: true });')).toEqual([]);
  });

  it('suggests mockValueProp for the one descriptor it reproduces exactly', () => {
    expect(suggestionsFor("Object.defineProperty(service, 'ready', { value: true });")).toEqual([
      "Record the undo: mockValueProp(service, 'ready', true)",
    ]);
    expect(applySuggestion("Object.defineProperty(service, 'ready', { value: true });")).toBe(
      "import { mockValueProp } from 'vitest-auto-spy';\nmockValueProp(service, 'ready', true);",
    );
  });

  it('uses the import the file already has', () => {
    const code = "import { mockValueProp } from 'vitest-auto-spy';\nObject.defineProperty(service, 'ready', { value: true });";

    expect(applySuggestion(code)).toBe("import { mockValueProp } from 'vitest-auto-spy';\nmockValueProp(service, 'ready', true);");
  });

  it('suggests the getter helper for a getter descriptor, configurable and all', () => {
    // The shape a spec reaches for when it needs a DOM measurement: `offsetHeight` is a getter.
    expect(suggestionsFor("Object.defineProperty(host, 'offsetHeight', { get: () => 1000, configurable: true });")).toEqual([
      "Record the undo: mockReadonlyPropGetter(host, 'offsetHeight', () => 1000)",
    ]);
    expect(applySuggestion("Object.defineProperty(host, 'offsetHeight', { get: () => 1000, configurable: true });")).toBe(
      "import { mockReadonlyPropGetter } from 'vitest-auto-spy';\nmockReadonlyPropGetter(host, 'offsetHeight', () => 1000);",
    );
  });

  it('reports without a suggestion for every descriptor it would have to reinterpret', () => {
    // An accessor pair is `mockAccessorsProp`, which takes an object rather than a value.
    expect(suggestionsFor("Object.defineProperty(service, 'ready', { get: () => true, set: (v) => v });")).toEqual([]);
    // `mockValueProp` writes its own `writable` and `configurable`; anything spelled out here would be lost.
    expect(suggestionsFor("Object.defineProperty(service, 'ready', { value: true, writable: false });")).toEqual([]);
    // A descriptor built somewhere else cannot be read here at all.
    expect(suggestionsFor("Object.defineProperty(service, 'ready', descriptor);")).toEqual([]);
    expect(suggestionsFor('Object.defineProperty(service);')).toEqual([]);
    // The name already means something else in this file.
    expect(suggestionsFor("const mockValueProp = 1;\nObject.defineProperty(service, 'ready', { value: true });")).toEqual([]);
    // `defineProperties` is one statement per entry, which is not an edit of this node.
    expect(suggestionsFor('Object.defineProperties(service, descriptors);')).toEqual([]);
  });
});

it('names the helper each descriptor asks for, including the ones it will not rewrite', () => {
  const message = firstMessage("Object.defineProperty(service, 'ready', { value: true });");

  expect(message).toContain('stubConstructor');
  expect(message).toContain('mockReadonlyPropGetter');
  expect(message).toContain('mockAccessorsProp');
  expect(message).toContain('instanceMethodsToSpyOn');
  // Third independent report of the same substitution: a signal replaced by a `vi.fn()` that
  // returns the value reads identically until something puts a `computed()` downstream of it.
  expect(message).toContain('signal(value)');
});

it('declines to suggest mockValueProp for a mock the code calls with new', () => {
  // Spelled with a `function` on purpose: an arrow cannot be constructed, and the resulting
  // "is not a constructor" is swallowed by the service's own try/catch three assertions earlier.
  const constructed = "Object.defineProperty(window, 'AudioContext', { value: vi.fn().mockImplementation(function () { return ctx; }) });";

  expect(suggestionsFor(constructed)).toEqual([]);
  // An arrow implementation is an ordinary value again.
  expect(suggestionsFor("Object.defineProperty(window, 'x', { value: vi.fn().mockImplementation(() => ctx) });")).toHaveLength(1);
});

it('says so when the patch is paired with a hand-written restore', () => {
  const manual = [
    "it('reads storage', () => {",
    "  Object.defineProperty(window, 'localStorage', { value: broken });",
    '  expect(read()).toBeUndefined();',
    "  Object.defineProperty(window, 'localStorage', { value: real });",
    '});',
  ].join('\n');

  expect(lint(manual)).toHaveLength(2);
  expect(firstMessage(manual)).toContain('the first red one skips it');
  // A patch in one test and a patch in another is not a restore pair.
  const separate = [
    "it('a', () => { Object.defineProperty(window, 'x', { value: 1 }); });",
    "it('b', () => { Object.defineProperty(window, 'x', { value: 2 }); });",
  ].join('\n');

  expect(firstMessage(separate)).toContain('leaves no way back');
  // Nor are two different properties of the same object.
  const twoKeys = "it('a', () => { Object.defineProperty(window, 'x', { value: 1 }); Object.defineProperty(window, 'y', { value: 2 }); });";

  expect(firstMessage(twoKeys)).toContain('leaves no way back');
  // A call with nothing to key on still reports.
  expect(lint('Object.defineProperty();')).toHaveLength(1);
});
