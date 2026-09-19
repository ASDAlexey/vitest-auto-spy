/** `calledWith(x)` as a statement configures a stub; as an assertion it is chai's, not this library's. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-bare-called-with';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/**
 * The one name this library shares with the runner, and the reason it needs a rule.
 *
 * `spy.method.calledWith(x)` configures a stub; `expect(fn).to.have.been.calledWith(x)` — chai
 * style, added in Vitest 4.1 for suites arriving from sinon — asserts. A migrating author writes
 * the first meaning the second, and gets a green test that checks nothing.
 */
describe('no-bare-called-with', () => {
  it('reports a chain nothing continues', () => {
    expect(lint('cart.checkout.calledWith(1);')).toEqual(['vitest-auto-spy/no-bare-called-with']);
  });

  it('says something different about `mustBeCalledWith`, which rejects the matching call too', () => {
    expect(lint('cart.checkout.mustBeCalledWith(1);')).toEqual(['vitest-auto-spy/no-bare-called-with']);
  });

  it('leaves a continued chain alone, whatever continues it', () => {
    expect(lint('cart.checkout.calledWith(1).mockReturnValue(2);')).toEqual([]);
    expect(lint('cart.save.calledWith(1).resolveWith(2);')).toEqual([]);
    expect(lint('cart.checkout.calledWith(1).failWith(new Error("x"));')).toEqual([]);
    expect(lint('const configured = cart.checkout.calledWith(1);')).toEqual([]);
  });

  it("leaves chai's assertion of the same name alone", () => {
    expect(lint("expect(fn).to.have.been.calledWith('example');")).toEqual([]);
    expect(lint("expect(spy.method).to.have.been.calledWith('example');")).toEqual([]);
  });
});
