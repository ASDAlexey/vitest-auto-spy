/**
 * What Vitest 5 took away or changed under a suite that does not know yet.
 *
 * On Vitest 5 a removed entry, flag or chain is broken now, so it is an error. On Vitest 4 the
 * same line works and costs nothing today, so it is a note for the upgrade. Older majors are left
 * alone: their way to 5 goes through Vitest 4's own migration first.
 *
 * Renamed config keys Vitest 5 still honours (`experimental.fsModuleCache`, `browser.isolate`,
 * `cache.dir`, …) are deliberately absent: Vitest 5 prints a deprecation naming the replacement on
 * every run, and on Vitest 4 the new spelling does not exist yet.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import type { SourceGraph } from './graph';
import { isInsideLiteral, literalSpans } from './literals';
import { unitTestTargets } from './unit-test-targets';
import { type ConfigKey, declaredVitestMajor, isKey, isTrue, passesFlag, runnerConfigKeys, vitestScripts } from './vitest-5-facts';

const FIRST_REMOVING = 5;
const FIRST_POOL_REWORK = 4;

const NODE_ENTRY = 'Import from `vitest/node` instead; it exports the same names from Vitest 4.1 on.';
const RUNTIME_ENTRY = 'Import from `vitest/runtime` instead; it exports the same names from Vitest 4.1 on.';

const REMOVED_ENTRIES: Readonly<Record<string, string>> = {
  reporters: NODE_ENTRY,
  coverage: NODE_ENTRY,
  environments: RUNTIME_ENTRY,
  snapshot: RUNTIME_ENTRY,
  runners: 'Use `TestRunner` from `vitest` instead; it is exported from Vitest 4.1 on.',
  suite: 'Use the static methods on `TestRunner` from `vitest` instead.',
  mocker: 'Import from the `@vitest/mocker` package directly.',
};

const REMOVED_IMPORT = /\b(?:from|import|require)\s*\(?\s*["']vitest\/(reporters|coverage|environments|snapshot|runners|suite|mocker)["']/g;
const SEQUENTIAL = /\b(?:test|it|describe|suite)(?:\.\w+)*\.sequential\b/g;

const OUTPUT_JSON_FIX = 'Use `--reporter=json --outputFile=<path>` instead.';
const COMPARE_FIX =
  'Pass `writeResult` as a per-bench option to persist a result, and read it back with `bench.from()`; Vitest 5 has no flag for it.';

const REMOVED_FLAGS: readonly (readonly [string, string])[] = [
  ['outputJson', OUTPUT_JSON_FIX],
  ['compare', COMPARE_FIX],
];

const RENAMED_APIS: Readonly<Record<string, string>> = {
  experimental_clearCache: 'clearCache',
  experimental_parseSpecifications: 'parseSpecifications',
};

const RENAMED_API = /\.(experimental_clearCache|experimental_parseSpecifications)\b/g;

function removed(major: number, file: string, subject: string, effect: string, fix: string): Finding {
  const now = major >= FIRST_REMOVING;

  return {
    check: 'vitest-5-removed',
    severity: now ? 'error' : 'info',
    file,
    message: now
      ? `${subject}, which Vitest ${major} removed: ${effect}.`
      : `${subject}, which Vitest 5 removes: after the upgrade ${effect}.`,
    fix,
  };
}

function codeMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const spans = literalSpans(text);

  return [...text.matchAll(pattern)].filter((match) => !isInsideLiteral(spans, match.index));
}

const lineOf = (text: string, offset: number): number => text.slice(0, offset).split('\n').length;

function removedInSources(major: number, graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const [file, text] of graph.texts) {
    for (const entry of new Set(codeMatches(text, REMOVED_IMPORT).map((match) => String(match[1])))) {
      findings.push(
        removed(
          major,
          file,
          `Imports \`vitest/${entry}\``,
          'the specifier stops resolving, for the runner and for `tsc` alike',
          String(REMOVED_ENTRIES[entry]),
        ),
      );
    }

    const chains = codeMatches(text, SEQUENTIAL);

    if (chains.length > 0) {
      const forms = [...new Set(chains.map((match) => `\`${match[0]}\``))].join(', ');
      const lines = chains.map((match) => lineOf(text, match.index));

      findings.push(
        removed(
          major,
          file,
          `Calls ${forms} (${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')})`,
          'collecting the file throws `TypeError: … is not a function`',
          'Drop `.sequential`. Where a suite or the config runs tests concurrently, pass `{ concurrent: false }` to opt this one out; the option works on Vitest 4 already.',
        ),
      );
    }
  }

  return findings;
}

function removedInScripts(major: number, profile: Profile): Finding[] {
  return vitestScripts(profile).flatMap(([name, script]) =>
    REMOVED_FLAGS.filter(([flag]) => passesFlag(script, flag)).map(([flag, fix]) =>
      removed(major, 'package.json', `The \`${name}\` script passes \`--${flag}\``, 'the command stops with `Unknown option`', fix),
    ),
  );
}

function removedInConfigs(major: number, keys: readonly ConfigKey[]): Finding[] {
  const findings: Finding[] = [];

  for (const key of keys) {
    if (isKey(key, 'benchmark.outputJson') || isKey(key, 'benchmark.compare')) {
      const outputJson = isKey(key, 'benchmark.outputJson');

      findings.push(
        removed(
          major,
          key.file,
          `Sets \`${outputJson ? 'benchmark.outputJson' : 'benchmark.compare'}\``,
          'nothing reads the key, and no warning says so',
          outputJson ? OUTPUT_JSON_FIX : COMPARE_FIX,
        ),
      );
    }

    if (major >= FIRST_POOL_REWORK && isKey(key, 'poolOptions')) {
      findings.push({
        check: 'vitest-5-removed',
        severity: 'warning',
        file: key.file,
        message:
          '`poolOptions` was removed in Vitest 4: Vitest prints one deprecation line and runs without every option inside it, so the pool is configured by the defaults.',
        fix: 'Move the options to the top level (`maxWorkers`, `isolate`, `execArgv`, …); the pool-rework section of the Vitest 4 migration guide maps each one.',
      });
    }
  }

  return findings;
}

function renamedApis(graph: SourceGraph): Finding[] {
  const findings: Finding[] = [];

  for (const [file, text] of graph.texts) {
    for (const name of new Set(codeMatches(text, RENAMED_API).map((match) => String(match[1])))) {
      findings.push({
        check: 'vitest-5-deprecated',
        severity: 'info',
        file,
        message: `Calls \`${name}\`, which Vitest 5 deprecated without a warning at run time: only the type says so.`,
        fix: `Call \`${String(RENAMED_APIS[name])}\` instead; it takes the same arguments.`,
      });
    }
  }

  return findings;
}

/** `vitest-5-removed` and, on Vitest 5, `vitest-5-deprecated`. */
export function checkVitest5Removed(profile: Profile, graph: SourceGraph): Finding[] {
  const major = declaredVitestMajor(profile);

  if (major === undefined || major < FIRST_POOL_REWORK) {
    return [];
  }

  return [
    ...removedInSources(major, graph),
    ...removedInScripts(major, profile),
    ...removedInConfigs(major, runnerConfigKeys(graph)),
    ...(major >= FIRST_REMOVING ? renamedApis(graph) : []),
  ];
}

