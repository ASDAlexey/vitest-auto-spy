import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

/** A controller constructor, structurally compatible with Nest's `Type<T>`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Nest's Type<T> allows construction with any arguments; never[] would make ExecutionContext structurally incompatible.
export type NestHttpContextClass<T = unknown> = new (...args: any[]) => T;

/** HTTP arguments supplied to {@link createHttpExecutionContext}. */
export interface NestHttpExecutionContextOptions<TRequest = unknown, TResponse = unknown, TNext = unknown> {
  request?: TRequest;
  response?: TResponse;
  next?: TNext;
  /** The actual controller class, when the code under test reads controller metadata. */
  class?: NestHttpContextClass;
  /** The actual controller method, when the code under test reads handler metadata. */
  handler?: (...args: never[]) => unknown;
}

/** The HTTP view of the same mutable argument array returned by `getArgs()`. */
export interface NestHttpArgumentsHost<TRequest = unknown, TResponse = unknown, TNext = unknown> {
  getRequest<T = TRequest>(): T;
  getResponse<T = TResponse>(): T;
  getNext<T = TNext>(): T;
}

/** The structural HTTP subset of Nest's ExecutionContext, including ArgumentsHost methods. */
export interface NestHttpExecutionContext<TRequest = unknown, TResponse = unknown, TNext = unknown> {
  getArgs<T extends unknown[] = unknown[]>(): T;
  getArgByIndex<T = unknown>(index: number): T;
  getType<TContext extends string = 'http'>(): TContext;
  getClass<T = unknown>(): NestHttpContextClass<T>;
  getHandler(): (...args: never[]) => unknown;
  switchToHttp(): NestHttpArgumentsHost<TRequest, TResponse, TNext>;
  switchToRpc(): never;
  switchToWs(): never;
}

// Nest's generic accessors let their caller select the view of an untyped argument slot. This
// boundary performs the same assertion without importing Nest or requiring its optional peers.
function argumentAs<T>(value: unknown): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Nest's caller-selected generic accessor is an assertion over a runtime argument slot.
  return value as T;
}

function contextError(message: string): never {
  throw new Error(withDocs(`[vitest-auto-spy] createHttpExecutionContext(): ${message}`, DOCS_LINKS.nestHttpContext));
}

/**
 * Build an HTTP ExecutionContext for a Nest guard, interceptor, filter or parameter decorator.
 * No Nest runtime or HTTP adapter is loaded. Request, response and next keep their identities;
 * omitted arguments are `undefined`, just like an empty slot in Nest's ExecutionContextHost.
 *
 * All argument accessors read one mutable `[request, response, next]` array. Updating the array
 * returned by `getArgs()` therefore changes what `switchToHttp()` and `getArgByIndex()` read.
 * The context always reports `http`; switching to RPC or WebSockets throws.
 *
 * Supply `class` or `handler` when the code under test reads metadata from them. Their accessors
 * throw an instruction when omitted rather than supplying a fabricated metadata target.
 *
 * @example
 * ```ts
 * const context = createHttpExecutionContext({ request: { headers: { authorization: 'test' } } });
 * expect(guard.canActivate(context)).toBe(true);
 * ```
 */
export function createHttpExecutionContext<TRequest = unknown, TResponse = unknown, TNext = unknown>(
  options: NestHttpExecutionContextOptions<TRequest, TResponse, TNext> = {},
): NestHttpExecutionContext<TRequest, TResponse, TNext> {
  const args: unknown[] = [options.request, options.response, options.next];
  const http: NestHttpArgumentsHost<TRequest, TResponse, TNext> = {
    getRequest: <T>() => argumentAs<T>(args[0]),
    getResponse: <T>() => argumentAs<T>(args[1]),
    getNext: <T>() => argumentAs<T>(args[2]),
  };

  return {
    getArgs: <T extends unknown[]>() => argumentAs<T>(args),
    getArgByIndex: <T>(index: number) => argumentAs<T>(args[index]),
    getType: <TContext extends string>() => argumentAs<TContext>('http'),
    getClass: <T>(): NestHttpContextClass<T> => {
      if (options.class === undefined) {
        contextError('pass { class: Controller } before calling getClass().');
      }

      return argumentAs<NestHttpContextClass<T>>(options.class);
    },
    getHandler: (): ((...args: never[]) => unknown) => {
      if (options.handler === undefined) {
        contextError('pass { handler: Controller.prototype.method } before calling getHandler().');
      }

      return options.handler;
    },
    switchToHttp: () => http,
    switchToRpc: (): never => contextError('supports HTTP only; switchToRpc() is unavailable.'),
    switchToWs: (): never => contextError('supports HTTP only; switchToWs() is unavailable.'),
  };
}
