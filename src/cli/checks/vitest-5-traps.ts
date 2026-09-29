/**
 * Vitest 5 changes that keep a suite compiling and, mostly, running — and quietly change what it does.
 *
 * Each trap was read off Vitest 5.0.2's own source against 4.1's. As in `vitest-5.ts`, a trap is a
 * finding at its own severity on Vitest 5 and a note for the upgrade on Vitest 4.
 */
import { join } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding, Severity } from '../report';
import { type SourceGraph, type TextPass, inOnePass } from './graph';
import { codeMatches, codeOnly } from './literals';
import {
  type TextFile,
  ciConfigs,
  declaredUpTree,
  declaredVitestMajor,
  installedVersionOf,
  isRunnerConfig,
  textsOf,
  vitestScripts,
} from './vitest-5-facts';

const FIRST_CHANGED = 5;

interface Trap {
  readonly check: string;
  readonly file: string;
  /** Severity on Vitest 5; on Vitest 4 every trap is a note. */
  readonly severity: Severity;
  /** What happens on Vitest 5, as the end of a sentence about the subject. */
  readonly now: string;
  readonly subject: string;
  readonly fix: string;
}

function finding(major: number, trap: Trap): Finding {
  const now = major >= FIRST_CHANGED;

  return {
    check: trap.check,
    severity: now ? trap.severity : 'info',
    file: trap.file,
    message: now ? `${trap.subject}: on Vitest ${major} ${trap.now}.` : `${trap.subject}: after the upgrade to Vitest 5 ${trap.now}.`,
    fix: trap.fix,
  };
}

const lineOf = (text: string, offset: number): number => text.slice(0, offset).split('\n').length;

function linesPhrase(lines: readonly number[]): string {
  return `${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')}`;
}

