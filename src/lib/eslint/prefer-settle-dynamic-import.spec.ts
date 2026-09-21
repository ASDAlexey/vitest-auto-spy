import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-settle-dynamic-import';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

function applied(code: string): string {
  const [report] = verify(code);
  const suggestion = report?.suggestions?.[0];

  if (!suggestion) {
    return '';
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('prefer-settle-dynamic-import', () => {
  it('flags the bare await a spec writes for a module the code under test loads', () => {
    const code = `
      it('opens the modal', async () => {
        button.click();
        await import('./exit-from-app.component');
        expect(dialog.open).toHaveBeenCalled();
      });
    `;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('waits for the **module** and not for the code that was loading it');
    expect(text).toContain('settleDynamicImport(() => import(');
    expect(text).toContain('vitest-auto-spy');
  });

  it('reads the destructured form, which the helper returns the namespace for', () => {
    expect(count(`it('x', async () => { const { Modal } = await import('./modal'); expect(Modal).toBeDefined(); });`)).toBe(1);
  });

  it('names the second failure mode of the then form rather than repeating the first', () => {
    const code = `it('x', () => { import('./modal').then((m) => expect(m.Modal).toBeDefined()); });`;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('`import(…).then(…)`');
  });

  it('reads a hook, and the marked spellings of a test name', () => {
    expect(count(`beforeEach(async () => { await import('./modal'); });`)).toBe(1);
    expect(count(`afterEach(async () => { await import('./modal'); });`)).toBe(1);
    expect(count(`it.only('x', async () => { await import('./modal'); });`)).toBe(1);
    expect(count(`test.skip('x', async () => { await import('./modal'); });`)).toBe(1);
    expect(count(`it.each([1])('x', async () => { await import('./modal'); });`)).toBe(1);
  });

  it('suggests the wrap, and imports the helper when the name is free', () => {
    const code = `it('x', async () => { await import('./modal'); });`;

    expect(verify(code)[0]?.suggestions?.[0]?.desc).toContain('settleDynamicImport()');
    expect(applied(code)).toBe(
      `import { settleDynamicImport } from 'vitest-auto-spy';\nit('x', async () => { await settleDynamicImport(() => import('./modal')); });`,
    );
  });

  it('takes the specifier into an import of the package the file already has', () => {
    // A second `import … from 'vitest-auto-spy'` next to the first reads as the fix having worked
    // and then draws an `import/no-duplicates` error on the line the fixer just wrote.
    const code = `import { flushEventLoop } from 'vitest-auto-spy';\nit('x', async () => { await import('./modal'); });`;

    expect(applied(code)).toContain(`import { flushEventLoop, settleDynamicImport } from 'vitest-auto-spy';`);
  });

  it('wraps the loader of the then form too, leaving the chain where it was', () => {
    expect(applied(`it('x', () => { import('./modal').then((m) => m); });`)).toContain(
      `settleDynamicImport(() => import('./modal')).then((m) => m)`,
    );
  });

  it('writes no import when the file already has the helper', () => {
    const code = `import { settleDynamicImport } from 'vitest-auto-spy';\nit('x', async () => { await import('./modal'); });`;

    expect(applied(code)).toBe(
      `import { settleDynamicImport } from 'vitest-auto-spy';\nit('x', async () => { await settleDynamicImport(() => import('./modal')); });`,
    );
  });

  it('reports without an edit when the file declares the helper name as something of its own', () => {
    const code = `const settleDynamicImport = 1;\nit('x', async () => { await import('./modal'); });`;

    expect(count(code)).toBe(1);
    expect(verify(code)[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('leaves the import alone wherever the helper is the wrong advice', () => {
    // Already wrapped — the import sits in the loader the helper takes.
    expect(count(`it('x', async () => { await settleDynamicImport(() => import('./modal')); });`)).toBe(0);
    // A module mock's factory: the import is the real module the mock spreads, not a load to settle.
    expect(count(`vi.mock('./modal', async () => ({ ...(await import('./modal')), Modal: class {} }));`)).toBe(0);
    expect(count(`it('x', async () => { vi.doMock('./modal', async () => ({ ...(await import('./modal')) })); });`)).toBe(0);
    // A lazy route handed to the router as data — the router does the loading, not the spec.
    expect(count(`it('x', async () => { const routes = [{ path: 'a', loadComponent: async () => (await import('./a')).A }]; });`)).toBe(0);
    expect(count(`it('x', async () => { const routes = [{ path: 'a', loadChildren: () => import('./a') }]; });`)).toBe(0);
    // A callback the spec hands to the code under test.
    expect(count(`it('x', async () => { loader.mockImplementation(async () => await import('./modal')); });`)).toBe(0);
    // Module scope, and a describe body — neither is a test the runner drives.
    expect(count(`const modal = await import('./modal');`)).toBe(0);
    expect(count(`describe('x', () => { const load = () => import('./modal'); });`)).toBe(0);
  });

  it('leaves alone an import nothing waits for, and a then that is not the promise’s', () => {
    expect(count(`it('x', () => { import('./modal'); });`)).toBe(0);
    expect(count(`it('x', async () => { await Promise.all([import('./a'), import('./b')]); });`)).toBe(0);
    expect(count(`it('x', () => { wrapper.then(import('./modal')); });`)).toBe(0);
    expect(count(`it('x', async () => { await helper.import('./modal'); });`)).toBe(0);
    expect(count(`it('x', () => { import('./modal').catch(noop); });`)).toBe(0);
    expect(count(`it('x', () => { const f = import('./modal').then; });`)).toBe(0);
    expect(count(`it('x', () => { register(import('./modal').then); });`)).toBe(0);
    expect(count(`it('x', () => { table[import('./modal')] = 1; });`)).toBe(0);
  });

  it('leaves alone a callback something other than the runner invokes', () => {
    expect(count(`it('x', waitForAsync(async () => { await import('./modal'); }));`)).toBe(0);
    expect(count(`((run) => run())(async () => { await import('./modal'); });`)).toBe(0);
  });

  it('leaves a spec-local helper alone, because the file cannot say who calls it', () => {
    // A named function whose body awaits an import reads the same whether the spec calls it or
    // hands it to production code as a loader, and for the second `settleDynamicImport` is wrong.
    expect(count(`const flushLazyImport = async () => { await import('./modal'); };`)).toBe(0);
    expect(count(`async function load() { await import('./modal'); }`)).toBe(0);
  });
});
