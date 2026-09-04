/**
 * A helper imported from an entry point that does not export it.
 *
 * `provideAutoSpy` and `injectSpy` live in `/angular` and `/nestjs`, `expectRequest` in
 * `/angular-http`, `setupAutoSpy` in `/setup`, `subscribeSpyTo` in `/observer-spy` — and
 * `flushEventLoop` is in the root but not in `/angular`. Importing one from the wrong entry is not
 * a style question: the entry decides which mock adapter is registered, which is why the names are
 * not re-exported from a single barrel.
 *
 * It is a `doctor` check rather than a lint rule because resolving a name to the entry that owns it
 * needs a table generated from the installed version's own export map, which no per-file linter
 * has. And it survives in the wild for the same reason `tsconfig-glob-matches-nothing` does: the
 * files it fires in are usually the files no `tsc` program covers.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { entryExports, findEntryImports, ownersOf, tableApplies } from './entry-imports';
import type { SourceGraph } from './graph';

/**
 * `provideAutoSpy` exists in five entries, one implementation each, so the raw owner list is a menu
 * rather than an answer. When the repository's own entry is on it, that is the answer.
 */
function candidates(owners: readonly string[], preferred: string): readonly string[] {
  return owners.includes(preferred) ? [preferred] : owners;
}

function findingFor(file: string, entry: string, name: string, owners: readonly string[]): Finding {
  const list = owners.map((owner) => `\`${owner}\``).join(' or ');

  return {
    check: 'helper-from-wrong-entry',
    severity: 'error',
    file,
    message: `Imports \`${name}\` from \`${entry}\`, which does not export it.`,
    fix: `Change the specifier to ${list}. The entry point decides which mock adapter and which framework wiring the file gets, which is why the name is not re-exported from the root.`,
  };
}

export function checkHelperEntry(profile: Profile, graph: SourceGraph): Finding[] {
  if (!tableApplies(profile.cwd)) {
    return [];
  }

  const findings: Finding[] = [];

  for (const [file, text] of graph.texts) {
    for (const { entry, name } of findEntryImports(text)) {
      const exported = entryExports(entry);
      const owners = candidates(ownersOf(name), profile.entry);

      if (exported !== undefined && !exported.has(name) && owners.length > 0) {
        findings.push(findingFor(file, entry, name, owners));
      }
    }
  }

  return findings;
}