const BUNDLED_IMPORT = /\b(?:from|import|require)\s*\(?\s*["'](@vitest\/(?:expect|runner))(?:\/[^"']*)?["']/g;
const BUNDLED_AUGMENTATION = /\bdeclare\s+module\s+["'](@vitest\/(?:expect|runner))["']/g;

const BUNDLED_FIX: Readonly<Record<string, string>> = {
  '@vitest/expect':
    "Import from `vitest` instead: `expect`, `MatcherState`, `ExpectationResult` and the `Assertion` / `Matchers` types all come from it, and an augmentation goes in `declare module 'vitest'`. Then drop `@vitest/expect` from package.json.",
  '@vitest/runner':
    'Import from `vitest` instead: `getCurrentTest`, `getCurrentSuite`, `createTaskCollector` and the `TestRunner` statics are exported there. Then drop `@vitest/runner` from package.json.',
};

function bundledPackages(major: number, file: string, text: string): Finding[] {
  const imported = new Set(codeMatches(text, BUNDLED_IMPORT).map((match) => String(match[1])));
  const augmented = new Set(codeMatches(text, BUNDLED_AUGMENTATION).map((match) => String(match[1])));

  return [...new Set([...imported, ...augmented])].sort().map((name) =>
    finding(major, {
      check: 'vitest-5-bundled-package',
      file,
      severity: 'error',
      subject: `${imported.has(name) ? 'Imports' : 'Augments'} \`${name}\``,
      now: `\`vitest\` bundles its own copy and no longer depends on the package, so this resolves to a separate copy or to nothing — \`expect.extend\` through it registers nothing on the \`expect\` your tests call, and a type augmented there never reaches \`vitest\``,
      fix: String(BUNDLED_FIX[name]),
    }),
  );
}

const VITEST_AUGMENTATION = /\bdeclare\s+module\s+["']vitest["']/g;
const ONE_PARAMETER_MATCHERS = /\binterface\s+Matchers\s*<\s*[$A-Z_a-z][\w$]*(?:\s+extends\s+[^,<=>]+)?(?:\s*=\s*[^,<>]+)?\s*>/g;
const JEST_MATCHERS = /\bnamespace\s+jest\s*{[^}]*?\binterface\s+Matchers\b/g;

function matcherAugmentations(major: number, file: string, text: string): Finding[] {
  const found: Finding[] = [];
  const single = codeMatches(text, ONE_PARAMETER_MATCHERS);

  if (single.length > 0 && codeMatches(text, VITEST_AUGMENTATION).length > 0) {
    found.push(
      finding(major, {
        check: 'vitest-5-matchers-augmentation',
        file,
        severity: 'error',
        subject: `Augments \`vitest\` with a one-parameter \`interface Matchers<T>\` (${linesPhrase(single.map((match) => lineOf(text, match.index)))})`,
        now: 'Vitest declares `Matchers<R, T>`, so the declarations no longer merge — `tsc` reports TS2428 in a `.ts` file, and in a `.d.ts` under `skipLibCheck` the custom matchers silently return the received type',
        fix: 'Declare `interface Matchers<R, T> { toBeFoo(): R }` — both parameters, with those names, and `R` as the return type. The two-parameter form only compiles on Vitest 5, so change it with the upgrade.',
      }),
    );
  }

  const jest = codeMatches(text, JEST_MATCHERS);

  if (jest.length > 0) {
    found.push(
      finding(major, {
        check: 'vitest-5-matchers-augmentation',
        file,
        severity: 'error',
        subject: `Augments the global \`jest.Matchers\` (${linesPhrase(jest.map((match) => lineOf(text, match.index)))})`,
        now: 'Vitest no longer declares that namespace or extends its assertions from it, so every matcher declared there is missing from `expect(…)` and `tsc` reports TS2339 at each call',
        fix: "Move the declarations to `declare module 'vitest' { interface Matchers<R, T> { … } }`.",
      }),
    );
  }

  return found;
}

const HOISTED_CALL = /\b(?:vi|vitest)\.(mock|unmock|hoisted)\s*\(/g;

/** Where each `vi.mock` / `vi.unmock` / `vi.hoisted` call sits inside a block rather than at module scope. */
export function nestedHoistedCalls(text: string): { name: string; line: number }[] {
  if (text.search(HOISTED_CALL) === -1) {
    return [];
  }

  const code = codeOnly(text);
  const found: { name: string; line: number }[] = [];
  let depth = 0;
  let from = 0;

  for (const match of code.matchAll(HOISTED_CALL)) {
    for (const char of code.slice(from, match.index)) {
      depth += char === '{' ? 1 : char === '}' ? -1 : 0;
    }

    from = match.index;

    if (depth > 0) {
      found.push({ name: `vi.${String(match[1])}`, line: lineOf(text, match.index) });
    }
  }

  return found;
}

function nestedHoisting(major: number, file: string, text: string): Finding[] {
  // Vitest skips this validation for a file with in-source tests.
  const nested = text.includes('import.meta.vitest') ? [] : nestedHoistedCalls(text);

  if (nested.length === 0) {
    return [];
  }

  const names = [...new Set(nested.map((call) => `\`${call.name}\``))].join(', ');

  return [
    finding(major, {
      check: 'vitest-5-nested-hoist',
      file,
      severity: 'error',
      subject: `Calls ${names} inside a block (${linesPhrase(nested.map((call) => call.line))})`,
      now: 'collecting the file throws "… was defined outside of the module\'s top level scope" instead of printing the warning Vitest 4 printed',
      fix: 'Move the call to the top level of the file, where Vitest hoists it anyway. A mock that must differ per test is `vi.doMock` plus a dynamic `import()` inside that test.',
    }),
  ];
}

const EMPTY_THROW = /\.(not\.)?toThrow(?:Error)?\(\s*(["'`])\2\s*\)/g;

function emptyThrowMessage(major: number, file: string, text: string): Finding[] {
  const matches = codeMatches(text, EMPTY_THROW);

  if (matches.length === 0) {
    return [];
  }

  const negated = matches.some((match) => match[1] !== undefined);

  return [
    finding(major, {
      check: 'vitest-5-empty-throw-message',
      file,
      severity: 'warning',
      subject: `Asserts \`${negated ? ".not.toThrow('')" : ".toThrow('')"}\` (${linesPhrase(matches.map((match) => lineOf(text, match.index)))})`,
      now: "an empty string is a substring of every message: `.toThrow('')` passes for any error and `.not.toThrow('')` fails on any error, where Vitest 4 matched only an empty message",
      fix: 'Write `.not.toThrow()` for "throws nothing", or `/^$/` in place of `\'\'` to keep matching an empty message only.',
    }),
  ];
}

const PRUNE_ON = /\bpruneMockRegistry\s*:\s*true\b|\btrackMockRegistry\s*\(/g;
const FROM_THE_LIBRARY = /["']vitest-auto-spy(?:\/[\w-]+)?["']/;

function inertPrune(major: number, file: string, text: string): Finding[] {
  return major < FIRST_CHANGED || codeMatches(text, PRUNE_ON).length === 0 || !FROM_THE_LIBRARY.test(text)
    ? []
    : [
        {
          check: 'vitest-5-prune-mock-registry',
          severity: 'info',
          file,
          message: `Turns on the mock-registry pruning (\`pruneMockRegistry: true\` or \`trackMockRegistry()\`), which does nothing on Vitest ${major}: its registry holds \`WeakRef\`s and \`vi.clearAllMocks()\` walks only the mocks called since their last clear, so there is no growing set left to prune.`,
          fix: 'Delete it. It still earns its keep on Vitest 4 under `isolate: false`, so keep it until the upgrade lands.',
        },
      ];
}

interface InlineProject {
  readonly keys: ReadonlyMap<string, string>;
  readonly testKeys: ReadonlyMap<string, string>;
  readonly name: string | undefined;
  readonly line: number;
}

const KEY = /([$A-Z_a-z][\w$]*)\s*:(?!:)/y;

/** Direct keys of the object literal opening at `open`, with the rest of each key's line, and where it closes. */
function objectKeys(code: string, text: string, open: number): { keys: Map<string, string>; close: number; bodies: Map<string, number> } {
  const keys = new Map<string, string>();
  const bodies = new Map<string, number>();
  let depth = 0;
  let index = open;

  for (; index < code.length; index += 1) {
    const char = code.charAt(index);

    if ('{[('.includes(char)) {
      depth += 1;
    } else if ('}])'.includes(char)) {
      depth -= 1;

      if (depth === 0) {
        break;
      }
    } else if (depth === 1 && /[$A-Z_a-z]/.test(char) && !/[\w$.]/.test(code.charAt(index - 1))) {
      KEY.lastIndex = index;
      const key = KEY.exec(code);

      if (key !== null) {
        const end = index + key[0].length;
        const lineEnd = text.indexOf('\n', end);

        keys.set(String(key[1]), text.slice(end, lineEnd === -1 ? text.length : lineEnd).trim());
        bodies.set(String(key[1]), end);
        index = end - 1;
      }
    }
  }

  return { keys, close: index, bodies };
}

/** The object literals written directly in a config's `projects: [ … ]` array. */
export function inlineProjects(text: string): InlineProject[] {
  const code = codeOnly(text);
  const projects: InlineProject[] = [];

  for (const match of code.matchAll(/\bprojects\s*:\s*\[/g)) {
    let depth = 0;

    for (let index = match.index + match[0].length - 1; index < code.length; index += 1) {
      const char = code.charAt(index);

      if (char === '{' && depth === 1) {
        const { keys, close, bodies } = objectKeys(code, text, index);
        const testOpen = bodies.get('test');
        const testBrace = testOpen === undefined ? -1 : code.indexOf('{', testOpen);
        const testKeys =
          testOpen !== undefined && testBrace !== -1 && code.slice(testOpen, testBrace).trim() === ''
            ? objectKeys(code, text, testBrace).keys
            : new Map<string, string>();

        projects.push({ keys, testKeys, name: /^["'`]([^"'`]+)/.exec(testKeys.get('name') ?? '')?.[1], line: lineOf(text, index) });
        index = close;

        continue;
      }

      depth += '{[('.includes(char) ? 1 : '}])'.includes(char) ? -1 : 0;

      if (depth === 0) {
        break;
      }
    }
  }

  return projects;
}

/** What makes Vitest 5 give an inline project a Vite server of its own (`getOwnServerReason`). */
const OWN_SERVER_TEST_KEYS = ['alias', 'browser', 'css', 'mode', 'root'];

function ownServerReason(project: InlineProject): string | undefined {
  for (const [key, value] of project.keys) {
    if (key === 'test' || key === 'extends' || key === 'define' || (key === 'plugins' && /^\[\s*]/.test(value))) {
      continue;
    }

    return `\`${key}\``;
  }

  const affecting = OWN_SERVER_TEST_KEYS.find((key) => project.testKeys.has(key));

  return affecting === undefined ? undefined : `\`test.${affecting}\``;
}

function projectLabel(project: InlineProject): string {
  return project.name === undefined ? `on line ${project.line}` : `"${project.name}"`;
}

function inlineProjectFindings(major: number, graph: SourceGraph): Finding[] {
  if (major < FIRST_CHANGED) {
    return [];
  }

  return textsOf(graph, isRunnerConfig).flatMap(({ file, text }) => {
    if (/\bsharedViteServer\s*:\s*false\b/.test(codeOnly(text))) {
      return inlineProjects(text).flatMap((project) => restatedExtends(file, project));
    }

    return inlineProjects(text).flatMap((project): Finding[] => {
      const reason = ownServerReason(project);
      const own: Finding[] =
        reason === undefined
          ? []
          : [
              {
                check: 'vitest-5-project-own-server',
                severity: 'info',
                file,
                message: `The inline project ${projectLabel(project)} sets ${reason}, so Vitest ${major} starts a Vite server of its own for it instead of sharing the one of the config that declares it (\`sharedViteServer\`): one more server to start and one more transform cache to fill, every run.`,
                fix: 'Keep Vite options in the root config, where every inline project inherits them. When they repeat the root’s, delete them; when a project truly needs different plugins or resolution, it is a separate config file with its own server either way.',
              },
            ];

      return [...own, ...restatedExtends(file, project)];
    });
  });
}

function restatedExtends(file: string, project: InlineProject): Finding[] {
  return /^true\b/.test(project.keys.get('extends') ?? '')
    ? [
        {
          check: 'vitest-5-extends-restated',
          severity: 'info',
          file,
          message: `The inline project ${projectLabel(project)} sets \`extends: true\`, which is the default for an inline project from Vitest 5: it inherits the declaring config unless it says \`extends: false\`.`,
          fix: 'Delete the line; nothing changes either way.',
        },
      ]
    : [];
}

const REPORTER_WITHOUT_FILE = /--reporter[ =]["']?(json|junit)\b/;
const REPORTS_DIRECTORY = '.vitest-reports';

interface CommandText {
  readonly file: string;
  readonly where: string;
  readonly line: string;
}

function commandLines(profile: Profile, ci: readonly TextFile[]): CommandText[] {
  return [
    ...vitestScripts(profile).map(([name, script]) => ({ file: 'package.json', where: `The \`${name}\` script`, line: script })),
    ...ci.flatMap(({ file, text }) =>
      text
        .split('\n')
        .map((line, index) => ({ file, where: `Line ${index + 1}`, line }))
        .filter(({ line }) => /\bvitest\b/.test(line)),
    ),
  ];
}

function reportPaths(major: number, profile: Profile, graph: SourceGraph): Finding[] {
  const ci = ciConfigs(profile);
  const findings: Finding[] = [];

  for (const { file, where, line } of commandLines(profile, ci)) {
    const reporter = REPORTER_WITHOUT_FILE.exec(line)?.[1];

    if (reporter !== undefined && !/--outputFile\b/.test(line)) {
      findings.push(
        finding(major, {
          check: 'vitest-5-report-path',
          file,
          severity: 'warning',
          subject: `${where} passes \`--reporter=${reporter}\` without \`--outputFile\``,
          now: `the report is written to \`.vitest/${reporter}/output.${reporter === 'json' ? 'json' : 'xml'}\` instead of standard output, so a redirect or a pipe that read it there gets nothing`,
          fix: `Pass \`--outputFile.${reporter}=<path>\` and read that file; it works the same on Vitest 4.`,
        }),
      );
    }
  }

  const texts = [
    ...Object.values(profile.scripts).map((text) => ({ file: 'package.json', text })),
    ...ci,
    ...textsOf(graph, isRunnerConfig),
  ];
  const writesThere = texts.some(({ text }) => new RegExp(`outputFile[^\\n]*${REPORTS_DIRECTORY.replace('.', '\\.')}`).test(text));

  if (!writesThere) {
    for (const file of new Set(texts.filter(({ text }) => text.includes(REPORTS_DIRECTORY)).map(({ file }) => file))) {
      findings.push(
        finding(major, {
          check: 'vitest-5-report-path',
          file,
          severity: 'warning',
          subject: `Names \`${REPORTS_DIRECTORY}\`, Vitest 4's default blob-report directory`,
          now: 'blob reports go to `.vitest/blob` and `--merge-reports` reads from there by default, so this path is empty and whatever uploads or merges it has nothing to work with',
          fix: 'Use `.vitest/blob`, or keep the directory by passing `--outputFile.blob=.vitest-reports/<name>.json` to each shard and `--merge-reports .vitest-reports` to the merge.',
        }),
      );
    }
  }

  return findings;
}

function vitePeer(major: number, profile: Profile): Finding[] {
  if (major < FIRST_CHANGED || !profile.files.includes('yarn.lock') || declaredUpTree(profile, 'vite')) {
    return [];
  }

  const installed = installedVersionOf(profile.cwd, 'vite');

  return [
    {
      check: 'vitest-5-vite-peer',
      severity: installed === undefined ? 'error' : 'warning',
      file: 'package.json',
      message:
        installed === undefined
          ? `Vitest ${major} takes \`vite\` as a peer dependency, Yarn does not install peers, and nothing here declares \`vite\`: no copy is installed, so \`vitest\` cannot start.`
          : `Vitest ${major} takes \`vite\` as a peer dependency, Yarn does not install peers, and nothing here declares \`vite\`: the installed ${installed} is whatever another package happened to bring, and it moves when that package does.`,
      fix: 'Add `vite` to devDependencies — `^6.4.0`, `^7` or `^8`, the range Vitest 5 accepts.',
    },
  ];
}

/** Every trap, for a repository that declares Vitest 4 or newer. */
export function checkVitest5Traps(profile: Profile, graph: SourceGraph): Finding[] {
  return inOnePass(graph, [vitest5TrapsPass(profile, graph)]);
}

export function vitest5TrapsPass(profile: Profile, graph: SourceGraph): TextPass | undefined {
  const major = declaredVitestMajor(profile);

  if (major === undefined || major < FIRST_CHANGED - 1) {
    return undefined;
  }

  const inSources: Finding[] = [];

  return {
    visit: (file, text): void => {
      inSources.push(
        ...bundledPackages(major, file, text),
        ...matcherAugmentations(major, file, text),
        ...nestedHoisting(major, file, text),
        ...emptyThrowMessage(major, file, text),
        ...inertPrune(major, file, text),
      );
    },
    finish: (): Finding[] => {
      // An augmentation usually lives in a declaration file, and the import graph skips those.
      const inDeclarations = profile.files
        .filter((file) => /\.d\.[cm]?ts$/.test(file))
        .flatMap((file) => {
          const text = readTextFile(join(profile.cwd, file)) ?? '';

          return [...bundledPackages(major, file, text), ...matcherAugmentations(major, file, text)];
        });

      return [
        ...inSources,
        ...inDeclarations,
        ...inlineProjectFindings(major, graph),
        ...reportPaths(major, profile, graph),
        ...vitePeer(major, profile),
      ];
    },
  };
}
