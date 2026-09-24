/** The static twin of `enableAngularDiagnostics({ deadSchemas })`. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-dead-schemas';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** The lines reported for a snippet — for asserting that every violator of a list is named, not just one. */
function lines(code: string): number[] {
  return verify(code).map((message) => message.line);
}

/**
 * The static twin of `enableAngularDiagnostics({ deadSchemas })`.
 *
 * The measured shape behind it: of 333 files carrying `NO_ERRORS_SCHEMA` in one Angular suite, 204
 * held `schemas` with no `declarations` anywhere — a charm protecting nobody, and one that starts
 * working the day somebody adds a `declarations` entry.
 */
describe('no-dead-schemas', () => {
  const bed = (body: string): string => `TestBed.configureTestingModule({ ${body} });`;

  it('flags schemas on a module that declares nothing', () => {
    expect(lint(bed('imports: [FooterComponent], schemas: [NO_ERRORS_SCHEMA]'))).toEqual(['vitest-auto-spy/no-dead-schemas']);
  });

  it('reports the `schemas` entry itself, so the fix is the reported line', () => {
    const [message] = verify(bed('imports: [C], schemas: [NO_ERRORS_SCHEMA]'));

    expect(message?.message).toContain('excuses nothing');
    expect(message?.message).toContain('createDirectiveHost');
  });

  /**
   * Both warnings come from one incident. An agent working the rule's list deleted a *textually
   * identical* `schemas:` line inside an `overrideComponent` block along with the reported one, and
   * six tests died on `NG0303` — nothing the compiler or ESLint could have said.
   */
  it('warns about the import and about checking the edit with a run', () => {
    const [message] = verify(bed('imports: [C], schemas: [NO_ERRORS_SCHEMA]'));

    expect(message?.message).toContain('only if nothing else in the file still uses it');
    expect(message?.message).toContain('verify with a run, not with a green lint');
    expect(message?.message).toContain('NG0303');
  });

  it('flags a configuration with nothing but schemas in it', () => {
    expect(lint(bed('schemas: [NO_ERRORS_SCHEMA]'))).toHaveLength(1);
  });

  it('leaves a live schema alone', () => {
    expect(lint(bed('declarations: [HostComponent], schemas: [NO_ERRORS_SCHEMA]'))).toEqual([]);
  });

  /**
   * Angular merges successive `configureTestingModule` calls before the module is instantiated, so
   * a schema in one hook and the declarations in another is one live configuration written twice.
   * The file decides, not the call.
   */
  it('leaves a schema alone when another configuration in the file declares something', () => {
    const split = [bed('schemas: [NO_ERRORS_SCHEMA]'), bed('declarations: [HostComponent]')].join('\n');

    expect(lint(split)).toEqual([]);
  });

  it('says nothing about an empty list, or one it cannot count', () => {
    // An empty `schemas` configures nothing either way; a list arriving through a name or a spread
    // is one this rule must read as present, or it would report a live schema as dead.
    expect(lint(bed('imports: [C], schemas: []'))).toEqual([]);
    expect(lint(bed('schemas: [NO_ERRORS_SCHEMA], declarations: DECLARATIONS'))).toEqual([]);
    expect(lint(bed('schemas: [NO_ERRORS_SCHEMA], declarations: [...SHARED]'))).toEqual([]);
  });

  it('reads only `TestBed.configureTestingModule` with a literal configuration', () => {
    expect(lint('bed.configureTestingModule({ schemas: [NO_ERRORS_SCHEMA] });')).toEqual([]);
    expect(lint('TestBed.configureTestingModule(moduleDef);')).toEqual([]);
    expect(lint('TestBed.overrideModule(M, { set: { schemas: [NO_ERRORS_SCHEMA] } });')).toEqual([]);
  });

  /**
   * The one legitimate `schemas` with no `declarations` in sight, found in a suite after the rule had
   * cleaned 85 files: a standalone component whose real import the spec cuts out on purpose — a
   * canvas-drawing child that jsdom cannot render — and a schema in the same `overrideComponent` call
   * to excuse the element the template still contains. Removing *that* schema breaks the build, so a
   * report here would be the kind of false positive that gets a rule switched off for good.
   */
  it('says nothing about a schema added through overrideComponent, which is compensating a real removal', () => {
    const compensating = [
      'TestBed.overrideComponent(BadgeQrComponent, {',
      '  remove: { imports: [QRCodeComponent] },',
      '  add: { schemas: [NO_ERRORS_SCHEMA] },',
      '});',
    ].join('\n');

    expect(lint(compensating)).toEqual([]);
    // The same call chained off the configuration, which is how the second of those two files reads.
    expect(lint(`TestBed.configureTestingModule({ imports: [C] })\n  .${compensating.slice('TestBed.'.length)}`)).toEqual([]);
  });

  /**
   * And the other half of the same evidence: in both of those files the module-level `schemas` was
   * dead *as well*, and removing it left the spec green. So a `remove: { imports: [...] }` must not
   * count as "this file declares something" — treating it that way would have hidden exactly the two
   * findings the cleanup confirmed.
   */
  it('still reports the module-level schema of a file that also overrides a component', () => {
    const both = [
      bed('imports: [BadgeQrComponent], schemas: [NO_ERRORS_SCHEMA]'),
      'TestBed.overrideComponent(BadgeQrComponent, {',
      '  remove: { imports: [QRCodeComponent] },',
      '  add: { schemas: [NO_ERRORS_SCHEMA] },',
      '});',
    ].join('\n');

    expect(lines(both)).toEqual([1]);
  });

  it('reports every dead configuration of a file, not the first', () => {
    const two = [bed('imports: [A], schemas: [NO_ERRORS_SCHEMA]'), bed('imports: [B], schemas: [NO_ERRORS_SCHEMA]')].join('\n');

    expect(lines(two)).toEqual([1, 2]);
  });
});
