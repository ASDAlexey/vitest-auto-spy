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
import { type SourceGraph, type TextPass, inOnePass } from './graph';
import { codeOnly } from './literals';
import { isolationFromAngularBuilder } from './runner-isolation';
import { declaredUpTree, isKey, runnerConfigKeys, vitestScripts } from './vitest-5-facts';

interface SetupCall {
  readonly file: string;
  readonly call: string;
}

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

/** The argument text of every `setupAutoSpy(…)` call, strings and comments blanked. */
export function setupCalls(text: string): string[] {
  const code = codeOnly(text);

  return [...code.matchAll(SETUP_CALL)].map((match) => {
    let depth = 0;
    const start = match.index + match[0].length - 1;

    for (let index = start; index < code.length; index += 1) {
      const char = code.charAt(index);

      depth += '({['.includes(char) ? 1 : ')}]'.includes(char) ? -1 : 0;

      if (depth === 0) {
        return text.slice(start + 1, index);
      }
    }

    return text.slice(start + 1);
  });
}

function turnsOn(call: string, option: string): boolean {
  return (
    new RegExp(`\\b${option}\\s*:\\s*(?:true\\b|\\{)`).test(call) ||
    (option === 'strayTimers' && /\bpreset\s*:\s*["']strict["']/.test(call) && !/\bstrayTimers\s*:\s*false\b/.test(call))
  );
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

  const calls: SetupCall[] = [];

  return {
    visit: (file, text): void => {
      calls.push(...setupCalls(text).map((call) => ({ file, call })));
    },
    finish: (): Finding[] => withoutRestore(calls, because),
  };
}

function withoutRestore(calls: readonly SetupCall[], because: string): Finding[] {
  const missing = RESTORE_OPTIONS.filter(([option]) => !calls.some(({ call }) => turnsOn(call, option)));

  if (missing.length === 0) {
    return [];
  }

  const where =
    calls.length === 0
      ? 'no setup file calls `setupAutoSpy()`'
      : `\`setupAutoSpy()\` in ${[...new Set(calls.map(({ file }) => file))].join(', ')} leaves ${missing.map(([option]) => `\`${option}\``).join(', ')} off`;

  return [
    {
      check: 'shared-env-without-restore',
      severity: 'info',
      ...(calls[0] === undefined ? {} : { file: calls[0].file }),
      message: `This Angular suite shares one environment across its files (${because}), and ${where}: ${missing.map(([, leak]) => leak).join(', ')} survives into the next file and fails there, in a file that never touched it.`,
      fix: `Call \`setupAutoSpy({ ${missing.map(([option]) => `${option}: true`).join(', ')} })\` in the setup file, or turn isolation back on for the files that leak.`,
    },
  ];
}
