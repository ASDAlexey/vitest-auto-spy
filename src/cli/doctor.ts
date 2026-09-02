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
import { checkCoverageConfig } from './checks/coverage-config';
import { checkForeignPragma } from './checks/foreign-pragma';
import { buildGraph } from './checks/graph';
import { checkJasmineEra } from './checks/jasmine-era';
import { checkOrphanRunnerConfig } from './checks/orphan-runner-config';
import { checkSpecImports } from './checks/spec-imports';
import { checkTsconfigGlobs } from './checks/tsconfig-globs';
import type { Profile } from './profile';
import type { Finding } from './report';

export function runDoctor(profile: Profile): Finding[] {
  const graph = buildGraph(profile);

  return [
    ...checkTsconfigGlobs(profile),
    ...checkSpecImports(graph),
    ...checkForeignPragma(graph),
    ...checkOrphanRunnerConfig(profile, graph),
    ...checkAngularBuild(profile),
    ...checkCoverageConfig(profile),
    ...checkAgentInstructions(profile),
    ...checkJasmineEra(profile),
  ];
}
