/**
 * The parts of the managed block a profile cannot answer: which setup file the unit-test builder
 * runs, and which Angular companion entries the sources import.
 */
import { entryExports, findEntryImports, ownersOf } from './checks/entry-imports';
import { buildGraph } from './checks/graph';
import { unitTestTargets } from './checks/unit-test-targets';
import type { BlockFacts } from './init-block';
import type { Profile } from './profile';

const ANGULAR = 'vitest-auto-spy/angular';

const COMPANIONS = ['vitest-auto-spy/angular/diagnostics', 'vitest-auto-spy/angular/doubles', 'vitest-auto-spy/angular/matchers'];

function builderSetupFile(profile: Profile): string | undefined {
  for (const target of unitTestTargets(profile)) {
    for (const block of target.optionBlocks) {
      const setupFiles: unknown = block['setupFiles'];
      const [first]: unknown[] = Array.isArray(setupFiles) ? setupFiles : [];

      if (typeof first === 'string') {
        return first.replace(/^\.\//, '');
      }
    }
  }

  return undefined;
}

/** A companion named directly, or the one owning a name still imported from `/angular` after 5.21.0 moved it. */
function companionsOf(entry: string, name: string): readonly string[] {
  if (COMPANIONS.includes(entry)) {
    return [entry];
  }

  return entry === ANGULAR && entryExports(ANGULAR)?.has(name) === false
    ? ownersOf(name).filter((owner) => COMPANIONS.includes(owner))
    : [];
}

function importedCompanions(profile: Profile): string[] {
  const used = new Set<string>();

  for (const text of buildGraph(profile).texts.values()) {
    for (const { entry, name } of findEntryImports(text)) {
      companionsOf(entry, name).forEach((companion) => used.add(companion));
    }
  }

  return COMPANIONS.filter((companion) => used.has(companion));
}

export function blockFacts(profile: Profile): BlockFacts {
  return { setupFile: builderSetupFile(profile), companions: profile.hasAngular ? importedCompanions(profile) : [] };
}
