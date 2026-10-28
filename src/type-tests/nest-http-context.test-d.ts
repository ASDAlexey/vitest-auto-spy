import { expectTypeOf, it } from 'vitest';

import { type NestHttpContextClass, createHttpExecutionContext } from '../lib/nest-http-context';

it('infers HTTP arguments and preserves Nest generic accessor signatures', () => {
  const request = { headers: { accept: 'application/json' } };
  const response = { statusCode: 200 };
  const next = (): undefined => undefined;
  const context = createHttpExecutionContext({ request, response, next });
  const http = context.switchToHttp();

  expectTypeOf(http.getRequest()).toEqualTypeOf<typeof request>();
  expectTypeOf(http.getResponse()).toEqualTypeOf<typeof response>();
  expectTypeOf(http.getNext()).toEqualTypeOf<typeof next>();
  expectTypeOf(http.getRequest<{ user: string }>()).toEqualTypeOf<{ user: string }>();
  expectTypeOf(http.getResponse<{ sent: boolean }>()).toEqualTypeOf<{ sent: boolean }>();
  expectTypeOf(http.getNext<() => void>()).toEqualTypeOf<() => void>();
  expectTypeOf(context.getArgs()).toEqualTypeOf<unknown[]>();
  expectTypeOf(context.getArgs<[typeof request, typeof response, typeof next]>()).toEqualTypeOf<
    [typeof request, typeof response, typeof next]
  >();
  expectTypeOf(context.getArgByIndex<string>(0)).toEqualTypeOf<string>();
  expectTypeOf(context.getClass<{ id: number }>()).toEqualTypeOf<NestHttpContextClass<{ id: number }>>();
  expectTypeOf(context.getType()).toEqualTypeOf<'http'>();
  expectTypeOf(context.getType<'http' | 'rpc'>()).toEqualTypeOf<'http' | 'rpc'>();
  expectTypeOf(context.switchToRpc).returns.toBeNever();
  expectTypeOf(context.switchToWs).returns.toBeNever();
  expectTypeOf(createHttpExecutionContext().switchToHttp().getRequest()).toBeUnknown();

  class Controller {
    constructor(readonly id: string) {}

    handle(value: number): number {
      return value;
    }
  }
  createHttpExecutionContext({ class: Controller, handler: Controller.prototype.handle });

  // @ts-expect-error The controller must be constructable.
  createHttpExecutionContext({ class: () => ({}) });
  // @ts-expect-error A handler is a callable metadata target.
  createHttpExecutionContext({ handler: 'handle' });
});
