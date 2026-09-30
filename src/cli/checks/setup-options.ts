/**
 * What an options object passed to a call sets, read statically. An object literal is read key by
 * key, its spreads applied in order as at runtime; an identifier is followed to its declaration in
 * the file, or through the import graph to the module that exports it. A value that cannot be read
 * that way is unknown, never "off".
 */
import { type SourceGraph, codeOnly, resolveRelative } from './graph';

export interface Settings {
  /** Each key's value as written, trimmed; `undefined` when something that cannot be read set it. */
  readonly values: ReadonlyMap<string, string | undefined>;
  /** A spread or an argument that could not be read may have set any key not written after it. */
  readonly open: boolean;
}

export type KeyValue = { readonly kind: 'unknown' } | { readonly kind: 'unset' } | { readonly kind: 'value'; readonly text: string };

export interface Source {
  readonly file: string;
  readonly text: string;
  /** {@link codeOnly} of `text`: offsets line up, strings and comments are blanked. */
  readonly code: string;
}

interface Binding {
  /** The name in this file for an import, the exported name for an export. */
  readonly local: string;
  readonly imported: string;
  readonly specifier: string | undefined;
}

const OPAQUE: Settings = { values: new Map(), open: true };
const EMPTY: Settings = { values: new Map(), open: false };
const MISSING = Symbol('missing');
const MAX_DEPTH = 12;

