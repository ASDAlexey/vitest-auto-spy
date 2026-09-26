/**
 * `doctor` — a repository-level pass over defects that never fail anything.
 *
 * What every check here has in common is that **nothing consumes the result**: the suite is green,
 * `tsc --noEmit` reports zero errors, and the only reader of a stale config after the old runner
 * is gone is somebody's editor. A per-file linter cannot see most of them, because the evidence is
 * spread across files.
 */
import { checkAgentInstructions } from './checks/agent-instructions';
import { checkAngularBuild } from './checks/angular-build';
import { checkBuilderSetup } from './checks/builder-setup';
import { checkCoverageConfig } from './checks/coverage-config';
import { checkForeignPragma } from './checks/foreign-pragma';
import { buildGraph, isSpecFile } from './checks/graph';
import { checkHelperEntry } from './checks/helper-entry';
import { checkJasmineEra } from './checks/jasmine-era';
import { checkModuleMockLeak } from './checks/module-mock-leak';
import { checkOrphanRunnerConfig } from './checks/orphan-runner-config';
import { checkScanCap } from './checks/scan-cap';
import { checkSpecImports } from './checks/spec-imports';
import { checkTsconfigGlobs } from './checks/tsconfig-globs';
import { checkUnawaitedHelper } from './checks/unawaited-helper';
import { checkVitest5ClearMocks, checkVitest5Removed } from './checks/vitest-5';
import { checkModuleCachePersisted, checkVitest5Available } from './checks/vitest-5-upgrade';
import type { Profile } from './profile';
import { type Finding, REPORT_SCHEMA, type Tally, findingJson, sortFindings, tallyOf } from './report';
import { ownVersion } from './self';

export function runDoctor(profile: Profile): Finding[] {
  const graph = buildGraph(profile);

  return [
    ...checkScanCap(profile),
    ...checkTsconfigGlobs(profile),
    ...checkSpecImports(graph),
    ...checkForeignPragma(graph),
    ...checkOrphanRunnerConfig(profile, graph),
    ...checkAngularBuild(profile),
    ...checkBuilderSetup(profile),
    ...checkCoverageConfig(profile),
    ...checkAgentInstructions(profile),
    ...checkJasmineEra(profile),
    ...checkHelperEntry(profile, graph),
    ...checkUnawaitedHelper(profile, graph),
    ...checkModuleMockLeak(profile, graph),
    ...checkVitest5Removed(profile, graph),
    ...checkVitest5ClearMocks(profile, graph),
    ...checkVitest5Available(profile),
    ...checkModuleCachePersisted(profile, graph),
  ];
}

/** The `--format json` document, which `--format markdown` renders too. */
export interface DoctorDocument {
  readonly schema: number;
  readonly command: 'doctor';
  readonly version: string;
  readonly cwd: string;
  readonly runner: Profile['runner'];
  readonly entry: string;
  readonly scanned: { readonly files: number; readonly specFiles: number; readonly truncated: boolean };
  readonly exitCode: number;
  readonly tally: Tally;
  readonly findings: readonly Finding[];
}

export function doctorDocument(profile: Profile, findings: readonly Finding[], exitCode: number): DoctorDocument {
  return {
    schema: REPORT_SCHEMA,
    command: 'doctor',
    version: ownVersion(),
    cwd: profile.cwd,
    runner: profile.runner,
    entry: profile.entry,
    scanned: { files: profile.files.length, specFiles: profile.files.filter(isSpecFile).length, truncated: profile.filesTruncated },
    exitCode,
    tally: tallyOf(findings),
    findings: sortFindings(findings).map(findingJson),
  };
}
