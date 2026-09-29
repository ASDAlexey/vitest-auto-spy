import type { PerfProject, PerfVitest } from './perf-reporter';

export const vitestInit = (projects: readonly PerfProject[]): PerfVitest => ({
  config: { root: '/repo' },
  state: { transformTime: 0 },
  projects,
});
