#!/usr/bin/env node

/**
 * Generate `src/cli/checks/export-map.generated.ts` from this package's **own** `exports` map.
 *
 * Two `doctor` checks need to know which entry point exports which name: `helper-from-wrong-entry`
 * ("`provideAutoSpy` is imported from the root, which does not export it") and
 * `no-unawaited-helper` ("this `expectEmission` call is dropped on the floor"). Both claim zero
 * false positives, and a hand-written table cannot make that claim — it drifts the first time a
 * helper moves between entries, and it drifts silently, because nothing type-checks a list of
 * strings against the barrels it describes.
 *
 * So the table is derived: `exports` gives the subpath → `dist/<name>.d.ts` mapping, `dist` maps
 * back to `src/<name>.ts`, and the TypeScript API is asked for the exported symbols of each barrel
 * — which is the only way to see through the `export *` chains the barrels are made of. The same
 * program answers the second question: which of those exports have call signatures that *all*
 * return a promise. That set is `AWAITABLE_HELPERS`; nothing about it is a judgement call.
 *
 * The generated file ships in the same tarball as the CLI, so it always describes the version that
 * is running. Drift against the consumer's *installed* version is handled at check time, not here.
 *
 * Usage:
 *   node scripts/generate-export-map.mjs           # rewrite the generated file
 *   node scripts/generate-export-map.mjs --check    # fail if the committed file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(REPO, 'src/cli/checks/export-map.generated.ts');
const require = createRequire(import.meta.url);

function fail(message) {
  process.stderr.write(`generate-export-map: ${message}\n`);
  process.exit(1);
}

/** Subpath → the source barrel behind it, e.g. `./angular` → `src/angular.ts`. */
function entrySources(packageJson) {
  const entries = new Map();

  for (const [subpath, value] of Object.entries(packageJson.exports)) {
    const types = typeof value.types === 'string' ? value.types : value.import?.types;

    if (typeof types !== 'string') {
      fail(`the "${subpath}" export declares no types entry`);
    }

    const specifier = subpath === '.' ? packageJson.name : `${packageJson.name}${subpath.slice(1)}`;

    entries.set(specifier, join('src', `${basename(types).replace(/\.d\.ts$/, '')}.ts`));
  }

  return entries;
}

function buildProgram(ts, sources) {
  return ts.createProgram(
    sources.map((source) => resolve(REPO, source)),
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      strict: true,
    },
  );
}

/** `true` when every call signature the symbol has returns a promise — so dropping the call is a bug. */
function isAwaitable(ts, checker, symbol) {
  const declaration = symbol.declarations?.[0];

  if (declaration === undefined) {
    return false;
  }

  const signatures = checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures();

  return (
    signatures.length > 0 &&
    signatures.every((signature) => /^Promise[<(]/.test(checker.typeToString(checker.getReturnTypeOfSignature(signature))))
  );
}

function collect(ts, entries) {
  const program = buildProgram(ts, [...entries.values()]);
  const checker = program.getTypeChecker();
  const specifiers = [...entries.keys()];
  const exportedBy = new Map();
  const awaitable = new Set();

  specifiers.forEach((specifier, index) => {
    const source = program.getSourceFile(resolve(REPO, entries.get(specifier)));
    const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);

    if (moduleSymbol === undefined) {
      fail(`${entries.get(specifier)} is not a module`);
    }

    for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
      const name = symbol.getName();

      exportedBy.set(name, [...(exportedBy.get(name) ?? []), index]);

      if (isAwaitable(ts, checker, symbol)) {
        awaitable.add(name);
      }
    }
  });

  return { specifiers, exportedBy, awaitable };
}

const HEADER = `/**
 * Which entry point exports which name — generated from this package's own \`exports\` map.
 *
 * Never edit by hand: \`npm run export-map\` rewrites it and \`npm run export-map:check\` fails the
 * gate when it is stale. A hand-written copy would drift the first time a helper moved between
 * entries, and it would drift silently, which is exactly the claim \`helper-from-wrong-entry\` makes
 * it cannot afford.
 */
`;

function render({ specifiers, exportedBy, awaitable }, version) {
  const rows = [...exportedBy.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, indices]) => `  ${name}: '${indices.join(' ')}',`)
    .join('\n');

  return [
    HEADER,
    `/** The version this table describes. Compared against the consumer's installed one at check time. */`,
    `export const EXPORT_MAP_VERSION = '${version}';`,
    ``,
    `/** Every published entry specifier, in \`exports\` order. \`EXPORTED_BY\` indexes into this list. */`,
    `export const ENTRY_SPECIFIERS = '${specifiers.join(' ')}';`,
    ``,
    `/** Export name → the space-separated indices of every entry that exports it. */`,
    `export const EXPORTED_BY: Readonly<Record<string, string>> = {`,
    rows,
    `};`,
    ``,
    `/** Exports whose every call signature returns a promise — calling one and dropping it is a bug. */`,
    `export const AWAITABLE_HELPERS = '${[...awaitable].sort().join(' ')}';`,
    ``,
  ].join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const packageJson = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const ts = require('typescript');
  const prettier = await import('prettier');
  const collected = collect(ts, entrySources(packageJson));
  const options = await prettier.resolveConfig(OUTPUT);
  const content = await prettier.format(render(collected, packageJson.version), { ...options, filepath: OUTPUT });

  if (!check) {
    writeFileSync(OUTPUT, content);
    process.stdout.write(`generate-export-map: wrote ${collected.exportedBy.size} names over ${collected.specifiers.length} entries\n`);

    return;
  }

  let current = '';

  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    fail('src/cli/checks/export-map.generated.ts is missing — run `npm run export-map`');
  }

  if (current !== content) {
    fail('src/cli/checks/export-map.generated.ts is stale — run `npm run export-map`');
  }

  process.stdout.write('generate-export-map: up to date\n');
}

await main();
