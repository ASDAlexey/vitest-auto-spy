import { DOCS } from '../lib/message-link';

export const CLI_DOCS = `${DOCS}/utilities/cli`;
export const CODEMOD_DOCS = `${DOCS}/utilities/codemod`;
export const BARE_RUN_DOCS = `${CLI_DOCS}#when-a-bare-run-is-not-your-suite`;
export const NOTHING_TO_READ_DOCS = `${CLI_DOCS}#when-there-is-nothing-to-read`;
export const GATE_DOCS = `${CLI_DOCS}#the-gate`;
export const MIGRATION_TABLE_DOCS = `${DOCS}/migrating#mapping-table`;
export const JASMINE_MIGRATION_TABLE_DOCS = `${DOCS}/migrating-jasmine#the-auto-spies-api`;
export const COVERAGE_MATCHING_DOCS = `${DOCS}/adapters/angular#coverage-matching-costs-more-than-coverage`;

/** Every check `doctor` can report. Each one has a heading of the same name on the CLI page. */
export const DOCTOR_CHECKS: readonly string[] = [
  'angular-build-splitting-off',
  'builder-setup-unreached',
  'coverage-all-removed',
  'coverage-include-misses-bundle',
  'coverage-include-recompiles-globs',
  'dead-runner-config',
  'foreign-runner-pragma',
  'helper-from-wrong-entry',
  'jasmine-era-project',
  'module-mock-leak',
  'no-agent-instructions',
  'no-unawaited-helper',
  'orphan-runner-file',
  'scan-cap-reached',
  'spec-exports-fixture',
  'spec-imported-by-non-spec',
  'tsconfig-file-missing',
  'tsconfig-glob-matches-nothing',
];

const PERF_SECTIONS: Readonly<Record<string, string>> = {
  'perf-environment': 'perf-environment',
  'perf-environment-node-candidate': 'perf-environment',
  'perf-environment-engine': 'perf-environment-engine',
  'perf-import': 'perf-import',
  'perf-import-barrel': 'perf-import',
  'perf-isolation': 'perf-isolation',
  'perf-workers': 'perf-workers',
  'perf-flaky': 'perf-flaky',
  'perf-heap': 'perf-heap',
};

const CODEMOD_SECTIONS: Readonly<Record<string, string>> = {
  'ambiguous-entry-point': `${CODEMOD_DOCS}#the-entry-point-table-is-generated-not-written-down`,
  'codemod-broke-syntax': `${CODEMOD_DOCS}#the-result-is-parsed-before-it-is-written`,
  'jest-mock-type-arguments': `${CODEMOD_DOCS}#the-trap-jest-puts-the-return-type-first`,
  'no-entry-table': `${CODEMOD_DOCS}#the-entry-point-table-is-generated-not-written-down`,
  'unmapped-legacy-export': MIGRATION_TABLE_DOCS,
};

/** The docs section about a finding, or `undefined` for a check no section describes. */
export function docsFor(check: string): string | undefined {
  if (DOCTOR_CHECKS.includes(check)) {
    return `${CLI_DOCS}#${check}`;
  }

  const perf = PERF_SECTIONS[check];

  if (perf !== undefined) {
    return `${CLI_DOCS}#${perf}`;
  }

  if (check.startsWith('perf-gate-')) {
    return GATE_DOCS;
  }

  return check.startsWith('residue/') ? `${CODEMOD_DOCS}#verifying-by-matching-not-by-diffing` : CODEMOD_SECTIONS[check];
}
