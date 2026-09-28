/**
 * A component's own provider read back out of the fixture while nothing in the file replaced it.
 *
 * ```ts
 * @Component({ providers: [CartStore] })
 * class CartComponent {}
 *
 * const store = fixture.debugElement.injector.get(CartStore); // the real store, HTTP and all
 * ```
 *
 * `injectSpy` cannot reach a provider declared on the component — it reads the environment injector
 * — so a spec that wants to steer or assert on that dependency goes through the fixture. When the
 * file never swapped the provider, what comes back is the production class: the spec then drives a
 * store through its real HTTP calls, flushes requests the component never makes itself, and repeats
 * the store's own spec under the component's name. The spy has to be installed where the component
 * looks, which is `overrideComponentProvider`.
 *
 * **Only the fixture's own injector is read.** `fixture.debugElement.injector` and
 * `fixture.componentRef.injector` are the component under test; `debugElement.query(…).injector` is
 * some child, and asking a child's injector for a directive class is how a spec reaches that
 * directive's instance — a legitimate read this rule cannot tell apart from a service by syntax.
 *
 * A token counts as replaced when the file names it anywhere a double is installed: the arguments of
 * `provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider`, `overrideProvider`,
 * `overrideComponent` and `createSpyFromClass`, or the `provide` key of a provider object. A read
 * wrapped in `asSpy(…)` is the author saying the double exists elsewhere, and is taken at its word.
 *
 * Left alone on purpose: tokens imported from `@angular/*` (`ElementRef`, `NgControl`, `Injector` —
 * framework objects a spec reads for real), classes the file renders — passed to `createComponent`
 * or listed in `imports` / `declarations` / `hostDirectives`, which is how a host-based directive spec
 * reaches the directive under test — and any file that calls `createWithAutoSpies`, which builds its
 * doubles out of sight of this scan.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsIdentifier,
  type EsNode,
  type EsProperty,
  hasAncestor,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  memberName,
  propertyName,
} from './rule-types';

/** Calls whose arguments install a double for every class they name. */
const REPLACING_CALLS: ReadonlySet<string> = new Set([
  'createSpyFromClass',
  'overrideAutoSpy',
  'overrideComponent',
  'overrideComponentProvider',
  'overrideProvider',
  'provideAutoSpy',
]);

/** Helpers that register doubles somewhere this scan does not look. */
const OPAQUE_HELPERS: ReadonlySet<string> = new Set(['createWithAutoSpies']);

/** The fixture members whose `injector` is the component under test's own. */
const OWN_INJECTOR_HOLDERS: ReadonlySet<string> = new Set(['componentRef', 'debugElement']);

const FRAMEWORK_SCOPE = '@angular/';

