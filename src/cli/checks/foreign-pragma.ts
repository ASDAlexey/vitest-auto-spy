/**
 * A foreign runner's docblock pragma left in a spec.
 *
 * Vitest does not read `@jest-environment`; the environment comes from the config. The comment
 * therefore looks operative, is not, and nothing ever contradicts it — a spec annotated
 * `@jest-environment node` runs in whatever the config says, jsdom included.
 */
import type { Finding } from '../report';
import type { SourceGraph } from './graph';
import { isSpecFile } from './graph';

const PRAGMA = /@jest-(?:environment-options|environment|config)\b/g;

/** The distinct foreign pragmas a source text carries, longest form first. */
export function findPragmas(source: string): string[] {
  return [...new Set([...source.matchAll(PRAGMA)].map((match) => match[0]))];
}

const ENVIRONMENT_VALUE = /^[\t ]+([\w./@-]+)/;

interface PragmaSite {
  readonly pragma: string;
  readonly value: string | undefined;
  readonly lines: number[];
}

/** Each distinct pragma with the environment it names, if any, and the lines it is on. */
export function pragmaSites(source: string): PragmaSite[] {
  const sites = new Map<string, PragmaSite>();

  for (const match of source.matchAll(PRAGMA)) {
    const pragma = match[0];
    const value = pragma === '@jest-environment' ? ENVIRONMENT_VALUE.exec(source.slice(match.index + pragma.length))?.[1] : undefined;
    const key = `${pragma} ${value ?? ''}`;
    const site = sites.get(key) ?? { pragma, value, lines: [] };

    site.lines.push(source.slice(0, match.index).split('\n').length);
    sites.set(key, site);
  }

  return [...sites.values()];
}

function linesOf(lines: readonly number[]): string {
  return lines.length === 1 ? `Line ${lines[0]}` : `Lines ${lines.join(', ')}`;
}

export function checkForeignPragma(graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const [file, text] of graph.texts) {
    if (!isSpecFile(file)) {
      continue;
    }

    for (const { pragma, value, lines } of pragmaSites(text)) {
      findings.push({
        check: 'foreign-runner-pragma',
        severity: 'warning',
        file,
        message: `${linesOf(lines)}: \`${pragma}${value === undefined ? '' : ` ${value}`}\` is a Jest docblock pragma, which this runner never reads.`,
        fix: value === undefined ? 'Delete it: the runner config decides this.' : `Write \`@vitest-environment ${value}\` instead.`,
      });
    }
  }

  return findings;
}
