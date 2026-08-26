/**
 * The rules are linted against real source, through the real ESLint engine and the TypeScript
 * parser — a rule tested against hand-built AST nodes proves nothing about the selectors it ships.
 *
 * Each rule is checked on both sides: the shape it must flag, and the shapes next to it that it
 * must leave alone (a config object that merely uses `useValue`, a single `vi.fn()`, an assertion
 * outside a `subscribe` callback).
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';
import { rules } from './rules';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with a single rule of the plugin enabled. */
function verify(code: string, ruleName: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${ruleName}`]: 'error' },
      },
    ],
    'component.spec.ts',
  );
}

/** The rule ids reported for a snippet. */
function lint(code: string, ruleName: string): string[] {
  return verify(code, ruleName).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string, ruleName: string): string {
  return verify(code, ruleName)[0]?.message ?? '';
}

describe('prefer-provide-auto-spy', () => {
  it('flags a provider whose useValue hand-rolls a mock', () => {
    expect(lint('const p = { provide: Cart, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toEqual([
      'vitest-auto-spy/prefer-provide-auto-spy',
    ]);
  });

  it('flags it through a quoted key too', () => {
    expect(lint("const p = { 'provide': Cart, 'useValue': { total: jest.fn() } };", 'prefer-provide-auto-spy')).toHaveLength(1);
  });

  it('leaves a plain configuration value alone', () => {
    expect(lint("const p = { provide: CONFIG, useValue: { apiUrl: '/api' } };", 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('leaves a spy-backed provider and a computed key alone', () => {
    expect(lint('const p = { provide: Cart, useValue: createSpyFromClass(Cart) };', 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint("const p = { ['provide']: Cart, useValue: { total: vi.fn() } };", 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint('const p = { useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('points at the README recipe', () => {
    expect(firstMessage('const p = { provide: Cart, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toContain(
      'https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock',
    );
  });
});

describe('prefer-create-spy-from-class', () => {
  it('flags an object literal built from several vi.fn()s', () => {
    expect(lint('const cart = { total: vi.fn(), clear: vi.fn() };', 'prefer-create-spy-from-class')).toHaveLength(1);
  });

  it('leaves a single stub, a spread and a provider useValue alone', () => {
    expect(lint('const cart = { total: vi.fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const cart = { ...base, total: vi.fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const p = { provide: Cart, useValue: { total: vi.fn(), clear: vi.fn() } };', 'prefer-create-spy-from-class')).toEqual([]);
  });
});

describe('prefer-inject-spy', () => {
  it('flags re-spying a TestBed.inject() result', () => {
    expect(lint("vi.spyOn(TestBed.inject(Cart), 'total');", 'prefer-inject-spy')).toHaveLength(1);
  });

  it('leaves an ordinary spyOn alone', () => {
    expect(lint("vi.spyOn(window, 'scrollTo');", 'prefer-inject-spy')).toEqual([]);
  });
});

describe('no-object-define-property', () => {
  it('flags both defineProperty and defineProperties', () => {
    expect(lint("Object.defineProperty(service, 'ready', { value: true });", 'no-object-define-property')).toHaveLength(1);
    expect(lint('Object.defineProperties(service, descriptors);', 'no-object-define-property')).toHaveLength(1);
  });

  it('leaves other Object statics alone', () => {
    expect(lint('Object.assign(service, { ready: true });', 'no-object-define-property')).toEqual([]);
  });
});

describe('no-expect-in-subscribe', () => {
  it('flags an assertion that only runs if the stream emits', () => {
    expect(lint('source$.subscribe((value) => expect(value).toBe(1));', 'no-expect-in-subscribe')).toHaveLength(1);
  });

  it('leaves an awaited assertion alone', () => {
    expect(lint('expect(await expectEmission(source$)).toBe(1);', 'no-expect-in-subscribe')).toEqual([]);
  });
});

describe('the plugin', () => {
  it('ships every rule it recommends, wired to itself for flat config', () => {
    const recommended = Object.keys(plugin.configs.recommended.rules).map((id) => id.replace('vitest-auto-spy/', ''));

    expect(recommended.sort()).toEqual(Object.keys(rules).sort());
    expect(plugin.configs.recommended.plugins['vitest-auto-spy']).toBe(plugin);
    expect(plugin.rules).toBe(rules);
  });

  it('documents every rule with a link to the recipe it recommends', () => {
    Object.values(rules).forEach((rule) => {
      expect(rule.meta.docs.url).toContain('#how-to-mock');
      expect(Object.values(rule.meta.messages).every((message) => message.includes(rule.meta.docs.url))).toBe(true);
    });
  });
});
