/**
 * A foreign runner's docblock pragma left in a spec.
 *
 * Vitest 5 and Rstest read `@jest-environment <name>` and `@jest-environment-options` as they read
 * their own spelling, so those are only reported as info. `@jest-config`, and `@jest-environment`
 * with no name, look operative and are read by neither.
 */
import type { Finding } from '../report';
import { type SourceGraph, type TextPass, inOnePass, isSpecFile } from './graph';

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

function findingFor({ pragma, value, lines }: PragmaSite): Pick<Finding, 'fix' | 'message' | 'severity'> {
  const where = linesOf(lines);

  if (pragma === '@jest-config' || (pragma === '@jest-environment' && value === undefined)) {
    return {
      severity: 'warning',
      message: `${where}: \`${pragma}\` is a Jest docblock pragma, which Vitest never reads.`,
      fix: 'Delete it: the runner config decides this.',
    };
  }

  const spelled = value === undefined ? pragma : `${pragma} ${value}`;

  return {
    severity: 'info',
    message: `${where}: \`${spelled}\` is the Jest spelling of a Vitest pragma. Vitest reads it as well, so it works, but it reads as a leftover of a migration.`,
    fix: `Write \`${spelled.replace('@jest-', '@vitest-')}\` instead.`,
  };
}

export function checkForeignPragma(graph: SourceGraph): Finding[] {
  return inOnePass(graph, [foreignPragmaPass()]);
}

export function foreignPragmaPass(): TextPass {
  const findings: Finding[] = [];

  return {
    visit: (file, text): void => {
      if (isSpecFile(file)) {
        for (const site of pragmaSites(text)) {
          findings.push({ check: 'foreign-runner-pragma', file, ...findingFor(site) });
        }
      }
    },
    finish: (): Finding[] => findings,
  };
}
