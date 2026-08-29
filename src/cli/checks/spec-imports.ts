/**
 * A spec that somebody imports.
 *
 * Two shapes of the same defect. A **non-spec** file importing a spec is the worse one: under a
 * shared environment the import is a cycle, and the spec loses its own suite. A **spec importing
 * another spec** is the fixture-export case — the imported file's suites are collected twice and
 * its lifecycle hooks run in a foreign file's context.
 *
 * A per-file linter cannot see either: it catches the export, but not "and three files import it".
 */
import type { Finding } from '../report';
import type { SourceGraph } from './graph';
import { isSpecFile } from './graph';

function findingFor(importer: string, imported: string): Finding {
  if (isSpecFile(importer)) {
    return {
      check: 'spec-exports-fixture',
      severity: 'warning',
      file: importer,
      message: `Imports the spec ${imported}, so that file's suites and hooks run inside this one too.`,
      fix: 'Move the shared fixture into a non-spec file (`*.fixture.ts`, `*.testing.ts`) and import that from both specs.',
    };
  }

  return {
    check: 'spec-imported-by-non-spec',
    severity: 'error',
    file: importer,
    message: `A non-spec file imports the spec ${imported}.`,
    fix: 'Under a shared test environment this is a cycle and the spec loses its own suite. Extract what is shared into a non-spec module.',
  };
}

export function checkSpecImports(graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const [importer, imported] of graph.imports) {
    for (const target of imported) {
      if (isSpecFile(target)) {
        findings.push(findingFor(importer, target));
      }
    }
  }

  return findings;
}
