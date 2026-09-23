/**
 * Type-level tests for the fixture helpers.
 *
 * The runtime half of `createFixture` is a deep copy and a merge; a spec can pin that. What a spec
 * cannot pin is the half these helpers exist for — that the defaults are checked as a **whole** `T`
 * and the overrides are still rejected for a field `T` does not have. Both guarantees disappear
 * silently the moment either parameter widens, and the merge keeps passing.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createFixture, createFixtureFactory, createMock, mockValueProp, narrow, outOfType } from '../auto-spy';

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

  it('takes an explicit undefined for a key the model declares optional, and only there', () => {
    interface Organisation {
      name: string;
      sites?: string[];
      address?: { city: string };
    }

    const base: Organisation = { name: 'Acme', sites: ['a'], address: { city: 'X' } };

    createMock<Organisation>({ ...base, sites: undefined });
    createFixture(base, { sites: undefined, address: undefined });

    // @ts-expect-error — `name` is required, so undefined is not a value for it
    createFixture(base, { name: undefined });
  });

  it('hands a Date through untouched rather than mapping over it', () => {
    expectTypeOf(createFixture(ARTICLE, { publishedAt: new Date(1) }).publishedAt).toEqualTypeOf<Date>();
  });
});

/** An error response: a class, and structurally an `Error` — `name`, `message` and the rest. */
class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly body: { code: string; detail: string },
  ) {
    super('server error');
  }
}

describe('createMock over an Error-shaped type', () => {
  it('takes a partial of it, at any depth, like any other object', () => {
    // `Error` was among the values handed back untouched, so a partial of any type that is
    // structurally an `Error` demanded every member of it.
    expectTypeOf(createMock<ServerError>({ status: 500 })).toEqualTypeOf<ServerError>();
    createMock<ServerError>({ body: { code: 'E1' } });
    createMock<ServerError>(new ServerError(500, { code: 'E1', detail: '' }));
    createMock<Error>({ message: 'boom' });
  });

  it('still rejects a key the type does not have', () => {
    // @ts-expect-error — `statusCode` is not on ServerError
    createMock<ServerError>({ statusCode: 500 });
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

describe('narrow.instanceOf', () => {
  it('returns the instance type of the class, an abstract one included', () => {
    abstract class Shape {
      abstract area(): number;
    }

    const body: FormData | string | null = null;
    const shape: unknown = null;

    expectTypeOf(narrow.instanceOf(body, FormData)).toEqualTypeOf<FormData>();
    expectTypeOf(narrow.instanceOf(shape, Shape)).toEqualTypeOf<Shape>();
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

describe('outOfType', () => {
  it('takes any value and answers the type it is asked for, which createMock would refuse', () => {
    expectTypeOf(outOfType<Article>(null)).toEqualTypeOf<Article>();
    expectTypeOf(outOfType<Article>([1, 2])).toEqualTypeOf<Article>();
  });

  it('takes its type from the slot, so mockValueProp still checks the key', () => {
    const job: { status: 'done' | 'queued' } = { status: 'done' };

    const status: typeof job.status = outOfType('UNKNOWN');

    mockValueProp(job, 'status', outOfType('UNKNOWN'));
    expectTypeOf(status).toEqualTypeOf<'done' | 'queued'>();
  });
});

describe('a class-typed member seeded with a construct signature', () => {
  class Transceiver {
    static readonly kind = 'audio';

    stop(): void {
      /* real */
    }
  }

  interface PlatformWindow {
    Transceiver: typeof Transceiver;
  }

  it('accepts a mock class typed as a bare constructor, and still checks what it builds', () => {
    const MockTransceiver: new () => Transceiver = Transceiver;
    const Wrong: new () => { stop: string } = class {
      stop = 'no';
    };

    expectTypeOf(createMock<PlatformWindow>({ Transceiver: MockTransceiver })).toEqualTypeOf<PlatformWindow>();
    // @ts-expect-error — the instance it builds is not a Transceiver.
    createMock<PlatformWindow>({ Transceiver: Wrong });
  });
});
