/**
 * `/console` and `/nestjs` on `bun test`, loading no module that imports `vitest`.
 *
 * Bun answers `import 'vitest'` with its own module before any plugin sees the specifier, so the
 * plugin below checks the other end: every source file this suite loads from here on is refused if
 * it imports `vitest` for anything but types.
 */
/* eslint-disable vitest-auto-spy/no-console-in-spec -- this file tests the console spies, so it writes to the console they replace */
import { plugin } from 'bun';
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const VITEST_IMPORT = /^import (?!type )[^;]*from 'vitest';/m;
// Plugins stay registered for the whole process, and the other files of a shared run may import `vitest`.
let guarding = true;

plugin({
  name: 'no-vitest',
  setup(build) {
    build.onLoad({ filter: /\/src\/.*\.ts$/ }, (args) => {
      const contents = readFileSync(args.path, 'utf8');

      if (guarding && VITEST_IMPORT.test(contents)) {
        throw new Error(`${args.path} imports vitest`);
      }

      return { contents, loader: 'ts' };
    });
  },
});

const bunEntry = await import('../bun');
const consoleEntry = await import('../console');
const nestEntry = await import('../nestjs');

guarding = false;

class Pricing {
  total(items: number): number {
    return items * 10;
  }
}

describe('vitest-auto-spy/console on bun:test', () => {
  describe('with useConsoleSpies()', () => {
    const spies = consoleEntry.useConsoleSpies();

    it("installs Bun mocks through bun:test's own hooks", () => {
      expect(console.warn).toBe(spies.consoleWarnSpy);

      console.warn('deprecated');
      console.info('done');

      expect(spies.consoleWarnSpy.mock.calls).toEqual([['deprecated']]);
      expect(consoleEntry.consoleLines()).toEqual([
        ['warn', 'deprecated'],
        ['info', 'done'],
      ]);
    });

    it('starts every test from a clean record, even after a reset Bun runs its own way', () => {
      expect(consoleEntry.consoleLines()).toEqual([]);

      console.error('ordered');
      expect(consoleEntry.consoleLines()).toEqual([['error', 'ordered']]);
    });
  });
});

describe('the Nest helpers on bun:test', () => {
  it('createNestUnit comes from /bun', () => {
    expect(typeof bunEntry.createNestUnit).toBe('function');
  });

  it('/nestjs builds Bun spies', () => {
    const provider = nestEntry.provideAutoSpy(Pricing);

    provider.useValue.total(2);

    expect(provider.useValue.total).toHaveBeenCalledWith(2);
  });
});
