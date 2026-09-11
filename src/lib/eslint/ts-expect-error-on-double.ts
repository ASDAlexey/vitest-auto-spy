/**
 * `@ts-expect-error` / `@ts-ignore` over a double's configuration — the suppression switches off the one
 * check a typed double gives, and the error it hides is nearly always an overload or a wrong fixture.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsComment,
  type EsNode,
  countInSubtree,
  isCallExpression,
  isFunctionNode,
  isMemberExpression,
  memberName,
} from './rule-types';

/** The helpers whose argument the compiler checks against the spied method's declared signature. */
const CONFIGURES = new Set([
  'calledWith',
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
  'mustBeCalledWith',
  'nextOneTimeWith',
  'nextWith',
  'nextWithPerCall',
  'nextWithValues',
  'resolveWith',
  'resolveWithPerCall',
  'returnValue',
]);

const ARGUMENT_MATCHERS = new Set(['calledWith', 'mustBeCalledWith']);

// TypeScript reads a block comment's directive off its last line, which is every line of a line comment.
const DIRECTIVE = /^[\s*/]*(@ts-(?:expect-error|ignore))/;

interface Configuration {
  call: EsCallExpression;
  helper: string;
  method: string;
}

/** `double.method.helper(…)`, and `double.method.calledWith(…).helper(…)` read back to the same method. */
function configurationOf(call: EsCallExpression): Configuration | undefined {
  const helper = memberName(call.callee);

  if (!helper || !CONFIGURES.has(helper) || !isMemberExpression(call.callee)) {
    return undefined;
  }

  const receiver = call.callee.object;
  const spied =
    isCallExpression(receiver) && ARGUMENT_MATCHERS.has(String(memberName(receiver.callee))) && isMemberExpression(receiver.callee)
      ? receiver.callee.object
      : receiver;
  const method = memberName(spied);

  return method ? { call, helper, method } : undefined;
}

/** Whether the directive's line lies in the call itself, rather than inside a callback handed to it. */
function suppresses({ call }: Configuration, line: number): boolean {
  const withinCallback = (node: EsNode): boolean => isFunctionNode(node) && node.loc.start.line < line && line <= node.loc.end.line;

  return call.loc.start.line <= line && line <= call.loc.end.line && countInSubtree(call, withinCallback, true) === 0;
}

function directiveOf(comment: EsComment): string | undefined {
  return DIRECTIVE.exec(comment.value.slice(comment.value.lastIndexOf('\n') + 1))?.[1];
}

export const noTsExpectErrorOnDouble = defineRule({
  anchor: '-an-overloaded-method',
  description: "Do not suppress a type error on a double's configuration — name the overload, or fix the fixture",
  messages: {
    noTsExpectErrorOnDouble:
      '`{{directive}}` above `{{method}}.{{helper}}(…)` switches off the one check a typed double gives: the stub is compared ' +
      'with the signature `{{method}}` declares, and the error it hides says the two disagree. On an overloaded method — a ' +
      "generated client with `observe` overloads — the double is typed against the **last** signature: name the one the spec means, `Spy<X, { overload: { {{method}}: 'first' } }>` " +
      "(or `asSpy<X, { overload: 'first' }>(…)`). Otherwise the fixture has the wrong shape — check it against " +
      "`ReturnType<X['{{method}}']>` (a `calledWith` argument against `Parameters<X['{{method}}']>`), and build a partial one " +
      'with `createMock<…>()`. A value outside the declared type on purpose, to reach a default branch, keeps its directive ' +
      'under `// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- <why>`.',
  },
  create: (context) => {
    const configurations: Configuration[] = [];

    return {
      CallExpression: (node: EsCallExpression): void => {
        const configuration = configurationOf(node);

        if (configuration) {
          configurations.push(configuration);
        }
      },
      'Program:exit': (): void => {
        context.sourceCode.getAllComments().forEach((comment) => {
          const directive = directiveOf(comment);
          const target = configurations.find((candidate) => suppresses(candidate, comment.loc.end.line + 1));

          if (directive && target) {
            context.report({
              node: target.call,
              loc: comment.loc,
              messageId: 'noTsExpectErrorOnDouble',
              data: { directive, helper: target.helper, method: target.method },
            });
          }
        });
      },
    };
  },
});
