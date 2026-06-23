# Bundle / package size optimization (task 4)

> Goal: make the published package smaller with identical functionality.

## Current built output (`dist/`, v1.0.1)

| File | Bytes | In npm tarball? |
|---|---:|---|
| `index.js` (ESM) | 13,951 | yes |
| `index.cjs` (CJS) | 14,354 | yes |
| `index.js.map` | 36,016 | **yes** |
| `index.cjs.map` | 36,205 | **yes** |
| `index.d.ts` | 8,353 | yes |
| `index.d.cts` | 8,353 (byte-identical to `.d.ts`) | yes |

**Published tarball:** ~29.4 kB compressed / **131.0 kB unpacked**, 9 files. The two
sourcemaps (72.2 kB) are **55% of the unpacked size** and ship to every consumer.

Runtime dependency `javascript-stringify`: ~132 kB on disk, of which ~22 kB is runtime `.js`.
Zero transitive dependencies.

## Prioritized recommendations

| # | Change | Est. saved (unpacked) | Preserves behavior? |
|---|---|---:|---|
| **1** | **Stop shipping sourcemaps.** `sourcemap: false` in `tsup.config.ts` (or exclude `dist/**/*.map` from `files`). | **~72 kB** (131 → ~59 kB) | **100%** — maps are non-functional. |
| **2** | **Minify the build.** `minify: true` in `tsup.config.ts`. ESM 14 kB → ~5 kB; CJS similar. | **~17 kB** | **100%** — identical runtime semantics. |
| **3** | **Drop `javascript-stringify`** for a small inline serializer in `args-map.ts` + `error-handler.ts`. | ~132 kB off the **install tree** (not the tarball); −1 dependency | **Risky** — see below. |
| 4 | Leave `index.d.cts` as-is. | 8.4 kB (not safe to remove) | Removing risks CJS type resolution under node16/bundler. |

**Combined low-risk wins (#1 + #2): 131 kB → ~30 kB (~77% smaller), zero behavior change**, only
`tsup.config.ts` touched. These are the clear, safe priorities.

## On dropping `javascript-stringify` (#3)

Used in exactly two spots, both `stringify(x)` with no options:
- `args-map.ts` — builds a stable string key for `calledWith`/`mustBeCalledWith` arg matching.
- `error-handler.ts` — formats the `mustBeCalledWith` mismatch message.

`JSON.stringify` is **not** a drop-in:
- The error test (`auto-spy.spec.ts`) asserts single-quoted output (`…were: 1,'a'`); JSON uses
  double quotes.
- The arg key must distinguish values JSON mangles: `undefined` (JSON → `null`), functions,
  symbols, and `BigInt` (JSON **throws**). Collapsing these silently breaks arg matching.

So #3 means a ~25–40 LOC inline serializer covering primitives, `undefined`, arrays, plain
objects, functions, symbols, BigInt, Date, **and circular refs** — reproducing the quoting and
key-equality semantics exactly. It only removes ~22 kB of JS with no transitive deps, so the
payoff is modest and the regression risk is the highest of the four. **Recommendation: defer #3
to its own PR gated by the serialization-contract tests; do #1 and #2 now.**

## Dead code / inflation
- No dead code (`treeshake: true`, `sideEffects: false`, single re-export barrel).
- JS is currently **unminified** (hence #2).
- `index.d.cts` duplicates `index.d.ts` byte-for-byte — required by the dual `exports` map, not
  safely removable.

## Files to touch
- `tsup.config.ts` — #1, #2.
- `package.json` (`files`, `dependencies`) — #1 (narrow `files`), #3.
- `src/lib/args-map.ts`, `src/lib/error-handler.ts` — #3.
- Keep `src/auto-spy.spec.ts` serialization assertions green for #3.
