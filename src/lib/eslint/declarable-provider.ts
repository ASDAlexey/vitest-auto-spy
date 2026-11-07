/** Declarables may be DI collaborators, but provideAutoSpy deliberately requires their explicit provider form. */
import type { EsNode, RuleContext, TsNode } from './rule-types';
import { askChecker, checkerServices } from './use-value-types';

interface DeclarationNode extends TsNode {
  readonly modifiers?: readonly { getText(): string; readonly expression?: { readonly expression?: TsNode } }[];
  readonly parent?: DeclarationNode;
  readonly moduleSpecifier?: { readonly text?: string };
  readonly name?: { readonly text?: string };
  readonly propertyName?: { readonly text?: string };
}

interface DeclarationSymbol {
  readonly declarations?: readonly DeclarationNode[];
}

interface DeclarationType {
  getProperty(name: string): unknown;
  getSymbol(): DeclarationSymbol | undefined;
}

interface DeclarationChecker {
  getTypeAtLocation(node: TsNode): DeclarationType;
  getSymbolAtLocation(node: TsNode): DeclarationSymbol | undefined;
}

/** Proved metadata or a source decorator imported from Angular; a name ending in Directive proves nothing. */
export function isDeclarableProvider(context: RuleContext, token: EsNode | undefined): boolean {
  const services = checkerServices<DeclarationChecker>(context, ['getTypeAtLocation', 'getSymbolAtLocation']);

  if (!services || token === undefined) {
    return false;
  }

  return (
    askChecker(() => {
      const { checker, toTs } = services;
      const type = checker.getTypeAtLocation(toTs.get(token));

      if (type.getProperty('ɵcmp') !== undefined || type.getProperty('ɵdir') !== undefined) {
        return true;
      }

      return type.getSymbol()?.declarations?.some((declaration) =>
        declaration.modifiers?.some((modifier) => {
          const callee = modifier.expression?.expression;
          const symbol = callee && checker.getSymbolAtLocation(callee);

          return symbol?.declarations?.some((imported) => {
            const name = imported.propertyName?.text ?? imported.name?.text;

            return (
              (name === 'Component' || name === 'Directive') && imported.parent?.parent?.parent?.moduleSpecifier?.text === '@angular/core'
            );
          });
        }),
      );
    }) === true
  );
}
