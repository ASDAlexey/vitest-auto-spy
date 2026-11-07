import type { PerfProject, PerfVitest } from './perf-reporter';

export const CI_SHARD = { index: 2, count: 3 };

export const vitestInit = (projects: readonly PerfProject[]): PerfVitest => ({
  config: { root: '/repo' },
  state: { transformTime: 0 },
  projects,
});
