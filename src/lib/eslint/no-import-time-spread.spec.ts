/** A spread of an imported binding, evaluated while the module is still loading. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'no-import-time-spread';

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

/** Run the rule the way `eslint --fix` does, repeated passes and all. */
function autofix(code: string): string {
  return fixRule(RULE, code).output;
}

describe('no-import-time-spread', () => {
  /** The shape the failure takes: a value another module owns, spread while this one is loading. */
  const imported = "import { BaseEvents } from './base-events';\n";

  it('flags a module-scope spread of an imported binding', () => {
    const spread = `${imported}export const webosEvents = [...BaseEvents];`;

    expect(lint(spread)).toEqual(['vitest-auto-spy/no-import-time-spread']);
    expect(firstMessage(spread)).toContain('`BaseEvents`');
  });

  it('reads an object spread and an argument list too', () => {
    expect(lint(`${imported}export const config = { ...BaseEvents };`)).toHaveLength(1);
    expect(lint(`${imported}register(...BaseEvents);`)).toHaveLength(1);
    // A static field is evaluated with the class declaration, which is while the module loads.
    expect(lint(`${imported}class Events { static all = [...BaseEvents]; }`)).toHaveLength(1);
  });

  it('tells an object spread apart, because that one fails without an error', () => {
    const object = `${imported}export const config = { ...BaseEvents };`;
    const array = `${imported}export const webosEvents = [...BaseEvents];`;
    const argumentList = `${imported}register(...BaseEvents);`;

    // `{ ...undefined }` is `{}`, so a reader sent looking for `Spread syntax requires …` finds no
    // such error and takes the report for a false positive. Both halves are asserted: the symptom
    // this message must describe, and the one it must not.
    expect(firstMessage(object)).toContain('`{ ...undefined }` is `{}`');
    expect(firstMessage(object)).not.toContain('Spread syntax requires');
    expect(firstMessage(object)).toContain('`BaseEvents`');

    expect(firstMessage(array)).toContain('Spread syntax requires');
    expect(firstMessage(argumentList)).toContain('Spread syntax requires');
    // An array inside an object literal is still an array spread: the operand must be iterable.
    expect(firstMessage(`${imported}export const c = { all: [...BaseEvents] };`)).toContain('Spread syntax requires');
  });

  it('leaves what runs later, and what this file owns, alone', () => {
    expect(lint(`${imported}export const make = () => [...BaseEvents];`)).toEqual([]);
    expect(lint(`${imported}class Events { all = [...BaseEvents]; }`)).toEqual([]);
    // A local value is already evaluated by the time the line below it runs.
    expect(lint('const local = [1];\nexport const all = [...local];')).toEqual([]);
    // A name from nowhere resolvable is not knowably an import.
    expect(lint('export const all = [...whateverThisIs];')).toEqual([]);
    // The operand is a call, not the binding: whatever that throws is not this rule's business.
    expect(lint(`${imported}export const all = [...BaseEvents.slice()];`)).toEqual([]);
  });

  it('offers the lazy value, and nothing where there is no value to defer', () => {
    const spread = `${imported}export const webosEvents = [...BaseEvents];`;
    const deferred = applySuggestion(spread);

    expect(suggestionsFor(spread)).toEqual(['Build the value lazily: wrap the initialiser in an arrow, and call it where it is read']);
    expect(deferred).toBe(`${imported}export const webosEvents = () => ([...BaseEvents]);`);
    // Accepting it puts the spread inside a function body, so the rule falls silent — and every use
    // of the name is now a call the type checker will point at.
    expect(lint(deferred)).toEqual([]);
    // An argument list is not an initialiser: there is nothing local to defer.
    expect(suggestionsFor(`${imported}register(...BaseEvents);`)).toEqual([]);
  });

  it('never fixes on its own — the safe rewrite is not decidable from this file', () => {
    const spread = `${imported}export const webosEvents = [...BaseEvents];`;

    expect(autofix(spread)).toBe(spread);
  });
});
