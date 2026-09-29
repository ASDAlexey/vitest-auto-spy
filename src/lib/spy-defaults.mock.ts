import { type Observable, of } from 'rxjs';

import type { ClassSpyConfiguration } from './types';

export class RouterLike {
  events: Observable<string> = of('start');

  private currentUrl = '/home';

  navigate(): boolean {
    return true;
  }

  reload(): void {
    /* real */
  }

  get url(): string {
    return this.currentUrl;
  }
}

export class AccountLike {
  ping(): void {
    /* real */
  }

  get isGuest(): boolean {
    return true;
  }
}

export const ROUTER_REGISTRATION: ClassSpyConfiguration<RouterLike> = {
  observablePropsToSpyOn: ['events'],
  gettersToSpyOn: ['url'],
};

export const ACCOUNT_PING_ENTRY: readonly [typeof AccountLike, ClassSpyConfiguration<AccountLike>] = [
  AccountLike,
  { instanceMethodsToSpyOn: ['ping'] },
];
