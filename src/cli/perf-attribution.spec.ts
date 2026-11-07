import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeTextFile } from './fs-scan';
import type { Capture, Captured } from './ng-test';
import type { Attribution, DebtReference, GateScope } from './perf-attribution';
import { DEBT_SHARE, debtReference, describeScope, excuseOf, gateScope, verdictPolicy } from './perf-attribution';
import { PERF_BASELINE_VERSION, formatBaseline } from './perf-baseline';
import { file, ordinary, run } from './perf-fixtures';
import type { GateCandidate } from './perf-gate';
import { PERF_HISTORY_VERSION } from './perf-history';
import type { HistoryEntry } from './perf-history';
import type { Profile } from './profile';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const WORKSPACE = {
  'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
  'vitest.config.ts': "export default { test: { setupFiles: ['./src/test-setup.ts'] } };\n",
  'src/test-setup.ts': "import './testing/global-stub';\n",
  'src/testing/global-stub.ts': 'export const stub = 1;\n',
  'src/app/user.service.ts': 'export class UserService {}\n',
  'src/app/user.service.spec.ts': "import { UserService } from './user.service';\n",
  'src/app/clock.spec.ts': "describe('clock', () => {});\n",
};

interface FakeGit {
  readonly capture: Capture;
  readonly calls: string[][];
}

const ok = (stdout: string): Captured => ({ status: 0, stdout, stderr: '' });

const failed = (stderr: string): Captured => ({ status: 128, stdout: '', stderr });

function fakeGit(answers: { readonly mergeBase?: Captured; readonly diff?: Captured; readonly untracked?: Captured }): FakeGit {
  const calls: string[][] = [];
  const capture: Capture = (_command, args) => {
    calls.push([...args]);

    if (args[0] === 'merge-base') {
      return answers.mergeBase ?? ok('base-sha\n');
    }

    return args[0] === 'diff' ? (answers.diff ?? ok('')) : (answers.untracked ?? ok(''));
  };

  return { capture, calls };
}

function scopeOf(
  ref: string,
  git: FakeGit,
  files: Readonly<Record<string, string>> = WORKSPACE,
  over: Partial<Profile> = {},
): { readonly scope: GateScope | undefined; readonly errors: string[] } {
  const errors: string[] = [];
  const scope = gateScope({ ...readProfile(createTempRepo(files)), ...over }, ref, git.capture, (line) => errors.push(line));

  return { scope, errors };
}

const diffRef = (git: FakeGit): string | undefined => git.calls.find((args) => args[0] === 'diff')?.at(-1);

