import { beforeAll, describe, expect, it } from 'vitest';

import { registerFocusMatchers } from './focus-matchers';

describe('toHaveFocus', () => {
  beforeAll(() => {
    registerFocusMatchers();
  });

  it('passes for the focused element', () => {
    const button = document.createElement('button');

    document.body.append(button);
    button.focus();

    expect(button).toHaveFocus();

    button.remove();
  });

  it('names the element that has focus instead', () => {
    const expected = document.createElement('button');
    const focused = document.createElement('input');

    focused.id = 'query';
    focused.className = 'search big';
    document.body.append(expected, focused);
    focused.focus();

    expect(() => expect(expected).toHaveFocus()).toThrow(/focus is on input#query\.search\.big/);

    expected.remove();
    focused.remove();
  });

  it('says so when the expected element is not in the document', () => {
    const detached = document.createElement('span');

    expect(() => expect(detached).toHaveFocus()).toThrow(/not in the document/);
  });

  it('treats a query that found nothing as its own, most common case', () => {
    expect(() => expect(null).toHaveFocus()).toThrow(/A query that found nothing/);
    expect(() => expect(undefined).toHaveFocus()).toThrow(/received undefined/);
    expect(() => expect('button').toHaveFocus()).toThrow(/a non-element \(string\)/);
  });

  it('supports the negated form', () => {
    const button = document.createElement('button');

    document.body.append(button);

    expect(button).not.toHaveFocus();

    button.focus();

    expect(() => expect(button).not.toHaveFocus()).toThrow(/not to have focus, but it does/);

    button.remove();
  });
});
