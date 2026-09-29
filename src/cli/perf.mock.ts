import type { PerfFile } from './perf-data';

/**
 * One repository for every ordering the report has to be stable under: barrels of different width,
 * two of the same width, one spec importing two of them, and a module two barrels share.
 */
export const BARREL_REPO: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
  'src/index.ts': "export * from './a';\nexport * from './b';\n",
  'src/a.ts': "export * from './shared';\nexport const a = 1;\n",
  'src/b.ts': "export * from './shared';\nexport const b = 2;\n",
  'src/shared.ts': 'export const shared = 3;\n',
  'src/other/index.ts': "export * from './x';\nexport * from './y';\n",
  'src/other/x.ts': 'export const x = 1;\n',
  'src/other/y.ts': 'export const y = 2;\n',
  'src/p/index.ts': "export * from './m';\nexport * from './n';\n",
  'src/p/m.ts': 'export const m = 1;\n',
  'src/p/n.ts': 'export const n = 2;\n',
  'src/q/index.ts': "export * from './r';\nexport * from './s';\n",
  'src/q/r.ts': 'export const r = 1;\n',
  'src/q/s.ts': 'export const s = 2;\n',
  'src/one.spec.ts': "import { a } from './index';\n",
  'src/two.spec.ts': "import { x } from './other/index';\n",
  'src/both.spec.ts': "import { m } from './p/index';\nimport { r } from './q/index';\n",
  'src/direct.spec.ts': "import { shared } from './shared';\n",
  'src/not-a-spec.ts': "import { a } from './index';\n",
};

export const CASE_SPECS: readonly string[] = ['src/case-0.spec.ts', 'src/case-1.spec.ts'];

export const HEAVY_ENVIRONMENT_FILE: Partial<PerfFile> = { environment: 9_000, tests: 10 };
