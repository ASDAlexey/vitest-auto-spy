/**
 * An Angular suite that shares one environment across its files, without the `setupAutoSpy` options
 * that put back what a file leaves behind.
 *
 * Under `isolate: false` a timer, a `window` listener, a replaced global or a `vi.spyOn` from one file
 * is still there when the next file runs, and it fails there — in a file that never touched it.
 * Angular makes it likelier: a component schedules change detection, observers and animation frames
 * of its own. The builder turns isolation off by default from 21.0, so many suites share without
 * having decided to.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { type SourceGraph, type TextPass, inOnePass, isSpecFile } from './graph';
import { isolationFromAngularBuilder } from './runner-isolation';
import { type Settings, SettingsReader, keyValue } from './setup-options';
import { declaredUpTree, isKey, runnerConfigKeys, vitestScripts } from './vitest-5-facts';

/** The options whose JSDoc says to turn them on with `isolate: false`, and what each one puts back. */
const RESTORE_OPTIONS: readonly (readonly [string, string])[] = [
  ['restoreMocks', 'a `vi.spyOn` on a shared object'],
  ['strayTimers', 'a timer or animation frame still pending'],
  ['strayListeners', 'a `window` / `document` listener never removed'],
  ['restoreGlobals', 'a global assigned by hand'],
];

