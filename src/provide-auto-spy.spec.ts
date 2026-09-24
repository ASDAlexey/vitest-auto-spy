/**
 * The TestBed half of the public API: `provideAutoSpy` / `injectSpy` / `provideAutoSpyForToken` and
 * the seeding a provider can do in one statement. Kept apart from `auto-spy.spec.ts` because this is
 * the file that has to load `@angular/core/testing` — the heaviest module graph in the suite — and
 * the TestBed-free majority of the core spec should not drag it in.
 */
import { Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, ReplaySubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { injectSpy, provideAutoSpy, provideAutoSpyForToken } from './angular';
import { clearAutoSpyDefaults, createAutoMock, createSpyFromClass, registerAutoSpyDefaults } from './index';
// Public entries: core (`./index`) and the Angular helpers (`./angular`). The bare `./rxjs` import
// registers observable support (IoC), which the token doubles with observable props rely on.
import './rxjs';

// ---------------------------------------------------------------------------
// Test subjects
// ---------------------------------------------------------------------------

class BaseService {
  baseMethod(): string {
    return 'base';
  }
}

@Injectable()
class MyService extends BaseService {
  things$: Observable<number> = of(1);
  theme!: string;

  // Instance-assigned callable: the shape of an Angular `signal()` field, an arrow-function
  // property or an ngrx `signalStore()` method. Never reachable through the prototype chain.
  readonly counter = (): number => 0;

  private _userName = 'real';

  syncMethod(_a?: number): string {
    return 'real';
  }

  get userName(): string {
    return this._userName;
  }

  set userName(value: string) {
    this._userName = value;
  }
}

/** Subscribe and collect everything a (completing) stream produces. */
function collect<T>(obs: Observable<T>): Promise<{ values: T[]; error?: unknown; completed: boolean }> {
  return new Promise((resolve) => {
    const values: T[] = [];
    obs.subscribe({
      next: (v) => values.push(v),
      error: (error) => resolve({ values, error, completed: false }),
      complete: () => resolve({ values, completed: true }),
    });
  });
}

// ---------------------------------------------------------------------------
// provideAutoSpy / injectSpy
// ---------------------------------------------------------------------------

describe('provideAutoSpy / injectSpy', () => {
  it('provides and injects a typed spy through TestBed', () => {
    TestBed.configureTestingModule({
      providers: [provideAutoSpy(MyService)],
    });

    const service = injectSpy(MyService);
    service.syncMethod.mockReturnValue('injected');
    expect(service.syncMethod()).toBe('injected');
  });

  it('warns when the injector hands back a real instance instead of a spy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // The provider is the class itself, so DI builds the real service — the mistake this catches.
    class UnprovidedService {
      load(): string {
        return 'real';
      }
    }

    TestBed.configureTestingModule({ providers: [UnprovidedService] });
    injectSpy(UnprovidedService);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the injector returned a plain instance'));

    // Once per token: the call sits in a `beforeEach`, and one warning per test would bury it.
    warn.mockClear();
    injectSpy(UnprovidedService);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns again in the next spec file, so which file shows it does not depend on run order', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
    const ownFile: unknown = Reflect.get(Object(worker), 'filepath');

    class ReportedPerFile {
      load(): string {
        return 'real';
      }
    }

    TestBed.configureTestingModule({ providers: [ReportedPerFile] });
    injectSpy(ReportedPerFile);
    Reflect.set(Object(worker), 'filepath', '/a/later.spec.ts');

    try {
      injectSpy(ReportedPerFile);
    } finally {
      Reflect.set(Object(worker), 'filepath', ownFile);
    }

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('fails every occurrence at the call site under misconfiguration: throw', () => {
    class ThrownEveryTime {
      load(): string {
        return 'real';
      }
    }

    TestBed.configureTestingModule({ providers: [ThrownEveryTime] });
    globalThis.__vitestAutoSpyMisconfiguration__ = 'throw';

    try {
      expect(() => injectSpy(ThrownEveryTime)).toThrow(/plain instance, not an auto-spy/);
      expect(() => injectSpy(ThrownEveryTime)).toThrow(/plain instance, not an auto-spy/);
    } finally {
      globalThis.__vitestAutoSpyMisconfiguration__ = undefined;
    }
  });

  it('names an InjectionToken in that warning too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const CONFIG = new InjectionToken<{ url: string }>('CONFIG');

    TestBed.configureTestingModule({ providers: [{ provide: CONFIG, useValue: { url: '/api' } }] });
    injectSpy(CONFIG);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('InjectionToken CONFIG'));
    warn.mockRestore();
  });

  it('provides a spy for a token whose type is an interface, with no class to read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const PASSCODE = new InjectionToken<{ check(code: string): boolean }>('PASSCODE');

    TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE, { check: () => true })] });

    const passcode = injectSpy(PASSCODE);

    expect(passcode.check('1234')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stays quiet for a token provided with a type-based auto-mock', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const LOGGER = new InjectionToken<{ log(message: string): void }>('LOGGER');

    TestBed.configureTestingModule({ providers: [{ provide: LOGGER, useValue: createAutoMock<{ log(message: string): void }>() }] });
    injectSpy(LOGGER);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('seeds properties and method results from the provider, in one statement', () => {
    // `returns` configures the spy; `overrides` seeds a member that is not a method result. Without
    // the pair, a double needing both was provided in one statement and finished in another — and
    // the shortcut people take instead is a module-scoped `const` provider, which under
    // `isolate: false` is one set of spies shared by every file that imports it.
    const events$ = new ReplaySubject<number>(1);

    TestBed.configureTestingModule({
      providers: [provideAutoSpy(MyService, { overrides: { things$: events$, theme: 'dark' }, returns: { syncMethod: 'seeded' } })],
    });

    const service = injectSpy(MyService);

    expect(service.syncMethod()).toBe('seeded');
    expect(service.things$).toBe(events$);
    expect(service.theme).toBe('dark');
  });

  it('seeds a readonly instance field, which no prototype walk can reach', () => {
    // The member `provideAutoSpy` is routinely assumed not to cover: a `readonly` field assigned in
    // the constructor is not on the prototype, so discovery cannot see it and the double answers
    // `undefined`. `overrides` is the channel for it — the same one `things$` uses above — and it
    // checks against the class, so a field the class drops fails here rather than in the spec that
    // reads it. `mockReadonlyProp(spy, 'focusStrategies', …)` is the other answer, and the one to
    // reach for when the value has to change between tests rather than be seeded once.
    class PaymentCardService {
      readonly focusStrategies: Record<string, number> = { poster: 1 };

      load(): number {
        return 1;
      }
    }

    TestBed.configureTestingModule({
      providers: [provideAutoSpy(PaymentCardService, { overrides: { focusStrategies: { poster: 9, button: 8 } } })],
    });

    const cards = injectSpy(PaymentCardService);

    expect(cards.focusStrategies).toEqual({ poster: 9, button: 8 });
    expect(cards.load).toHaveBeenCalledTimes(0);
  });

  describe('seeding a getter the double spies', () => {
    class FlagsConfigService {
      get flagsConfig(): { theme: string } {
        return { theme: 'light' };
      }

      get retries(): number {
        return 1;
      }

      set retries(_value: number) {
        /* the class stores it */
      }
    }

    it('answers the seed from a getter named in gettersToSpyOn, and keeps the getter a spy', () => {
      TestBed.configureTestingModule({
        providers: [provideAutoSpy(FlagsConfigService, { gettersToSpyOn: ['flagsConfig'], overrides: { flagsConfig: { theme: 'dark' } } })],
      });

      const config = injectSpy(FlagsConfigService);

      expect(config.flagsConfig).toEqual({ theme: 'dark' });
      expect(config.accessorSpies.getters['flagsConfig']).toHaveBeenCalledTimes(1);
    });

    it('answers the seed when a class default is what spies the getter', () => {
      registerAutoSpyDefaults(FlagsConfigService, { gettersToSpyOn: ['flagsConfig'] });

      try {
        expect(createSpyFromClass(FlagsConfigService, { overrides: { flagsConfig: { theme: 'dark' } } }).flagsConfig).toEqual({
          theme: 'dark',
        });
      } finally {
        clearAutoSpyDefaults(FlagsConfigService);
      }
    });

    it('answers the seed through provideAutoSpy when a registered table spies the getter', () => {
      registerAutoSpyDefaults([[FlagsConfigService, { gettersToSpyOn: ['flagsConfig'] }]]);

      try {
        TestBed.configureTestingModule({
          providers: [provideAutoSpy(FlagsConfigService, { overrides: { flagsConfig: { theme: 'dark' } } })],
        });

        expect(injectSpy(FlagsConfigService).flagsConfig).toEqual({ theme: 'dark' });
      } finally {
        clearAutoSpyDefaults(FlagsConfigService);
      }
    });

    it('answers the seed from a spied accessor pair', () => {
      expect(createSpyFromClass(FlagsConfigService, { autoSpyAccessors: true, overrides: { retries: 5 } }).retries).toBe(5);
    });

    it('lets a later mockReturnValue on the getter spy win over the seed', () => {
      const config = createSpyFromClass(FlagsConfigService, {
        gettersToSpyOn: ['flagsConfig'],
        overrides: { flagsConfig: { theme: 'dark' } },
      });

      config.accessorSpies.getters['flagsConfig']?.mockReturnValue({ theme: 'contrast' });

      expect(config.flagsConfig).toEqual({ theme: 'contrast' });
    });

    it('turns a seed on a setter-only spy into a plain value, instead of recording it and reading undefined', () => {
      class Sink {
        set level(_value: number) {
          /* write-only */
        }
      }

      expect(Reflect.get(createSpyFromClass(Sink, { settersToSpyOn: ['level'], overrides: { level: 7 } }), 'level')).toBe(7);
    });
  });

  it('names the token in a strict report, where a type-driven double has no class to name', () => {
    const OBSERVER = new InjectionToken<{ observe(target: Element): void }>('CAROUSEL_RESIZE_OBSERVER');

    TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(OBSERVER, undefined, { strict: true })] });

    expect(() => injectSpy(OBSERVER).observe(document.body)).toThrow(
      'Nothing configured InjectionToken CAROUSEL_RESIZE_OBSERVER.observe, and strict mode is on.',
    );
  });

  it('lets Angular tear a strict double down, since no spec asked for ngOnDestroy', () => {
    class Poller {
      poll(): void {
        /* polls */
      }

      ngOnDestroy(): void {
        /* stops polling */
      }
    }

    const TOKEN_DOUBLE = new InjectionToken<{ refresh(): void }>('TOKEN_DOUBLE');

    TestBed.configureTestingModule({
      providers: [provideAutoSpy(Poller, { strict: true }), provideAutoSpyForToken(TOKEN_DOUBLE, undefined, { strict: true })],
    });

    const poller = injectSpy(Poller);

    injectSpy(TOKEN_DOUBLE);

    expect(() => TestBed.resetTestingModule()).not.toThrow();
    expect(poller.ngOnDestroy).toHaveBeenCalledTimes(1);
    expect(() => poller.poll()).toThrow('Nothing configured Poller.poll');
  });

  it('keeps a name the caller gave the token double', () => {
    const OBSERVER = new InjectionToken<{ observe(target: Element): void }>('CAROUSEL_RESIZE_OBSERVER');

    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(OBSERVER, undefined, { strict: true, name: 'carousel observer' })],
    });

    expect(() => injectSpy(OBSERVER).observe(document.body)).toThrow('Nothing configured carousel observer.observe');
  });

  it('seeds method results behind an InjectionToken too', async () => {
    const PRODUCTS = new InjectionToken<{ getProducts(): Observable<string[]> }>('PRODUCTS');

    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of(['a']) } })],
    });

    const products = injectSpy(PRODUCTS);

    // Still a spy — which is what seeding it through `overrides` would have thrown away.
    await expect(collect(products.getProducts())).resolves.toMatchObject({ values: [['a']] });
    expect(products.getProducts).toHaveBeenCalled();
  });

  it('builds observable property spies behind a token, not function spies', async () => {
    interface FavoritesFacade {
      favorites$: Observable<number[]>;
      reload(): void;
    }

    const FAVORITES = new InjectionToken<FavoritesFacade>('FAVORITES');

    // With only a type at runtime, a method key and a property key are indistinguishable — so
    // without this option `favorites$` is a *function* spy, the code under test subscribes to a
    // function, and the failure lands nowhere near the double.
    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] })],
    });

    const favorites = injectSpy(FAVORITES);
    const emitted = collect(favorites.favorites$);

    favorites.favorites$.nextOneTimeWith([1]);

    await expect(emitted).resolves.toMatchObject({ values: [[1]], completed: true });
    // Not a function spy — which is what the same double answers for every unnamed key.
    expect(vi.isMockFunction(favorites.favorites$)).toBe(false);
    expect(vi.isMockFunction(favorites.reload)).toBe(true);
  });

  it('lets an `overrides` seed win over the observable-prop list', () => {
    interface FavoritesFacade {
      favorites$: Observable<number[]>;
    }

    const FAVORITES = new InjectionToken<FavoritesFacade>('FAVORITES');
    const seeded = new ReplaySubject<number[]>(1);

    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(FAVORITES, { favorites$: seeded }, { observablePropsToSpyOn: ['favorites$'] })],
    });

    // The seed is the more specific statement, and handing the double a real Subject the spec drives
    // itself is what it is for. Same precedence as on the class-based factory.
    expect(injectSpy(FAVORITES).favorites$).toBe(seeded);
  });

  it('takes an abstract class — the standard Angular DI-token shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Production provides `{ provide: LocalStorage, useClass: BrowserLocalStorage }`, so the token
    // is a class with nothing on its prototype: every member is `abstract`, and `abstract` is
    // erased before emit. Both halves used to fail — the type rejected it, and a spy read off that
    // prototype would have been `{}`.
    abstract class AbstractStorage {
      abstract read(key: string): string | null;
    }

    abstract class LocalStorage extends AbstractStorage {
      abstract write(key: string, value: string): void;
    }

    // The config form is the one that used to be a hard `TS2345 Cannot assign an abstract
    // constructor type to a non-abstract constructor type` — i.e. the bare call compiled and was
    // useless, and the form that fixes it did not compile at all.
    TestBed.configureTestingModule({ providers: [provideAutoSpy(LocalStorage, { instanceMethodsToSpyOn: ['read'] })] });

    const storage = injectSpy(LocalStorage);
    storage.read.calledWith('token').mockReturnValue('abc');
    storage.write('token', 'abc');

    expect(storage.read('token')).toBe('abc');
    expect(storage.write).toHaveBeenCalledWith('token', 'abc');
    // The double is recognisably an auto-spy, so `injectSpy` does not report a missing provider.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns a { provide, useValue } shape', () => {
    const provider = provideAutoSpy(MyService);
    expect(provider.provide).toBe(MyService);
    expect(vi.isMockFunction(provider.useValue.syncMethod)).toBe(true);
  });

  it('defaults to lazy spies (materialized on first access) and honours lazySpies: false', () => {
    const lazy = provideAutoSpy(MyService).useValue;

    // Not yet touched: the method is a lazy accessor placeholder, not a data property.
    expect(Object.getOwnPropertyDescriptor(lazy, 'syncMethod')?.get).toBeTypeOf('function');

    // First access materializes the real spy and caches it as a data property.
    expect(vi.isMockFunction(lazy.syncMethod)).toBe(true);
    const materialized = Object.getOwnPropertyDescriptor(lazy, 'syncMethod');
    expect(materialized && 'value' in materialized).toBe(true);

    // Opt out: eager spies are materialized up-front, before any access.
    const eager = provideAutoSpy(MyService, { lazySpies: false }).useValue;
    const eagerDescriptor = Object.getOwnPropertyDescriptor(eager, 'syncMethod');
    expect(eagerDescriptor && 'value' in eagerDescriptor).toBe(true);
  });

  it('applies the lazy default across every argument form (array and config object)', () => {
    // Array of method names → still lazy.
    const fromArray = provideAutoSpy(MyService, ['syncMethod']).useValue;
    expect(Object.getOwnPropertyDescriptor(fromArray, 'syncMethod')?.get).toBeTypeOf('function');

    // Config object without an explicit lazySpies → default applies (lazy).
    const fromConfig = provideAutoSpy(MyService, { methodsToSpyOn: ['syncMethod'] }).useValue;
    expect(Object.getOwnPropertyDescriptor(fromConfig, 'syncMethod')?.get).toBeTypeOf('function');
  });
});
