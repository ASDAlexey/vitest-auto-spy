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

export function checkForeignPragma(graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const [file, text] of graph.texts) {
    if (!isSpecFile(file)) {
      continue;
    }

    for (const pragma of findPragmas(text)) {
      findings.push({
        check: 'foreign-runner-pragma',
        severity: 'warning',
        file,
        message: `Carries a \`${pragma}\` docblock pragma, which this runner never reads.`,
        fix: 'Delete it, or express the same intent the way the runner supports — `@vitest-environment` for Vitest, or an `environmentMatchGlobs` entry in the config.',
      });
    }
  }

  return findings;
}
