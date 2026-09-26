/** `let s: Mocked<Cart>` → `let s: Spy<Cart>`. */
import { bindingState, findBinding } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import { type EsMockedTypeName, namesOneType, rewritesTheWholeDeclaration, spyTypeFixes } from './mocked-declaration';
import { type EsAssignmentExpression, type EsFix, type EsFixer, type EsNode, isIdentifier } from './rule-types';

export const noMockedForSpy = defineRule({
  name: 'no-mocked-for-spy',
  description: 'Declare a spy as Spy<T>, not as Vitest’s Mocked<T>',
  fixable: true,
  hasSuggestions: true,
  messages: {
    noMockedForSpy:
      '`{{type}}` keeps the class’s private members, so assigning a spy to it fails with a list of private field names that hides the real problem. Declare `{{spy}}` instead.',
  },
  create: (context) => {
    // Collected and reported at the end, because what a `let` ends up holding is routinely written
    // below its declaration — and whether the rename is the whole edit depends on that value.
    const assignments = new Map<string, EsNode[]>();
    const reported: EsMockedTypeName[] = [];

    return {
      AssignmentExpression: (node: EsAssignmentExpression): void => {
        if (!isIdentifier(node.left)) {
          return;
        }

        assignments.set(node.left.name, [...(assignments.get(node.left.name) ?? []), node.right]);
      },
      // Every type position, not only a `let` annotation: the type turns up in a factory's return
      // type, in a helper's parameter and — in all eight reports of one batch, on the line right after
      // the declaration — in `as unknown as Mocked<T>`. Fixing the declaration and leaving the cast
      // spelled `Mocked` is how the same file ends up saying both.
      'TSTypeReference > Identifier[name=/^Mocked(Object)?$/]': (node: EsMockedTypeName): void => {
        reported.push(node);
      },
      'Program:exit': (): void => {
        reported.forEach((node) => {
          const type = excerpt(context, node.parent);
          const data = { type, spy: type.replace(/^Mocked(Object)?/, 'Spy') };
          const mocked = findBinding(context.sourceCode.getScope(node), node.name);
          // A `Mocked` the file declares itself is not Vitest's, whatever it is called, and `Spy`
          // already meaning something else here is the same problem from the other end.
          const rewritable =
            (!mocked || mocked.defs.some((definition) => definition.type === 'ImportBinding')) &&
            namesOneType(node.parent) &&
            bindingState(context.sourceCode.getScope(node), 'Spy') !== 'taken';

          if (!rewritable) {
            context.report({ node, messageId: 'noMockedForSpy', data });

            return;
          }

          const fix = (fixer: EsFixer): EsFix[] => spyTypeFixes(context, fixer, node, mocked);

          context.report(
            rewritesTheWholeDeclaration(node, assignments)
              ? { node, messageId: 'noMockedForSpy', data, fix }
              : {
                  node,
                  messageId: 'noMockedForSpy',
                  data,
                  suggest: [
                    { desc: 'Declare Spy<T> — and rebuild what is assigned to it, which Spy<T> will reject if it is a literal', fix },
                  ],
                },
          );
        });
      },
    };
  },
});
