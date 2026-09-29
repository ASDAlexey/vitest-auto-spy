import { types } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConsoleSpies } from './console-spy';
import { createSpyFromClass } from './create-spy-from-class';
import { createSpyFromInstance } from './create-spy-from-instance';
import { takeStrictViolations } from './function-spy';
import { setMisconfigurationReaction } from './misconfiguration';
import { registerMockAdapter } from './mock-adapter';
import { declaresThen, getAllAccessorNames, getAllMethodNames, getCallableMemberNames, getDeclaredMethodNames } from './prototype-members';
import { clearAutoSpyDefaults, registerAutoSpyDefaults } from './spy-defaults';
import { createSpyForToken } from './track-injections';
import type { ClassSpyConfiguration } from './types';
import { vitestMockAdapter } from './vitest-adapter';

registerMockAdapter(vitestMockAdapter);

afterEach(() => {
  vi.restoreAllMocks();
  setMisconfigurationReaction(undefined);
});

const { consoleWarnSpy } = useConsoleSpies();

describe('prototype discovery — a class that declares then()', () => {
  class Query {
    then(_resolve: (rows: string[]) => void): void {
      /* real implementation */
    }

    where(_clause: string): this {
      return this;
    }
  }

  it('leaves then out, so awaiting the double settles with the double', async () => {
    const query = createSpyFromClass(Query);

    expect(Object.hasOwn(query, 'then')).toBe(false);
    await expect(Promise.resolve(query)).resolves.toBe(query);
    expect(vi.isMockFunction(query.where)).toBe(true);
  });

  it('warns once per class, naming the option that brings it back', () => {
    class Once {
      then(): void {
        /* real implementation */
      }

      run(): void {
        /* real implementation */
      }
    }

    createSpyFromClass(Once);
    createSpyFromClass(Once);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(String(consoleWarnSpy.mock.calls[0]?.[0])).toContain('createSpyFromClass(Once): the class declares then()');
    expect(String(consoleWarnSpy.mock.calls[0]?.[0])).toContain("methodsToSpyOn: ['then']");
  });

  it.each<[string, ClassSpyConfiguration<Query>]>([
    ['methodsToSpyOn', { methodsToSpyOn: ['then'] }],
    ['instanceMethodsToSpyOn', { instanceMethodsToSpyOn: ['then'] }],
    ['onlyMethodsToSpyOn', { onlyMethodsToSpyOn: ['then'] }],
  ])('spies then without a warning when %s names it', (_option, config) => {
    const query = createSpyFromClass(Query, config);

    expect(vi.isMockFunction(query.then)).toBe(true);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('stays quiet when onlyMethodsToSpyOn leaves then out or overrides seeds it', () => {
    createSpyFromClass(Query, { onlyMethodsToSpyOn: ['where'] });
    const seeded = createSpyFromClass(Query, { overrides: { then: () => undefined } });

    seeded.then(() => undefined);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(seeded.then).toHaveBeenCalledOnce();
  });

  it('says how to spy then when returns names it without methodsToSpyOn', () => {
    createSpyFromClass(Query, { returns: { then: undefined } });

    expect(consoleWarnSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      "returns names 'then', which the double leaves out unless methodsToSpyOn names it",
    );
  });

  it('keeps then out of the method set and reports it on its own', () => {
    expect(getAllMethodNames(Query.prototype)).toEqual(['where']);
    expect(getDeclaredMethodNames(Query.prototype)).toEqual(['where', 'then']);
    expect(declaresThen(Query.prototype)).toBe(true);
    expect(getDeclaredMethodNames(Map.prototype)).toBe(getAllMethodNames(Map.prototype));
  });

  it('keeps then as a declared method for a whitelist, so naming it is not a typo', () => {
    createSpyFromClass(Query, { onlyMethodsToSpyOn: ['then', 'where'] });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});

describe('prototype discovery — a class that extends a built-in', () => {
  class AppError extends Error {
    describe(): string {
      return this.message;
    }
  }

  class Rows extends Array<string> {
    first(): string | undefined {
      return this[0];
    }
  }

  class Widget extends EventTarget {
    get label(): string {
      return '';
    }

    render(): void {
      /* real implementation */
    }
  }

  it('stops at Error.prototype: no toString, no message', () => {
    const error = createSpyFromClass(AppError);

    expect(Object.keys(error)).toEqual(['describe']);
  });

  it('stops at Array.prototype', () => {
    expect(getAllMethodNames(Rows.prototype)).toEqual(['first']);
  });

  it('stops accessor discovery at a native base too', () => {
    expect(getAllMethodNames(Widget.prototype)).toEqual(['render']);
    expect(getAllAccessorNames(Widget.prototype)).toEqual({ getters: ['label'], setters: [] });
  });

  it('stops at a host class the environment installs as a getter, as jsdom does under threads and forks', () => {
    class HostTarget {
      dispatch(): void {
        /* host implementation */
      }
    }

    class Panel extends HostTarget {
      render(): void {
        /* real implementation */
      }
    }

    // eslint-disable-next-line vitest-auto-spy/no-object-define-property -- the getter is the shape under test, and the finally below removes it
    Object.defineProperty(globalThis, 'HostTarget', { get: () => HostTarget, configurable: true });

    try {
      expect(getAllMethodNames(Panel.prototype)).toEqual(['render']);
    } finally {
      Reflect.deleteProperty(globalThis, 'HostTarget');
    }
  });

  it('still walks a built-in doubled directly', () => {
    const map = createSpyFromClass(Map);

    expect(vi.isMockFunction(map.get)).toBe(true);
    expect(getAllMethodNames(Map.prototype)).toContain('set');
  });

  it('spies a built-in method when the call names it', () => {
    const rows = createSpyFromClass(Rows, { methodsToSpyOn: ['at'] });

    expect(vi.isMockFunction(rows.at)).toBe(true);
  });

  it('leaves createSpyFromInstance reading the whole live object', () => {
    expect(getCallableMemberNames(new AppError('x'))).toContain('toString');
    expect(vi.isMockFunction(createSpyFromInstance(new Rows(), { onlyMethodsToSpyOn: ['at'] }).at)).toBe(true);
  });
});

describe('returnsUndefined', () => {
  class CartStore {
    add(_id: number): void {
      /* real implementation */
    }

    remove(_id: number): void {
      /* real implementation */
    }

    total(): number {
      return 0;
    }
  }

  it('configures each named method to answer undefined, which strict mode accepts', () => {
    const store = createSpyFromClass(CartStore, { strict: true, returnsUndefined: ['add', 'remove'], lazySpies: false });

    expect(store.add(1)).toBeUndefined();
    expect(store.remove(1)).toBeUndefined();
    expect(takeStrictViolations()).toEqual([]);
    expect(() => store.total()).toThrow(/total/);
    takeStrictViolations();
  });

  it('lets returns win for a method named in both', () => {
    const store = createSpyFromClass(CartStore, { returnsUndefined: ['total'], returns: { total: 3 } });

    expect(store.total()).toBe(3);
  });

  it('reports a name that is not a method, as returns does', () => {
    setMisconfigurationReaction('throw');

    expect(() => createSpyFromClass(CartStore, { returnsUndefined: ['totl' as 'total'] })).toThrow(
      "returns names 'totl', not a method of CartStore — did you mean 'total'?",
    );
  });

  it('merges a registration with the call site, and keeps it for createSpyFromInstance with a whitelist', () => {
    registerAutoSpyDefaults(CartStore, { strict: true, returnsUndefined: ['add'] });

    try {
      const store = createSpyFromClass(CartStore, { returnsUndefined: ['remove'], lazySpies: false });

      store.add(1);
      store.remove(1);
      expect(takeStrictViolations()).toEqual([]);

      const instance = createSpyFromInstance(new CartStore(), { onlyMethodsToSpyOn: ['add'] });

      instance.add(1);
      expect(takeStrictViolations()).toEqual([]);
    } finally {
      clearAutoSpyDefaults();
    }
  });
});

describe('createSpyForToken', () => {
  it('lets a wide class take the proxy default', () => {
    class Wide {
      a(): void {}
      b(): void {}
      c(): void {}
      d(): void {}
      e(): void {}
      f(): void {}
      g(): void {}
      h(): void {}
    }

    expect(types.isProxy(createSpyForToken(Wide))).toBe(true);
  });

  it('keeps a narrow class on lazy placeholders', () => {
    class Narrow {
      a(): void {}
    }

    expect(types.isProxy(createSpyForToken(Narrow))).toBe(false);
  });
});
