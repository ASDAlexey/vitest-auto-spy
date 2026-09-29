import { type Observable, of } from 'rxjs';

import type { AutoMockConfiguration } from './auto-mock';

export class Feed {
  items$: Observable<number> = of(1);

  refresh(): void {
    /* real */
  }
}

export const STRICT_FEED_CONFIG: AutoMockConfiguration<Feed> = { strict: true, observablePropsToSpyOn: ['items$'] };
