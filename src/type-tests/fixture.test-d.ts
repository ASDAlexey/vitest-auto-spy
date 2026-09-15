/**
 * Type-level tests for the fixture helpers.
 *
 * The runtime half of `createFixture` is a deep copy and a merge; a spec can pin that. What a spec
 * cannot pin is the half these helpers exist for — that the defaults are checked as a **whole** `T`
 * and the overrides are still rejected for a field `T` does not have. Both guarantees disappear
 * silently the moment either parameter widens, and the merge keeps passing.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createFixture, createFixtureFactory, narrow } from '../auto-spy';

interface Article {
  id: string;
  header: { title: string; subtitle: string };
  tags: string[];
  publishedAt: Date;
}

const ARTICLE: Article = { id: '1', header: { title: '', subtitle: '' }, tags: [], publishedAt: new Date(0) };

describe('createFixture', () => {
  it('hands back the whole type, not a partial of it', () => {
    expectTypeOf(createFixture(ARTICLE)).toEqualTypeOf<Article>();
    expectTypeOf(createFixture(ARTICLE, { id: '2' })).toEqualTypeOf<Article>();
  });

  it('requires the defaults to be a complete T — the reason a removed field is a compile error', () => {
    // @ts-expect-error — `publishedAt` is required, and this is the one place that says so
    createFixture<Article>({ id: '1', header: { title: '', subtitle: '' }, tags: [] });
  });

  it('rejects a field the model does not have, at any depth', () => {
    // @ts-expect-error — `slug` is not on Article
    createFixture(ARTICLE, { slug: 'x' });

    // @ts-expect-error — `nickname` is not on Article['header']
    createFixture(ARTICLE, { header: { nickname: 'ada' } });
  });

  it('still rejects a field of the right name and the wrong type', () => {
    // @ts-expect-error — `tags` is a string[]
    createFixture(ARTICLE, { tags: 'news' });
  });

  it('hands a Date through untouched rather than mapping over it', () => {
    expectTypeOf(createFixture(ARTICLE, { publishedAt: new Date(1) }).publishedAt).toEqualTypeOf<Date>();
  });
});

describe('createFixtureFactory', () => {
  it('returns a function producing the whole type', () => {
    const anArticle = createFixtureFactory(ARTICLE);

    expectTypeOf(anArticle).toBeFunction();
    expectTypeOf(anArticle()).toEqualTypeOf<Article>();
    expectTypeOf(anArticle({ header: { title: 'Draft' } })).toEqualTypeOf<Article>();
  });

  it('checks per-call overrides against the same type', () => {
    const anArticle = createFixtureFactory(ARTICLE);

    // @ts-expect-error — `slug` is not on Article
    anArticle({ slug: 'x' });
  });
});

describe('narrow.defined', () => {
  it('strips null and undefined from the returned type, which assert.exists cannot do in an expression', () => {
    const covers: string[] | null | undefined = ['a'];

    expectTypeOf(narrow.defined(covers)).toEqualTypeOf<string[]>();
    expectTypeOf(narrow.defined(covers)).not.toEqualTypeOf<string[] | undefined>();
  });

  it('leaves a type that was never nullish exactly as it was', () => {
    // Through a function, so the literal is not what `defined` is handed.
    const count = (): number => 7;

    expectTypeOf(narrow.defined(count())).toEqualTypeOf<number>();
  });

  it('keeps the members of a union that are merely falsy', () => {
    // Through a function: a `const` with a literal initialiser is narrowed by control flow before
    // `defined` ever sees the union, which would prove nothing about the return type.
    const falsy = (): '' | 0 | false | null => 0;

    expectTypeOf(narrow.defined(falsy())).toEqualTypeOf<'' | 0 | false>();
  });
});
