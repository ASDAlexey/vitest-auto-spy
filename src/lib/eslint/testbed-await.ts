/**
 * `no-sync-testbed-await` — `await` on a TestBed call that answers the TestBed.
 *
 * `configureTestingModule` and every `override*` return `TestBed` itself, which is what lets them
 * chain; `createComponent` returns the `ComponentFixture`. None of the three is a promise, so an
 * `await` in front of one waits for nothing — it only resumes the hook a microtask later — while
 * reading, to everybody after, as though the setup were asynchronous. The `async` it forces on the
 * hook then awaits nothing at all, and that is the half worth naming: the two are one shape.
 *
 * Measured on an Angular monorepo of 1862 spec files. `no-compile-components` took 448
 * `compileComponents()` calls out of 410 files, and what was left behind was
 * `await TestBed.configureTestingModule({ … })` — 18 `await`s on a value that was never a promise
 * and 33 hooks left `async` with nothing to wait for. Both had been there all along, hidden behind a
 * call that really did return one. Run over that consumer's last commit — 1759 spec files, 411 of
 * them still calling `compileComponents()` — the rule reports 14 times in 10 files, every one with
 * the edit; over the same tree with the calls removed and their awaits fixed it reports nothing.
 *
 * **No type information.** The stock way to gate this is `@typescript-eslint/await-thenable`, which
 * needs `parserOptions.project` and reports "Unexpected `await` of a non-Promise (non-Thenable)
 * value" — true, and it leaves the reader to work out why a TestBed call is not one. The fact here
 * is fixed: these are Angular's own signatures, so the member name settles it and the rule reports
 * in a project that has wired no program at all.
 *
 * **What it does not report**, because one file's syntax cannot settle it: `TestBed.inject(TOKEN)`
 * answers whatever the token holds and `TestBed.runInInjectionContext(fn)` whatever the callback
 * returns — either can be a promise, and in the suite this was measured on four
 * `await TestBed.inject(…)` calls really do await one. `compileComponents()` is a promise and is
 * `no-compile-components`'s to decide on; `whenStable()`, `whenRenderingDone()` and
 * `getDeferBlocks()` are promises the fixture hands back, and so is `render(…)`.
 */
import { asyncOnlyFor, dropAsync } from './async-hooks';
import { boundValueOf } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsAwaitExpression,
  type EsFix,
  type EsFixer,
  type EsNode,
  type RuleContext,
  type SuggestionDescriptor,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';

const TEST_BED = 'TestBed';

/** The static accessor, for a file that took the TestBed through the function rather than the class. */
const GET_TEST_BED = 'getTestBed';

/**
 * The members that answer the `TestBed` itself — Angular's own return type, and what makes the calls
 * chainable in the first place (`@angular/core/testing`, 22.1).
 *
 * `configureCompiler` is deliberately **not** here: it is the one member of this family that returns
 * `void`, so the fact this rule states about the others would be wrong about it.
 */
const ANSWERS_THE_TEST_BED = new Set([
  'configureTestingModule',
  'overrideComponent',
  'overrideDirective',
  'overrideModule',
  'overridePipe',
  'overrideProvider',
  'overrideTemplate',
  'overrideTemplateUsingTestingModule',
  'resetTestingModule',
]);

/** The two that answer a `ComponentFixture` — the end of a chain rather than a link in one. */
const ANSWERS_A_FIXTURE = new Set(['createComponent', 'getLastFixture']);

/**
 * Whether an expression is the TestBed — the class, the accessor, a chain of its own members, or a
 * name holding one of those.
 *
 * The chain is walked link by link rather than rooted by its first token, so that only the members
 * Angular declares as returning `TestBed` count as links: `TestBed.inject(Api).createComponent(x)`
 * roots at `TestBed` too, and a rule reading the root alone would report a collaborator's method
 * that happens to share a name.
 *
 * `seen` guards the one thing a file can write that would otherwise loop — `let bed = bed`, dead at
 * run time and still parsed.
 */
function answersTheTestBed(context: RuleContext, node: EsNode, seen: Set<string>): boolean {
  if (isIdentifier(node)) {
    if (node.name === TEST_BED) {
      return true;
    }

    if (seen.has(node.name)) {
      return false;
    }

    seen.add(node.name);

    const bound = boundValueOf(context.sourceCode.getScope(node), node);

    return bound !== undefined && answersTheTestBed(context, bound, seen);
  }

  if (!isCallExpression(node)) {
    return false;
  }

  if (isIdentifier(node.callee)) {
    return node.callee.name === GET_TEST_BED;
  }

  if (!isMemberExpression(node.callee)) {
    return false;
  }

  const link = memberName(node.callee);

  return link !== undefined && ANSWERS_THE_TEST_BED.has(link) && answersTheTestBed(context, node.callee.object, seen);
}

/** Drop the `await`, and the `async` of a hook that awaits nothing else. */
function removal(context: RuleContext, awaited: EsAwaitExpression): SuggestionDescriptor {
  const callback = asyncOnlyFor(awaited);

  return {
    desc: 'Remove the await — the TestBed call answers the TestBed, not a promise',
    fix: (fixer: EsFixer): EsFix[] => {
      // The whole `await` expression is replaced by the text of what it awaited, rather than the
      // keyword cut out by range: ESTree does not record parentheses, so a range ending where the
      // argument starts would eat the opening one of `await (TestBed.configureTestingModule({}))`.
      const fixes = [fixer.replaceText(awaited, context.sourceCode.getText(awaited.argument))];

      if (callback) {
        fixes.push(dropAsync(context, callback, fixer));
      }

      return fixes;
    },
  };
}

export const noSyncTestbedAwait = defineRule({
  anchor: '-a-service-behind-angular-di',
  description: 'Drop the await on a TestBed call that answers the TestBed or a fixture rather than a promise',
  hasSuggestions: true,
  messages: {
    noSyncTestbedAwait:
      '`{{member}}(…)` answers the TestBed, not a promise, so this `await` waits for nothing. Every `configureTestingModule` and ' +
      '`override*` returns `TestBed` itself — that is what lets them chain — and `createComponent` / `getLastFixture` return the ' +
      '`ComponentFixture`; awaiting one of those only resumes the hook a microtask later, while making a synchronous setup read as ' +
      'an asynchronous one. Drop the `await`, and the `async` of a `beforeEach` / `beforeAll` / `afterEach` / `afterAll` / `it` / ' +
      '`test` callback that then awaits nothing else — the hook is not asynchronous any more, and leaving the `async` behind is ' +
      'the half `@typescript-eslint/require-await` would still have to report. The TestBed calls that really do return a promise ' +
      'keep their `await`: `compileComponents()`, and on a fixture `whenStable()`, `whenRenderingDone()` and `getDeferBlocks()`. ' +
      '`TestBed.inject(TOKEN)` and `TestBed.runInInjectionContext(fn)` are never reported — each answers whatever the token or the ' +
      'callback holds, which is a promise often enough to be awaited on purpose.',
  },
  create: (context) => ({
    AwaitExpression: (node: EsAwaitExpression): void => {
      const { argument } = node;

      if (!isCallExpression(argument) || !isMemberExpression(argument.callee)) {
        return;
      }

      const member = memberName(argument.callee);

      if (member === undefined || !(ANSWERS_THE_TEST_BED.has(member) || ANSWERS_A_FIXTURE.has(member))) {
        return;
      }

      if (!answersTheTestBed(context, argument.callee.object, new Set())) {
        return;
      }

      context.report({ node, messageId: 'noSyncTestbedAwait', data: { member }, suggest: [removal(context, node)] });
    },
  }),
});
