import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import type { ClassType } from './types';

/** Public callable instance members, including symbol-named handlers. */
export type NestParamDecoratorMethod<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

type MetadataReader = (key: string, target: object, property: string | symbol) => unknown;

function fail(message: string): Error {
  return new Error(withDocs(`[vitest-auto-spy] invokeNestParamDecorator: ${message}`, DOCS_LINKS.nestParamDecorator));
}

/**
 * Invoke the custom parameter factory recorded by Nest's `createParamDecorator`.
 *
 * Pass the decorated controller class, handler name, zero-based parameter index and execution
 * context. The stored decorator data is forwarded unchanged, as is its result (including a Promise).
 * This tests the factory only: parameters with pipes or a schema are refused because Nest's
 * validation pipeline is not run. Native decorators such as `@Body()` have no custom factory.
 * Requires the consumer's `reflect-metadata` import; imports no Nest or runner code itself.
 */
export function invokeNestParamDecorator<T>(
  Controller: ClassType<T>,
  method: NestParamDecoratorMethod<T> & (string | symbol),
  parameterIndex: number,
  context: object,
): unknown {
  if (!Number.isInteger(parameterIndex) || parameterIndex < 0) {
    throw fail('parameterIndex must be a non-negative integer.');
  }

  const read: unknown = Reflect.get(Reflect, 'getMetadata');

  if (typeof read !== 'function') {
    throw fail('import "reflect-metadata" before reading Nest parameter decorator metadata.');
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the optional consumer-owned reflect-metadata polyfill has this structural signature.
  const metadata: unknown = (read as MetadataReader)('__routeArguments__', Controller, method);

  if (metadata === undefined) {
    throw fail(`no parameter metadata for ${String(method)}; apply a Nest custom parameter decorator first.`);
  }

  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw fail(`invalid parameter metadata for ${String(method)}.`);
  }

  const records: [string, unknown][] = Object.entries(metadata);
  const entries = records.filter((record): record is [string, object] => {
    const [key, value] = record;
    return (
      key.endsWith(`__customRouteArgs__:${parameterIndex}`) &&
      value !== null &&
      typeof value === 'object' &&
      Reflect.get(value, 'index') === parameterIndex
    );
  });

  const selected = entries.at(0);

  if (!selected) {
    throw fail(
      `no custom parameter factory for ${String(method)} parameter #${parameterIndex}; native decorators such as @Body() are not supported.`,
    );
  }

  if (entries.length > 1) {
    throw fail(`ambiguous custom parameter factories for ${String(method)} parameter #${parameterIndex}.`);
  }

  const entry = selected[1];
  const factory: unknown = Reflect.get(entry, 'factory');
  const pipes: unknown = Reflect.get(entry, 'pipes');

  if (typeof factory !== 'function') {
    throw fail(`invalid custom parameter factory for ${String(method)} parameter #${parameterIndex}.`);
  }

  if ((pipes !== undefined && (!Array.isArray(pipes) || pipes.length > 0)) || Reflect.get(entry, 'schema') !== undefined) {
    throw fail('parameters with pipes or a schema require the Nest validation pipeline; this helper invokes only the custom factory.');
  }

  return Reflect.apply(factory, undefined, [Reflect.get(entry, 'data'), context]);
}