export const REAL_COMPONENT_PROVIDER_SCHEMA = [
  {
    type: 'object',
    properties: { ignoreTokens: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
    additionalProperties: false,
  },
];

/** The name a call is made through — `provideAutoSpy` and `TestBed.overrideProvider` alike. */
function calleeName(node: EsCallExpression): string | undefined {
  return isIdentifier(node.callee) ? node.callee.name : memberName(node.callee);
}

/** Keys whose classes are components and directives the file renders, not services it provides. */
const RENDERED_KEYS: ReadonlySet<string> = new Set(['declarations', 'hostDirectives', 'imports']);

/** Whether `node` is the value of an `imports` / `declarations` / `hostDirectives` key. */
function isRenderedList(node: EsNode): boolean {
  const name = propertyName(node.parent);

  return name !== undefined && RENDERED_KEYS.has(name) && Reflect.get(node.parent, 'value') === node;
}

/** Whether `node` is one of the arguments of a call that installs a double. */
function isReplacingArgument(node: EsNode): boolean {
  const call = node.parent;

  if (!isCallExpression(call) || !call.arguments.includes(node)) {
    return false;
  }

  const name = calleeName(call);

  return name !== undefined && REPLACING_CALLS.has(name);
}

/** `<fixture>.debugElement.injector.get(Token)` → `Token`, for the fixture's own injector only. */
function ownInjectorToken(node: EsCallExpression): EsIdentifier | undefined {
  const [token] = node.arguments;

  if (!isMemberExpression(node.callee) || memberName(node.callee) !== 'get' || !token || !isIdentifier(token)) {
    return undefined;
  }

  const injector = node.callee.object;

  if (!isMemberExpression(injector) || memberName(injector) !== 'injector') {
    return undefined;
  }

  const holder = memberName(injector.object);

  return holder !== undefined && OWN_INJECTOR_HOLDERS.has(holder) ? token : undefined;
}

/** Whether the read is already re-viewed as a spy — `asSpy(fixture.debugElement.injector.get(X))`. */
function isClaimedSpy(node: EsCallExpression): boolean {
  return isCallExpression(node.parent) && calleeName(node.parent) === 'asSpy';
}

/** What one file adds up to: the reads, and every reason a read may be left alone. */
interface ProviderScan {
  readonly reads: EsIdentifier[];
  readonly replaced: Set<string>;
  readonly rendered: Set<string>;
  readonly framework: Set<string>;
  opaque: boolean;
}

/** The tokens the project listed in `{ ignoreTokens }`. */
function ignoredTokens(options: readonly unknown[]): Set<string> {
  const configured: unknown = Reflect.get(Object(options[0]), 'ignoreTokens');

  return new Set(Array.isArray(configured) ? configured.filter((entry) => typeof entry === 'string') : []);
}

/** Whether `node` is an import declaration from `@angular/*`, whose names are framework objects. */
function isFrameworkImport(node: EsNode): boolean {
  return node.type === 'ImportDeclaration' && String(Reflect.get(Reflect.get(node, 'source'), 'value')).startsWith(FRAMEWORK_SCOPE);
}

/** Records what a call says about the file: an opaque helper, a rendered class, or a read to judge. */
function readCall(node: EsCallExpression, scan: ProviderScan): void {
  const name = calleeName(node);

  if (name !== undefined && OPAQUE_HELPERS.has(name)) {
    scan.opaque = true;
  }

  if (name === 'createComponent') {
    node.arguments.filter(isIdentifier).forEach((argument) => scan.rendered.add(argument.name));
  }

  const token = ownInjectorToken(node);

  if (token && !isClaimedSpy(node)) {
    scan.reads.push(token);
  }
}

export const noRealComponentProvider = defineRule({
  name: 'no-real-component-provider',
  description: "Do not read a component's own provider from the fixture unless the file replaced it with a spy",
  schema: REAL_COMPONENT_PROVIDER_SCHEMA,
  messages: {
    noRealComponentProvider:
      'Nothing in this file replaces `{{token}}`, so the fixture hands back the real instance the component provides, and the spec tests it through the component. Install the spy where the component looks: `const {{variable}} = overrideComponentProvider(Component, {{token}});`, before the fixture is created. If the real one is meant, list `{{token}}` in `{ ignoreTokens }`.',
  },
  create: (context) => {
    const scan: ProviderScan = { reads: [], replaced: new Set(), rendered: new Set(), framework: new Set(), opaque: false };
    const ignored = ignoredTokens(context.options);

    return {
      Property: (node: EsProperty): void => {
        if (propertyName(node) === 'provide' && isIdentifier(node.value)) {
          scan.replaced.add(node.value.name);
        }
      },
      Identifier: (node: EsIdentifier): void => {
        if (hasAncestor(node, isReplacingArgument)) {
          scan.replaced.add(node.name);
        }

        if (hasAncestor(node, isRenderedList)) {
          scan.rendered.add(node.name);
        }

        if (hasAncestor(node, isFrameworkImport)) {
          scan.framework.add(node.name);
        }
      },
      CallExpression: (node: EsCallExpression): void => {
        readCall(node, scan);
      },
      'Program:exit': (): void => {
        if (scan.opaque) {
          return;
        }

        const skipped = [scan.replaced, scan.rendered, scan.framework, ignored];

        scan.reads
          .filter(({ name }) => !skipped.some((names) => names.has(name)))
          .forEach((token) => {
            const variable = `${token.name.charAt(0).toLowerCase()}${token.name.slice(1)}`;

            context.report({ node: token, messageId: 'noRealComponentProvider', data: { token: token.name, variable } });
          });
      },
    };
  },
});
