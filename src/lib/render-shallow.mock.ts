import type { Type } from '@angular/core';

import type { RenderShallowOptions } from './render-shallow';

export function createKeepModuleOptions<T>(module: Type<unknown>): RenderShallowOptions<T> {
  return { keepTemplate: true, keepModules: [module] };
}
