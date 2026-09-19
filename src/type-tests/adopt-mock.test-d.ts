/**
 * Type-level tests for `adoptMock`: a mock reached through a mocked module is typed as the module's
 * function, so the helpers have to be typed from that signature — and from the mock's own signature
 * when the spec holds the `vi.fn()` itself.
 */
import { describe, expectTypeOf, it, vi } from 'vitest';

import { type AdoptedMock, type ModuleNamespace, adoptMock, moduleNamespace } from '../auto-spy';

declare function loadUser(id: number): Promise<{ id: number; name: string }>;
type FormatName = (first: string, last: string) => string;

declare const bunLikeMock: ((id: number) => Promise<string>) & { mock: { calls: unknown[][] } };

describe('adoptMock', () => {
  it('types the helpers from a module function', () => {
    const adopted = adoptMock(loadUser);

    expectTypeOf(adopted).toEqualTypeOf<AdoptedMock<typeof loadUser>>();
    adopted.calledWith(7).resolveWith({ id: 7, name: 'Ada' });
    adopted.resolveWith({ id: 1, name: 'default' });
    // @ts-expect-error -- the resolved value has to be a user
    adopted.resolveWith('not a user');
    // @ts-expect-error -- the argument is a number
    adopted.calledWith('7');
  });

  it('types the helpers from the signature a vi.fn() was given', () => {
    const adopted = adoptMock(vi.fn<FormatName>());

    expectTypeOf(adopted).toEqualTypeOf<AdoptedMock<FormatName>>();
    adopted.calledWith('Ada', 'Lovelace').mockReturnValue('Ada Lovelace');
    expectTypeOf(adopted).parameters.toEqualTypeOf<[string, string]>();
    // @ts-expect-error -- the return value is a string
    adopted.calledWith('Ada', 'Lovelace').mockReturnValue(1);
  });

  it("types the helpers from another runner's mock by its call signature", () => {
    const adopted = adoptMock(bunLikeMock);

    adopted.calledWith(1).resolveWith('one');
    expectTypeOf(adopted).parameters.toEqualTypeOf<[number]>();
    // @ts-expect-error -- the resolved value is a string
    adopted.resolveWith(1);
  });

  it('takes an optional name', () => {
    expectTypeOf(adoptMock).parameter(1).toEqualTypeOf<{ name?: string } | undefined>();
  });
});

describe('moduleNamespace with passthrough', () => {
  it('keeps the module type, and adoptMock types an export from it', () => {
    const namespace = moduleNamespace({ loadUser }, { passthrough: true });

    expectTypeOf(namespace).toEqualTypeOf<ModuleNamespace<{ loadUser: typeof loadUser }>>();
    adoptMock(namespace.loadUser).calledWith(1).resolveWith({ id: 1, name: 'Ada' });
  });
});
