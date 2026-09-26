// Lets one entry host the core and the entries loaded beside it import the core from that file.
//
// An Angular spec imports the root entry and `/angular` in every file. Built solo, each carried its
// own copy of the same ~130 kB of core, so every Angular spec file parsed it twice. esbuild's own
// code splitting would share it through a chunk, which costs the root an extra module when it is
// loaded alone — the case every non-Angular spec is. Here the root itself is the shared file:
//
//   * a satellite (`/angular`, `/react`, `/vue`, `/svelte`) resolves every module the root already
//     bundles to `./index.js` instead of inlining it;
//   * the root re-exports what the satellites take from it under `ɵ`-prefixed names that no
//     `.d.ts` declares, so the public surface of `vitest-auto-spy` does not change.
//
// The root alone keeps its module count; a satellite adds one module and stops inlining the core.
// Which names the root must expose is only known after the satellites are tree-shaken, so
// `planHostedEntries` builds them in memory once before tsup's passes run.
import { build } from 'esbuild';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const HIDDEN_PREFIX = 'ɵ';
const HOST_NAMESPACE = 'vitest-auto-spy-host';
const REEXPORT_NAMESPACE = 'vitest-auto-spy-host-reexport';

const SOURCE_EXTENSIONS = ['', '.ts', '/index.ts'];