describe('gateScope', () => {
  it('diffs against HEAD itself, without asking for a merge base', () => {
    const git = fakeGit({ diff: ok('src/app/user.service.ts\0') });
    const { scope } = scopeOf('HEAD', git);

    expect(git.calls.some((args) => args[0] === 'merge-base')).toBe(false);
    expect(diffRef(git)).toBe('HEAD');
    expect(scope).toEqual({ ref: 'HEAD', all: false, changed: 1, specs: new Set(['src/app/user.service.spec.ts']) });
  });

  it('diffs against the merge base of the ref and HEAD', () => {
    const git = fakeGit({ mergeBase: ok('abc123\n') });

    scopeOf('origin/main', git);

    expect(git.calls[0]).toEqual(['merge-base', 'origin/main', 'HEAD']);
    expect(diffRef(git)).toBe('abc123');
  });

  it('falls back to the ref when the merge base fails or prints nothing', () => {
    const failing = fakeGit({ mergeBase: failed('no merge base') });
    const empty = fakeGit({ mergeBase: ok('  \n') });

    scopeOf('origin/main', failing);
    scopeOf('origin/main', empty);

    expect(diffRef(failing)).toBe('origin/main');
    expect(diffRef(empty)).toBe('origin/main');
  });

  it('answers undefined and warns when git cannot diff, so every file is judged', () => {
    const { scope, errors } = scopeOf('origin/main', fakeGit({ diff: failed('fatal: bad revision') }));

    expect(scope).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      'warning  --changed origin/main: `git diff --name-only --diff-filter=ACMR --relative base-sha` failed: fatal: bad revision',
    );
    expect(errors[0]).toContain('The gate judges every file instead.');
  });

  it('judges every file when a config changed', () => {
    const { scope } = scopeOf('HEAD', fakeGit({ diff: ok('package-lock.json\0') }));

    expect(scope).toEqual({ ref: 'HEAD', all: true, reason: 'package-lock.json changed' });
  });

  it('judges every file when the change reaches a setup file named with a leading ./', () => {
    const { scope } = scopeOf('HEAD', fakeGit({ diff: ok('src/testing/global-stub.ts\0') }));

    expect(scope).toMatchObject({
      all: true,
      reason: 'src/testing/global-stub.ts changed, and every spec loads it through the setup files',
    });
  });

  it('counts tracked and untracked changes once each, normalized, and keeps the specs they reach', () => {
    const git = fakeGit({
      diff: ok('src/app/./user.service.ts\0README.md\0'),
      untracked: ok('src/app/clock.spec.ts\0README.md\0'),
    });
    const { scope, errors } = scopeOf('HEAD', git);

    expect(errors).toEqual([]);
    expect(scope).toEqual({
      ref: 'HEAD',
      all: false,
      changed: 3,
      specs: new Set(['src/app/clock.spec.ts', 'src/app/user.service.spec.ts']),
    });
  });

  it('reads a path git would quote, such as one with non-ASCII characters, as written', () => {
    const git = fakeGit({ diff: ok('src/данные/service.ts\0') });
    const { scope } = scopeOf('HEAD', git, {
      ...WORKSPACE,
      'src/данные/service.ts': 'export class Service {}\n',
      'src/данные/service.spec.ts': "import { Service } from './service';\n",
    });

    expect(git.calls.find((args) => args[0] === 'diff')).toContain('-z');
    expect(scope).toEqual({ ref: 'HEAD', all: false, changed: 1, specs: new Set(['src/данные/service.spec.ts']) });
  });

  it('judges every file when the change reaches a setup file or providers file declared in angular.json', () => {
    const angular = {
      ...WORKSPACE,
      'angular.json': JSON.stringify({
        projects: {
          app: {
            root: '',
            architect: {
              test: {
                builder: '@angular/build:unit-test',
                options: { setupFiles: ['src/angular-setup.ts'], providersFile: 'src/test-providers.ts' },
              },
            },
          },
        },
      }),
      'src/angular-setup.ts': 'export const setup = 1;\n',
      'src/test-providers.ts': 'export default [];\n',
    };

    expect(scopeOf('HEAD', fakeGit({ diff: ok('src/angular-setup.ts\0') }), angular).scope).toMatchObject({ all: true });
    expect(scopeOf('HEAD', fakeGit({ diff: ok('src/test-providers.ts\0') }), angular).scope).toMatchObject({ all: true });
  });

  it('judges every file, with a warning, when the scan stopped at its file limit', () => {
    const { scope, errors } = scopeOf('HEAD', fakeGit({ diff: ok('src/app/user.service.ts\0') }), WORKSPACE, { filesTruncated: true });

    expect(scope).toEqual({ ref: 'HEAD', all: true, reason: 'the import graph is incomplete' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('the scan stopped at its file limit');
  });
});

describe('describeScope', () => {
  it('names the reason every file is judged', () => {
    expect(describeScope({ ref: 'main', all: true, reason: 'angular.json changed' })).toBe(
      'perf gate: every file is judged — against main, angular.json changed.',
    );
  });

  it('says that nothing changed, so nothing can fail', () => {
    expect(describeScope({ ref: 'main', all: false, changed: 0, specs: new Set() })).toBe(
      "perf gate: nothing changed against main, so no finding is this change's — each one is reported, none fails the run.",
    );
  });

  it('counts the spec files and the changed files, in the singular', () => {
    expect(describeScope({ ref: 'main', all: false, changed: 1, specs: new Set(['a.spec.ts']) })).toBe(
      'perf gate: judging the 1 spec file that 1 changed file reaches against main; a finding anywhere else is reported, not failed.',
    );
  });

  it('counts the spec files and the changed files, in the plural', () => {
    expect(describeScope({ ref: 'main', all: false, changed: 3, specs: new Set(['a.spec.ts', 'b.spec.ts']) })).toBe(
      'perf gate: judging the 2 spec files that 3 changed files reach against main; a finding anywhere else is reported, not failed.',
    );
  });
});

const historyLine = (files: Readonly<Record<string, number>>, tests?: HistoryEntry['tests']): string =>
  JSON.stringify({
    version: PERF_HISTORY_VERSION,
    at: '2026-09-01T00:00:00.000Z',
    median: 100,
    files,
    ...(tests === undefined ? {} : { tests }),
  });

describe('debtReference', () => {
  it('reads a committed baseline as recorded, with its test bodies', () => {
    const path = join(createTempRepo({}), 'perf-baseline.json');

    writeTextFile(
      path,
      formatBaseline({ version: PERF_BASELINE_VERSION, median: 100, files: { 'a.spec.ts': 3 }, tests: { 'a.spec.ts': { slow: 2 } } }),
    );

    expect(debtReference(path)).toEqual({ path, files: { 'a.spec.ts': 3 }, tests: { 'a.spec.ts': { slow: 2 } } });
  });

  it('reads a baseline without test bodies as knowing none', () => {
    const path = join(createTempRepo({}), 'perf-baseline.json');

    writeTextFile(path, formatBaseline({ version: PERF_BASELINE_VERSION, median: 100, files: { 'a.spec.ts': 3 } }));

    expect(debtReference(path)?.tests).toEqual({});
  });

  it('answers undefined for a missing baseline, and for a missing or empty history', () => {
    const root = createTempRepo({ 'empty.jsonl': '\n' });

    expect(debtReference(join(root, 'none.json'))).toBeUndefined();
    expect(debtReference(join(root, 'none.jsonl'))).toBeUndefined();
    expect(debtReference(join(root, 'empty.jsonl'))).toBeUndefined();
  });

  it('reads a history as the median of its runs, per file and per test body', () => {
    const path = join(createTempRepo({}), 'perf-history.jsonl');

    writeTextFile(
      path,
      [
        historyLine({ 'a.spec.ts': 1, 'b.spec.ts': 4 }, { 'a.spec.ts': { slow: 1, slower: 5 } }),
        historyLine({ 'a.spec.ts': 3 }),
        historyLine({ 'a.spec.ts': 9, 'b.spec.ts': 6 }, { 'a.spec.ts': { slow: 3 }, 'c.spec.ts': { only: 2 } }),
        '',
      ].join('\n'),
    );

    expect(debtReference(path)).toEqual({
      path,
      files: { 'a.spec.ts': 3, 'b.spec.ts': 5 },
      tests: { 'a.spec.ts': { slow: 2, slower: 2.5 }, 'c.spec.ts': { only: 2 } },
    });
  });

  it('counts a body missing from a run that recorded its file as under the floor, so one slow run is not the median', () => {
    const path = join(createTempRepo({}), 'perf-history.jsonl');
    const fast = historyLine({ 'a.spec.ts': 1, 'b.spec.ts': 1 }, { 'b.spec.ts': { other: 2 } });

    writeTextFile(path, [fast, fast, historyLine({ 'a.spec.ts': 1 }, { 'a.spec.ts': { body: 9 } }), fast, fast].join('\n'));

    expect(debtReference(path)?.tests['a.spec.ts']).toEqual({ body: 0 });
  });
});

const slowFile = (path: string, budget = 1_000): GateCandidate => ({
  check: 'perf-gate-slow-file',
  file: path,
  ms: budget * 2,
  budget,
  budgetNote: 'note',
});

const slowTest = (path: string, name: string, budget = 1_000): GateCandidate => ({
  check: 'perf-gate-slow-test',
  file: path,
  name,
  ms: budget * 2,
  budget,
  budgetNote: 'note',
});

const debt: DebtReference = {
  path: 'perf-baseline.json',
  files: { 'old.spec.ts': 9, 'cheap.spec.ts': 1 },
  tests: { 'old.spec.ts': { 'slow body': 9 } },
};

const within = (scope: GateScope): Attribution => ({ scope, medianFile: 100 });

const inDebt: Attribution = { debt, medianFile: 100 };

describe('excuseOf', () => {
  it('never excuses the wall clock, whatever the scope and the reference say', () => {
    const wall: GateCandidate = { check: 'perf-gate-wall', ms: 2, budget: 1, budgetNote: 'note' };

    expect(excuseOf(wall, { scope: { ref: 'main', all: false, changed: 0, specs: new Set() }, debt, medianFile: 100 })).toBeUndefined();
  });

  it('excuses a file the change does not reach, before looking at debt', () => {
    const excuse = excuseOf(slowFile('elsewhere.spec.ts'), {
      ...within({ ref: 'main', all: false, changed: 1, specs: new Set(['mine.spec.ts']) }),
      debt,
    });

    expect(excuse).toEqual({
      outcome: 'outside change',
      note: 'This change does not reach the file — nothing changed against main is imported by it — so it is reported, not failed.',
    });
  });

  it('judges a file the change reaches, and every file when the scope is all of them', () => {
    expect(
      excuseOf(slowFile('mine.spec.ts'), within({ ref: 'main', all: false, changed: 1, specs: new Set(['mine.spec.ts']) })),
    ).toBeUndefined();
    expect(excuseOf(slowFile('elsewhere.spec.ts'), within({ ref: 'main', all: true, reason: 'why' }))).toBeUndefined();
    expect(excuseOf(slowFile('elsewhere.spec.ts'), { medianFile: 100 })).toBeUndefined();
  });

  it("excuses a file that was already this slow in the reference, on this run's scale", () => {
    expect(excuseOf(slowFile('old.spec.ts'), inDebt)).toEqual({
      outcome: 'known debt',
      note: "It was already this slow in perf-baseline.json — 900ms there, on this run's scale — so it is known debt, reported and not failed.",
    });
  });

  it('counts a reference at exactly the debt share of the budget as debt, and one just under it as news', () => {
    const budget = 9 * 100;

    expect(excuseOf(slowFile('old.spec.ts', budget / DEBT_SHARE), inDebt)?.outcome).toBe('known debt');
    expect(excuseOf(slowFile('old.spec.ts', budget / DEBT_SHARE + 1), inDebt)).toBeUndefined();
    expect(excuseOf(slowFile('cheap.spec.ts'), inDebt)).toBeUndefined();
  });

  it('judges a file the reference does not know', () => {
    expect(excuseOf(slowFile('new.spec.ts'), inDebt)).toBeUndefined();
  });

  it('excuses a test body the reference had, and judges one it did not', () => {
    expect(excuseOf(slowTest('old.spec.ts', 'slow body'), inDebt)?.outcome).toBe('known debt');
    expect(excuseOf(slowTest('old.spec.ts', 'another body'), inDebt)).toBeUndefined();
    expect(excuseOf(slowTest('cheap.spec.ts', 'slow body'), inDebt)).toBeUndefined();
  });

  it('never excuses a regression as debt: growing is what the reference catches', () => {
    const regression: GateCandidate = {
      check: 'perf-gate-regression',
      file: 'old.spec.ts',
      ms: 2,
      budget: 1,
      grewBy: 2,
      budgetNote: 'note',
    };

    expect(excuseOf(regression, inDebt)).toBeUndefined();
  });
});

describe('verdictPolicy', () => {
  const measured = run({ files: [...ordinary('/repo'), file('/repo/old.spec.ts', { tests: 2_000 })] });

  const policyOf = (gate: Parameters<typeof verdictPolicy>[2], baselinePath?: string) => {
    const errors: string[] = [];

    return { policy: verdictPolicy(measured, '/repo', gate, baselinePath, (line) => errors.push(line)), errors };
  };

  it('allows no excuse without a scope or debt, and passes the margin through', () => {
    expect(policyOf({})).toEqual({ policy: {}, errors: [] });
    expect(policyOf({ margin: 1.5 }).policy).toEqual({ margin: 1.5 });
  });

  it('does not read the baseline unless debt is to be warned about', () => {
    const { policy, errors } = policyOf({ debt: 'fail' }, '/nowhere/perf-baseline.json');

    expect(policy).toEqual({});
    expect(errors).toEqual([]);
  });

  it('excuses through the scope alone', () => {
    const { policy } = policyOf({ scope: { ref: 'main', all: false, changed: 1, specs: new Set() } });

    expect(policy.excuse?.(slowFile('old.spec.ts'))?.outcome).toBe('outside change');
  });

  it("excuses known debt on the scale of this run's median file", () => {
    const path = join(createTempRepo({}), 'perf-baseline.json');

    writeTextFile(path, formatBaseline({ version: PERF_BASELINE_VERSION, median: 50, files: { 'old.spec.ts': 9 } }));

    const { policy, errors } = policyOf({ debt: 'warn' }, path);

    expect(errors).toEqual([]);
    expect(policy.excuse?.(slowFile('old.spec.ts'))?.note).toContain('900ms there');
  });

  it('warns that --debt warn needs a --baseline to read from', () => {
    const { policy, errors } = policyOf({ debt: 'warn' });

    expect(policy).toEqual({});
    expect(errors).toEqual([
      '\nwarning  --debt warn has nothing to read debt from: pass --baseline with it. Every finding is judged as new.',
    ]);
  });

  it('warns when the baseline it was given cannot be read', () => {
    const { errors } = policyOf({ debt: 'warn' }, '/nowhere/perf-baseline.json');

    expect(errors).toEqual([
      '\nwarning  --debt warn has nothing to read debt from: no readable baseline or history at /nowhere/perf-baseline.json. Every finding is judged as new.',
    ]);
  });
});
