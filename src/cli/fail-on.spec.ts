import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { failsOn, severityNamed } from './fail-on';
import { writeTextFile } from './fs-scan';
import { runCli } from './main';
import { renderPerf } from './perf';
import type { PerfRun } from './perf-data';
import { file, recorder, run } from './perf-fixtures';
import type { PerfSource } from './perf-run';
import { readProfile } from './profile';
import type { Finding, Severity } from './report';
import { createTempRepo, removeTempRepos } from './temp-repo';

beforeEach(() => {
  vi.stubEnv('NO_COLOR', '1');
  vi.stubEnv('CI', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const finding = (severity: Severity): Finding => ({ check: 'x', severity, message: 'm', fix: 'f' });

describe('severityNamed', () => {
  it('reads the three severities, warn for warning, in any case and padding', () => {
    expect(['error', ' WARN ', 'warning', 'Info'].map(severityNamed)).toEqual(['error', 'warning', 'warning', 'info']);
    expect(severityNamed('notes')).toBeUndefined();
    expect(severityNamed(undefined)).toBeUndefined();
  });
});

describe('failsOn', () => {
  it('fails on a finding at the threshold or louder, never on a quieter one', () => {
    expect(failsOn([finding('info')], 'warning')).toBe(false);
    expect(failsOn([finding('info')], 'info')).toBe(true);
    expect(failsOn([finding('warning')], 'error')).toBe(false);
    expect(failsOn([finding('error')], 'error')).toBe(true);
    expect(failsOn([], 'info')).toBe(false);
  });
});

describe('doctor --fail-on', () => {
  // One note: no instruction file names the package.
  const noteOnly = (): string => createTempRepo({ 'package.json': '{}' });

  it('keeps a note from failing the run by default, and fails on it under --fail-on info', () => {
    const root = noteOnly();

    expect(runCli(['doctor', '--cwd', root], recorder())).toBe(0);
    expect(runCli(['doctor', '--cwd', root, '--fail-on', 'info'], recorder())).toBe(1);
    expect(runCli(['doctor', '--cwd', root, '--fail-on=info', '--ignore', 'no-agent-instructions'], recorder())).toBe(0);
  });

  it('lets an error alone fail the run under --fail-on error, and carries the code into --format json', () => {
    const root = createTempRepo({ 'package.json': '{}', 'tsconfig.json': JSON.stringify({ include: ['src/polyfills.ts'] }) });
    const io = recorder();

    expect(runCli(['doctor', '--cwd', root, '--fail-on', 'error', '--format', 'json'], io)).toBe(1);
    expect(JSON.parse(io.stdout.join(''))).toMatchObject({ exitCode: 1 });
  });

  it('refuses a word that is not a severity, before running anything', () => {
    const io = recorder();

    expect(runCli(['doctor', '--cwd', noteOnly(), '--fail-on', 'notes'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown --fail-on value: notes. Accepted values: error, warning, info. Nothing ran.');
  });
});

describe('perf --fail-on', () => {
  const flakyRun = (root: string): PerfRun =>
    run({ root, wall: 100, files: [file(join(root, 'src/a.spec.ts'), { tests: 10, flaky: ['a > retried'] })] });
  const flakySource = (root: string): PerfSource => ({ ok: true, runFailed: false, run: flakyRun(root) });

  it('exits 1 on a finding at the threshold, and 0 without the flag or under a louder one', () => {
    const root = createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }), 'src/a.spec.ts': '' });
    const profile = readProfile(root);

    expect(renderPerf(flakySource(root), profile, recorder())).toBe(0);
    expect(renderPerf(flakySource(root), profile, recorder(), { failOn: 'error' })).toBe(0);
    expect(renderPerf(flakySource(root), profile, recorder(), { failOn: 'warning' })).toBe(1);
  });

  it('takes the flag from the command line', () => {
    const root = createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }), 'src/a.spec.ts': '' });
    const report = join(root, 'perf.json');

    writeTextFile(report, JSON.stringify(flakyRun(root)));

    expect(runCli(['perf', '--cwd', root, '--json', report], recorder())).toBe(0);
    expect(runCli(['perf', '--cwd', root, '--json', report, '--fail-on', 'warning'], recorder())).toBe(1);
  });
});
