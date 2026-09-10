/**
 * The registry is only worth having if a call site stays **additive** over it, so most of this file
 * is about the merge rather than about the lookup: a spec that names one extra member must get the
 * registration's members too, and a spec that names a scalar must still win.
 *
 * The registry is process-wide, so every test clears it — a registration that outlives its test is
 * exactly the silent cross-file effect this API exists to remove.
 */
import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import '../index';
import '../rxjs';
import { createSpyFromClass } from './create-spy-from-class';
import { clearAutoSpyDefaults, mergeAutoSpyDefaults, registerAutoSpyDefaults } from './spy-defaults';

class RouterLike {
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

class AccountLike {
  ping(): void {
    /* real */
  }

  get isGuest(): boolean {
    return true;
  }
}

afterEach(() => {
  clearAutoSpyDefaults();
});

describe('registerAutoSpyDefaults', () => {
  it('composes a double from the registration alone', () => {
    registerAutoSpyDefaults(RouterLike, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });

    const router = createSpyFromClass(RouterLike);

    router.events.nextWith('navigated');
    router.accessorSpies.getters.url.mockReturnValue('/profile');

    expect(router.url).toBe('/profile');
    expect(typeof router.events.nextWith).toBe('function');
  });

  it('adds the call site to the registration rather than replacing it', () => {
    // The whole point: 23 opinions about one class became one, and a spec that needs one more
    // member names one more member.
    registerAutoSpyDefaults(RouterLike, { observablePropsToSpyOn: ['events'] });

    const router = createSpyFromClass(RouterLike, { instanceMethodsToSpyOn: ['reload'] });

    router.events.nextWith('navigated');
    router.reload.mockReturnValue(undefined);

    expect(typeof router.events.nextWith).toBe('function');
    expect(typeof router.reload.mockReturnValue).toBe('function');
  });

  it('takes the bare-array form of the call site too', () => {
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    expect(mergeAutoSpyDefaults(RouterLike, ['reload'])).toEqual({ gettersToSpyOn: ['url'], methodsToSpyOn: ['reload'] });
  });

  it('registers by class identity, so a subclass inherits nothing', () => {
    class ChildRouter extends RouterLike {}

    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    expect(mergeAutoSpyDefaults(ChildRouter, undefined)).toBeUndefined();
  });

  it('replaces a second registration for the same class rather than merging it', () => {
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });
    registerAutoSpyDefaults(RouterLike, { instanceMethodsToSpyOn: ['reload'] });

    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toEqual({ instanceMethodsToSpyOn: ['reload'] });
  });

  it('composes a double from the table form alone', () => {
    registerAutoSpyDefaults([
      [RouterLike, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
      [AccountLike, { instanceMethodsToSpyOn: ['ping'] }],
    ]);

    const router = createSpyFromClass(RouterLike);
    const account = createSpyFromClass(AccountLike);

    router.events.nextWith('navigated');
    router.accessorSpies.getters.url.mockReturnValue('/profile');
    account.ping.mockReturnValue(undefined);

    expect(router.url).toBe('/profile');
    expect(typeof router.events.nextWith).toBe('function');
    expect(typeof account.ping.mockReturnValue).toBe('function');
  });

  it('registers every row of the table form against its own class', () => {
    registerAutoSpyDefaults([
      [RouterLike, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
      [AccountLike, { instanceMethodsToSpyOn: ['ping'] }],
    ]);

    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toEqual({ observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
    expect(mergeAutoSpyDefaults(AccountLike, undefined)).toEqual({ instanceMethodsToSpyOn: ['ping'] });
  });

  it('lets a later row replace an earlier one for the same class, as a second call would', () => {
    registerAutoSpyDefaults([
      [RouterLike, { gettersToSpyOn: ['url'] }],
      [RouterLike, { instanceMethodsToSpyOn: ['reload'] }],
    ]);

    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toEqual({ instanceMethodsToSpyOn: ['reload'] });
  });

  it('leaves an empty table a no-op', () => {
    registerAutoSpyDefaults([]);

    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toBeUndefined();
  });

  it('mixes the table form and the per-class form over one registry', () => {
    registerAutoSpyDefaults([[AccountLike, { instanceMethodsToSpyOn: ['ping'] }]]);
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    expect(mergeAutoSpyDefaults(AccountLike, undefined)).toEqual({ instanceMethodsToSpyOn: ['ping'] });
    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toEqual({ gettersToSpyOn: ['url'] });
  });
});

describe('the merge', () => {
  it('unions lists, in registration order and without repeats', () => {
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    expect(mergeAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url', 'events'] })).toEqual({ gettersToSpyOn: ['url', 'events'] });
  });

  it('unions a list the call site introduces, and one only the registration has', () => {
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    expect(mergeAutoSpyDefaults(RouterLike, { instanceMethodsToSpyOn: ['reload'] })).toEqual({
      gettersToSpyOn: ['url'],
      instanceMethodsToSpyOn: ['reload'],
    });
  });

  it('merges returns and overrides key by key, with the call site winning', () => {
    registerAutoSpyDefaults(RouterLike, { returns: { navigate: true }, overrides: { events: of('a') } });

    const merged = mergeAutoSpyDefaults(RouterLike, { returns: { navigate: false, reload: undefined } });

    expect(merged).toMatchObject({ returns: { navigate: false, reload: undefined } });
    expect(Object.keys(Object(Reflect.get(Object(merged), 'overrides')))).toEqual(['events']);
  });

  it('takes an object key the registration does not have', () => {
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    expect(mergeAutoSpyDefaults(RouterLike, { returns: { navigate: true } })).toEqual({
      gettersToSpyOn: ['url'],
      returns: { navigate: true },
    });
  });

  it('lets the call site replace a scalar', () => {
    registerAutoSpyDefaults(RouterLike, { lazySpies: true, strict: true });

    expect(mergeAutoSpyDefaults(RouterLike, { lazySpies: false })).toEqual({ lazySpies: false, strict: true });
  });

  it('hands the call site straight back when the class has no registration', () => {
    expect(mergeAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] })).toEqual({ gettersToSpyOn: ['url'] });
  });
});

describe('clearAutoSpyDefaults', () => {
  it('drops one class, leaving the others', () => {
    class Other {
      ping(): void {
        /* real */
      }
    }

    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });
    registerAutoSpyDefaults(Other, { instanceMethodsToSpyOn: ['ping'] });

    clearAutoSpyDefaults(RouterLike);

    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toBeUndefined();
    expect(mergeAutoSpyDefaults(Other, undefined)).toEqual({ instanceMethodsToSpyOn: ['ping'] });
  });

  it('drops the lot when called with nothing', () => {
    registerAutoSpyDefaults(RouterLike, { gettersToSpyOn: ['url'] });

    clearAutoSpyDefaults();

    expect(mergeAutoSpyDefaults(RouterLike, undefined)).toBeUndefined();
  });
});
