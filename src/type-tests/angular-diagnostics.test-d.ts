/**
 * Type-level tests for `enableAngularDiagnostics` and its options.
 *
 * The options are five switches a setup file writes once, and the failure these guard against is a
 * quiet one: a key widened off `boolean` — or a misspelled key silently accepted — leaves the check
 * at its default with the setup file none the wiser, and no runtime test says otherwise. Every
 * pin below compiles against the declared shape or fails the suite.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type AngularDiagnosticsOptions, disableAngularDiagnostics, enableAngularDiagnostics } from '../angular';

describe('AngularDiagnosticsOptions', () => {
  it('declares every check as a boolean switch, and nothing wider', () => {
    expectTypeOf<AngularDiagnosticsOptions['ngModuleScopes']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<AngularDiagnosticsOptions['deadSchemas']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<AngularDiagnosticsOptions['unspiedProviders']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<AngularDiagnosticsOptions['pendingRequests']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<AngularDiagnosticsOptions['shadowedProviders']>().toEqualTypeOf<boolean | undefined>();
  });

  it('accepts all five keys at once, and the object is optional', () => {
    enableAngularDiagnostics();
    enableAngularDiagnostics({
      ngModuleScopes: true,
      deadSchemas: false,
      unspiedProviders: true,
      pendingRequests: false,
      shadowedProviders: true,
    });
  });

  it('takes each key on its own, since picking is the point', () => {
    enableAngularDiagnostics({ pendingRequests: false });
    enableAngularDiagnostics({ shadowedProviders: false });
  });

  it('rejects what the switches are not', () => {
    // @ts-expect-error -- a check is on or off; it has no grade to pick
    enableAngularDiagnostics({ pendingRequests: 'yes' });
    // @ts-expect-error -- no such check exists
    enableAngularDiagnostics({ overlappingSchemas: true });
    // @ts-expect-error -- unspiedProviders is a switch, not a list
    enableAngularDiagnostics({ unspiedProviders: ['Router'] });
  });

  it('leaves `disableAngularDiagnostics` nothing to configure', () => {
    disableAngularDiagnostics();

    // @ts-expect-error -- disabling takes every check off; there is nothing to pick
    disableAngularDiagnostics({ pendingRequests: false });
  });
});
