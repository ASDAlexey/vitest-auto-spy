import type { DebugElement, DebugNode, Type } from '@angular/core';

import { sourceClassName } from './message-text';

export function directiveNodes(root: DebugElement, directive: Type<unknown>): DebugNode[] {
  const matches = (node: DebugNode): boolean => node.providerTokens.includes(directive);
  const nodes = root.queryAllNodes(matches);

  return matches(root) ? [root, ...nodes] : nodes;
}

export function findDirective<T>(fixture: { readonly debugElement: DebugElement }, directive: Type<T>): T {
  const nodes = directiveNodes(fixture.debugElement, directive);
  const [match] = nodes;

  if (match === undefined || nodes.length > 1) {
    throw new Error(
      `[vitest-auto-spy] findDirective: expected exactly one ${sourceClassName(directive.name)} instance in this fixture, found ${nodes.length}.`,
    );
  }

  return match.injector.get(directive);
}
