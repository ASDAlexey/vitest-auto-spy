/** Recognise local Angular unit-test wrappers without importing consumer code. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { findStringEnd } from './jsonc';

const BUILDERS = new Set(['@angular/build:unit-test', '@nx/angular:unit-test']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));

    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Keep only executable code and the module literal the declaration matcher needs. */
function codeOf(text: string): string {
  let code = '';
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (char === '/' && text.charAt(index + 1) === '/') {
      const end = text.indexOf('\n', index + 2);
      index = end < 0 ? text.length : end;
      code += ' ';
    } else if (char === '/' && text.charAt(index + 1) === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end < 0 ? text.length : end + 2;
      code += ' ';
    } else if (char === '"' || char === "'" || char === '`') {
      const end = findStringEnd(text, index);
      const literal = text.slice(index, end);
      code += literal === "'@angular/build'" || literal === '"@angular/build"' ? literal : '""';
      index = end;
    } else {
      code += char;
      index += 1;
    }
  }

  return code;
}

/** Only a named import followed by a call is evidence; comments and manifest prose are not. */
function delegates(text: string): boolean {
  const code = codeOf(text);
  const binding = '(?:executeUnitTestBuilder)(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?';
  const staticImport = new RegExp(`\\bimport\\s*\\{\\s*${binding}\\s*\\}\\s*from\\s*['"]@angular/build['"]`).exec(code);
  const dynamicImport =
    /\b(?:const|let)\s*{\s*executeUnitTestBuilder(?:\s*:\s*([$A-Z_a-z][\w$]*))?\s*}\s*=\s*await\s+import\s*\(\s*["']@angular\/build["']\s*\)/.exec(
      code,
    );
  const imported = staticImport ?? dynamicImport;

  if (imported === null) {
    return false;
  }

  const name = imported[1] ?? 'executeUnitTestBuilder';

  return new RegExp(`\\b${name.replaceAll('$', '\\$')}\\s*\\(`).test(code.slice(imported.index + imported[0].length));
}

export function isAngularUnitTestBuilder(builder: string, workspaceRoot: string): boolean {
  if (BUILDERS.has(builder)) {
    return true;
  }

  const colon = builder.lastIndexOf(':');

  if (!builder.startsWith('./') || colon < 0) {
    return false;
  }

  const packageRoot = resolve(workspaceRoot, builder.slice(0, colon));
  const manifest = readJson(resolve(packageRoot, 'package.json'))?.['builders'];

  if (typeof manifest !== 'string' || !manifest.endsWith('.json')) {
    return false;
  }

  const manifestPath = resolve(packageRoot, manifest);
  const builders = readJson(manifestPath)?.['builders'];
  const entry: unknown = typeof builders === 'object' && builders !== null ? Reflect.get(builders, builder.slice(colon + 1)) : undefined;
  const implementation: unknown = typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'implementation') : undefined;

  if (typeof implementation !== 'string' || !/\.[cm]?[jt]s$/.test(implementation)) {
    return false;
  }

  try {
    return delegates(readFileSync(resolve(dirname(manifestPath), implementation), 'utf8'));
  } catch {
    return false;
  }
}
