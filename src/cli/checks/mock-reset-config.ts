/**
 * `no-redundant-mock-reset` pointed at a runner config it cannot read.
 *
 * The rule reads the file `configFile` names as text, for literal flags. A config whose default
 * export is a factory call or a `mergeConfig` sets them in another module, so the rule reads "no
 * flags" and decides on the runner's defaults, and nothing at lint time says so. A relative
 * `configFile` resolves against the repository root, the directory ESLint usually runs in.
 */
import { resolve } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import type { SourceGraph } from './graph';
import { type Span, isInsideLiteral, literalSpans } from './literals';

const RULE_KEY = /["'][\w/@-]*\/no-redundant-mock-reset["']\s*:\s*\[/g;
const CONFIG_FILE = /\bconfigFile\s*:\s*(["'`])([^"'`]+)\1/g;
const OPTION_FLAG = /\b(?:clearMocks|mockReset|restoreMocks)\s*:/g;
const ANY_FLAG = /\b(?:clearMocks|mockReset|restoreMocks)\b/;
const DEFAULT_CALL = /\b(?:export\s+default|module\.exports\s*=)\s*([$A-Z_a-z][\w$.]*)\s*(?:<[^>]*>)?\s*\(/;
const READABLE = new Set(['defineConfig', 'defineProject']);

/** The index just past the `]` closing the array opened at `open`, with strings and comments skipped. */
export function closingBracket(text: string, spans: readonly Span[], open: number): number {
  let depth = 0;

  for (let index = open; index < text.length; index += 1) {
    const span = spans.find((candidate) => candidate.start === index);

    if (span !== undefined) {
      index = span.end - 1;

      continue;
    }

    const char = text.charAt(index);

    depth += char === '[' ? 1 : char === ']' ? -1 : 0;

    if (depth === 0) {
      return index + 1;
    }
  }

  return text.length;
}

function inCode(spans: readonly Span[], match: RegExpExecArray, base: number): boolean {
  return !isInsideLiteral(spans, base + match.index);
}

/** The `configFile` of each rule entry that writes no flag beside it. */
export function unflaggedConfigFiles(text: string): string[] {
  const spans = literalSpans(text);
  const found: string[] = [];

  for (const match of text.matchAll(RULE_KEY)) {
    if (spans.find((span) => span.start <= match.index && match.index < span.end)?.start !== match.index) {
      continue;
    }

    const open = match.index + match[0].length - 1;
    const options = text.slice(open, closingBracket(text, spans, open));
    const configFile = [...options.matchAll(CONFIG_FILE)].find((entry) => inCode(spans, entry, open))?.[2];
    const flagged = [...options.matchAll(OPTION_FLAG)].some((entry) => inCode(spans, entry, open));

    if (configFile !== undefined && !flagged) {
      found.push(configFile);
    }
  }

  return found;
}

/** The callee of a default export the rule cannot read through, or `undefined` when it reads the text as written. */
export function unreadableCallee(configText: string): string | undefined {
  if (ANY_FLAG.test(configText)) {
    return undefined;
  }

  const callee = DEFAULT_CALL.exec(configText)?.[1];

  return callee === undefined || READABLE.has(callee) ? undefined : callee;
}

export function checkMockResetConfig(profile: Profile, graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const [file, text] of graph.texts) {
    for (const configFile of unflaggedConfigFiles(text)) {
      const callee = unreadableCallee(readTextFile(resolve(profile.cwd, configFile)) ?? '');

      if (callee !== undefined) {
        findings.push({
          check: 'mock-reset-config-unread',
          severity: 'info',
          file,
          message: `\`no-redundant-mock-reset\` reads \`${configFile}\`, whose default export is a \`${callee}(…)\` call: the rule reads the file as text, finds no \`clearMocks\` / \`mockReset\` / \`restoreMocks\`, and decides on the runner's defaults instead of what \`${callee}\` sets.`,
          fix: 'Write the flags that config ends up with beside `configFile` in the rule options, e.g. `{ configFile, clearMocks: true }`; a flag written there wins over the file.',
        });
      }
    }
  }

  return findings;
}
