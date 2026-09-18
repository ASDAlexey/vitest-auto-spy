/**
 * The check that reads the rewritten file the way a compiler would.
 *
 * Every transform here works on text, and the failures that hurt are the ones where the diff looks
 * plausible and the file no longer parses: a name inserted after a line comment, a rename that
 * landed on a declaration, an argument list that lost a value. Those are one class of bug, and one
 * check catches the next one too — parse the result and refuse to write a file that stopped parsing.
 *
 * The parser is the consumer's own `typescript`, resolved from the repository being migrated. It is
 * there in every repository this codemod has anything to do with; where it is not, the check is
 * silently skipped rather than turned into an install instruction.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { Finding } from '../report';
import { note } from './edits';

/** What a file's syntax diagnostics are compared by: the code, not the wording. */
export interface SyntaxParser {
  codesOf(file: string, text: string): number[];
}

interface Diagnostic {
  readonly code: number;
}

interface TranspileResult {
  readonly diagnostics?: readonly Diagnostic[];
}

interface TypeScriptModule {
  transpileModule(input: string, options: Record<string, unknown>): TranspileResult;
}

function isTypeScript(loaded: unknown): loaded is TypeScriptModule {
  return typeof loaded === 'object' && loaded !== null && 'transpileModule' in loaded && typeof loaded.transpileModule === 'function';
}

/** `target: esnext`, `jsx: preserve` — enough to parse anything a spec file can hold. */
const PARSE_OPTIONS = { target: 99, jsx: 1, allowJs: true };

/**
 * The `typescript` the repository under migration has, or `undefined` when it has none.
 *
 * Resolved from `cwd` rather than from this package: a global `npx vitest-auto-spy` must not parse
 * the consumer's files with whichever compiler happens to sit next to the CLI.
 */
export function loadParser(cwd: string, load: (specifier: string) => unknown = requireFrom(cwd)): SyntaxParser | undefined {
  let loaded: unknown;

  try {
    loaded = load('typescript');
  } catch {
    return undefined;
  }

  if (!isTypeScript(loaded)) {
    return undefined;
  }

  const typescript = loaded;

  return {
    codesOf: (file, text) =>
      (typescript.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: PARSE_OPTIONS }).diagnostics ?? []).map(
        (diagnostic) => diagnostic.code,
      ),
  };
}

function requireFrom(cwd: string): (specifier: string) => unknown {
  return (specifier) => createRequire(join(cwd, 'package.json'))(specifier);
}

/** Whether `after` has a diagnostic `before` did not — a regression this run introduced. */
export function brokeSyntax(parser: SyntaxParser, file: string, before: string, after: string): boolean {
  const left = new Map<number, number>();

  for (const code of parser.codesOf(file, before)) {
    left.set(code, (left.get(code) ?? 0) + 1);
  }

  for (const code of parser.codesOf(file, after)) {
    const remaining = left.get(code) ?? 0;

    if (remaining === 0) {
      return true;
    }

    left.set(code, remaining - 1);
  }

  return false;
}

export function brokeSyntaxNote(file: string): Finding {
  return note({
    check: 'codemod-broke-syntax',
    severity: 'error',
    file,
    line: 1,
    message: 'The rewritten file does not parse, so it was left exactly as it was.',
    fix: 'This is a defect in the codemod, not in the file. Migrate this one by hand, and report the construct it tripped over — the file is worth attaching.',
  });
}
