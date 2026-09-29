/**
 * A relative `vi.mock()` in a spec the Angular unit-test builder runs. The builder patches `vi.mock`,
 * `vi.doMock`, `vi.importMock`, `vi.unmock` and `vi.doUnmock` to throw on any specifier matching
 * `/^[./]/`, on purpose and with no flag to lift it.
 *
 * Silent until something says the builder runs the file: a `@angular/build:unit-test` /
 * `@nx/angular:unit-test` target whose project contains it (`builder-targets.ts`, the search
 * `no-redundant-mock-reset` uses), or `{ builder: 'unit-test' }` where that search cannot see the
 * workspace. A spec only `npx vitest` runs may mock a relative path.
 *
 * A tsconfig `paths` alias for a workspace file passes the builder's check and is compiled into the
 * bundle anyway, so that mock is reported too: it throws nothing and replaces nothing — unless every
 * run's `buildTarget` lists it in `externalDependencies`, which keeps it out of the bundle.
 */
import { type BuilderRun, builderRuns } from './builder-targets';
import { defineRule } from './define-rule';
import { type EsCallExpression, type EsNode, type RuleContext, isMemberCall, memberName } from './rule-types';
import { localAliasOf } from './tsconfig-aliases';

const VITEST = new Set(['vi', 'vitest']);
const PATCHED = new Set(['mock', 'doMock', 'importMock', 'unmock', 'doUnmock']);

/** The builder's own test, from `angular:vitest-mock-patch`. */
const BLOCKED_SPECIFIER = /^[./]/;

function runsUnderBuilder(context: RuleContext): boolean {
  return Reflect.get(Object(context.options[0]), 'builder') === 'unit-test' || builderRuns(context.filename).length > 0;
}

/** esbuild's `external` match: the exact specifier, a subpath of it, or one `*` wildcard. */
function matchesExternal(specifier: string, external: string): boolean {
  const star = external.indexOf('*');

  if (star === -1) {
    return specifier === external || specifier.startsWith(`${external}/`);
  }

  const prefix = external.slice(0, star);
  const suffix = external.slice(star + 1);

  return specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix);
}

/** Whether every builder run leaves the specifier out of the bundle, so Vitest resolves and mocks it. */
function externalInEveryRun(runs: readonly BuilderRun[], specifier: string): boolean {
  return runs.length > 0 && runs.every((run) => run.externals.some((external) => matchesExternal(specifier, external)));
}

/** The string a specifier argument spells: a literal, a static template, or `import('…')`. */
function specifierOf(node: EsNode | undefined): string | undefined {
  if (node?.type === 'ImportExpression') {
    return specifierOf(Reflect.get(node, 'source'));
  }

  const value: unknown = node?.type === 'Literal' ? Reflect.get(node, 'value') : undefined;

  if (typeof value === 'string') {
    return value;
  }

  const quasis: unknown = node?.type === 'TemplateLiteral' ? Reflect.get(node, 'quasis') : undefined;

  return Array.isArray(quasis) && quasis.length === 1
    ? String(Reflect.get(Object(Reflect.get(Object(quasis[0]), 'value')), 'cooked'))
    : undefined;
}

export const noRelativeMockUnderBuilder = defineRule({
  name: 'no-relative-mock-under-builder',
  description: 'Do not vi.mock() a relative path in a spec the Angular unit-test builder runs — the builder throws on it',
  schema: [{ type: 'object', properties: { builder: { enum: ['unit-test'] } }, additionalProperties: false }],
  messages: {
    noRelativeMockUnderBuilder:
      '`vi.{{method}}(\'{{specifier}}\')` throws under `@angular/build:unit-test`: the builder patches `vi.{{method}}` to reject every relative specifier (`The "vi.mock" and related methods are not supported for relative imports`), and no option lifts it. Replace the dependency through TestBed instead — `provideAutoSpy(Service)`, or `overrideComponentProvider` for a component’s own provider.',
    aliasMockUnderBuilder:
      "`vi.{{method}}('{{specifier}}')` does nothing under `@angular/build:unit-test`: `{{specifier}}` is the tsconfig path alias `{{alias}}` for a file of this workspace, so the builder bundles it before Vitest can replace it, and the real module runs without an error. List it in `externalDependencies` of the `buildTarget`, or replace it through TestBed: `provideAutoSpy(Service)`, or `overrideComponentProvider` for a component’s own provider.",
  },
  create: (context) =>
    runsUnderBuilder(context)
      ? {
          CallExpression: (node: EsCallExpression): void => {
            const specifier = specifierOf(node.arguments[0]);

            if (!isMemberCall(node, VITEST, PATCHED) || specifier === undefined) {
              return;
            }

            const method = String(memberName(node.callee));

            if (BLOCKED_SPECIFIER.test(specifier)) {
              context.report({ node, messageId: 'noRelativeMockUnderBuilder', data: { method, specifier } });

              return;
            }

            const alias = localAliasOf(context.filename, specifier);

            if (alias !== undefined && !externalInEveryRun(builderRuns(context.filename), specifier)) {
              context.report({ node, messageId: 'aliasMockUnderBuilder', data: { method, specifier, alias: alias.pattern } });
            }
          },
        }
      : {},
});
