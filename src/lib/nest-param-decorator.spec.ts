import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { invokeNestParamDecorator } from './nest-param-decorator';
import { mockValueProp } from './prop-mock';

const method = Symbol('handler');

function controller(metadata?: unknown) {
  class Controller {
    handle(): void {}
    [method](): void {}
  }

  if (metadata !== undefined) {
    Reflect.defineMetadata('__routeArguments__', metadata, Controller, 'handle');
  }

  return Controller;
}

function custom(index: number, factory: unknown, extra: object = {}): object {
  return { index, factory, data: undefined, pipes: [], ...extra };
}

describe('invokeNestParamDecorator', () => {
  it('selects the parameter by index and custom key and forwards stored data and context', () => {
    const context = {};
    const data = { field: 'image' };
    const result = { body: 'stream' };
    const factory = vi.fn().mockReturnValue(result);
    const Controller = controller({
      '0:1': { index: 1, factory: () => 'native' },
      'other__customRouteArgs__:0': custom(0, () => 'other'),
      'chosen__customRouteArgs__:1': custom(1, factory, { data }),
    });

    expect(invokeNestParamDecorator(Controller, 'handle', 1, context)).toBe(result);
    expect(factory).toHaveBeenCalledExactlyOnceWith(data, context);
  });

  it('preserves a Promise without wrapping it and propagates factory errors', () => {
    const promise = Promise.resolve('value');
    const error = new Error('bad request');
    const Controller = controller({
      'async__customRouteArgs__:0': custom(0, () => promise),
      'throws__customRouteArgs__:1': custom(1, () => {
        throw error;
      }),
    });

    expect(invokeNestParamDecorator(Controller, 'handle', 0, {})).toBe(promise);
    expect(() => invokeNestParamDecorator(Controller, 'handle', 1, {})).toThrow(error);
  });

  it('reads inherited metadata and supports symbol-named methods', () => {
    const Base = controller();
    Reflect.defineMetadata('__routeArguments__', { 'symbol__customRouteArgs__:0': custom(0, () => 42) }, Base, method);
    class Derived extends Base {}

    expect(invokeNestParamDecorator(Derived, method, 0, {})).toBe(42);
  });

  it.each([-1, 0.5, NaN, Infinity])('refuses invalid parameter index %s', (index) => {
    expect(() => invokeNestParamDecorator(controller(), 'handle', index, {})).toThrow('non-negative integer');
  });

  it('explains a missing reflect-metadata import', () => {
    const Controller = controller();
    const restore = mockValueProp(Reflect, 'getMetadata', undefined);

    try {
      expect(() => invokeNestParamDecorator(Controller, 'handle', 0, {})).toThrow('import "reflect-metadata"');
    } finally {
      restore();
    }
  });

  it('distinguishes absent metadata from a native decorator without a custom factory', () => {
    expect(() => invokeNestParamDecorator(controller(), 'handle', 0, {})).toThrow('no parameter metadata');
    expect(() => invokeNestParamDecorator(controller({ '3:0': { index: 0, data: 'body' } }), 'handle', 0, {})).toThrow('native decorators');
  });

  it.each([null, [], 'invalid'])('refuses malformed metadata %j', (metadata) => {
    expect(() => invokeNestParamDecorator(controller(metadata), 'handle', 0, {})).toThrow('invalid parameter metadata');
  });

  it('refuses mismatched keys and records and ambiguous custom factories', () => {
    expect(() => invokeNestParamDecorator(controller({ 'x__customRouteArgs__:0': custom(1, () => 1) }), 'handle', 0, {})).toThrow(
      'no custom parameter factory',
    );
    expect(() =>
      invokeNestParamDecorator(
        controller({ 'a__customRouteArgs__:0': custom(0, () => 1), 'b__customRouteArgs__:0': custom(0, () => 2) }),
        'handle',
        0,
        {},
      ),
    ).toThrow('ambiguous');
  });

  it('refuses a non-callable factory', () => {
    expect(() => invokeNestParamDecorator(controller({ 'x__customRouteArgs__:0': custom(0, null) }), 'handle', 0, {})).toThrow(
      'invalid custom parameter factory',
    );
  });

  it.each([{ pipes: [() => 'pipe'] }, { pipes: 'invalid' }, { schema: { '~standard': {} } }])(
    'refuses validation it cannot run: %j',
    (extra) => {
      const factory = vi.fn();
      const Controller = controller({ 'x__customRouteArgs__:0': custom(0, factory, extra) });

      expect(() => invokeNestParamDecorator(Controller, 'handle', 0, {})).toThrow('Nest validation pipeline');
      expect(factory).not.toHaveBeenCalled();
    },
  );
});