const CLEAR_MOCKS_ON_BY_DEFAULT = 5;

function clearMocksRestated(keys: readonly ConfigKey[]): Finding[] {
  return [...new Set(keys.filter((key) => isKey(key, 'clearMocks') && isTrue(key)).map((key) => key.file))].map((file): Finding => ({
    check: 'vitest-5-clear-mocks',
    severity: 'info',
    file,
    message: '`clearMocks: true` is the default from Vitest 5, so this line restates it.',
    fix: 'Delete it; nothing changes either way. It is `clearMocks: false` that needs writing out now, in a suite that relies on call history surviving from one test to the next.',
  }));
}

function clearMocksReadiness(profile: Profile, keys: readonly ConfigKey[]): Finding[] {
  const decided =
    keys.some((key) => isKey(key, 'clearMocks') || (isKey(key, 'mockReset') && isTrue(key))) ||
    vitestScripts(profile).some(([, script]) => /--(?:no-)?clearMocks\b|--mockReset\b/.test(script));

  if (decided) {
    return [];
  }

  const builder =
    unitTestTargets(profile).length > 0
      ? ' Under `@angular/build:unit-test`, set `clearMocks: true` in the runner config for that one run instead.'
      : '';

  return [
    {
      check: 'vitest-5-clear-mocks',
      severity: 'info',
      message:
        'Vitest 5 turns `clearMocks` on by default, and no config here sets it: after the upgrade every mock’s call history is cleared before each test, and a test that counts calls made in `beforeAll` or in an earlier `it` starts failing.',
      fix: `Price it before upgrading: \`npx vitest run --clearMocks\` on Vitest 4 runs the suite the way Vitest 5 will.${builder} Then fix what breaks, or keep today's behaviour with \`clearMocks: false\`.`,
    },
  ];
}

export function checkVitest5ClearMocks(profile: Profile, graph: SourceGraph): Finding[] {
  const major = declaredVitestMajor(profile);

  if (major === undefined || major < CLEAR_MOCKS_ON_BY_DEFAULT - 1) {
    return [];
  }

  const keys = runnerConfigKeys(graph);

  return major >= CLEAR_MOCKS_ON_BY_DEFAULT ? clearMocksRestated(keys) : clearMocksReadiness(profile, keys);
}
