/**
 * An Analog-compiled Angular suite on plain Vitest that leaves this package externalized.
 *
 * Analog's Vitest plugin inlines `@angular/core/testing` (`ssr.noExternal: [/fesm2022(.*?)testing/]`),
 * so the spec's `TestBed` is the Vite-evaluated copy. Vitest externalizes `vitest-auto-spy` like any
 * dependency, and its `/angular` entry then imports the other, native copy: two `TestBed`s, one
 * initialised. `injectSpy` throws "Need to call TestBed.initTestEnvironment() first" or "Cannot read
 * properties of null (reading 'ngModule')", and nothing in either message points here.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { type SourceGraph, type TextPass, inOnePass } from './graph';
import { codeOnly } from './literals';
import { declaredUpTree, isRunnerConfig, textsOf } from './vitest-5-facts';

const ANALOG_PLUGIN = /["']@analogjs\/(?:vite-plugin-angular|platform|vitest-angular)["']/;
const ANGULAR_ENTRY = /["']vitest-auto-spy\/(?:angular|angular-http)["']/;
const INLINED = /^(?:inline|noExternal)\s*:\s*(?:true\b|\[[^\]]*vitest-auto-spy)/;

/** Keys are read from code, the list's contents from the text: the package name is a string there. */
function inlinesThePackage(text: string): boolean {
  const code = codeOnly(text);

  return [...code.matchAll(/\b(?:inline|noExternal)\s*:/g)].some((match) => INLINED.test(text.slice(match.index)));
}

export function checkAngularTestBedSplit(profile: Profile, graph: SourceGraph): Finding[] {
  return inOnePass(graph, [angularTestBedSplitPass(profile, graph)]);
}

export function angularTestBedSplitPass(profile: Profile, graph: SourceGraph): TextPass | undefined {
  if (!profile.hasAngular || !declaredUpTree(profile, 'vitest-auto-spy')) {
    return undefined;
  }

  const configs = textsOf(graph, isRunnerConfig);
  const first = configs.find(({ text }) => ANALOG_PLUGIN.test(text));

  if (first === undefined || configs.some(({ text }) => inlinesThePackage(text))) {
    return undefined;
  }

  let importing = 0;

  return {
    visit: (_file, text): void => {
      importing += ANGULAR_ENTRY.test(text) ? 1 : 0;
    },
    finish: (): Finding[] => (importing === 0 ? [] : [split(first.file, importing)]),
  };
}

function split(file: string, importing: number): Finding {
  return {
    check: 'angular-testbed-split',
    severity: 'warning',
    file,
    message: `The Analog plugin inlines \`@angular/core/testing\` while Vitest externalizes \`vitest-auto-spy\`, which ${importing} ${importing === 1 ? 'file imports' : 'files import'} for Angular: its \`TestBed\` is a second copy nobody initialised, and \`injectSpy\` throws "Need to call TestBed.initTestEnvironment() first" or "Cannot read properties of null (reading 'ngModule')".`,
    fix: "Add `server: { deps: { inline: ['vitest-auto-spy'] } }` to the `test` block of this config, so the package goes through Vite and shares the spec's `TestBed`.",
  };
}
