#!/usr/bin/env node
// Points `/rxjs`'s augmentation at the declaration chunk instead of the root entry.
//
// `declare module 'vitest-auto-spy'` makes TypeScript load `dist/index.d.ts`, and the root is the
// entry that merges Vitest's mock types in (`src/lib/vitest-mock-types.ts`), so a Bun or
// `node:test` consumer of `/rxjs` got TS2307 on `vitest`. The chunk that declares
// `AutoSpyRxjsTypes` is the same declaration the root re-exports, so a Vitest consumer's merge is
// unchanged. Also exports the entries whose declarations must never reach `vitest` (check-dist).
//
// Usage: node scripts/portable-dts.mjs    (after tsup, before check-dist)
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = 'dist';
const ROOT_AUGMENTATION = /declare module ['"]vitest-auto-spy['"] \{\s*interface AutoSpyRxjsTypes</;
export const PORTABLE_ENTRIES = [
  'node',
  'bun',
  'bun-angular',
  'rstest',
  'jasmine-compat',
  'angular-router',
  'console',
  'nestjs',
  'observer-spy',
  'rxjs',
];

function fail(message) {
  process.stderr.write(`portable-dts: ${message}\n`);
  process.exit(1);
}

/** The chunk that declares `AutoSpyRxjsTypes`, and the name it exports it under. */
function seamChunk() {
  for (const file of readdirSync(DIST).filter((name) => name.endsWith('.d.ts'))) {
    const exported = /export (?:type )?\{[^}]*\bAutoSpyRxjsTypes as (\w+)\b/.exec(readFileSync(join(DIST, file), 'utf8'));

    if (exported !== null) {
      return { file, alias: exported[1] };
    }
  }

  return fail('no declaration chunk exports AutoSpyRxjsTypes');
}

function main() {
  // Earlier builds copied the chunks there; with tsup's `clean: false` a stale copy would ship.
  rmSync(join(DIST, 'portable'), { recursive: true, force: true });

  const file = join(DIST, 'rxjs.d.ts');
  const source = readFileSync(file, 'utf8');

  if (!ROOT_AUGMENTATION.test(source)) {
    fail('dist/rxjs.d.ts no longer augments AutoSpyRxjsTypes on `vitest-auto-spy`; update this script');
  }

  const seam = seamChunk();

  writeFileSync(
    file,
    source.replace(ROOT_AUGMENTATION, `declare module './${seam.file.replace(/\.d\.ts$/, '.js')}' {\n  interface ${seam.alias}<`),
  );
  process.stdout.write(`portable-dts: /rxjs augments ${seam.file}; ${PORTABLE_ENTRIES.join(', ')} declare no vitest\n`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
