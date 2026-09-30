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

/** A workspace whose packages reach each other through tsconfig `paths`, as an Nx monorepo does. */
export const PACKAGE_BARREL_REPO: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
  'tsconfig.json': JSON.stringify({
    compilerOptions: { paths: { '@ws/util': ['libs/util/src/index.ts'], '@ws/gone': ['libs/gone/index.ts'], '@ws/*': ['libs/*'] } },
  }),
  'libs/util/src/index.ts': "export * from './a';\nexport * from './b';\n",
  'libs/util/src/a.ts': 'export const a = 1;\n',
  'libs/util/src/b.ts': 'export const b = 2;\n',
  'libs/util/src/inner.spec.ts': "import { a } from '@ws/util';\n",
  'libs/app/subject.ts': "import { a } from '@ws/util';\nexport const subject = a;\n",
  'libs/app/subject.spec.ts': "import { b } from '@ws/util';\nimport { subject } from './subject';\n",
  'libs/app/other.spec.ts': "import { b } from '@ws/util';\n",
  'libs/app/local/index.ts': "export * from './x';\nexport * from './y';\n",
  'libs/app/local/x.ts': 'export const x = 1;\n',
  'libs/app/local/y.ts': 'export const y = 2;\n',
  'libs/app/local.spec.ts': "import { x } from './local/index';\n",
};

export const CASE_SPECS: readonly string[] = ['src/case-0.spec.ts', 'src/case-1.spec.ts'];

export const HEAVY_ENVIRONMENT_FILE: Partial<PerfFile> = { environment: 9_000, tests: 10 };