const IDENTIFIER = /^[$A-Z_a-z][\w$]*/;
const KEY = /^(?:[$A-Z_a-z][\w$]*|(["'])[^\n"']*\1)/;
const TYPE_TRAILER = /^(?:\s+(?:as|satisfies)\s+[\w$.]+(?:<[^\n;]*>)?(?:\[[^\n\]]*])*)*/;
const IMPORT_CLAUSE = /(?<![\w$.])import\s+(?!type\b)([\s\w$,{}]*?)\s*from\s*["']/g;
const EXPORT_CLAUSE = /(?<![\w$.])export\s+(?!type\b)({[^}]*})(?:\s*from\s*["'])?/g;
const EXPORT_STAR = /(?<![\w$.])export\s*\*\s*from\s*["']/g;
const EXPORT_DEFAULT = /(?<![\w$.])export\s+default\s+/;
const OPENERS = '({[';
const CLOSERS = ')}]';

export function keyValue(settings: Settings, key: string): KeyValue {
  if (!settings.values.has(key)) {
    return settings.open ? { kind: 'unknown' } : { kind: 'unset' };
  }

  const text = settings.values.get(key);

  return text === undefined ? { kind: 'unknown' } : { kind: 'value', text };
}

/** Applies `from` over `target` the way a spread does; returns whether it may have set any key. */
function spread(target: Map<string, string | undefined>, from: Settings): boolean {
  if (from.open) {
    for (const key of target.keys()) {
      target.set(key, undefined);
    }
  }

  for (const [key, value] of from.values) {
    target.set(key, value);
  }

  return from.open;
}

function nesting(char: string): number {
  return OPENERS.includes(char) ? 1 : CLOSERS.includes(char) ? -1 : 0;
}

function closingOf(code: string, open: number): number {
  let depth = 0;

  for (let index = open; index < code.length; index += 1) {
    depth += nesting(code.charAt(index));

    if (depth === 0) {
      return index;
    }
  }

  return -1;
}

/** Whether nothing but a type assertion stands between `end` and the end of the expression. */
function endsCleanly(code: string, end: number): boolean {
  return /^[\t ]*(?:[\n\r),;}]|$)/.test(code.slice(end).replace(TYPE_TRAILER, ''));
}

function leadingSpace(text: string): number {
  return text.search(/\S|$/);
}

/**
 * Reads option bags across files, memoising each file's masked text. Only the files a bag leads to
 * are read: the call sites and the modules they import it from.
 */
export class SettingsReader {
  readonly #sources = new Map<string, Source | undefined>();
  readonly #graph: SourceGraph;

  constructor(graph: SourceGraph) {
    this.#graph = graph;
  }

  /** Registers a text the caller already holds, so an import of that file does not read it again. */
  withText(file: string, text: string): Source {
    const source = { file, text, code: codeOnly(text) };

    this.#sources.set(file, source);

    return source;
  }

  #source(file: string): Source | undefined {
    if (!this.#sources.has(file)) {
      const text = this.#graph.texts.get(file);

      this.#sources.set(file, text === undefined ? undefined : { file, text, code: codeOnly(text) });
    }

    return this.#sources.get(file);
  }

  /** The settings of the expression at `start`; an empty argument list reads as `{}`. */
  valueAt(source: Source, start: number, depth = 0): Settings {
    const { code } = source;
    const at = start + leadingSpace(code.slice(start));

    if (code.charAt(at) === ')') {
      return EMPTY;
    }

    if (code.charAt(at) === '{') {
      const close = closingOf(code, at);

      return close !== -1 && endsCleanly(code, close + 1) ? this.#objectAt(source, at, close, depth) : OPAQUE;
    }

    const name = IDENTIFIER.exec(code.slice(at))?.[0];

    if (name === undefined || !endsCleanly(code, at + name.length) || depth >= MAX_DEPTH) {
      return OPAQUE;
    }

    const found = this.#localBinding(source, name, depth + 1);

    return found === MISSING ? OPAQUE : found;
  }

  #objectAt(source: Source, open: number, close: number, depth: number): Settings {
    const values = new Map<string, string | undefined>();
    let anyOpen = false;
    let entryStart = open + 1;
    let level = 0;

    for (let index = open + 1; index <= close; index += 1) {
      const char = source.code.charAt(index);

      if (index === close || (char === ',' && level === 0)) {
        anyOpen = this.#entry(source, entryStart, index, values, depth) || anyOpen;
        entryStart = index + 1;
      } else {
        level += nesting(char);
      }
    }

    return { values, open: anyOpen };
  }

  /** Applies one `key: value`, shorthand or spread; returns whether it may have set any key. */
  #entry(source: Source, start: number, end: number, values: Map<string, string | undefined>, depth: number): boolean {
    const from = start + leadingSpace(source.code.slice(start, end));
    const entry = source.code.slice(from, end).trimEnd();

    if (entry.startsWith('...')) {
      return spread(values, this.valueAt(source, from + 3, depth));
    }

    if (entry.startsWith('[')) {
      return spread(values, OPAQUE);
    }

    const key = KEY.exec(entry)?.[0];

    if (key === undefined) {
      return false;
    }

    const name = source.text.slice(from, from + key.length).replace(/^["']|["']$/g, '');
    const colon = /^\s*:/.exec(entry.slice(key.length));

    if (colon === null) {
      if (entry === key) {
        values.set(name, undefined);
      }

      return false;
    }

    const valueFrom = from + key.length + colon[0].length;
    const valueCode = source.code.slice(valueFrom, from + entry.length);
    const lead = leadingSpace(valueCode);
    const value = source.text.slice(valueFrom + lead, valueFrom + valueCode.trimEnd().length);

    if (/^(?:undefined|null)$/.test(value)) {
      values.delete(name);
    } else {
      values.set(name, value);
    }

    return false;
  }

  #localBinding(source: Source, name: string, depth: number): Settings | typeof MISSING {
    const declaration = new RegExp(`(?<![\\w$.])(?:const|let|var)\\s+${name.replace(/\$/g, '\\$')}\\s*(?::[^=;]*)?=(?![=>])`).exec(
      source.code,
    );

    if (declaration !== null) {
      return this.valueAt(source, declaration.index + declaration[0].length, depth);
    }

    const binding = this.#bindings(source, IMPORT_CLAUSE).find(({ local }) => local === name);

    return binding === undefined ? MISSING : this.#exported(source, String(binding.specifier), binding.imported, depth);
  }

  /** The value a module exports as `name`, following re-exports; {@link MISSING} when it has none. */
  #exportOf(file: string, name: string, depth: number): Settings | typeof MISSING {
    const source = this.#source(file);

    if (source === undefined || depth >= MAX_DEPTH) {
      return MISSING;
    }

    if (name === 'default') {
      const match = EXPORT_DEFAULT.exec(source.code);

      return match === null ? MISSING : this.valueAt(source, match.index + match[0].length, depth);
    }

    const binding = this.#bindings(source, EXPORT_CLAUSE).find(({ local }) => local === name);

    if (binding !== undefined) {
      return binding.specifier === undefined
        ? this.#localBinding(source, binding.imported, depth + 1)
        : this.#exported(source, binding.specifier, binding.imported, depth);
    }

    const local = this.#localBinding(source, name, depth + 1);

    if (local !== MISSING) {
      return local;
    }

    for (const star of source.code.matchAll(EXPORT_STAR)) {
      const found = this.#exported(source, this.#specifierAfter(source, star.index + star[0].length), name, depth);

      if (found !== MISSING) {
        return found;
      }
    }

    return MISSING;
  }

  /** Follows `specifier` from `source` to the repository file the import graph resolved it to. */
  #exported(source: Source, specifier: string, name: string, depth: number): Settings | typeof MISSING {
    const imported = this.#graph.imports.get(source.file) ?? [];
    const relative = resolveRelative(source.file, specifier, new Set(imported));
    // A tsconfig `paths` alias is resolved by the graph but not here, so every imported file is a candidate.
    const targets = relative !== undefined ? [relative] : specifier.startsWith('.') ? [] : imported;

    for (const target of targets) {
      const found = this.#exportOf(target, name, depth + 1);

      if (found !== MISSING) {
        return found;
      }
    }

    return MISSING;
  }

  /** The specifier whose opening quote ends just before `after`. */
  #specifierAfter(source: Source, after: number): string {
    return source.text.slice(after, source.text.indexOf(source.text.charAt(after - 1), after));
  }

  #bindings(source: Source, pattern: RegExp): Binding[] {
    return [...source.code.matchAll(pattern)].flatMap((match): Binding[] => {
      const specifier = /["']$/.test(match[0]) ? this.#specifierAfter(source, match.index + match[0].length) : undefined;
      const clause = String(match[1]);
      const named = /{([^}]*)}/.exec(clause)?.[1] ?? '';
      const defaultName = /^\s*([$A-Z_a-z][\w$]*)/.exec(clause.replace(/^\s*{[^}]*}/, ''))?.[1];
      const pairs = named.split(',').flatMap((part): Binding[] => {
        const pair = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);

        return pair === null ? [] : [{ local: pair[2] ?? String(pair[1]), imported: String(pair[1]), specifier }];
      });

      return defaultName === undefined ? pairs : [{ local: defaultName, imported: 'default', specifier }, ...pairs];
    });
  }
}
