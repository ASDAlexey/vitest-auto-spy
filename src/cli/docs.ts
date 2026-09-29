import { DOCS } from '../lib/message-link';

export const CLI_DOCS = `${DOCS}/utilities/cli`;
export const CODEMOD_DOCS = `${DOCS}/utilities/codemod`;
export const BARE_RUN_DOCS = `${CLI_DOCS}#when-a-bare-run-is-not-your-suite`;
export const NOTHING_TO_READ_DOCS = `${CLI_DOCS}#when-there-is-nothing-to-read`;
export const GATE_DOCS = `${CLI_DOCS}#the-gate`;
export const MIGRATION_TABLE_DOCS = `${DOCS}/migrating#mapping-table`;
export const JASMINE_MIGRATION_TABLE_DOCS = `${DOCS}/migrating-jasmine#the-auto-spies-api`;
export const COVERAGE_MATCHING_DOCS = `${DOCS}/guides/angular-unit-test-builder#coverage-matching-costs-more-than-coverage`;
export const VITEST_5_PERF_DOCS = `${DOCS}/core/performance#vitest-5-under-the-angular-unit-test-builder`;

/** Every check `doctor` can report. Each one has a heading of the same name on the CLI page. */
export const DOCTOR_CHECKS: readonly string[] = [
  'analog-behind-angular-build',
  'analog-fast-compile-ctor-injection',
  'analog-module-cache-inline-styles',
  'analog-testbed-laxer-than-builder',
  'angular-build-happy-dom',
  'angular-build-istanbul-module-cache',
  'angular-build-splitting-deprecated',
  'angular-build-splitting-off',
  'angular-cache-off-in-ci',
  'angular-testbed-split',
  'builder-setup-unreached',
  'coverage-all-removed',
  'coverage-include-misses-bundle',
  'coverage-include-recompiles-globs',
  'dead-runner-config',
  'foreign-runner-pragma',
  'fs-module-cache-not-persisted',
  'helper-from-wrong-entry',
  'jasmine-era-project',
  'mock-registry-capture-drops-sentinel',
  'mock-reset-config-unread',
  'module-mock-leak',
  'no-agent-instructions',
  'no-unawaited-helper',
  'orphan-runner-file',
  'runner-dom-differs-from-builder',
  'scan-cap-reached',
  'shared-env-without-restore',
  'spec-exports-fixture',
  'spec-imported-by-non-spec',
  'tsconfig-file-missing',
  'tsconfig-glob-matches-nothing',
  'vitest-5-available',
  'vitest-5-bundled-package',
  'vitest-5-clear-mocks',
  'vitest-5-deprecated',
  'vitest-5-empty-throw-message',
  'vitest-5-extends-restated',
  'vitest-5-matchers-augmentation',
  'vitest-5-nested-hoist',
  'vitest-5-project-own-server',
  'vitest-5-prune-mock-registry',
  'vitest-5-removed',
  'vitest-5-report-path',
  'vitest-5-vite-peer',
  'vitest-entry-without-vitest',
];

const PERF_SECTIONS: Readonly<Record<string, string>> = {
  'perf-environment': 'perf-environment',
  'perf-environment-node-candidate': 'perf-environment',
  'perf-environment-engine': 'perf-environment-engine',
  'perf-import': 'perf-import',
  'perf-import-barrel': 'perf-import',
  'perf-isolation': 'perf-isolation',
  'perf-isolation-ab': 'perf-isolation',
  'perf-pool': 'perf-pool',
  'perf-coverage': 'perf-coverage',
  'perf-hung': 'perf-hung',
  'perf-workers': 'perf-workers',
  'perf-flaky': 'perf-flaky',
  'perf-heap': 'perf-heap',
  'perf-transform': 'perf-transform',
  'perf-long-pole': 'perf-long-pole',
  'perf-vitest-doctor': 'perf-vitest-doctor',
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
