// Lets `node --test` load this repository's TypeScript sources without a bundler in the way.
//
// Why a hook rather than an esbuild step: `src/node.ts` registers its mock adapter as a top-level
// side effect, `sideEffects: false` is the truth for most of this package, and every bundler is
// therefore free to tree-shake that call away — which turns the one thing a real-runtime suite
// exists to prove into "No mock adapter registered". Running the sources means nothing can.
//
// What Node cannot do on its own is find them: the library's own imports are extensionless
// (`./lib/mock-adapter`), and the ESM resolver never tries `.ts` for a specifier that names no
// extension. `--experimental-transform-types` handles the rest — plain strip-only mode dies on the
// parameter properties in `src/lib/**` with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[mc]?[jt]s$/.test(specifier) && context.parentURL) {
      const base = new URL(specifier, context.parentURL);

      for (const candidate of [`${base.href}.ts`, `${base.href}/index.ts`]) {
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate, shortCircuit: true };
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
