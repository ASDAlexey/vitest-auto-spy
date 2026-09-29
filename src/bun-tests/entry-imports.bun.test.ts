/**
 * Every public entry loads on Bun once `vitest-auto-spy/bun` is in.
 *
 * The list is read from `exports`, so a new entry is covered the day it ships. The built-preload lane
 * imports the built files instead of the sources, since that is what a consumer installs.
 */
import { describe, expect, it } from 'bun:test';

import pkg from '../../package.json';

const fromDist = process.env['npm_lifecycle_event'] === 'test:bun:preload';

/** Entries that cannot share a Bun process with the others, and why. */
const notImportedHere: Readonly<Record<string, string>> = {
  './bun': 'imported first, below',
  './bun-angular': 'a preload, which every lane running this file already loads',
  './node': 'registers the node:test adapter over the Bun one for the whole process',
  './rstest': 'needs the Rstest runner',
  './zone': 'needs zone.js loaded first; asserted separately below',
  './package.json': 'not a module',
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function entryPath(subpath: string): string {
  const exportMap: Readonly<Record<string, unknown>> = pkg.exports;
  const target = exportMap[subpath];
  const conditions = isRecord(target) ? target['import'] : undefined;
  const file = isRecord(conditions) ? conditions['default'] : conditions;

  if (typeof file !== 'string') {
    throw new TypeError(`No import target for ${subpath}`);
  }

  return fromDist ? `../../${file.slice(2)}` : `../${file.slice('./dist/'.length).replace(/\.js$/, '.ts')}`;
}

await import(entryPath('./bun'));

const entries = Object.keys(pkg.exports).filter((subpath) => !(subpath in notImportedHere));

describe(`public entries on Bun (${fromDist ? 'dist' : 'source'})`, () => {
  it('covers every export that is not excused', () => {
    expect(entries).toContain('./nestjs');
    expect(entries).toContain('./console');
    expect(Object.keys(notImportedHere).every((subpath) => subpath in pkg.exports)).toBe(true);
  });

  for (const subpath of entries) {
    it(`${subpath} imports without throwing`, async () => {
      const module: unknown = await import(entryPath(subpath));

      expect(module).toBeDefined();
    });
  }

  it('/zone fails with its own guidance, not a crash', async () => {
    expect(Reflect.get(globalThis, 'Zone')).toBeUndefined();
    await expect(import(entryPath('./zone'))).rejects.toThrow('globalThis.Zone is not there');
  });

  it('/console spies are driven by the Bun adapter', async () => {
    const consoleEntry = await import(entryPath('./console'));
    const spies = consoleEntry.installConsoleSpies();

    try {
      // eslint-disable-next-line vitest-auto-spy/no-console-in-spec -- the call is what the console spy under test records
      console.error('boom', 1);

      expect(spies.consoleErrorSpy).toHaveBeenCalledWith('boom', 1);
      expect(spies.consoleErrorSpy.mock.calls).toEqual([['boom', 1]]);
    } finally {
      consoleEntry.restoreConsole();
    }
  });
});

const consoleEntry: typeof import('../console') = await import(entryPath('./console'));

describe('/console useConsoleSpies on Bun', () => {
  const spies = consoleEntry.useConsoleSpies();

  it('has the spies on console inside the block', () => {
    // eslint-disable-next-line vitest-auto-spy/no-console-in-spec -- the call is what the console spy under test records
    console.warn('late');

    expect(console.warn).toBe(spies.consoleWarnSpy);
    expect(spies.consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(spies.consoleWarnSpy).toHaveBeenCalledWith('late');
  });

  it('starts every test with the calls of the previous one cleared', () => {
    expect(console.warn).toBe(spies.consoleWarnSpy);
    expect(spies.consoleWarnSpy).not.toHaveBeenCalled();
  });
});

it('/console useConsoleSpies restores the console after the block', () => {
  expect(console.warn).not.toBe(consoleEntry.consoleWarnSpy);
});
