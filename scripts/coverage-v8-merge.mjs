// The v8 coverage provider, with one thing changed: the raw script coverages are merged all at
// once instead of being folded together a pair at a time.
//
// `@vitest/coverage-v8@5.0.0` accumulates every worker's payload with
// `mergeScriptCovs(previous ? [previous, script] : [script])` (provider.js:49-63) — a running
// fold. That fold is not associative: `mergeScriptCovs` normalises the range tree it returns, and
// a range that normalisation collapsed into its parent can no longer absorb the counts of the next
// payload, so a covered block is dropped. Which block depends on the order the workers finish in,
// which is why the gate failed the 100 % threshold with all 113 test files green, blaming four or
// five different lines every attempt. Measured on this repository: folded, branches land anywhere
// between 99.52 % and 100 % across runs; merged in one call, three consecutive runs report
// 3821/3821 — the same denominator, no missing blocks.
//
// Handing the provider one already-merged script per URL is enough. Its fold then only ever sees
// a single entry, `mergeScriptCovs([script])` returns it unchanged, and everything downstream —
// source-map remapping, `startOffset`, the reports, the thresholds — is upstream's code, untouched.
//
// Drop this file and set `provider: 'v8'` back when vitest merges the payloads in one call
// upstream. Background and measurements: tasks/2026-09-06-session/coverage-flake.md.
import { mergeScriptCovs } from '@bcoe/v8-coverage';
import v8 from '@vitest/coverage-v8';

/**
 * `readCoverageFiles` reads one payload per test file and calls `onFileRead` for each, then
 * `onFinished` once per project and environment. Buffering between the two gives every payload for
 * a URL to a single `mergeScriptCovs` call.
 */
function mergeInOneCall(provider) {
  if (typeof provider.readCoverageFiles !== 'function') {
    throw new TypeError(
      'coverage-v8-merge: the v8 provider no longer reads coverage through readCoverageFiles. ' +
        'Check whether vitest still folds script coverages pairwise, and delete this file if it does not.',
    );
  }

  const readCoverageFiles = provider.readCoverageFiles.bind(provider);

  provider.readCoverageFiles = ({ onFileRead, onFinished, onDebug }) => {
    const scriptsByUrl = new Map();

    return readCoverageFiles({
      onDebug,

      onFileRead(coverage) {
        for (const script of coverage.result) {
          const scripts = scriptsByUrl.get(script.url);

          if (scripts) {
            scripts.push(script);
          } else {
            scriptsByUrl.set(script.url, [script]);
          }
        }
      },

      onFinished: async (project, environment) => {
        const result = [];

        for (const scripts of scriptsByUrl.values()) {
          const merged = mergeScriptCovs(scripts);

          // Both are what the upstream fold carries across a merge: the first offset anyone
          // reported, and the flag set if it was set anywhere.
          merged.startOffset = scripts.find((script) => script.startOffset)?.startOffset ?? 0;

          if (scripts.some((script) => script.isExtendedContext)) {
            merged.isExtendedContext = true;
          }

          result.push(merged);
        }

        scriptsByUrl.clear();
        onFileRead({ result });

        await onFinished(project, environment);
      },
    });
  };

  return provider;
}

export default {
  ...v8,
  async getProvider() {
    return mergeInOneCall(await v8.getProvider());
  },
};
