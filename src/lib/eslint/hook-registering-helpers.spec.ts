/**
 * The list is checked against the source, not restated: a TypeScript program over every public entry
 * follows each exported function through the calls it makes, and a function that reaches
 * `beforeEach` / `afterEach` / `beforeAll` / `afterAll` on the way registers a hook when called.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const HOOKS = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll']);

const ROOT = process.cwd();

interface PackageManifest {
  exports: Record<string, string | { import?: string | { default?: string } }>;
}

function publicEntries(): string[] {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageManifest;

  return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
    const file = typeof target === 'string' ? target : typeof target.import === 'string' ? target.import : target.import?.default;
    const match = /^\.\/dist\/(.+)\.js$/.exec(file ?? '');

    return match && subpath !== './eslint-plugin' && subpath !== './perf-reporter' ? [join(ROOT, 'src', `${match[1]}.ts`)] : [];
  });
}

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function functionOf(declaration: ts.Declaration | undefined): FunctionLike | undefined {
  if (declaration === undefined) {
    return undefined;
  }

  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
    return declaration;
  }

  if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
    const initializer = declaration.initializer;

    return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer) ? initializer : undefined;
  }

  return undefined;
}

function hookRegisteringExports(): Set<string> {
  const entries = publicEntries();
  const program = ts.createProgram(entries, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const memo = new Map<FunctionLike, boolean>();

  const resolve = (node: ts.Node): FunctionLike | undefined => {
    let symbol = checker.getSymbolAtLocation(node);

    if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }

    const declaration = symbol?.declarations?.[0];

    return declaration?.getSourceFile().fileName.startsWith(join(ROOT, 'src')) ? functionOf(declaration) : undefined;
  };

  const registersHook = (fn: FunctionLike): boolean => {
    const known = memo.get(fn);

    if (known !== undefined) {
      return known;
    }

    memo.set(fn, false);

    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) {
        return;
      }

      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
        const target = resolve(ts.isPropertyAccessExpression(callee) ? callee.name : callee);

        found = (name !== undefined && HOOKS.has(name)) || (target !== undefined && registersHook(target));
      }

      ts.forEachChild(node, visit);
    };

    if (fn.body !== undefined) {
      ts.forEachChild(fn.body, visit);
    }

    memo.set(fn, found);

    return found;
  };

  const names = new Set<string>();

  for (const entry of entries) {
    const source = program.getSourceFile(entry);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);

    for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const fn = functionOf(target.declarations?.[0]);

      if (fn !== undefined && registersHook(fn)) {
        names.add(exported.getName());
      }
    }
  }

  return names;
}

describe('hookRegisteringHelpers', () => {
  it('names exactly the public helpers that register a runner hook when called', { timeout: 60_000 }, () => {
    const expected = [...hookRegisteringExports()].sort();

    expect([...plugin.hookRegisteringHelpers].sort()).toStrictEqual(expected);
  });

  it('is frozen, so a consumer spreading it into allowedFunctionCalls cannot change it for the next', () => {
    expect(Object.isFrozen(plugin.hookRegisteringHelpers)).toBe(true);
  });
});
