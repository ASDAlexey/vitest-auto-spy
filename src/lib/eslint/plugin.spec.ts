/**
 * The plugin's own surface: every rule wired into the configs that recommend it, and the severity
 * map spelled out rather than derived.
 */
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';
import { rules } from './rules';

describe('the plugin', () => {
  it('ships every rule it recommends, wired to itself for flat config', () => {
    const recommended = Object.keys(plugin.configs.recommended.rules).map((id) => id.replace('vitest-auto-spy/', ''));

    expect(recommended.sort()).toEqual(Object.keys(rules).sort());
    expect(plugin.configs.recommended.plugins['vitest-auto-spy']).toBe(plugin);
    expect(plugin.rules).toBe(rules);
  });

  it('declares a fix or a suggestion exactly where it ships one', () => {
    const named = (predicate: (rule: (typeof rules)[string]) => boolean): string[] =>
      Object.entries(rules)
        .filter(([, rule]) => predicate(rule))
        .map(([name]) => name)
        .sort();

    // The README and AGENTS.md tables say the same thing in prose; this is what keeps them honest.
    expect(named((rule) => rule.meta.fixable !== undefined)).toEqual([
      'no-mocked-for-spy',
      'no-redundant-mock-reset',
      'prefer-as-spy',
      'prefer-native-spy-api',
      'prefer-provide-auto-spy',
      'prefer-spy-on-own-method',
    ]);
    // `no-mocked-for-spy`, `no-redundant-mock-reset`, `prefer-native-spy-api` and `prefer-spy-on-own-method` declare both: the
    // same edit is applied where the file settles it and offered where something outside the file —
    // or, for the reset, somewhere else inside it — has to agree.
    expect(named((rule) => rule.meta.hasSuggestions !== undefined)).toEqual([
      'no-compile-components',
      'no-expect-in-subscribe',
      'no-import-time-spread',
      'no-mock-cast',
      'no-mocked-for-spy',
      'no-object-define-property',
      'no-overridden-provider',
      'no-passthrough-console-spy',
      'no-redundant-mock-reset',
      'no-redundant-smoke-test',
      'no-reflect-member-access',
      'no-sync-testbed-await',
      'prefer-create-mock',
      'prefer-inject-spy',
      'prefer-native-spy-api',
      'prefer-render-shallow',
      'prefer-set-inputs',
      'prefer-settle-dynamic-import',
      'prefer-spy-on-own-method',
    ]);
  });

  it('ships every rule as an error bar the one that reports a cost rather than a defect', () => {
    const levels = Object.values(plugin.configs.recommended.rules);

    // Until 4.0.0 this config was a mix of `error` / `warn` / `off`, which chose for the consumer
    // how much each finding mattered — and a `warn` in a repository that does not read lint output
    // is `off` with noise. Which findings block a merge is one line of config in the consumer, so
    // the default is the strict end and the docs carry the dial. Three rules can report on correct
    // code: `jasmine-namespace-without-entry` decides on a setup file the spec never imports (its
    // `setupModules` option is the fix), `no-unregistered-inject-spy` takes no option and silences
    // itself wherever it cannot read a file's registrations in full, and `prefer-native-spy-api`
    // flags a bridge that is still needed. Documented overrides, not severities.
    //
    // Eight rules are graded, and the reason differs between them.
    //
    // `prefer-render-shallow` is graded on the *kind* of thing it says: the others name something
    // wrong or dead, while this one names a file that could render more cheaply. Moving onto
    // `renderShallow` is a choice a suite makes, and at `error` the plugin would gate it — 491
    // findings across 398 of one consumer's 1759 spec files, i.e. a `recommended` that exists to be
    // overridden.
    //
    // `prefer-spy-on-own-method` is graded on the same reading: the call it reports is correct and does
    // exactly what the helper does, so it names a shorter spelling rather than a defect.
    //
    // `no-stub-class-double` and `no-structural-double` are graded on the *evidence*. Both report a
    // real defect, the same drift `prefer-create-spy-from-class` reports, but both decide it on a
    // heuristic that has no `provide:` next to it to settle the question — a class whose fields are
    // `vi.fn()`s, an object whose declared type is an object of `Mock`s. Measured on the same 1759
    // files against the same plugin: `no-stub-class-double` reports 12 in 8 files and
    // `no-structural-double` 115 in 74, on a suite that is green under every `error` rule here.
    // A project that disagrees with either heuristic has to be able to say so without losing the
    // count-based rule, which is why they are rules of their own rather than arms of it — and a
    // hundred-odd new errors on the first upgrade is the wrong way to introduce a heuristic.
    //
    // `no-instance-lifecycle-spy` is graded on the evidence too: a spec that calls the hook itself
    // does reach the instance spy, and the syntax cannot tell that spec from one that relies on Angular.
    //
    // `prefer-create-mock` is graded on what its repair costs, the same reading as `prefer-set-inputs`
    // below and not the same as the two heuristics above: the evidence is exact — an object literal
    // and the type it claims are both written on the line — and the finding is a fixture the
    // compiler was never allowed to read. What is graded is the migration. Accepting the suggestion
    // makes the compiler read that literal, so every fixture that has drifted becomes a compile
    // error the same day; on a 2 032-file consumer the rule reports 1 200 times across 327 files,
    // which at `error` would be a first upgrade nobody can land in one branch. `off` would be the
    // wrong end of the same mistake, so the assertion pins `warn` rather than allowing "not error".
    //
    // `prefer-set-inputs` is graded on what its repair costs. The finding is a fact in the line —
    // `setInput` takes a name Angular checks against nothing — but `setInputs` awaits `stable()`,
    // whose `TestBed.tick()` re-enters the zone's own tick under zone.js: on the same 1771-file
    // consumer the rule reports 504 times in 140 files, and accepting every suggestion turns 57 of
    // 105 green files red on NG0101. That makes adoption a migration a project takes file by file.
    //
    // `no-unasserted-argument` is graded on what its repair needs, which is the one thing the rule
    // cannot supply: the arguments the call should have been made with. Every `error` here either
    // names an edit or names a helper; this one names a question for the author. Both of its
    // readings are evidence out of the file rather than a style preference, which is why it is in
    // `recommended` at all — 175 findings in 90 of one consumer's 2032 spec files, against the 1941
    // in 360 the blunt `vitest/prefer-called-with` reports on the same tree.
    //
    // `off` would be the wrong end of the same mistake in all of these cases, so the assertions pin
    // the values rather than allowing "not error".
    expect(new Set(levels)).toEqual(new Set(['error', 'warn']));
    expect(plugin.configs.recommended.rules['vitest-auto-spy/prefer-render-shallow']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/no-stub-class-double']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/no-structural-double']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/no-instance-lifecycle-spy']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/prefer-set-inputs']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/prefer-create-mock']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/no-unasserted-argument']).toBe('warn');
    expect(plugin.configs.recommended.rules['vitest-auto-spy/prefer-spy-on-own-method']).toBe('warn');
    expect(levels.filter((level) => level !== 'error')).toHaveLength(8);
    expect(levels).toHaveLength(Object.keys(rules).length);
  });

  it('ships the compile-error subset as a second config, so a downgrade recipe is a spread', () => {
    const { recommended, typeErrors } = plugin.configs;

    // The set is exactly the rules whose findings do not type-check — `prefer-as-spy` is `TS2352`
    // and `no-mocked-for-spy` is `TS2322`, by construction rather than by luck — so a suite taking
    // the rest as warnings while it fixes them in batches has no batch to plan for these: the build
    // is already red. Spelled out rather than derived from a `meta` flag, so a new rule has to be
    // considered here instead of joining the set by matching a predicate.
    expect(Object.keys(typeErrors.rules).sort()).toEqual(['vitest-auto-spy/no-mocked-for-spy', 'vitest-auto-spy/prefer-as-spy']);
    expect(new Set(Object.values(typeErrors.rules))).toEqual(new Set(['error']));

    // A strict subset of `recommended`: the config is spread over it, never instead of it, so a
    // name that is not in `recommended` would silently switch on a rule nothing else recommends.
    Object.keys(typeErrors.rules).forEach((id) => expect(recommended.rules[id]).toBe('error'));
    expect(Object.keys(typeErrors.rules).length).toBeLessThan(Object.keys(recommended.rules).length);

    expect(typeErrors.plugins['vitest-auto-spy']).toBe(plugin);
  });

  it('ships recommended with every rule at error as the strict config', () => {
    const { recommended, strict } = plugin.configs;

    expect(Object.keys(strict.rules)).toEqual(Object.keys(recommended.rules));
    expect(new Set(Object.values(strict.rules))).toEqual(new Set(['error']));
    expect(strict.plugins['vitest-auto-spy']).toBe(plugin);
  });

  it('documents every rule with a link to the recipe it recommends', () => {
    Object.values(rules).forEach((rule) => {
      expect(rule.meta.docs.url).toContain('#how-to-mock');
      expect(Object.values(rule.meta.messages).every((message) => message.includes(rule.meta.docs.url))).toBe(true);
    });
  });
});