const SETUP_CALL = /\bsetupAutoSpy\s*\(/g;

/** Why the files share an environment, or `undefined` when they do not. */
function sharedBecause(profile: Profile, graph: SourceGraph): string | undefined {
  const key = runnerConfigKeys(graph).find((entry) => isKey(entry, 'isolate') && /^false\b/.test(entry.value));

  if (key !== undefined) {
    return `${key.file} sets \`isolate: false\``;
  }

  const script = vitestScripts(profile).find(([, command]) => /--no-isolate\b|--isolate[ =]false\b/.test(command));

  if (script !== undefined) {
    return `the \`${script[0]}\` script turns isolation off`;
  }

  const builder = isolationFromAngularBuilder(profile);

  return builder?.isolated === false ? builder.why : undefined;
}

/** `true` on, `false` off, `undefined` when the value cannot be read statically. */
type Switch = boolean | undefined;

interface SetupSite {
  readonly file: string;
  readonly switches: readonly Switch[];
}

function truthOf(text: string): Switch {
  return /^(?:true\b|{)/.test(text) ? true : text === 'false' ? false : undefined;
}

function strictPreset(settings: Settings): Switch {
  const preset = keyValue(settings, 'preset');

  if (preset.kind !== 'value') {
    return preset.kind === 'unset' ? false : undefined;
  }

  return /^(["'`])strict\1$/.test(preset.text) ? true : /^["'`]/.test(preset.text) ? false : undefined;
}

/** An explicit value wins over the preset: `applyPreset` fills only what the caller left out. */
function switchOf(settings: Settings, option: string): Switch {
  const value = keyValue(settings, option);

  if (value.kind === 'unset') {
    return option === 'strayTimers' && strictPreset(settings);
  }

  return value.kind === 'value' ? truthOf(value.text) : undefined;
}

/** On when either turns it on; unknown when neither does and one cannot be read. */
function either(left: Switch, right: Switch): Switch {
  return left === true || right === true ? true : left === undefined || right === undefined ? undefined : false;
}

function siteOf(reader: SettingsReader, file: string, text: string): SetupSite | undefined {
  if (isSpecFile(file) || !text.includes('setupAutoSpy')) {
    return undefined;
  }

  const source = reader.withText(file, text);
  const calls = [...source.code.matchAll(SETUP_CALL)].map((call) => reader.valueAt(source, call.index + call[0].length));

  return calls.length === 0
    ? undefined
    : { file, switches: RESTORE_OPTIONS.map(([option]) => calls.map((settings) => switchOf(settings, option)).reduce(either)) };
}

/**
 * The files whose calls run together. The setup files the runner config lists run in every worker, so
 * their calls add up; any other file calling `setupAutoSpy()` is some other project's setup and
 * stands alone.
 */
function groupsOf(sites: readonly SetupSite[], declared: ReadonlySet<string>): SetupSite[][] {
  const together = sites.filter(({ file }) => declared.has(file));
  const alone = sites.filter(({ file }) => !declared.has(file)).map((site) => [site]);

  return together.length === 0 ? alone : [together, ...alone];
}

function finding(because: string, missing: readonly (readonly [string, string])[], where: string, file?: string): Finding {
  return {
    check: 'shared-env-without-restore',
    severity: 'info',
    ...(file === undefined ? {} : { file }),
    message: `This Angular suite shares one environment across its files (${because}), and ${where}: ${missing.map(([, leak]) => leak).join(', ')} survives into the next file and fails there, in a file that never touched it.`,
    fix: `Call \`setupAutoSpy({ ${missing.map(([option]) => `${option}: true`).join(', ')} })\` in the setup file, or turn isolation back on for the files that leak.`,
  };
}

export function checkSharedEnvRestore(profile: Profile, graph: SourceGraph): Finding[] {
  return inOnePass(graph, [sharedEnvRestorePass(profile, graph)]);
}

export function sharedEnvRestorePass(profile: Profile, graph: SourceGraph): TextPass | undefined {
  if (!profile.hasAngular || !declaredUpTree(profile, 'vitest-auto-spy')) {
    return undefined;
  }

  const because = sharedBecause(profile, graph);

  if (because === undefined) {
    return undefined;
  }

  const reader = new SettingsReader(graph);
  const sites: SetupSite[] = [];

  return {
    visit: (file, text): void => {
      const site = siteOf(reader, file, text);

      if (site !== undefined) {
        sites.push(site);
      }
    },
    finish: (): Finding[] => withoutRestore(sites, new Set(profile.setupFiles), because),
  };
}

function unreadable(because: string, options: readonly (readonly [string, string])[], files: readonly string[]): Finding {
  const names = options.map(([option]) => `\`${option}\``).join(', ');

  return {
    check: 'shared-env-without-restore',
    severity: 'info',
    file: String(files[0]),
    message: `This Angular suite shares one environment across its files (${because}), and the options \`setupAutoSpy()\` gets in ${files.join(', ')} are not statically readable, so \`doctor\` cannot tell whether ${names} ${options.length === 1 ? 'is' : 'are'} on: if off, ${options.map(([, leak]) => leak).join(', ')} survives into the next file.`,
    fix: `Pass an object literal, or one declared in the setup file or imported from a module of the repository, so ${names} can be read; a function call, a condition or an import from a package cannot.`,
  };
}

/** A switch no call turns on and every call provably leaves off; one that cannot be read gets a note of its own. */
function withoutRestore(sites: readonly SetupSite[], declared: ReadonlySet<string>, because: string): Finding[] {
  if (sites.length === 0) {
    return [finding(because, RESTORE_OPTIONS, 'no setup file calls `setupAutoSpy()`')];
  }

  return groupsOf(sites, declared).flatMap((group) => {
    const verdicts = RESTORE_OPTIONS.map((_, index) => group.map(({ switches }) => switches[index]).reduce(either));
    const missing = RESTORE_OPTIONS.filter((_, index) => verdicts[index] === false);
    const unknown = RESTORE_OPTIONS.filter((_, index) => verdicts[index] === undefined);
    const files = group.map(({ file }) => file);

    return [
      ...(missing.length === 0
        ? []
        : [
            finding(
              because,
              missing,
              `\`setupAutoSpy()\` in ${files.join(', ')} leaves ${missing.map(([option]) => `\`${option}\``).join(', ')} off`,
              files[0],
            ),
          ]),
      ...(unknown.length === 0 ? [] : [unreadable(because, unknown, files)]),
    ];
  });
}
