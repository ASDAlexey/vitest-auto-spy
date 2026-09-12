/**
 * A 40-line argument parser, because the alternative is a dependency.
 *
 * `node:util`'s `parseArgs` needs options declared up front; this `<command> [--flag] [--key value]
 * [--key=value] [positional…]` grammar has none, so it stays dependency-free and fully covered.
 */

export interface ParsedArgs {
  /** The sub-command (`doctor`, `init`), or `undefined` when none was given. */
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
}

/** Flags that take a value; everything else is boolean. */
const VALUE_FLAGS = new Set([
  'command',
  'baseline',
  'baseline-factor',
  'baseline-floor-ms',
  'cwd',
  'factor',
  'from',
  'gate-only',
  'json',
  'max-file-ms',
  'max-test-ms',
  'max-wall-ms',
  'only',
  'out',
  'skip',
  'top',
]);

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

/**
 * Reads a value flag as a finite, non-negative number. Anything else — a missing flag, a word, a
 * negative budget — answers `undefined`, and the caller keeps its default rather than gating on
 * `NaN`, which compares false against everything and would quietly pass every budget.
 */
export function flagNumber(args: ParsedArgs, name: string): number | undefined {
  const raw = flagValue(args, name);

  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  const value = Number(raw);

  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Reads a value flag as a comma-separated list, dropping the empty entries a trailing comma makes. */
export function flagList(args: ParsedArgs, name: string): string[] {
  return (flagValue(args, name) ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
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
