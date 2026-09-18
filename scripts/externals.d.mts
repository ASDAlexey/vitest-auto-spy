/**
 * Types for `externals.mjs`, so `tsup.config.ts` — which is TypeScript — can read the same list the
 * measuring scripts read. The implementation stays plain JavaScript because `scripts/` is run by
 * `node` directly, with no build step.
 */
import type { Plugin } from 'esbuild';

export declare const PEER_EXTERNALS: string[];

export declare const externalizeBareImports: Plugin;
