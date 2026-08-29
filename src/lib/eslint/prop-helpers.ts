/**
 * Which `mock*Prop` helper an `Object.defineProperty` descriptor is asking for.
 *
 * Five migration batches met four different descriptor shapes and one message naming two helpers,
 * and two of those shapes are actively repaired *wrong* by the helper it named: a getter is
 * `mockReadonlyPropGetter`, and a value the code under test calls with `new` is
 * `stubConstructor`. Reading the descriptor is the whole of the work, so it is done in one place.
 */
import { bindingState, insertImport } from './bindings';
import {
  type EsCallExpression,
  type EsFix,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  type SuggestionDescriptor,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  isRunnerFnCall,
  propertyName,
  propertyValue,
} from './rule-types';

/** The package the fixes import from, spelled once. */
const PACKAGE = 'vitest-auto-spy';

/** The helper that reproduces a descriptor entry exactly, for the two entries that have one. */
function helperFor(property: EsNode): string | undefined {
  const name = propertyName(property);

  if (name === 'value') {
    return 'mockValueProp';
  }

  return name === 'get' ? 'mockReadonlyPropGetter' : undefined;
}

/** One descriptor entry and the helper that replaces it, when the descriptor says nothing else. */
interface DescriptorRewrite {
  helper: string;
  value: EsNode;
}

/**
 * The single `value:` or `get:` of a descriptor that says nothing else.
 *
 * `configurable` is the one companion key that is allowed to be there, because making the property
 * configurable again is the entire point of the change: `Object.defineProperty` defaults it to
 * `false` and seals the property for the rest of the worker, which is what these helpers exist to
 * undo. `writable`, `enumerable` and a second entry are not reproduced, so a descriptor carrying
 * one is reported and left alone.
 */
function convertibleDescriptor(descriptor: EsObjectExpression): DescriptorRewrite | undefined {
  const meaningful = descriptor.properties.filter((property) => propertyName(property) !== 'configurable');
  const rewrites = meaningful.flatMap((property) => {
    const helper = helperFor(property);

    return helper ? [{ helper, value: propertyValue(property) }] : [];
  });

  return meaningful.length === 1 ? rewrites[0] : undefined;
}

/**
 * Whether the value is a mock the code under test will call with `new`.
 *
 * `vi.fn().mockImplementation(function () { … })` is spelled with a `function` for one reason: an
 * arrow cannot be constructed, and `new AudioContextClass()` on one throws "is not a constructor" —
 * which a service's own `try`/`catch` then swallows into a fallback branch, so the failure surfaces
 * three assertions later as a wrong channel count. `mockValueProp` would keep that trap; the
 * message names `stubConstructor`, which exists for it.
 */
function buildsConstructor(value: EsNode): boolean {
  return (
    isCallExpression(value) &&
    isRunnerFnCall(value) &&
    isMemberExpression(value.callee) &&
    isIdentifier(value.callee.property) &&
    value.callee.property.name === 'mockImplementation' &&
    value.arguments.some((argument) => argument.type === 'FunctionExpression')
  );
}

/** `Object.defineProperty(obj, 'x', { value })` → `mockValueProp(obj, 'x', value)`, and the same for a getter. */
export function propHelperSuggestion(context: RuleContext, node: EsCallExpression): SuggestionDescriptor | undefined {
  const [target, key, descriptor] = node.arguments;

  if (!target || !key || !descriptor || !isObjectExpression(descriptor)) {
    return undefined;
  }

  const rewrite = convertibleDescriptor(descriptor);
  const state = rewrite && bindingState(context.sourceCode.getScope(node), rewrite.helper);

  if (!rewrite || state === 'taken' || state === undefined || buildsConstructor(rewrite.value)) {
    return undefined;
  }

  const parts = [target, key, rewrite.value].map((part) => context.sourceCode.getText(part)).join(', ');
  const replacement = `${rewrite.helper}(${parts})`;

  return {
    desc: `Record the undo: ${replacement}`,
    fix: (fixer): EsFix[] => {
      const edits = [fixer.replaceText(node, replacement)];

      if (state === 'free') {
        edits.push(insertImport(fixer, `import { ${rewrite.helper} } from '${PACKAGE}';`));
      }

      return edits;
    },
  };
}
