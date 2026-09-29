/**
 * `/console` and `/nestjs` on `node --test`, with `vitest` made unresolvable.
 *
 * The repository has Vitest installed, so the resolve hook below stands in for a project that does
 * not: any import of it fails the file. The entries are imported in the order a sorted import list
 * puts them — `/console` before `/node` — so the console spies are built by the first install.
 */
/* eslint-disable vitest-auto-spy/no-console-in-spec -- this file tests the console spies, so it writes to the console they replace */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it, mock } from 'node:test';
import 'reflect-metadata';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'vitest' || specifier.startsWith('vitest/')) {
      throw new Error(`'${specifier}' imported from ${String(context.parentURL)}`);
    }

    return nextResolve(specifier, context);
  },
});

const consoleEntry = await import('../console');
const warnSpyAtImport = consoleEntry.consoleWarnSpy;
const nodeEntry = await import('../node');
const nestEntry = await import('../nestjs');
const { createNodeMockAdapter } = await import('../lib/node-adapter');

interface NodeMockView {
  calls: { arguments: unknown[] }[];
}

function nodeCalls(spy: unknown): unknown[][] {
  return (spy as { mock: NodeMockView }).mock.calls.map((call) => call.arguments);
}

class Pricing {
  total(items: number): number {
    return items * 10;
  }
}

class Cart {
  pricing: Pricing;

  constructor(pricing: Pricing) {
    this.pricing = pricing;
  }

  checkout(items: number): number {
    return this.pricing.total(items);
  }
}
Reflect.defineMetadata('design:paramtypes', [Pricing], Cart);

describe('vitest-auto-spy/console on node:test', () => {
  it('built nothing on import, since /node registered its adapter after it', () => {
    assert.equal(warnSpyAtImport, undefined);
  });

  describe('with useConsoleSpies()', () => {
    const spies = consoleEntry.useConsoleSpies();

    it("installs node:test mocks through node:test's own hooks", () => {
      assert.equal(console.warn, spies.consoleWarnSpy);
      assert.equal(consoleEntry.consoleWarnSpy, spies.consoleWarnSpy);

      console.warn('deprecated');
      console.info('done');

      assert.deepEqual(nodeCalls(spies.consoleWarnSpy), [['deprecated']]);
      assert.deepEqual(consoleEntry.consoleLines(), [
        ['warn', 'deprecated'],
        ['info', 'done'],
      ]);
      assert.deepEqual(consoleEntry.consoleOutput(), { info: [['done']], warn: [['deprecated']] });
    });

    it('starts every test from a clean record', () => {
      assert.deepEqual(consoleEntry.consoleLines(), []);
    });
  });

  it('restored the real console after the block', () => {
    assert.notEqual(console.warn, consoleEntry.consoleWarnSpy);
  });
});

describe('the Nest helpers on node:test', () => {
  it('createNestUnit comes from /node', () => {
    const { unit, spies } = nodeEntry.createNestUnit(Cart);

    spies.get(Pricing).total.calledWith(3).returnValue(99);

    assert.equal(unit.checkout(3), 99);
  });

  it('/nestjs loads and builds node:test spies', () => {
    const provider = nestEntry.provideAutoSpy(Pricing);

    provider.useValue.total(2);

    assert.deepEqual(nodeCalls(provider.useValue.total), [[2]]);
  });
});

describe('the node:test adapter', () => {
  it('reset drops an installed implementation along with the calls', () => {
    const adapter = createNodeMockAdapter(mock);
    const fn = adapter.createMockFn(() => 'original', 'fn');

    adapter.restoreImplementation(fn, () => 'override');
    assert.equal(fn(), 'override');

    adapter.reset(fn);

    assert.equal(fn(), 'original');
    assert.deepEqual(adapter.getCalls(fn), [[]]);
  });
});
