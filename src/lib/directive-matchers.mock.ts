import type { Type } from '@angular/core';

export function highlightHostConfig(scope: readonly Type<unknown>[]): { template: string; scope: readonly Type<unknown>[] } {
  return { template: '<div appHighlight></div>', scope };
}