function resolveSource(resolveDir, specifier) {
  const base = resolve(resolveDir, specifier);

  return SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function hiddenName(sourceRoot, modulePath, exportName) {
  const key = relative(sourceRoot, modulePath)
    .replace(/\.ts$/, '')
    .replace(/^lib[\\/]/, '')
    .replace(/[\\/]/g, '$')
    .replace(/[^\w$]/g, '_');

  return `${HIDDEN_PREFIX}${key}$${exportName}`;
}

/**
 * @param {{
 *   root: string,
 *   host: string,
 *   publicBarrel: string,
 *   hostFile: string,
 *   satellites: string[],
 *   external: string[],
 *   plugins: () => import('esbuild').Plugin[],
 *   inline?: string[],
 * }} options
 */
export async function planHostedEntries(options) {
  const root = resolve(options.root);
  const hostPath = resolve(root, options.host);
  const barrelPath = resolve(root, options.publicBarrel);
  const hostDir = dirname(hostPath);
  const hostSpecifier = `./${options.hostFile}`;
  // `charset: 'utf8'` as tsup sets it: the default escapes `ɵ`, and the scan below would miss it.
  const common = {
    bundle: true,
    format: 'esm',
    platform: 'node',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
    external: options.external,
  };

  const hostProbe = await build({ ...common, entryPoints: [hostPath], metafile: true, plugins: options.plugins() });
  const inlined = new Set((options.inline ?? []).map((path) => resolve(root, path)));
  const hostInputs = new Set(
    Object.keys(hostProbe.metafile.inputs)
      .map((input) => resolve(root, input))
      .filter((input) => !inlined.has(input)),
  );
  const [hostOutput] = Object.values(hostProbe.metafile.outputs);
  const publicNames = hostOutput.exports;

  const exportCache = new Map();

  async function exportsOf(modulePath) {
    if (modulePath === hostPath || modulePath === barrelPath) {
      return publicNames.map((name) => [name, name]);
    }

    if (!exportCache.has(modulePath)) {
      const probe = await build({ ...common, entryPoints: [modulePath], metafile: true });
      const [output] = Object.values(probe.metafile.outputs);

      exportCache.set(
        modulePath,
        output.exports.map((name) => [name, hiddenName(hostDir, modulePath, name)]),
      );
    }

    return exportCache.get(modulePath);
  }

  /** Candidate hidden name → the module and export it stands for. */
  const hiddenIndex = new Map();
  /** Hidden name → the public export that is already the same binding. */
  const aliases = new Map();

  function satellitePlugin() {
    return {
      name: 'vitest-auto-spy:import-from-host',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\./ }, (args) => {
          if (args.kind === 'entry-point' || args.namespace !== 'file') {
            return undefined;
          }

          const modulePath = resolveSource(args.resolveDir, args.path);

          return modulePath && hostInputs.has(modulePath)
            ? { path: relative(root, modulePath), namespace: REEXPORT_NAMESPACE, sideEffects: false }
            : undefined;
        });

        pluginBuild.onLoad({ filter: /./, namespace: REEXPORT_NAMESPACE }, async (args) => {
          const modulePath = resolve(root, args.path);
          const pairs = await exportsOf(modulePath);

          for (const [exportName, hidden] of pairs) {
            if (hidden !== exportName) {
              hiddenIndex.set(hidden, { modulePath, exportName });
            }
          }

          const specifiers = pairs.map(([exportName, hidden]) => {
            const imported = aliases.get(hidden) ?? hidden;

            return imported === exportName ? exportName : `${imported} as ${exportName}`;
          });

          return {
            contents: specifiers.length > 0 ? `export { ${specifiers.join(', ')} } from ${JSON.stringify(hostSpecifier)};\n` : '',
            loader: 'js',
          };
        });

        // The re-export modules name the host by a relative specifier on purpose: it is what the
        // shipped satellite must import, so esbuild has to leave it alone.
        pluginBuild.onResolve({ filter: /./ }, (args) =>
          args.path === hostSpecifier ? { path: hostSpecifier, external: true } : undefined,
        );
      },
    };
  }

  const used = new Set();

  for (const satellite of options.satellites) {
    const probe = await build({ ...common, entryPoints: [resolve(root, satellite)], plugins: [...options.plugins(), satellitePlugin()] });
    const [output] = probe.outputFiles;

    for (const [name] of output.text.matchAll(new RegExp(`${HIDDEN_PREFIX}[\\w$]+`, 'gu'))) {
      if (hiddenIndex.has(name)) {
        used.add(name);
      }
    }
  }

  const exportLine = (hidden) => {
    const { modulePath, exportName } = hiddenIndex.get(hidden);

    return `export { ${exportName} as ${hidden} } from ${JSON.stringify(modulePath)};`;
  };
  let hostExports = [...used].sort().map(exportLine);

  // A satellite that imports `createAutoMock` from its own module gets the root's public export of
  // the same binding rather than a second, hidden name for it. esbuild's export clause tells which.
  const hostSource = () => [readFileSync(hostPath, 'utf8'), ...hostExports].join('\n');
  const aliasProbe = await build({
    ...common,
    stdin: { contents: hostSource(), resolveDir: hostDir, loader: 'ts', sourcefile: basename(hostPath) },
    plugins: options.plugins(),
  });
  const clause = aliasProbe.outputFiles[0].text.match(/export \{([^}]*)\};\s*$/)?.[1] ?? '';
  const localOf = new Map(
    clause.split(',').map((specifier) => {
      const [local, exported = local] = specifier.trim().split(/\s+as\s+/);

      return [exported, local];
    }),
  );
  const publicByLocal = new Map(publicNames.map((name) => [localOf.get(name), name]));

  for (const hidden of used) {
    const publicName = publicByLocal.get(localOf.get(hidden));

    if (publicName) {
      aliases.set(hidden, publicName);
    }
  }

  hostExports = [...used]
    .filter((hidden) => !aliases.has(hidden))
    .sort()
    .map(exportLine);

  function hostPlugin() {
    return {
      name: 'vitest-auto-spy:host-core',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' && resolve(root, args.path) === hostPath
            ? { path: basename(hostPath), namespace: HOST_NAMESPACE }
            : undefined,
        );

        pluginBuild.onLoad({ filter: /./, namespace: HOST_NAMESPACE }, () => ({
          contents: hostSource(),
          loader: 'ts',
          resolveDir: hostDir,
        }));
      },
    };
  }

  return { hostPlugin, satellitePlugin, hiddenExports: hostExports.length };
}
