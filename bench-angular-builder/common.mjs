import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = import.meta.dirname;
export const DEFAULT_WORK = join(tmpdir(), 'vitest-auto-spy-bench-angular-builder');
export const DEFAULT_LIB = '5.34.0';
export const DEFAULT_SEED = 20260926;

export const ARMS = {
  A: { ng: '22.1.8', ngTool: '22.1.9', vitest: '4.1.11' },
  B: { ng: '22.2.0', ngTool: '22.2.0', vitest: '4.1.11' },
  C: { ng: '22.2.0', ngTool: '22.2.0', vitest: '5.0.2' },
};

export const PROVIDERS = ['v8', 'istanbul'];

export const armDir = (work, arm, files) => join(work, 'arms', `${arm}-${files}`);

// Order matters: the round-robin rotation in run.mjs indexes into this list.
export function cellsFor(arms, providers) {
  const cells = [];
  for (const provider of PROVIDERS) {
    if (!providers.includes(provider)) continue;
    for (const arm of Object.keys(ARMS)) if (arms.includes(arm)) cells.push({ arm, provider });
  }
  return cells;
}

export const ngEnv = () => {
  const env = { ...process.env, NG_CLI_ANALYTICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env.CI;
  return env;
};

export const ngTestArgs = (provider) =>
  provider === 'none'
    ? ['node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false', '--no-coverage', '--runner-config=vitest-v8.config.mts']
    : ['node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false', '--coverage', `--runner-config=vitest-${provider}.config.mts`];

export const isMain = (url) => process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
