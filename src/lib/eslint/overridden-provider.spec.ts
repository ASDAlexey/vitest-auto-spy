/**
 * `no-overridden-provider`: a registration a later one for the same token replaces — in a
 * `providers` array or under `TestBed.overrideProvider`.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-overridden-provider';

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

/** The lines reported for a snippet — for asserting that every violator of a list is named, not just one. */
function lines(code: string): number[] {
  return verify(code).map((message) => message.line);
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

describe('no-overridden-provider', () => {
  it('flags the provider a later one for the same token replaces', () => {
    // Eight tokens in one spec file were registered both ways at once, and every `provideAutoSpy`
    // among them was dead code.
    const both = 'providers: [provideAutoSpy(DisplaySettingsService), { provide: DisplaySettingsService, useValue: mockDisplaySettings }]';

    expect(lint(both)).toEqual(['vitest-auto-spy/no-overridden-provider']);
    expect(firstMessage(both)).toContain('`DisplaySettingsService`');
  });

  it('flags whatever the two spellings are, in either order', () => {
    expect(lint('const p = [{ provide: A, useValue: x }, provideAutoSpy(A)];')).toHaveLength(1);
    expect(lint('const p = [provideAutoSpy(A), provideAutoSpy(A)];')).toHaveLength(1);
    expect(lint('const p = [provideAutoSpyForToken(TOKEN), { provide: TOKEN, useValue: x }];')).toHaveLength(1);
    expect(lint('const p = [{ provide: A, useValue: x }, { provide: A, useClass: B }];')).toHaveLength(1);
  });

  it('reports every provider the last one buries, not just the one above it', () => {
    expect(lint('const p = [provideAutoSpy(A), { provide: A, useValue: x }, { provide: A, useValue: y }];')).toHaveLength(2);
  });

  it('leaves an array that registers each token once alone', () => {
    expect(lint('const p = [provideAutoSpy(A), provideAutoSpy(B), { provide: C, useValue: x }];')).toEqual([]);
    // Two arrays are two scopes; only a single array can be resolved this way.
    expect(lint('const a = [provideAutoSpy(A)];\nconst b = [provideAutoSpy(A)];')).toEqual([]);
  });

  it('reads past everything in a providers array that is not a provider', () => {
    expect(lint('const p = [provideRouter([]), provideHttpClient(), provideAutoSpy(A)];')).toEqual([]);
    expect(lint('const p = [SomeModule, ...sharedProviders, provideAutoSpy(A)];')).toEqual([]);
    expect(lint('const p = [helpers.provideAutoSpy(A), provideAutoSpy(A)];')).toEqual([]);
    expect(lint('const p = [provideAutoSpy(), provideAutoSpy()];')).toEqual([]);
    expect(lint('const p = [{ useValue: x }, { useValue: y }];')).toEqual([]);
    // A hole is not a provider either, and must not be read as one.
    expect(lint('const p = [provideAutoSpy(A), , provideAutoSpy(B)];')).toEqual([]);
  });

  it('separates the exact duplicate, and offers to delete it', () => {
    // The larger half of the first field data: 20 reports across an 8 673-file workspace, most of
    // them a token registered twice in the same words.
    const duplicate = 'const p = [provideAutoSpy(SafeModeService), provideAutoSpy(SafeModeService)];';
    const message = firstMessage(duplicate);

    expect(message).toContain('`SafeModeService` is provided twice in this array, in the same words');
    expect(message).toContain('the copy on line 1');
    expect(suggestionsFor(duplicate)).toEqual(['Delete this duplicate provider for SafeModeService']);
    // The comma goes with it, or the array is left holding a hole.
    expect(applySuggestion(duplicate)).toBe('const p = [ provideAutoSpy(SafeModeService)];');
  });

  it('says which provider survives, and that it is the barer of the two', () => {
    // The smaller and more interesting half: the double the spec configured is not the one it got.
    const barer = [
      'const p = [',
      '  provideAutoSpy(AccountService, { gettersToSpyOn: [], instanceMethodsToSpyOn: [] }),',
      '  provideAutoSpy(AccountService),',
      '];',
    ].join('\n');
    const message = firstMessage(barer);

    expect(message).toContain('follows this one on line 3');
    expect(message).toContain('the **barer** of the two');
    // Which of the two to keep is the whole question, so there is nothing to offer.
    expect(suggestionsFor(barer)).toEqual([]);

    // An options value that is not a literal counts as the one thing it is, and still outweighs none.
    expect(firstMessage('const p = [provideAutoSpy(A, options), provideAutoSpy(A)];')).toContain('**barer**');
  });

  it('leaves two multi providers for one token alone — Angular keeps both', () => {
    // Angular accumulates multi providers instead of keeping the last, so the second is the feature.
    // A spec asserting that two BEFORE_INIT hooks run in registration order registers both on
    // purpose, and reporting it can only be silenced with an eslint-disable over a working test.
    const multi = [
      'const p = [',
      '  { provide: BEFORE_INIT, useValue: first, multi: true },',
      '  { provide: BEFORE_INIT, useValue: second, multi: true },',
      '];',
    ].join('\n');

    expect(lint(multi)).toEqual([]);
    // Three of them accumulate the same way, and none of them buries another.
    expect(
      lint(
        'const p = [{ provide: T, useValue: a, multi: true }, { provide: T, useValue: b, multi: true }, { provide: T, useValue: c, multi: true }];',
      ),
    ).toEqual([]);
    // A value this rule cannot resolve is read as multi: a missed report costs nothing, a false one
    // costs a disable comment over correct code.
    expect(lint('const p = [{ provide: T, useValue: a, multi: flag }, { provide: T, useValue: b, multi: flag }];')).toEqual([]);
  });

  it('still reports multi mixed with plain, which Angular refuses at runtime', () => {
    // `Cannot mix multi providers and regular providers` — a defect whichever half was meant.
    expect(lint('const p = [{ provide: T, useValue: a, multi: true }, { provide: T, useValue: b }];')).toHaveLength(1);
    expect(lint('const p = [{ provide: T, useValue: a }, { provide: T, useValue: b, multi: true }];')).toHaveLength(1);
    // `multi: false` is a plain provider written out, not an accumulating one.
    expect(lint('const p = [{ provide: T, useValue: a, multi: false }, { provide: T, useValue: b, multi: false }];')).toHaveLength(1);
    // The library's factories have no multi form, so one beside a multi provider is still a mix.
    expect(lint('const p = [provideAutoSpy(T), { provide: T, useValue: b, multi: true }];')).toHaveLength(1);
  });

  it('keeps the original wording where neither of those is true', () => {
    // The eight-tokens case: an auto-spy buried by a configured hand-rolled double.
    const shadowed = 'const p = [provideAutoSpy(A), { provide: A, useValue: mock }];';

    expect(firstMessage(shadowed)).toContain('the one on line 1 is what DI hands out');
    expect(suggestionsFor(shadowed)).toEqual([]);
  });

  /**
   * The second half of the same defect, one statement further out: `TestBed.overrideProvider` wins
   * over a module provider whenever it runs, so a registration for the same token is dead.
   *
   * Found in a migration and reproduced on the consumer it came from: 9 reports in 5 files, and the
   * shape of them is the interesting one — `provideAutoSpy(DevicesListService, { instanceMethodsToSpyOn:
   * ['getDevices'] })` in the array, buried by a bare `provideAutoSpy(DevicesListService)` in the
   * override, so the spy the spec configured is not the spy it got.
   */
  const overridden = (registration: string, override: string, hook = 'beforeEach'): string =>
    [
      "describe('page', () => {",
      `  ${hook}(() => {`,
      `    TestBed.configureTestingModule({ providers: [${registration}] })`,
      `      .${override};`,
      '  });',
      '});',
    ].join('\n');

  it('flags a registration a TestBed.overrideProvider in the same hook replaces', () => {
    const buried = overridden('provideAutoSpy(DevicesListService)', 'overrideProvider(DevicesListService, { useValue: devices })');

    expect(lines(buried)).toEqual([3]);
    expect(firstMessage(buried)).toContain('`TestBed.overrideProvider(DevicesListService)` on line 4');
    // Whatever the registration is spelled as, and whatever the override hands over.
    expect(lint(overridden('{ provide: A, useValue: mock }', 'overrideProvider(A, provideAutoSpy(A))'))).toHaveLength(1);
    expect(lint(overridden('provideAutoSpyForToken(TOKEN)', 'overrideProvider(TOKEN, { useValue: {} })'))).toHaveLength(1);
    // `beforeAll` reaches every test of the suite the same way.
    expect(lint(overridden('provideAutoSpy(A)', 'overrideProvider(A, { useValue: mock })', 'beforeAll'))).toHaveLength(1);
  });

  it('leaves the registration alone when the override does not run for every test', () => {
    // An override parked in a helper runs where the helper is called, and the call sites are the
    // fact that decides the outcome. The file that taught this registers three tokens and overrides
    // each of them from a helper three of its thirty-four tests call.
    const helper = [
      "describe('page', () => {",
      '  const setFlagsConfig = (on) => TestBed.overrideProvider(FlagsConfigService, { useValue: { isKeyEnabled: () => on } });',
      '  beforeEach(() => {',
      '    TestBed.configureTestingModule({ providers: [{ provide: FlagsConfigService, useValue: { isKeyEnabled: () => false } }] });',
      '  });',
      "  it('reads the default', () => { expect(1).toBe(1); });",
      "  it('reads the override', () => { setFlagsConfig(true); });",
      '});',
    ].join('\n');

    expect(lint(helper)).toEqual([]);

    // An override inside one test decides for that test alone.
    const inTest = [
      "describe('page', () => {",
      '  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideAutoSpy(A)] }); });',
      "  it('overrides', () => { TestBed.overrideProvider(A, { useValue: mock }); });",
      '});',
    ].join('\n');

    expect(lint(inTest)).toEqual([]);
    // At module scope there is no hook to be inside of.
    expect(
      lint('TestBed.configureTestingModule({ providers: [provideAutoSpy(A)] });\nTestBed.overrideProvider(A, { useValue: mock });'),
    ).toEqual([]);
  });

  it('leaves the registration alone when the override belongs to a nested suite', () => {
    // The override replaces the provider for the tests of its own block; every other test still
    // gets the registration, so it is not dead. The consumer has this exact shape.
    const nested = [
      "describe('page', () => {",
      '  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideAutoSpy(ErrorService)] }); });',
      "  describe('empty', () => {",
      '    beforeEach(() => { TestBed.overrideProvider(ErrorService, { useValue: mock }); });',
      '  });',
      '});',
    ].join('\n');

    expect(lint(nested)).toEqual([]);
  });

  it('leaves a suite that resets the testing module alone', () => {
    // The documented way of putting the module back, after which the registration is live again.
    const reset = [
      "describe('page', () => {",
      '  beforeEach(() => {',
      '    TestBed.configureTestingModule({ providers: [provideAutoSpy(A)] });',
      '    TestBed.overrideProvider(A, { useValue: mock });',
      '  });',
      "  it('starts over', () => { TestBed.resetTestingModule(); });",
      '});',
    ].join('\n');

    expect(lint(reset)).toEqual([]);
  });

  it('reads only what an override can actually bury', () => {
    // A multi registration accumulates rather than being replaced.
    expect(lint(overridden('{ provide: T, useValue: a, multi: true }', 'overrideProvider(T, { useValue: b })'))).toEqual([]);
    // A different token, and a call with no token to read.
    expect(lint(overridden('provideAutoSpy(A)', 'overrideProvider(B, { useValue: mock })'))).toEqual([]);
    expect(lint(overridden('provideAutoSpy(A)', 'overrideProvider()'))).toEqual([]);
    // An array that is not a testing module's `providers`.
    expect(
      lint("describe('x', () => { beforeEach(() => { const p = [provideAutoSpy(A)]; TestBed.overrideProvider(A, { useValue: m }); }); });"),
    ).toEqual([]);
    // A decorated class's own providers are the component's, and an override reaching them is the
    // documented workaround rather than a defect.
    const host = [
      "describe('x', () => {",
      '  @Component({ providers: [provideAutoSpy(A)] })',
      '  class Host {}',
      '  beforeEach(() => { TestBed.overrideProvider(A, { useValue: mock }); });',
      '});',
    ].join('\n');

    expect(lint(host)).toEqual([]);
  });

  it('reports a provider the array already buried only once', () => {
    // Two reports for one dead provider would make the count of a cleared suite meaningless.
    const both = overridden('provideAutoSpy(A), provideAutoSpy(A)', 'overrideProvider(A, { useValue: mock })');

    expect(lint(both)).toHaveLength(2);
    expect(lines(both)).toEqual([3, 3]);
  });
});
