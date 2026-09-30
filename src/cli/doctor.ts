/**
 * `doctor` — a repository-level pass over defects that never fail anything.
 *
 * What every check here has in common is that **nothing consumes the result**: the suite is green,
 * `tsc --noEmit` reports zero errors, and the only reader of a stale config after the old runner
 * is gone is somebody's editor. A per-file linter cannot see most of them, because the evidence is
 * spread across files.
 */
import { checkAgentInstructions } from './checks/agent-instructions';
import { analogFastCompilePass } from './checks/analog-fast-compile';
import { analogModuleCachePass } from './checks/analog-module-cache';
import { checkAngularBuild } from './checks/angular-build';
import { checkAngularCacheInCi } from './checks/angular-cache-ci';
import { angularTestBedSplitPass } from './checks/angular-testbed-split';
import { checkBuilderSetup } from './checks/builder-setup';
import { checkBuilderSpeed } from './checks/builder-speed';
import { checkCoverageConfig } from './checks/coverage-config';
import { foreignPragmaPass } from './checks/foreign-pragma';
import { buildGraph, inOnePass, isSpecFile } from './checks/graph';
import { helperEntryPass } from './checks/helper-entry';
import { checkJasmineEra } from './checks/jasmine-era';
import { mockRegistryCapturePass } from './checks/mock-registry-capture';
import { mockResetConfigPass } from './checks/mock-reset-config';
import { moduleMockLeakPass } from './checks/module-mock-leak';
import { checkOrphanRunnerConfig } from './checks/orphan-runner-config';
import { analogTestBedPass, checkRunnerDom } from './checks/runner-parity';
import { checkScanCap } from './checks/scan-cap';
import { sharedEnvRestorePass } from './checks/shared-env-restore';
import { checkSpecImports } from './checks/spec-imports';
import { checkTsconfigGlobs } from './checks/tsconfig-globs';
import { checkTsconfigMockFiles } from './checks/tsconfig-mock-files';
import { unawaitedHelperPass } from './checks/unawaited-helper';
import { checkVitest5ClearMocks, vitest5RemovedPass } from './checks/vitest-5';
import { vitest5TrapsPass } from './checks/vitest-5-traps';
import { checkModuleCachePersisted, checkVitest5Available } from './checks/vitest-5-upgrade';
import { vitestLessEntryPass } from './checks/vitest-less-entry';
import type { Profile } from './profile';
import { type Finding, REPORT_SCHEMA, type Tally, findingJson, sortFindings, tallyOf } from './report';
import { ownVersion } from './self';

export function runDoctor(profile: Profile): Finding[] {
  const graph = buildGraph(profile);

  // One read of each text for every check that walks them; see `TextPass`.
  return inOnePass(graph, [
    checkScanCap(profile),
    checkTsconfigGlobs(profile),
    checkTsconfigMockFiles(profile),
    checkSpecImports(graph),
    foreignPragmaPass(),
    checkOrphanRunnerConfig(profile, graph),
    checkAngularBuild(profile),
    checkBuilderSetup(profile),
    checkBuilderSpeed(profile),
    checkRunnerDom(profile, graph),
    analogTestBedPass(profile),
    checkCoverageConfig(profile),
    checkAgentInstructions(profile),
    checkJasmineEra(profile),
    helperEntryPass(profile),
    unawaitedHelperPass(profile),
    moduleMockLeakPass(profile),
    mockResetConfigPass(profile),
    vitest5RemovedPass(profile, graph),
    checkVitest5ClearMocks(profile, graph),
    checkVitest5Available(profile),
    checkModuleCachePersisted(profile, graph),
    analogModuleCachePass(profile, graph),
    analogFastCompilePass(graph),
    vitest5TrapsPass(profile, graph),
    checkAngularCacheInCi(profile),
    sharedEnvRestorePass(profile, graph),
    mockRegistryCapturePass(profile),
    angularTestBedSplitPass(profile, graph),
    vitestLessEntryPass(profile),
  ]);
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
