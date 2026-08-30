/**
 * `trackInjections` is the DI answer to "which collaborators did this entry point ask for", so the
 * things worth proving are: the record fills in only as DI constructs a token, the doubles exist
 * before that so a spec can stub them, and the provider shape is the one both frameworks accept.
 */
import { InjectionToken, Injectable, Injector, inject } from '@angular/core';
import { describe, expect, it } from 'vitest';

import '../angular';
import { trackInjections } from './track-injections';

@Injectable()
class FeatureFlagService {
  isOn(): boolean {
    return false;
  }
}

@Injectable()
class AnalyticsService {
  track(): void {
    /* real implementation, never reached in these tests */
  }
}

const CONFIG = new InjectionToken<{ retries: number }>('CONFIG');

@Injectable()
class CheckoutFacade {
  readonly #flags = inject(FeatureFlagService);

  start(): boolean {
    return this.#flags.isOn();
  }
}

function build(tokens: unknown[]): Injector {
  const collaborators = trackInjections(tokens);

  return Injector.create({
    providers: [{ provide: CheckoutFacade, useClass: CheckoutFacade }, ...collaborators.providers] as never,
  });
}

describe('trackInjections', () => {
  it('records only the tokens DI actually constructed, in order', () => {
    const collaborators = trackInjections([FeatureFlagService, AnalyticsService, CONFIG]);
    const injector = Injector.create({
      providers: [{ provide: CheckoutFacade, useClass: CheckoutFacade }, ...collaborators.providers] as never,
    });

    collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

    expect(collaborators.injectedTokens()).toEqual([]);
    expect(injector.get(CheckoutFacade).start()).toBe(true);
    expect(collaborators.injectedTokens()).toEqual([FeatureFlagService]);
    // The class name, not the identifier: the Angular plugin's decorator downlevelling renames the
    // compiled class, which is exactly why `names()` reads it off the token instead of a literal.
    expect(collaborators.names()).toEqual([FeatureFlagService.name]);
    expect(collaborators.wasInjected(FeatureFlagService)).toBe(true);
    expect(collaborators.wasInjected(AnalyticsService)).toBe(false);
  });

  it('names an InjectionToken and a nameless class by what they print as', () => {
    // A class whose name a minifier removed — the case `names()` cannot answer from the token itself.
    const anonymous = Object.defineProperty(class {}, 'name', { value: '' });
    const collaborators = trackInjections([CONFIG, anonymous]);

    collaborators.providers.forEach(({ useFactory }) => useFactory());

    expect(collaborators.names()).toEqual([String(CONFIG), String(anonymous)]);
  });

  it('hands back an auto-mock for a token and a class spy for a class', () => {
    const collaborators = trackInjections([CONFIG, FeatureFlagService]);

    collaborators.get<{ retries: number }>(CONFIG).retries = 3;
    collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

    expect(collaborators.get(FeatureFlagService).isOn()).toBe(true);
  });

  it('lets a caller supply the double, for a collaborator that has to be real', () => {
    const collaborators = trackInjections([CONFIG], { double: () => ({ retries: 7 }) });
    const injector = Injector.create({
      providers: collaborators.providers as never,
    });

    expect(injector.get(CONFIG)).toEqual({ retries: 7 });
  });

  it('names the tracked tokens when asked for one it does not have', () => {
    const collaborators = trackInjections([FeatureFlagService]);

    expect(() => collaborators.get(AnalyticsService)).toThrow(
      new RegExp(`${AnalyticsService.name}.*not tracked[\\s\\S]*Tracked here: ${FeatureFlagService.name}`),
    );
    expect(() => trackInjections([]).get(AnalyticsService)).toThrow(/Tracked here: \(none\)/);
  });

  it('forgets the record on reset, keeping the doubles', () => {
    const injector = build([FeatureFlagService]);
    const collaborators = trackInjections([FeatureFlagService]);

    injector.get(CheckoutFacade).start();
    collaborators.providers.forEach(({ useFactory }) => useFactory());
    collaborators.reset();

    expect(collaborators.injectedTokens()).toEqual([]);
    expect(typeof collaborators.get(FeatureFlagService).isOn).toBe('function');
  });
});
