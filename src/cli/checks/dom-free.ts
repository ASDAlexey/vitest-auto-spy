/**
 * Which spec files could run under the `node` environment.
 *
 * The rule is deliberately one-sided. A file is listed only when every module it can reach has been
 * read and none of them mentions a DOM name; anything the rule cannot see through — an unresolved
 * import, a package that is not on the list below — leaves the file undecided, never a candidate.
 * A false positive is somebody's suite failing on `document is not defined`, so the two mistakes do
 * not cost the same and the rule is not symmetric either.
 */
import { join } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { SourceGraph } from './graph';
import { extractSpecifiers, isSpecFile, resolveRelative } from './graph';

/**
 * Names that exist only in a browser-like environment. Data rather than one literal so the list
 * stays readable — and so a reader can check it, which is the point of printing the rule.
 */
const DOM_NAMES = [
  'document',
  'window',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'HTML\\w+',
  'SVG\\w+',
  'Element',
  'Node',
  'ShadowRoot',
  'Range',
  'Selection',
  '\\w*Event',
  'EventTarget',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'MutationObserver',
  'IntersectionObserver',
  'ResizeObserver',
  'customElements',
  'DOMParser',
  'XMLHttpRequest',
  'FormData',
  'Blob',
  'File',
  'FileReader',
  'Image',
  'Audio',
  'CSS',
  'Worker',
  'WebSocket',
  'Notification',
  'canvas',
  'innerHTML',
  'querySelector\\w*',
  'addEventListener',
  'removeEventListener',
  'createElement',
  'jsdom',
  'happy-dom',
  'TestBed',
];

const DOM_EVIDENCE = new RegExp(String.raw`\b(?:${DOM_NAMES.join('|')})\b`);

/** Packages whose whole surface runs under plain Node. Everything else leaves a file undecided. */
const DOM_FREE_PACKAGES = [
  'vitest',
  'rxjs',
  'vitest-auto-spy',
  'vitest-auto-spies',
  'date-fns',
  'dayjs',
  'luxon',
  'lodash',
  'lodash-es',
  'ramda',
  'immer',
  'uuid',
  'nanoid',
  'zod',
  'decimal.js',
  'big.js',
  'reflect-metadata',
];

const DOM_FREE_PACKAGE_SET = new Set(DOM_FREE_PACKAGES);

/**
 * The subpaths of this package that stay DOM-free. `/angular`, `/dom-stubs` and `/setup` are
 * deliberately absent: each one reaches a DOM, so a spec importing them is not a candidate.
 */
const DOM_FREE_SUBPATHS = new Set([
  'vitest-auto-spy/rxjs',
  'vitest-auto-spy/jasmine',
  'vitest-auto-spy/console',
  'vitest-auto-spy/node',
  'vitest-auto-spy/nestjs',
]);

/** A file that already declares an environment is not this rule's to move. */
const DECLARED_ENVIRONMENT = /@vitest-environment\s+\S+/;

/** Printed with the finding: advice whose rule is hidden cannot be checked by the person taking it. */
export const DOM_FREE_RULE = `a spec is listed only when it, the configured setup files and every repository module any of them imports were read and none of them mentions a DOM name (document, window, HTML*, *Event, TestBed, …), and every package they import is one of: ${DOM_FREE_PACKAGES.join(', ')}`;

export interface DomFreeSpecs {
  /** Specs the rule proved DOM-free. */
  readonly specs: readonly string[];
  /** How many specs it could not decide, because something in reach could not be read. */
  readonly undecided: number;
}

export interface Alias {
  readonly prefix: string;
  readonly target: string;
}

interface Local {
  readonly dom: boolean;
  /** Something this file imports could not be seen through. */
  readonly opaque: boolean;
  readonly edges: readonly string[];
}

/** A file at the repository root, so a repository-relative stem resolves as written. */
const ROOT_IMPORTER = 'package.json';

