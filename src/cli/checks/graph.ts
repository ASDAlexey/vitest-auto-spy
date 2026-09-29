/**
 * The repository's own import graph, built once and shared by every check that needs one.
 *
 * Lexical: it matches `from '…'`, a side-effect `import '…'`, a dynamic `import('…')` and
 * `require('…')` in code, never in a comment or a string, then resolves the relative specifiers and
 * the bare ones tsconfig `paths` / `baseUrl` map into the repository; the rest live in `node_modules`.
 */
import { join, posix } from 'node:path';

import { findStringEnd, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { aliasCandidates, readCompilerPaths } from './graph-paths';

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const SPEC_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

/** Each ends at the opening quote of the specifier, matched against {@link codeOnly} text. */
const SPECIFIER_PATTERNS = [/(?<![\w$.])from\s*["']/g, /(?<![\w$.])(?:import|require)\s*\(\s*["']/g, /(?<![\w$.])import\s*["']/g];

const RESOLUTION_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

export interface SourceGraph {
  /** Every non-declaration source file in the repository, POSIX-relative. */
  readonly sources: readonly string[];
  /** Importer → the repository files it imports. */
  readonly imports: ReadonlyMap<string, readonly string[]>;
  /** Imported file → the repository files importing it. */
  readonly importedBy: ReadonlyMap<string, readonly string[]>;
  /**
   * Every readable source file's text; past {@link TEXT_CACHE_UNITS} it is read from disk on access.
   * Iterate it with `for…of`: spreading it into an array holds every text at once again.
   */
  readonly texts: ReadonlyMap<string, string>;
}

/** A file at the repository root, so a repository-relative stem resolves as written. */
const ALIAS_IMPORTER = 'package.json';

export function isSpecFile(file: string): boolean {
  return SPEC_FILE.test(file);
}

export function isSourceFile(file: string): boolean {
  return SOURCE_FILE.test(file) && !DECLARATION_FILE.test(file);
}

/** Every module specifier a file imports, ignoring the ones inside comments and strings. */
export function extractSpecifiers(source: string): string[] {
  const code = codeOnly(source);
  const found = new Set<string>();

  for (const pattern of SPECIFIER_PATTERNS) {
    code.replace(pattern, (match: string, offset: number): string => {
      const quote = offset + match.length - 1;
      const end = lineStringEnd(source, quote);
      const specifier = source.slice(quote + 1, end - 1);

      if (source[end - 1] === source[quote] && /^[^\n"']+$/.test(specifier)) {
        found.add(specifier);
      }

      return match;
    });
  }

  return [...found];
}

/** A quoted string ends at its line: an apostrophe in JSX text must not swallow the rest of the file. */
function lineStringEnd(source: string, start: number): number {
  const end = findStringEnd(source, start);
  const newline = source.indexOf('\n', start);

  return newline !== -1 && newline < end ? newline : end;
}

const INTERESTING = /["'/`{}]/;
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_AFTER_WORD = /(?:^|[^\w$.])(?:await|case|delete|do|else|in|instanceof|new|of|return|throw|typeof|void|yield)$/;

/** Whether a `/` at `index` opens a regular expression literal rather than dividing. */
function opensRegex(source: string, index: number): boolean {
  const before = source.slice(Math.max(0, index - 12), index).trimEnd();

  return REGEX_AFTER.has(before.slice(-1)) || REGEX_AFTER_WORD.test(before);
}

function regexEnd(source: string, start: number): number {
  let inClass = false;

  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];

    if (char === '\n') {
      return -1;
    }

    if (char === '\\') {
      index++;
    } else if (char === '[' || char === ']') {
      inClass = char === '[';
    } else if (char === '/' && !inClass) {
      return index + 1;
    }
  }

  return -1;
}

interface Masking {
  readonly source: string;
  readonly parts: string[];
  /** The brace depth each open template `${` returns to its template at. */
  readonly templates: number[];
  depth: number;
  kept: number;
}

function blank(state: Masking, start: number, end: number): void {
  if (end > start) {
    state.parts.push(state.source.slice(state.kept, start), ' '.repeat(end - start));
    state.kept = end;
  }
}

function endOrLength(found: number, length: number, source: string): number {
  return found === -1 ? source.length : found + length;
}

/** Blanks template text from `start`, stopping after the closing backtick or an opening `${`. */
function templateText(state: Masking, start: number): number {
  const { source } = state;

  for (let index = start; index < source.length; index++) {
    if (source[index] === '\\') {
      index++;
    } else if (source[index] === '`') {
      blank(state, start, index);

      return index + 1;
    } else if (source.startsWith('${', index)) {
      blank(state, start, index);
      state.templates.push(++state.depth);

      return index + 2;
    }
  }

  blank(state, start, source.length);

  return source.length;
}

function slashEnd(state: Masking, index: number): number {
  const { source } = state;

  if (source.startsWith('//', index) || source.startsWith('/*', index)) {
    const end = source.startsWith('//', index)
      ? endOrLength(source.indexOf('\n', index), 0, source)
      : endOrLength(source.indexOf('*/', index + 2), 2, source);

    blank(state, index, end);

    return end;
  }

  const end = opensRegex(source, index) ? regexEnd(source, index) : -1;

  blank(state, index + 1, end - 1);

  return end === -1 ? index + 1 : end;
}

function quoteEnd(state: Masking, index: number, quote: string): number {
  const end = lineStringEnd(state.source, index);

  blank(state, index + 1, state.source[end - 1] === quote && end - 1 > index ? end - 1 : end);

  return end;
}

function braceEnd(state: Masking, index: number, brace: string): number {
  if (brace === '{') {
    state.depth++;

    return index + 1;
  }

  if (state.templates.at(-1) === state.depth) {
    state.templates.pop();
    state.depth--;

    return templateText(state, index + 1);
  }

  state.depth--;

  return index + 1;
}

/**
 * The source with every comment, string body, template text and regular expression body blanked
 * to spaces, so offsets still line up with the original. Template `${…}` expressions stay code.
 */
export function codeOnly(source: string): string {
  const state: Masking = { source, parts: [], templates: [], depth: 0, kept: 0 };
  const interesting = new RegExp(INTERESTING.source, 'g');

  for (let match = interesting.exec(source); match !== null; match = interesting.exec(source)) {
    const [char] = match;

    if (char === '/') {
      interesting.lastIndex = slashEnd(state, match.index);
    } else if (char === '`') {
      interesting.lastIndex = templateText(state, match.index + 1);
    } else if (char === '{' || char === '}') {
      interesting.lastIndex = braceEnd(state, match.index, char);
    } else {
      interesting.lastIndex = quoteEnd(state, match.index, char);
    }
  }

  state.parts.push(source.slice(state.kept));

  return state.parts.join('');
}

/** Resolves a relative specifier against the repository's own file list. */
export function resolveRelative(importer: string, specifier: string, files: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const base = posix.normalize(posix.join(posix.dirname(importer), specifier)).replace(/^\.\//, '');
  const withoutJs = base.replace(/\.[cm]?js$/, '');
  const stems = base === withoutJs ? [base] : [base, withoutJs];

  for (const stem of stems) {
    for (const suffix of RESOLUTION_SUFFIXES) {
      if (files.has(`${stem}${suffix}`)) {
        return `${stem}${suffix}`;
      }
    }
  }

  return undefined;
}

function record(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);

  if (existing === undefined) {
    map.set(key, [value]);

    return;
  }

  if (!existing.includes(value)) {
    existing.push(value);
  }
}

/**
 * Texts kept in memory, in UTF-16 code units. A repository under it is read once per run, as
 * before; past it the rest is read again on each access instead of holding ~200 MB at 15k files.
 */
export const TEXT_CACHE_UNITS = 8 * 1024 * 1024;

/** Reads each file when asked, keeping only the texts `cached` was given within the budget. */
function lazyTexts(cwd: string, files: readonly string[], cached: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const known = new Set(files);
  const read = (file: string): string | undefined => cached.get(file) ?? (known.has(file) ? readTextFile(join(cwd, file)) : undefined);

  function* entries(): MapIterator<[string, string]> {
    for (const file of files) {
      const text = read(file);

      if (text !== undefined) {
        yield [file, text];
      }
    }
  }

  function* keys(): MapIterator<string> {
    yield* files;
  }

  function* values(): MapIterator<string> {
    for (const [, text] of entries()) {
      yield text;
    }
  }

  const map: ReadonlyMap<string, string> = {
    size: files.length,
    get: read,
    has: (file) => known.has(file),
    entries,
    keys,
    values,
    forEach: (callback, thisArg?: unknown) => {
      for (const [file, text] of entries()) {
        callback.call(thisArg, text, file, map);
      }
    },
    [Symbol.iterator]: entries,
  };

  return map;
}

export function buildGraph(profile: Profile, cacheUnits: number = TEXT_CACHE_UNITS): SourceGraph {
  const sources = profile.files.filter(isSourceFile);
  const known = new Set(profile.files);
  const paths = readCompilerPaths(profile.cwd);
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const readable: string[] = [];
  const cached = new Map<string, string>();
  let budget = cacheUnits;

  const resolve = (importer: string, specifier: string): string | undefined =>
    specifier.startsWith('.')
      ? resolveRelative(importer, specifier, known)
      : aliasCandidates(specifier, paths)
          .map((stem) => resolveRelative(ALIAS_IMPORTER, `./${stem}`, known))
          .find((resolved) => resolved !== undefined);

  for (const importer of sources) {
    const text = readTextFile(join(profile.cwd, importer));

    if (text === undefined) {
      continue;
    }

    readable.push(importer);

    if (text.length <= budget) {
      cached.set(importer, text);
      budget -= text.length;
    }

    for (const specifier of extractSpecifiers(text)) {
      const resolved = resolve(importer, specifier);

      if (resolved !== undefined && resolved !== importer) {
        record(imports, importer, resolved);
        record(importedBy, resolved, importer);
      }
    }
  }

  return { sources, imports, importedBy, texts: lazyTexts(profile.cwd, readable, cached) };
}

/**
 * A check's walk over every text, split in two so the doctor can walk once for all of them: a text
 * past the cache budget is read from disk per walk, and at 15k files each walk costs ~0.2 s.
 */
export interface TextPass {
  readonly visit: (file: string, text: string) => void;
  readonly finish: () => Finding[];
}

/** What a doctor step hands back: its findings, a walk still to make, or `undefined` where it does not apply. */
export type CheckStep = TextPass | readonly Finding[] | undefined;

function isPass(step: CheckStep): step is TextPass {
  return step !== undefined && 'visit' in step;
}

/** Every step's findings, in order, with all the walks made together in one read of each text. */
export function inOnePass(graph: SourceGraph, steps: readonly CheckStep[]): Finding[] {
  const passes = steps.filter(isPass);

  if (passes.length > 0) {
    for (const [file, text] of graph.texts) {
      for (const pass of passes) {
        pass.visit(file, text);
      }
    }
  }

  return steps.flatMap((step) => (isPass(step) ? step.finish() : (step ?? [])));
}
