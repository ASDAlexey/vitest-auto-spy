/**
 * A 40-line argument parser, because the alternative is a dependency.
 *
 * The CLI has two commands and a handful of flags; `node:util`'s `parseArgs` would do, but it is
 * only stable from Node 18.11 and this package supports `>=18`. The grammar accepted here is
 * `<command> [--flag] [--key value] [--key=value] [positional…]`.
 */

export interface ParsedArgs {
  /** The sub-command (`doctor`, `init`), or `undefined` when none was given. */
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
}

/** Flags that take a value; everything else is boolean. */
const VALUE_FLAGS = new Set(['cwd', 'from', 'only', 'skip']);

const ALIASES: Record<string, string> = { h: 'help', v: 'version' };

function normalizeName(raw: string): string {
  const name = raw.replace(/^--?/, '');

  return ALIASES[name] ?? name;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, string | true> = {};
  const positionals: string[] = [];
  let command: string | undefined;
  let consumed = false;

  for (const [index, token] of argv.entries()) {
    if (consumed) {
      consumed = false;

      continue;
    }

    if (!token.startsWith('-')) {
      if (command === undefined) {
        command = token;
      } else {
        positionals.push(token);
      }

      continue;
    }

    const [rawName, inlineValue] = splitInline(token);
    const name = normalizeName(rawName);

    if (inlineValue !== undefined) {
      flags[name] = inlineValue;

      continue;
    }

    const next = argv[index + 1];

    if (VALUE_FLAGS.has(name) && next !== undefined && !next.startsWith('-')) {
      flags[name] = next;
      consumed = true;

      continue;
    }

    flags[name] = true;
  }

  return { command, positionals, flags };
}

function splitInline(token: string): [string, string | undefined] {
  const equals = token.indexOf('=');

  if (equals === -1) {
    return [token, undefined];
  }

  return [token.slice(0, equals), token.slice(equals + 1)];
}

/** Reads a value flag, ignoring a bare `--cwd` with nothing after it. */
export function flagValue(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];

  return typeof value === 'string' ? value : undefined;
}

/** Reads a boolean flag. `--check=false` is honoured so a script can pass a computed value. */
export function flagEnabled(args: ParsedArgs, name: string): boolean {
  const value = args.flags[name];

  if (value === undefined) {
    return false;
  }

  return value !== 'false';
}
