/**
 * Type-level tests for the `vitest-auto-spy/angular` `registerAutoSpyDefaults`, which also takes an
 * `InjectionToken` — and for `selfReturning`, which every double's configuration now carries.
 *
 * A token's registration is checked against the type the token carries, exactly as a class's is
 * against its instance: `returns`, `selfReturning` and `overrides` name keys of `T`. That property
 * is easy to lose without a single runtime test noticing — `InjectionToken<T>` never uses `T` in a
 * member, so any spelling that stops inferring it from the token's type argument widens `T` to
 * `unknown` and accepts every key. Half of these blocks exist in order to fail.
 *
 * In a table, each row is checked against its own key — a class row against the class, a token row
 * against the token's `T` — and the diagnostic lands on the offending row's line.
 *
 * A class key takes `T` from the class alone, as `provideAutoSpy` does: a generic class next to an
 * accessor list and `returns` otherwise reads `T` back from the list as `{ flags: any }` and rejects
 * the `returns` key. The core entry keeps that trap (`spy.test-d.ts`).
 */
import { InjectionToken } from '@angular/core';
import type { Subject } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';

import { type AutoSpyTokenDefaults, provideAutoSpyForToken, registerAutoSpyDefaults } from '../angular';
import { createAutoMock, createSpyFromClass, registerAutoSpyDefaults as registerCoreDefaults } from '../auto-spy';

interface ChannelLogger {
  readonly name: string;
  info(message: string): void;
}

interface AppLogger {
  level: string;
  info(message: string): void;
  err(message: string): void;
  channel(name: string): ChannelLogger;
}

class RouterLike {
  navigate(): boolean {
    return true;
  }

  get url(): string {
    return '/home';
  }
}

interface Navigation {
  activeRow$: Subject<HTMLElement>;
  backButton$: Subject<boolean>;
  navigateBack(force?: boolean): void;
  setFocus(element: HTMLElement): void;
  arrowMove(direction: number): void;
}

interface FlagDefaults {
  beta: boolean;
}

declare class FlagService<T extends object = FlagDefaults> {
  get flags(): Readonly<T>;
  isEnabled(key: keyof T): boolean;
}

const LOGGER = new InjectionToken<AppLogger>('LOGGER');
const NAVIGATION = new InjectionToken<Navigation>('NAVIGATION');

describe('registerAutoSpyDefaults with an InjectionToken', () => {
  it('takes a registration whose keys the token type has', () => {
    registerAutoSpyDefaults(LOGGER, {
      returns: { info: undefined, err: undefined },
      selfReturning: ['channel'],
      overrides: { level: 'debug' },
      strict: true,
      name: 'app logger',
    });
  });

  it('rejects a returns key the token type does not have', () => {
    // @ts-expect-error — `warn` is not a member of AppLogger
    registerAutoSpyDefaults(LOGGER, { returns: { warn: undefined } });
  });

  it('rejects a selfReturning entry that is not a method of the token type', () => {
    // @ts-expect-error — `level` is data, not a method
    registerAutoSpyDefaults(LOGGER, { selfReturning: ['level'] });
  });

  it('rejects a seed of the wrong type', () => {
    // @ts-expect-error — `level` is a string
    registerAutoSpyDefaults(LOGGER, { overrides: { level: 1 } });
  });

  it('is not on the core entry, which cannot name an InjectionToken', () => {
    // @ts-expect-error — the core signature takes a class; the token overload lives on `/angular`
    registerCoreDefaults(LOGGER, { returns: { info: undefined } });
  });

  it('accepts a registration typed as AutoSpyTokenDefaults', () => {
    const defaults: AutoSpyTokenDefaults<AppLogger> = { selfReturning: ['channel'] };

    registerAutoSpyDefaults(LOGGER, defaults);
  });

  it('takes T from the token when the registration names observable members next to returns', () => {
    registerAutoSpyDefaults(NAVIGATION, {
      observablePropsToSpyOn: ['activeRow$', 'backButton$'],
      returns: { setFocus: undefined, navigateBack: undefined, arrowMove: undefined },
    });
    // @ts-expect-error — `setFocus` answers nothing, so a registration may not seed it with a value
    registerAutoSpyDefaults(NAVIGATION, { observablePropsToSpyOn: ['activeRow$'], returns: { setFocus: 1 } });
  });
});

describe('the per-class form on a generic class', () => {
  it('keeps the declared default with an accessor list and returns together', () => {
    registerAutoSpyDefaults(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled: false } });
  });

  it('keeps it with overrides and returns together', () => {
    registerAutoSpyDefaults(FlagService, { overrides: { flags: { beta: true } }, returns: { isEnabled: false } });
  });

  it('still takes the type argument spelled out', () => {
    registerAutoSpyDefaults<FlagService<{ alpha: boolean }>>(FlagService, {
      gettersToSpyOn: ['flags'],
      overrides: { flags: { alpha: true } },
      returns: { isEnabled: true },
    });
  });

  it('still checks the registration against the class, not against any', () => {
    // @ts-expect-error — `isEnabled` answers a boolean
    registerAutoSpyDefaults(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled: 'yes' } });
    // @ts-expect-error — `alpha` is not a flag of the declared default
    registerAutoSpyDefaults(FlagService, { gettersToSpyOn: ['flags'], overrides: { flags: { alpha: true } } });
    // @ts-expect-error — `nope` is not a member of FlagService
    registerAutoSpyDefaults(FlagService, { gettersToSpyOn: ['nope'], returns: { isEnabled: false } });
  });
});

describe('the many-at-once form, with token rows', () => {
  it('compiles a table mixing class rows and token rows', () => {
    registerAutoSpyDefaults([
      [RouterLike, { gettersToSpyOn: ['url'], returns: { navigate: true } }],
      [LOGGER, { selfReturning: ['channel'], overrides: { level: 'debug' } }],
    ]);
  });

  it('rejects a wrong key in a token row, naming the members of that token type', () => {
    registerAutoSpyDefaults([
      [RouterLike, { gettersToSpyOn: ['url'] }],
      // @ts-expect-error — `navigate` is RouterLike's, not AppLogger's
      [LOGGER, { selfReturning: ['navigate'] }],
    ]);
  });

  it('rejects a wrong key in a class row beside a token row', () => {
    registerAutoSpyDefaults([
      // @ts-expect-error — `channel` is AppLogger's, not RouterLike's
      [RouterLike, { gettersToSpyOn: ['channel'] }],
      [LOGGER, { selfReturning: ['channel'] }],
    ]);
  });
});

describe('selfReturning on every factory', () => {
  it('names methods of the doubled type, inline and through provideAutoSpyForToken', () => {
    createAutoMock<AppLogger>(undefined, { selfReturning: ['channel'] });
    createSpyFromClass(RouterLike, { selfReturning: ['navigate'] });
    expectTypeOf(provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] }).useValue.channel).toBeFunction();
  });

  it('rejects a member that is not a method', () => {
    // @ts-expect-error — `url` is a getter
    createSpyFromClass(RouterLike, { selfReturning: ['url'] });
    // @ts-expect-error — `level` is data
    createAutoMock<AppLogger>(undefined, { selfReturning: ['level'] });
  });
});
