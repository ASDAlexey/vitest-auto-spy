// The one min+gzip measurement `size-badge.mjs` and `size-entries.mjs` both publish: bundle an entry
// from `dist/`, minify and gzip it in memory, peers external. Nothing is written to `dist/`.
import { build } from 'esbuild';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

import { externalizeBareImports } from './externals.mjs';

const BUILD_OPTIONS = {
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'neutral',
  plugins: [externalizeBareImports],
  write: false,
  logLevel: 'silent',
};

// The root re-exports under `ɵ` names what `/angular` and the framework entries take from it
// (scripts/host-entries.mjs). No consumer imports those, so they are not kept alive in the weight.
const HIDDEN_EXPORT = /^ɵ/u;

/** Min+gzip bytes of the public surface of one built entry. */
export async function minGzip(path) {
  const probe = await build({ ...BUILD_OPTIONS, entryPoints: [path], metafile: true });
  const exported = Object.values(probe.metafile.outputs)[0].exports;
  let [{ contents }] = probe.outputFiles;

  if (exported.some((name) => HIDDEN_EXPORT.test(name))) {
    const publicNames = exported.filter((name) => !HIDDEN_EXPORT.test(name));
    const result = await build({
      ...BUILD_OPTIONS,
      stdin: { contents: `export { ${publicNames.join(', ')} } from ${JSON.stringify(path)};`, resolveDir: dirname(path), loader: 'js' },
    });

    [{ contents }] = result.outputFiles;
  }

  return gzipSync(contents, { level: 9 }).length;
}
