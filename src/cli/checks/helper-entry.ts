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
import { dirname, join } from 'node:path';

import type { Profile } from '../profile';
import type { Finding } from '../report';
import { entryExports, findEntryImports, installedEntries, ownersOf, scanSources } from './entry-imports';
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

/**
 * Only owners the install resolved from the file publishes: the table can be a minor ahead of it
 * (5.21.0 moved helpers in one), and a fix naming a missing entry is `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
function publishedOwners(profile: Profile, file: string, name: string): readonly string[] {
  const published = installedEntries(join(profile.cwd, dirname(file)));

  return ownersOf(name).filter((owner) => published?.has(owner) === true);
}

export function checkHelperEntry(profile: Profile, graph: SourceGraph): Finding[] {
  return scanSources(profile, graph, (file, text, report) => {
    for (const { entry, name } of findEntryImports(text)) {
      const exported = entryExports(entry);
      const owners = exported === undefined || exported.has(name) ? [] : candidates(publishedOwners(profile, file, name), profile.entry);

      if (owners.length > 0) {
        report(findingFor(file, entry, name, owners));
      }
    }
  });
}
