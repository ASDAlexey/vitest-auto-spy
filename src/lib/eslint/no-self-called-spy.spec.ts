import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-self-called-spy';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('no-self-called-spy', () => {
  it('flags the emit a test makes itself and then asserts', () => {
    const code = `
      it('relays subscribeClick from children', () => {
        const emitSpy = vi.spyOn(component.subscribeClick, 'emit');
        component.subscribeClick.emit(payload);
        expect(emitSpy).toHaveBeenCalledWith(payload);
      });
    `;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('`component.subscribeClick.emit`');
    expect(text).toContain('satisfied by this line');
    expect(text).toContain('survives the deletion');
  });

  it('reads the assertion written on the member rather than on a name', () => {
    const code = `it('x', () => { vi.spyOn(service, 'load'); service.load(); expect(service.load).toHaveBeenCalled(); });`;

    expect(count(code)).toBe(1);
  });

  it('reads a hook-free test through its wrappers and its marked spellings', () => {
    const body = `() => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).toHaveBeenCalled(); }`;

    expect(count(`it.only('x', ${body});`)).toBe(1);
    expect(count(`test('x', ${body});`)).toBe(1);
    expect(count(`it.each([1])('x', ${body});`)).toBe(1);
    expect(count(`it('x', fakeAsync(${body}));`)).toBe(1);
    expect(count(`jest.spyOn(a, 'b');\nit('x', () => { const s = jest.spyOn(a, 'b'); a.b(); expect(s).toHaveBeenCalled(); });`)).toBe(1);
  });

  it('reports each self-made call, and only inside the test that made it', () => {
    const code = `
      it('x', () => {
        const s = vi.spyOn(a, 'b');
        a.b(1);
        a.b(2);
        expect(s).toHaveBeenCalled();
      });
      it('y', () => { a.b(3); });
    `;

    expect(count(code)).toBe(2);
  });

  it('leaves arrangement written before the spy alone', () => {
    // The shape the order check exists for: state is set up, the spy goes on afterwards, and the
    // production path is what the assertion is about.
    const code = `
      it('does not update state when the id is stale', () => {
        service.updateSectionState(slug, stale);
        const updateSpy = vi.spyOn(service, 'updateSectionState');
        run();
        expect(updateSpy).toHaveBeenCalled();
      });
    `;

    expect(count(code)).toBe(0);
  });

  it('leaves an absence assertion alone, in either spelling', () => {
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).not.toHaveBeenCalled(); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).toHaveBeenCalledTimes(0); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).toEqual(other); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).resolves.toHaveBeenCalled(); });`)).toBe(0);
  });

  it('leaves a call a reset between it and the assertion has already dropped', () => {
    // The spec says it itself: what the assertion reads afterwards is the production path alone.
    const cleared = `
      it('defers the enable until the next frame', () => {
        const enableSpy = vi.spyOn(service, 'enableNewNavigation');
        service.enableNewNavigation();
        enableSpy.mockClear();
        modal.closeModal.emit();
        expect(enableSpy).toHaveBeenCalledTimes(1);
      });
    `;

    expect(count(cleared)).toBe(0);
    expect(count(`it('x', () => { vi.spyOn(a, 'b'); a.b(); a.b.mockReset(); run(); expect(a.b).toHaveBeenCalled(); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); vi.clearAllMocks(); run(); expect(s).toHaveBeenCalled(); });`)).toBe(
      0,
    );
    // A reset written *after* the assertion leaves the assertion reading the call above it.
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).toHaveBeenCalled(); s.mockClear(); });`)).toBe(1);
  });

  it('leaves an assertion alone whose arguments are not the ones the call passed', () => {
    const arranged = `
      it('increases the scale', () => {
        vi.spyOn(component.scale, 'set');
        component.scale.set(2);
        component.zoom(1);
        expect(component.scale.set).toHaveBeenCalledWith(3);
      });
    `;

    expect(count(arranged)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(1); expect(s).toHaveBeenCalledWith(1); });`)).toBe(1);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(1); expect(s).toHaveBeenNthCalledWith(1, 1); });`)).toBe(1);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(1); expect(s).toHaveBeenNthCalledWith(2, 9); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b({ id: 1 }); expect(s).toHaveBeenCalledWith({id: 1}); });`)).toBe(1);
  });

  it('leaves a delegation test alone — two members are not one', () => {
    const code = `it('x', () => { const s = vi.spyOn(service, 'load'); component.ngOnInit(); expect(s).toHaveBeenCalled(); });`;

    expect(count(code)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); other.b(); expect(s).toHaveBeenCalled(); });`)).toBe(0);
  });

  it('leaves a call the code under test makes through a callback alone', () => {
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); run(() => a.b()); expect(s).toHaveBeenCalled(); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); source$.subscribe(() => a.b()); expect(s).toHaveBeenCalled(); });`)).toBe(0);
  });

  it('leaves a spy installed in a hook alone, and one nothing asserts', () => {
    expect(count(`beforeEach(() => { vi.spyOn(a, 'b'); });\nit('x', () => { a.b(); expect(a.b).toHaveBeenCalled(); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); });`)).toBe(0);
    expect(count(`it('x', () => { a.b(); expect(a.b).toHaveBeenCalled(); });`)).toBe(0);
  });

  it('leaves the assertion written above the call alone', () => {
    const code = `it('x', () => { const s = vi.spyOn(a, 'b'); expect(s).toHaveBeenCalled(); a.b(); });`;

    expect(count(code)).toBe(0);
  });

  it('reads nothing from an expect with no subject, and nothing a matcher name cannot be read off', () => {
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect().toHaveBeenCalled(); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(read()).toHaveBeenCalled(); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 1); a.b(); expect(a.b).toHaveBeenCalled(); });`)).toBe(0);
  });

  it('reads nothing from a matcher nothing invokes', () => {
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).toHaveBeenCalled; });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); register(expect(s).toHaveBeenCalled); });`)).toBe(0);
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s); });`)).toBe(0);
  });

  it('reads nothing from a reset whose spy it cannot name', () => {
    expect(count(`it('x', () => { const s = vi.spyOn(a, 'b'); a.b(); read().mockClear(); expect(s).toHaveBeenCalled(); });`)).toBe(1);
  });

  it('reads nothing outside a test body', () => {
    expect(count(`const s = vi.spyOn(a, 'b');\na.b();\nexpect(s).toHaveBeenCalled();`)).toBe(0);
    expect(count(`describe('x', () => { const s = vi.spyOn(a, 'b'); a.b(); expect(s).toHaveBeenCalled(); });`)).toBe(0);
  });

  it('reads nothing from a spy whose member is computed', () => {
    expect(count(`it('x', () => { const s = vi.spyOn(a, name); a.b(); expect(s).toHaveBeenCalled(); });`)).toBe(0);
  });
});
