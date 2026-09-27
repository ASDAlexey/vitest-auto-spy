// Analog's JIT fastCompile keeps `@Injectable` on the class but emits no `ctorParameters` for it
// (2.7.5, 2.8.0-beta.12, main), so any constructor parameter there becomes NG0202 at inject time.
import type { Finding } from '../report';
import type { SourceGraph } from './graph';
import { type Span, isInsideLiteral, literalSpans } from './literals';
import { isKey, isRunnerConfig, runnerConfigKeys } from './vitest-5-facts';

const DECORATOR = /@(?:Injectable|Service)\s*\(/g;
const CLASS_HEAD = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([$A-Z_a-z][\w$]*)[^{]*{/;
const CONSTRUCTOR = /constructor\s*\(/y;
const SHOWN = 10;

const OPENERS = new Set(['(', '[', '{', '<']);
const CLOSERS = new Set([')', ']', '}', '>']);

function spanAt(spans: readonly Span[], index: number): Span | undefined {
  return spans.find((candidate) => candidate.start === index);
}

/** The index of the bracket closing the one at `open`, literals skipped; `-1` when it never closes. */
export function closingIndex(text: string, spans: readonly Span[], open: number): number {
  let depth = 0;

  for (let index = open; index < text.length; index += 1) {
    const span = spanAt(spans, index);

    if (span !== undefined) {
      index = span.end - 1;

      continue;
    }

    const char = text.charAt(index);

    depth += '([{'.includes(char) ? 1 : ')]}'.includes(char) ? -1 : 0;

    if (depth === 0) {
      return index;
    }
  }

  return -1;
}

/** Top-level pieces of a parameter list, split at commas outside brackets and type arguments. */
export function splitParameters(list: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < list.length; index += 1) {
    const char = list.charAt(index);

    if (OPENERS.has(char)) {
      depth += 1;
    } else if (CLOSERS.has(char) && list.charAt(index - 1) !== '=') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      pieces.push(list.slice(start, index));
      start = index + 1;
    }
  }

  pieces.push(list.slice(start));

  return pieces.map((piece) => piece.trim()).filter((piece) => piece !== '');
}

/** `@Inject(X)` survives as parameter metadata; a default stops `Function.length`, which Angular reads. */
export function needsTypeToken(parameter: string): boolean {
  let depth = 0;

  if (/@Inject\s*\(/.test(parameter)) {
    return false;
  }

  for (let index = 0; index < parameter.length; index += 1) {
    const char = parameter.charAt(index);

    if (OPENERS.has(char)) {
      depth += 1;
    } else if (CLOSERS.has(char) && parameter.charAt(index - 1) !== '=') {
      depth -= 1;
    } else if (char === '=' && depth === 0 && parameter.charAt(index + 1) !== '>') {
      return false;
    }
  }

  return true;
}

/** The parameter list of the constructor declared directly in the body `[open, close]`, if any. */
function constructorParameters(text: string, spans: readonly Span[], open: number, close: number): string | undefined {
  let depth = 0;

  for (let index = open; index < close; index += 1) {
    const span = spanAt(spans, index);

    if (span !== undefined) {
      index = span.end - 1;

      continue;
    }

    const char = text.charAt(index);

    depth += char === '{' ? 1 : char === '}' ? -1 : 0;

    CONSTRUCTOR.lastIndex = index + 1;

    const match = depth === 1 && /[\s;{}]/.test(char) ? CONSTRUCTOR.exec(text) : null;

    if (match !== null) {
      const paren = index + match[0].length;

      return text.slice(paren + 1, closingIndex(text, spans, paren));
    }
  }

  return undefined;
}

/** `@Injectable` classes in `text` whose constructor takes a parameter Angular has to resolve. */
export function constructorInjectedClasses(text: string): string[] {
  if (!/@(?:Injectable|Service)\b/.test(text)) {
    return [];
  }

  const spans = literalSpans(text);
  const found: string[] = [];

  for (const match of text.matchAll(DECORATOR)) {
    const argsEnd = closingIndex(text, spans, match.index + match[0].length - 1);
    const head = argsEnd === -1 || isInsideLiteral(spans, match.index) ? null : CLASS_HEAD.exec(text.slice(argsEnd + 1));

    if (head === null) {
      continue;
    }

    const bodyOpen = argsEnd + head[0].length;
    const parameters = constructorParameters(text, spans, bodyOpen, closingIndex(text, spans, bodyOpen));

    if (parameters !== undefined && splitParameters(parameters).some(needsTypeToken)) {
      found.push(String(head[1]));
    }
  }

  return found;
}

/** Runner configs that turn `fastCompile` on without leaving JIT mode. */
export function fastCompileConfigs(graph: SourceGraph): string[] {
  const keys = runnerConfigKeys(graph);
  const aot = new Set(keys.filter((key) => isKey(key, 'jit') && /^false\b/.test(key.value)).map((key) => key.file));
  const on = keys.filter((key) => isKey(key, 'fastCompile') && /^true\b/.test(key.value) && !aot.has(key.file));

  return [...new Set(on.map((key) => key.file))];
}

export function checkAnalogFastCompile(graph: SourceGraph): Finding[] {
  const configs = fastCompileConfigs(graph);
  const classes =
    configs.length === 0
      ? []
      : [...graph.texts]
          .filter(([file]) => !isRunnerConfig(file))
          .flatMap(([file, text]) => constructorInjectedClasses(text).map((name) => `${file}: ${name}`));

  if (classes.length === 0) {
    return [];
  }

  const details = classes.length > SHOWN ? [...classes.slice(0, SHOWN), `… and ${classes.length - SHOWN} more`] : classes;
  const counted = classes.length === 1 ? '1 `@Injectable` class takes' : `${classes.length} \`@Injectable\` classes take`;

  return configs.map((file) => ({
    check: 'analog-fast-compile-ctor-injection',
    severity: 'warning',
    file,
    message: `Analog \`fastCompile\` is on in JIT mode, the default under Vitest, and ${counted} constructor parameters known only by their type: the plugin emits no \`ctorParameters\` for \`@Injectable\`, so \`TestBed.inject\`, \`Injector.create\` and \`createWithAutoSpies\` throw NG0202 ("dependency at index N of the parameter list is invalid") for each of them.`,
    details,
    fix: 'Move those dependencies to `inject()` field initializers (`ng generate @angular/core:inject` migrates a project), or name each token with `@Inject(TaxService)` on the parameter, or turn `fastCompile` off until the plugin emits `ctorParameters` for `@Injectable`. Components, directives and pipes are not affected.',
  }));
}
