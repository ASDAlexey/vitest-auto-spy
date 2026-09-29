import type { PerfFile } from './perf-data';

export const LANE_ONE_FIRST: Partial<PerfFile> = { lane: 1, start: 0, heap: 0 };

export const LANE_TWO_FIRST: Partial<PerfFile> = { lane: 2, start: 0, heap: 0 };

export const LANE_ONE_SECOND: Partial<PerfFile> = { lane: 1, start: 1, heap: 1_048_576 };
