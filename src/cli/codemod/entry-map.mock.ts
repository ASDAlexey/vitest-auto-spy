import type { EntryMap } from './entry-map';

export const SAMPLE_ENTRY_MAP: EntryMap = {
  source: 'test',
  byName: new Map([
    ['Spy', ['vitest-auto-spy']],
    ['expectEmission', ['vitest-auto-spy/rxjs', 'vitest-auto-spy']],
    ['mockSignalProp', ['vitest-auto-spy/angular']],
    // The real shapes, read off the installed package: several entries, and no root among them.
    [
      'provideAutoSpy',
      [
        'vitest-auto-spy/bun-angular',
        'vitest-auto-spy/jasmine',
        'vitest-auto-spy/angular',
        'vitest-auto-spy/nestjs',
        'vitest-auto-spy/vue',
      ],
    ],
    ['injectSpy', ['vitest-auto-spy/bun-angular', 'vitest-auto-spy/angular', 'vitest-auto-spy/nestjs']],
    ['shared', ['vitest-auto-spy/vue', 'vitest-auto-spy/svelte']],
    ['tick', ['vitest-auto-spy/node', 'vitest-auto-spy/console']],
  ]),
};
