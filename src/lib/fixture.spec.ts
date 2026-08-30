/**
 * The properties that make a fixture helper worth having over a shared literal: overrides reach a
 * leaf without flattening its siblings, every call is a new object, and anything with a prototype
 * survives the copy intact rather than being rebuilt as a bag of its own fields.
 */
import { describe, expect, it } from 'vitest';

import { createFixture, createFixtureFactory } from './fixture';

class Money {
  constructor(private readonly amount: number) {}

  get formatted(): string {
    return `${this.amount} ₽`;
  }
}

interface Article {
  id: string;
  header: { title: string; subtitle: string };
  tags: string[];
  publishedAt: Date;
  price: Money;
}

const ARTICLE: Article = {
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
  price: new Money(100),
};

describe('createFixture', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(createFixture(ARTICLE)).toEqual(ARTICLE);
  });

  it('merges a nested override without dropping its siblings', () => {
    const article = createFixture(ARTICLE, { header: { title: 'Draft' } });

    expect(article.header).toEqual({ title: 'Draft', subtitle: 'none' });
  });

  it('replaces an overridden array instead of merging into it', () => {
    const article = createFixture(ARTICLE, { tags: ['news'] });

    expect(article.tags).toEqual(['news']);
  });

  it('copies arrays, so a mutation cannot reach the defaults', () => {
    const article = createFixture(ARTICLE);

    article.tags.push('leaked');

    expect(ARTICLE.tags).toEqual([]);
    expect(createFixture(ARTICLE).tags).toEqual([]);
  });

  it('carries a prototype-bearing value across by reference, accessors intact', () => {
    const article = createFixture(ARTICLE, { header: { title: 'Priced' } });

    expect(article.price).toBe(ARTICLE.price);
    expect(article.price.formatted).toBe('100 ₽');
    expect(article.publishedAt).toBeInstanceOf(Date);
  });

  it('replaces a prototype-bearing value when the override names it', () => {
    const price = new Money(250);

    expect(createFixture(ARTICLE, { price }).price.formatted).toBe('250 ₽');
  });

  it('adds a field the defaults never had, copied rather than shared', () => {
    const defaults: Record<string, unknown> = { known: 1 };
    const nested = { added: true };

    const fixture = createFixture(defaults, { extra: nested });

    expect(fixture).toEqual({ known: 1, extra: { added: true } });
    expect(fixture['extra']).not.toBe(nested);
  });

  it('copies an object built without a prototype', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare['flag'] = true;

    const fixture = createFixture({ bare });

    expect(fixture.bare).toEqual({ flag: true });
    expect(fixture.bare).not.toBe(bare);
  });

  it('never lets a `__proto__` key rewrite the copy it is building', () => {
    const polluted = JSON.parse('{ "id": "1", "__proto__": { "injected": true } }') as { id: string };

    const fixture = createFixture(polluted, JSON.parse('{ "__proto__": { "injectedToo": true } }') as object);

    expect(Object.getPrototypeOf(fixture)).toBe(Object.prototype);
    expect('injected' in fixture).toBe(false);
    expect('injectedToo' in fixture).toBe(false);
  });
});

describe('createFixtureFactory', () => {
  it('hands out a new object on every call', () => {
    const anArticle = createFixtureFactory(ARTICLE);

    const first = anArticle();
    const second = anArticle();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('applies per-call overrides without them leaking into the next call', () => {
    const anArticle = createFixtureFactory(ARTICLE);

    expect(anArticle({ header: { title: 'Draft' } }).header.title).toBe('Draft');
    expect(anArticle().header.title).toBe('');
  });

  it('pins the defaults at build time, so a later edit cannot reach a fixture', () => {
    const defaults = { tags: ['original'] };
    const someTags = createFixtureFactory(defaults);

    defaults.tags = ['edited'];

    expect(someTags().tags).toEqual(['original']);
  });
});
