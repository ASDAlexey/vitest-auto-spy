/**
 * Type-level tests for `registerAutoSpyDefaults` — above all its many-at-once form, whose whole
 * reason to exist is that **each row of the table is checked against its own class**.
 *
 * That property is fragile in exactly the way type tests exist for: the form can be re-typed into
 * something that compiles every table. The obvious spelling — `Array<[ClassType<unknown>,
 * ClassSpyConfiguration<unknown>]>` — checks nothing, because `ClassSpyConfiguration<T>` names keys
 * *of `T`* and no two classes' instantiations unify; and moving the row check out of the constraint
 * and into the parameter lets overload resolution defer the conditional and accept a wrong key. Both
 * placements were tried in `lib/spy-defaults.ts`, and both silently accepted a key the row class
 * does not have. Every valid table below stays green through those mistakes — only a wrong key can
 * tell checking from not-checking, so half of these blocks exist in order to fail.
 *
 * The wrong-key diagnostics must also name **the row's own** members — `"navigate" | "reload"` for a
 * `RouterLike` row, `"ping"` for an `AccountLike` row — never a union of every row's members, which
 * is the fingerprint of a spelling that checks all rows against one common type.
 *
 * Directive placement is load-bearing: in a table call the diagnostic lands on the offending
 * **row's** line, not on the call's first line, so each `@ts-expect-error` sits directly above its
 * row. One left elsewhere is itself reported — TS2578, unused directive — and fails this gate.
 */
import { type Observable, of } from 'rxjs';
import { describe, it } from 'vitest';

import { type AutoSpyDefaultEntry, registerAutoSpyDefaults } from '../auto-spy';

class RouterLike {
  events: Observable<string> = of('start');

  navigate(): boolean {
    return true;
  }

  reload(): void {
    /* real */
  }

  get url(): string {
    return '/home';
  }
}

class AccountLike {
  ping(): void {
    /* real */
  }

  get isGuest(): boolean {
    return true;
  }
}

describe('the many-at-once form of registerAutoSpyDefaults', () => {
  it('compiles a table whose rows name members only their own class has', () => {
    registerAutoSpyDefaults([
      [RouterLike, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
      [AccountLike, { gettersToSpyOn: ['isGuest'], instanceMethodsToSpyOn: ['ping'] }],
    ]);
  });

  it('rejects a wrong key in the first row of a table, naming the members of that row class', () => {
    // The diagnostic must name RouterLike's own methods — `"navigate" | "reload"` — and not a union
    // with the members of the AccountLike row below.
    registerAutoSpyDefaults([
      // @ts-expect-error — `isGuest` is not a method of RouterLike
      [RouterLike, { instanceMethodsToSpyOn: ['isGuest'] }],
      [AccountLike, { instanceMethodsToSpyOn: ['ping'] }],
    ]);
  });

  it('rejects a wrong key in the second row of a table, naming the members of that row class', () => {
    registerAutoSpyDefaults([
      [RouterLike, { instanceMethodsToSpyOn: ['reload'] }],
      // @ts-expect-error — `navigate` is not a method of AccountLike
      [AccountLike, { instanceMethodsToSpyOn: ['navigate'] }],
    ]);
  });

  it('compiles an empty table', () => {
    registerAutoSpyDefaults([]);
  });

  it('compiles a one-row table', () => {
    registerAutoSpyDefaults([[RouterLike, { gettersToSpyOn: ['url'] }]]);
  });

  it('accepts a row typed as AutoSpyDefaultEntry, so the exported row type and the table form agree', () => {
    const routerRow: AutoSpyDefaultEntry<RouterLike> = [RouterLike, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }];

    registerAutoSpyDefaults([routerRow]);
  });
});

describe('the per-class form of registerAutoSpyDefaults', () => {
  it('still compiles unchanged beside the table overload', () => {
    registerAutoSpyDefaults(RouterLike, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
    registerAutoSpyDefaults(AccountLike, { instanceMethodsToSpyOn: ['ping'], gettersToSpyOn: ['isGuest'] });
  });
});
