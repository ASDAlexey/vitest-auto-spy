/**
 * Configuration for a runner that is no longer installed, and the files only it referenced.
 *
 * After a migration the old config keeps sitting in the repository looking authoritative. Nothing
 * reads it, so nothing complains. One `setupFiles` entry found this way had been empty since
 * before the migration: a year as a setting that configured nothing.
 */
import { join } from 'node:path';

import { captures, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import type { SourceGraph } from './graph';

interface ConfigKind {
  readonly pattern: RegExp;
  readonly runner: string;
  /** Packages that prove the runner is still in use. */
  readonly packages: readonly string[];
  readonly binary: RegExp;
}

const CONFIG_KINDS: readonly ConfigKind[] = [
  {
    pattern: /(^|\/)jest[.-](?:config|preset|setup)\.[cm]?[jt]sx?$|(^|\/)jest\.config\.json$|(^|\/)setup-jest\.[cm]?[jt]sx?$/,
    runner: 'jest',
    packages: ['jest', 'ts-jest', 'jest-preset-angular', '@jest/globals', 'babel-jest', '@types/jest'],
    binary: /\bjest\b/,
  },
  {
    pattern: /(^|\/)karma\.conf\.[cm]?[jt]s$/,
    runner: 'karma',
    packages: ['karma', 'karma-jasmine', '@angular-devkit/build-angular'],
    binary: /\bkarma\b/,
  },
];

function isRunnerInstalled(kind: ConfigKind, profile: Profile): boolean {
  const inScripts = Object.values(profile.scripts).some((script) => kind.binary.test(script));

  return inScripts || kind.packages.some((name) => profile.dependencies[name] !== undefined);
}

/** Quoted paths a config file names — `<rootDir>/` prefixes stripped, bare specifiers dropped. */
export function referencedPaths(configText: string): string[] {
  const quoted = captures(configText, /["']([^"']+)["']/g);

  return [
    ...new Set(
      quoted
        .filter((value) => value.includes('/') || value.includes('.'))
        .map((value) => value.replace(/^<rootDir>\//, '').replace(/^\.\//, ''))
        .filter((value) => !value.startsWith('@') && !value.startsWith('<') && /\.[cm]?[jt]sx?$/.test(value)),
    ),
  ];
}

function orphanFindings(config: string, text: string, profile: Profile, graph: SourceGraph): Finding[] {
  const live = new Set(profile.setupFiles.map((entry) => entry.replace(/^\.\//, '')));

  return referencedPaths(text)
    .filter((path) => profile.files.includes(path) && !live.has(path) && (graph.importedBy.get(path) ?? []).length === 0)
    .map((path) => ({
      check: 'orphan-runner-file',
      severity: 'warning',
      file: path,
      message: `Referenced only by ${config}, which configures a runner this repository no longer installs.`,
      fix: 'Nothing loads this file. Delete it, or move what it does into the live runner’s setup file.',
    }));
}

export function checkOrphanRunnerConfig(profile: Profile, graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const kind of CONFIG_KINDS) {
    if (isRunnerInstalled(kind, profile)) {
      continue;
    }

    for (const config of profile.files.filter((file) => kind.pattern.test(file))) {
      const text = readTextFile(join(profile.cwd, config)) ?? '';

      findings.push({
        check: 'dead-runner-config',
        severity: 'warning',
        file: config,
        message: `Configures ${kind.runner}, which is not installed in this repository.`,
        fix: `Delete it. While it stays, every reader — human or agent — treats it as the source of truth for how tests run.`,
      });
      findings.push(...orphanFindings(config, text, profile, graph));
    }
  }

  return findings;
}
