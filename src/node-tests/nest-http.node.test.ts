/** The HTTP helpers work without Nest, Vitest or an installed mock adapter. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';
import 'reflect-metadata';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'vitest' || specifier.startsWith('vitest/') || specifier.startsWith('@nestjs/')) {
      throw new Error(`Unexpected optional dependency '${specifier}' from ${String(context.parentURL)}`);
    }

    return nextResolve(specifier, context);
  },
});

const { createHttpExecutionContext, invokeNestParamDecorator } = await import('../nestjs');

class Controller {
  read(): void {}
}

describe('Nest HTTP helpers on node:test without optional dependencies', () => {
  it('passes the same HTTP request through the custom parameter factory', () => {
    const request = { user: { id: 7 } };
    const response = { statusCode: 200 };
    const context = createHttpExecutionContext({ request, response, handler: Controller.prototype.read, class: Controller });

    Reflect.defineMetadata(
      '__routeArguments__',
      {
        'fixture__customRouteArgs__:0': {
          index: 0,
          data: 'user',
          pipes: [],
          factory: (data: string, host: typeof context): unknown => Reflect.get(host.switchToHttp().getRequest(), data),
        },
      },
      Controller,
      'read',
    );

    assert.equal(invokeNestParamDecorator(Controller, 'read', 0, context), request.user);
    assert.equal(context.switchToHttp().getRequest(), request);
    assert.equal(context.switchToHttp().getResponse(), response);
    assert.equal(context.getHandler(), Controller.prototype.read);
    assert.equal(context.getClass(), Controller);
    assert.equal(context.getType(), 'http');
  });
});