function aliasesFrom(text: string | undefined): Alias[] {
  const parsed = text === undefined ? undefined : parseJsonc(text);
  const options = isRecord(parsed) && isRecord(parsed['compilerOptions']) ? parsed['compilerOptions'] : undefined;
  const paths = options !== undefined && isRecord(options['paths']) ? options['paths'] : undefined;
  const baseUrl = options !== undefined && typeof options['baseUrl'] === 'string' ? options['baseUrl'] : '.';
  const found: Alias[] = [];

  for (const [pattern, targets] of Object.entries(paths ?? {})) {
    const first = Array.isArray(targets) ? targets[0] : undefined;
    const prefix = pattern.replace(/\*$/, '');

    if (typeof first === 'string' && prefix !== '') {
      found.push({ prefix, target: `${baseUrl}/${first}`.replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\*$/, '') });
    }
  }

  return found;
}

/** `compilerOptions.paths` from the two configs that carry them in practice. No `extends` chasing. */
export function readAliases(cwd: string): Alias[] {
  const found = ['tsconfig.json', 'tsconfig.base.json'].flatMap((name) => aliasesFrom(readTextFile(join(cwd, name))));

  return found.sort((a, b) => b.prefix.length - a.prefix.length);
}

/** The package a bare specifier belongs to: `@scope/pkg/sub` → `@scope/pkg`, `rxjs/operators` → `rxjs`. */
export function packageOf(specifier: string): string {
  const slash = specifier.indexOf('/');

  if (!specifier.startsWith('@')) {
    return slash === -1 ? specifier : specifier.slice(0, slash);
  }

  const second = specifier.indexOf('/', slash + 1);

  return second === -1 ? specifier : specifier.slice(0, second);
}

function isDomFreePackage(specifier: string): boolean {
  return specifier.startsWith('node:') || DOM_FREE_SUBPATHS.has(specifier) || DOM_FREE_PACKAGE_SET.has(packageOf(specifier));
}

/** A repository file for the specifier, or `undefined` when it does not name one. */
function targetOf(importer: string, specifier: string, known: ReadonlySet<string>, aliases: readonly Alias[]): string | undefined {
  if (specifier.startsWith('.')) {
    return resolveRelative(importer, specifier, known);
  }

  const alias = aliases.find((entry) => specifier.startsWith(entry.prefix));

  if (alias === undefined) {
    return undefined;
  }

  return resolveRelative(ROOT_IMPORTER, `./${alias.target}${specifier.slice(alias.prefix.length)}`, known);
}

function classify(importer: string, text: string, known: ReadonlySet<string>, aliases: readonly Alias[]): Local {
  const edges: string[] = [];
  let opaque = false;

  for (const specifier of extractSpecifiers(text)) {
    const target = targetOf(importer, specifier, known, aliases);

    if (target !== undefined) {
      edges.push(target);

      continue;
    }

    if (!isDomFreePackage(specifier)) {
      opaque = true;
    }
  }

  return { dom: DOM_EVIDENCE.test(text), opaque, edges };
}

function isClean(spec: string, setup: readonly string[], locals: ReadonlyMap<string, Local>): boolean {
  const seen = new Set([spec, ...setup]);
  const order = [spec, ...setup];

  // `for…of` over an array that is still growing: the iterator re-reads the length, so a module
  // pushed here is visited later in the same loop.
  for (const current of order) {
    const local = locals.get(current);

    if (local === undefined || local.dom || local.opaque) {
      return false;
    }

    for (const edge of local.edges) {
      if (!seen.has(edge)) {
        seen.add(edge);
        order.push(edge);
      }
    }
  }

  return true;
}

export function findDomFreeSpecs(profile: Profile, graph: SourceGraph): DomFreeSpecs {
  const known = new Set(profile.files);
  const aliases = readAliases(profile.cwd);
  const locals = new Map<string, Local>();

  for (const [file, text] of graph.texts) {
    locals.set(file, classify(file, text, known, aliases));
  }

  // Over `texts` rather than `sources`: a file that could not be read cannot be proved clean, so
  // counting it as undecided and counting it as absent are the same answer.
  const candidates = [...graph.texts].filter(([file, text]) => isSpecFile(file) && !DECLARED_ENVIRONMENT.test(text)).map(([file]) => file);
  // The setup files run for every spec, so they are part of every spec's reach. A setup file that
  // builds a TestBed is why a spec that never touches the DOM itself still cannot move.
  const setup = profile.setupFiles.map((entry) => entry.replace(/^\.\//, ''));
  const specs = candidates.filter((file) => isClean(file, setup, locals));

  return { specs, undecided: candidates.length - specs.length };
}
