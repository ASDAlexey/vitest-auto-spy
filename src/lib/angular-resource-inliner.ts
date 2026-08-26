/**
 * Inline an Angular component's external resources into its source, so a runtime with no Angular
 * build step can compile the component just-in-time.
 *
 * An external template is not an import: nothing in the module graph points at the HTML file, and
 * Angular's JIT compiler refuses to build a component whose template it cannot fetch synchronously
 * ("Component X is not resolved"). Under Vitest the Analog plugin solves this during transform; the
 * Bun entry does the same from a `Bun.plugin` `onLoad` hook, and this module is the runtime-agnostic
 * half of it — a pure `string -> string` rewrite, unit-tested on Vitest and given real file reads
 * under Bun.
 *
 * Two properties matter for a rewrite that runs over every file of a test run:
 *
 * - **Comments are never rewritten.** A doc comment that shows an external-template declaration is
 *   ordinary prose, and reading a file it names would fail the whole run. Matches are checked
 *   against the source's comment and string ranges before anything is replaced.
 * - **Line numbers are preserved.** Every replacement is a single-line literal (`JSON.stringify`
 *   escapes newlines), so a stack trace from a failing spec still points at the original line.
 */
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

import { DOCS_LINKS, withDocs } from './docs-links';

/** How {@link inlineAngularResources} reads resources and which stylesheets it keeps. */
export interface AngularResourceInlinerOptions {
  /** Read a resource file. Defaults to a UTF-8 `readFileSync`; injected in tests. */
  readResource?: (path: string) => string;
  /**
   * Extensions whose contents are inlined verbatim. Anything else — `.scss`, `.less`, `.styl` —
   * becomes an empty stylesheet: a test runner has no CSS pre-processor, and no spec asserts on
   * styles (a component still compiles and renders without them).
   */
  inlineStyleExtensions?: readonly string[];
}

/** A half-open `[start, end)` slice of the source. */
interface SourceRange {
  start: number;
  end: number;
}

/** Extensions a test runtime can hand to Angular untouched. */
const DEFAULT_INLINE_STYLE_EXTENSIONS: readonly string[] = ['.css'];

/** Cheap pre-filter: skips the whole rewrite for the vast majority of files. */
const HAS_EXTERNAL_RESOURCE = /templateUrl|styleUrls?/;

const TEMPLATE_URL = /templateUrl\s*:\s*(["'`])([^"'`]+)\1/g;
const STYLE_URLS = /styleUrls\s*:\s*\[([^\]]*)]/g;
const STYLE_URL = /styleUrl\s*:\s*(["'`])([^"'`]+)\1/g;
const QUOTED = /["'`][^"'`]+["'`]/g;

function defaultReadResource(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Rewrite `templateUrl` / `styleUrl` / `styleUrls` in `source` into inline `template` / `styles`.
 *
 * Returns `undefined` when the file declares neither, so a caller can hand the original source back
 * untouched instead of paying for a copy.
 *
 * @param source Contents of the module being loaded.
 * @param modulePath Absolute path of that module — resource URLs resolve relative to its directory.
 *
 * @example
 * ```ts
 * const source = inlineAngularResources(rawSource, modulePath, { inlineStyleExtensions: ['.css', '.scss'] });
 * ```
 */
export function inlineAngularResources(
  source: string,
  modulePath: string,
  options: AngularResourceInlinerOptions = {},
): string | undefined {
  if (!HAS_EXTERNAL_RESOURCE.test(source)) {
    return undefined;
  }

  const readResource = options.readResource ?? defaultReadResource;
  const inlineStyleExtensions = options.inlineStyleExtensions ?? DEFAULT_INLINE_STYLE_EXTENSIONS;
  const directory = dirname(modulePath);
  // The mask is rebuilt between passes: inlining a template changes every offset after it, so a
  // range computed against the previous text would point at the wrong bytes.
  let masked = findMaskedRanges(source);
  const isCode = (offset: number): boolean => !masked.some((range) => offset >= range.start && offset < range.end);

  const read = (url: string): string => {
    const path = resolve(directory, url);

    try {
      return readResource(path);
    } catch (cause) {
      throw new Error(
        withDocs(
          `vitest-auto-spy: cannot read "${url}" referenced by ${modulePath} (resolved to ${path}). ` +
            `The path is resolved relative to the component file, not to the project root.`,
          DOCS_LINKS.bunAngular,
        ),
        { cause },
      );
    }
  };

  const readStyle = (url: string): string => (inlineStyleExtensions.includes(extname(url)) ? read(url) : '');

  let rewritten = source.replace(TEMPLATE_URL, (match: string, _quote: string, url: string, offset: number): string =>
    isCode(offset) ? `template: ${quote(read(url))}` : match,
  );

  masked = findMaskedRanges(rewritten);
  rewritten = rewritten.replace(STYLE_URLS, (match: string, list: string, offset: number): string =>
    isCode(offset) ? `styles: [${collectUrls(list).map(readStyle).map(quote).join(', ')}]` : match,
  );

  masked = findMaskedRanges(rewritten);
  rewritten = rewritten.replace(STYLE_URL, (match: string, _quote: string, url: string, offset: number): string =>
    isCode(offset) ? `styles: [${quote(readStyle(url))}]` : match,
  );

  return rewritten === source ? undefined : rewritten;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

/** Pull every quoted entry out of a `styleUrls: [...]` list body. */
function collectUrls(list: string): string[] {
  return [...list.matchAll(QUOTED)].map((match) => match[0].slice(1, -1));
}

/**
 * Locate every stretch of `source` that is not executable code: comments and string/template
 * literals.
 *
 * A hand-rolled scan rather than a parse, and only as accurate as a decorator rewrite needs: a
 * `templateUrl` written inside a doc comment or inside a string is prose, not a declaration, and
 * reading the file it names would fail the run. `${…}` interpolation and regex literals are not
 * tracked — an `@Component` declaration cannot be hiding inside either.
 */
function findMaskedRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let index = 0;

  while (index < source.length) {
    const pair = source.slice(index, index + 2);

    if (pair === '//') {
      const end = source.indexOf('\n', index);

      ranges.push({ start: index, end: end === -1 ? source.length : end });
      index = end === -1 ? source.length : end;
      continue;
    }

    if (pair === '/*') {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;

      ranges.push({ start: index, end });
      index = end;
      continue;
    }

    if (QUOTES.includes(source.charAt(index))) {
      const end = skipLiteral(source, index);

      ranges.push({ start: index, end });
      index = end;
      continue;
    }

    index += 1;
  }

  return ranges;
}

const QUOTES: readonly string[] = ["'", '"', '`'];

/** Advance past the string or template literal opening at `start`, honouring backslash escapes. */
function skipLiteral(source: string, start: number): number {
  const quoteChar = source[start];
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quoteChar) {
      return index + 1;
    }

    index += 1;
  }

  return index;
}
