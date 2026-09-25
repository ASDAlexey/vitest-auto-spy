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
import { lineOf } from './mask';

/** A syntax diagnostic, compared by its code rather than its wording. */
export interface SyntaxDiagnostic {
  readonly code: number;
  /** Offset into the text, when the compiler gave one. */
  readonly start: number | undefined;
  readonly message: string;
}

export interface SyntaxParser {
  diagnosticsOf(file: string, text: string): SyntaxDiagnostic[];
}

interface Diagnostic {
  readonly code: number;
  readonly start?: number;
  readonly messageText?: string | { readonly messageText: string };
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
    diagnosticsOf: (file, text) =>
      (typescript.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: PARSE_OPTIONS }).diagnostics ?? []).map(
        (diagnostic) => ({
          code: diagnostic.code,
          start: diagnostic.start,
          message:
            typeof diagnostic.messageText === 'object'
              ? diagnostic.messageText.messageText
              : (diagnostic.messageText ?? `TS${diagnostic.code}`),
        }),
      ),
  };
}

function requireFrom(cwd: string): (specifier: string) => unknown {
  return (specifier) => createRequire(join(cwd, 'package.json'))(specifier);
}

/** The first diagnostic `after` has that `before` did not — a regression this run introduced. */
export function brokeSyntax(parser: SyntaxParser, file: string, before: string, after: string): SyntaxDiagnostic | undefined {
  const left = new Map<number, number>();

  for (const { code } of parser.diagnosticsOf(file, before)) {
    left.set(code, (left.get(code) ?? 0) + 1);
  }

  for (const diagnostic of parser.diagnosticsOf(file, after)) {
    const remaining = left.get(diagnostic.code) ?? 0;

    if (remaining === 0) {
      return diagnostic;
    }

    left.set(diagnostic.code, remaining - 1);
  }

  return undefined;
}

export function brokeSyntaxNote(file: string, after: string, diagnostic: SyntaxDiagnostic): Finding {
  const line = diagnostic.start === undefined ? 1 : lineOf(after, diagnostic.start);

  return note({
    check: 'codemod-broke-syntax',
    severity: 'error',
    file,
    line,
    message: `The rewritten file would not parse at line ${line} (${diagnostic.message}), so the file was left as it was.`,
    fix: 'Migrate this file by hand, and report the construct on that line as a codemod defect.',
  });
}
