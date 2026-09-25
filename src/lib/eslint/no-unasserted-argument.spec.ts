import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-unasserted-argument';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code, {});
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('no-unasserted-argument', () => {
  it('reports the bare matcher on a subject the file pins elsewhere', () => {
    const code = `
      it('saves the draft', () => {
        expect(api.save).toHaveBeenCalled();
      });
      it('saves the draft under its key', () => {
        expect(api.save).toHaveBeenCalledWith('draft', body);
      });
    `;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(verify(code)[0]?.line).toBe(3);
    expect(text).toMatch(/^This checks only that `api\.save` ran/);
    expect(text).toContain('expect(api.save).toHaveBeenCalledWith(…)');
  });

  it('matches the two assertions by the text of the subject', () => {
    expect(count(`expect( api . save ).toHaveBeenCalled();\nexpect(api.save).toHaveBeenCalledWith(1);`)).toBe(1);
    // A spy under a second name is a second subject: identity is what is written, never what it is.
    expect(count(`expect(saveSpy).toHaveBeenCalled();\nexpect(api.save).toHaveBeenCalledWith(1);`)).toBe(0);
  });

  it('reads a test-local spy through what it holds, not through its name', () => {
    const twoTests = (first: string, second: string): string => `
      it('logs the payload', () => {
        const spy = ${first};
        run();
        expect(spy).toHaveBeenCalledWith('payload');
      });
      it('closes the dialog', () => {
        const spy = ${second};
        run();
        expect(spy).toHaveBeenCalled();
      });
    `;

    // Two members spied under one generic name are two subjects.
    expect(count(twoTests("vi.spyOn(logger, 'info')", "vi.spyOn(dialog, 'close')"))).toBe(0);
    // The same member is one subject, configured or not.
    expect(count(twoTests("vi.spyOn(component.char, 'emit')", "vi.spyOn(component.char, 'emit').mockReturnValue(true)"))).toBe(1);
    // A `vi.fn()` is nobody but itself.
    expect(count(twoTests('vi.fn()', 'vi.fn()'))).toBe(0);
    // One binding shared by both tests is still one subject.
    expect(count(`let spy;\n${twoTests("vi.spyOn(logger, 'info')", "vi.spyOn(dialog, 'close')").replaceAll('const spy =', 'spy =')}`)).toBe(
      1,
    );
    expect(count(`const spy = vi.fn();\n${twoTests('x', 'x').replaceAll('const spy = x;', '')}`)).toBe(1);
    // A subject read through a call, or with no name to start from, is matched by its text alone.
    expect(count(`expect(TestBed.inject(Api).save).toHaveBeenCalled();\nexpect(TestBed.inject(Api).save).toHaveBeenCalledWith(1);`)).toBe(
      1,
    );
    expect(count(`expect((api as Api).save).toHaveBeenCalled();\nexpect((api as Api).save).toHaveBeenCalledWith(1);`)).toBe(1);
  });

  it('leaves the test that pins the arguments itself alone', () => {
    const code = `
      it('saves the draft', () => {
        expect(api.save).toHaveBeenCalled();
        expect(api.save).toHaveBeenCalledWith('draft');
      });
    `;

    expect(count(code)).toBe(0);
  });

  it('reports a title that promises an argument list over a body that asserts nothing else', () => {
    const code = `
      it('emits rowFocused with the host element', () => {
        component.onFocus();

        expect(component.rowFocused.emit).toHaveBeenCalled();
      });
    `;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('The title of this test says what `component.rowFocused.emit` is called with');
  });

  it('reads the title through the spellings a test is marked and generated with', () => {
    expect(count("it.only('opens the modal with the profile', () => { expect(modal.open).toHaveBeenCalled(); });")).toBe(1);
    expect(count('test(`navigates with ${target}`, () => { expect(router.navigate).toHaveBeenCalled(); });')).toBe(1);
    expect(count("it('opens the modal', fakeAsync(() => { expect(modal.open).toHaveBeenCalled(); }));")).toBe(0);
  });

  it('does not take a title apart on a substring', () => {
    expect(count("it('renders without a poster', () => { expect(render).toHaveBeenCalled(); });")).toBe(0);
    expect(count("it('withdraws the offer', () => { expect(offers.drop).toHaveBeenCalled(); });")).toBe(0);
    expect(count('it(NAME, () => { expect(offers.drop).toHaveBeenCalled(); });')).toBe(0);
  });

  it('does not read the `with` of the asserted method name as an argument list', () => {
    expect(count("it('should dismiss with action on click', () => { expect(ref.dismissWithAction).toHaveBeenCalled(); });")).toBe(0);
    expect(
      count("it('dismisses with the action, via dismissWithAction', () => { expect(ref.dismissWithAction).toHaveBeenCalled(); });"),
    ).toBe(1);
    expect(count("it('opens with the id', () => { expect(ref.dismissWithAction).toHaveBeenCalled(); });")).toBe(1);
    expect(count("it('starts with a payload', () => { expect(spies[0]).toHaveBeenCalled(); });")).toBe(1);
  });

  it('leaves the Event methods that take no arguments alone', () => {
    expect(count("it('ignores events with metaKey', () => { expect(event.preventDefault).toHaveBeenCalled(); });")).toBe(0);
    expect(count("it('stops with a click', () => { expect(e.stopPropagation).toHaveBeenCalled(); });")).toBe(0);
    expect(count("it('stops with a click', () => { expect(e.stopImmediatePropagation).toHaveBeenCalled(); });")).toBe(0);
    expect(count(`expect(event.preventDefault).toHaveBeenCalled();\nexpect(event.preventDefault).toHaveBeenCalledWith();`)).toBe(0);
    expect(message("it('loads with the id', () => { expect(api.load).toHaveBeenCalled(); });")).toContain(
      'expect(api.load).toHaveBeenCalledWith(…)',
    );
  });

  it('is silenced by any assertion in the test that is not a bare call', () => {
    const result = `it('loads with the id', () => { expect(api.load).toHaveBeenCalled(); expect(result).toEqual(page); });`;
    const counted = `it('loads with the id', () => { expect(api.load).toHaveBeenCalled(); expect(api.load).toHaveBeenCalledTimes(1); });`;
    const unreadable = `it('loads with the id', async () => { expect(api.load).toHaveBeenCalled(); await expect(p).resolves.toBe(1); });`;

    expect(count(result)).toBe(0);
    expect(count(counted)).toBe(0);
    expect(count(unreadable)).toBe(0);
    // Another bare call is not an assertion about arguments either, so it does not silence anything.
    expect(count(`it('loads with the id', () => { expect(a.load).toHaveBeenCalled(); expect(b.load).toHaveBeenCalled(); });`)).toBe(2);
  });

  it('leaves the negative alone, which is a claim about the call and not about its arguments', () => {
    expect(count(`expect(api.save).not.toHaveBeenCalled();\nexpect(api.save).toHaveBeenCalledWith(1);`)).toBe(0);
    expect(count(`it('saves with no key', () => { expect(api.save).not.toHaveBeenCalled(); });`)).toBe(0);
  });

  it('leaves alone what is not the bare matcher at all', () => {
    expect(count(`expect(api.save).toHaveBeenCalledTimes(1);\nexpect(api.save).toHaveBeenCalledWith(1);`)).toBe(0);
    expect(count(`expect(api.save).toHaveBeenCalledOnce();\nexpect(api.save).toHaveBeenCalledWith(1);`)).toBe(0);
    expect(count(`expect(api.save).toHaveBeenCalled();`)).toBe(0);
    expect(count(`expect().toHaveBeenCalled();`)).toBe(0);
    expect(count(`check(api.save).toHaveBeenCalled();\nexpect(api.save).toHaveBeenCalledWith(1);`)).toBe(0);
  });

  it('reads an assertion outside any test the same way', () => {
    // Two `describe`-scope assertions share one `undefined` test, which must not read as "the same
    // test already pins it".
    expect(count(`expect(api.save).toHaveBeenCalled();\nit('x', () => { expect(api.save).toHaveBeenCalledWith(1); });`)).toBe(1);
  });
});
