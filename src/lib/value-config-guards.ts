/**
 * Type guards that narrow a `ValueConfig` union to its concrete variant.
 */

import type { CompleteValueConfig, ErrorValueConfig, NextValueConfig, ValueConfig } from './types';

export function isCompleteConfig<T>(config: ValueConfig<T>): config is CompleteValueConfig {
  return 'complete' in config;
}

export function isNextValueConfig<T>(config: ValueConfig<T>): config is NextValueConfig<T> {
  return 'value' in config;
}

export function isErrorConfig<T>(config: ValueConfig<T>): config is ErrorValueConfig {
  return 'errorValue' in config;
}
