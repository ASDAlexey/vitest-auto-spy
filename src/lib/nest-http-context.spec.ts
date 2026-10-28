import { describe, expect, it } from 'vitest';

import { createHttpExecutionContext } from './nest-http-context';

describe('createHttpExecutionContext', () => {
  it('preserves HTTP argument identities through one mutable argument array', () => {
    const request = { headers: { accept: 'application/json' } };
    const response = { statusCode: 200 };
    const next = () => undefined;
    const context = createHttpExecutionContext({ request, response, next });
    const http = context.switchToHttp();
    const args = context.getArgs();

    expect(context.getType()).toBe('http');
    expect(context.getArgs()).toBe(args);
    expect(args).toEqual([request, response, next]);
    expect(http.getRequest()).toBe(request);
    expect(http.getResponse()).toBe(response);
    expect(http.getNext()).toBe(next);
    expect(context.getArgByIndex(0)).toBe(request);
    expect(context.getArgByIndex(1)).toBe(response);
    expect(context.getArgByIndex(2)).toBe(next);
    expect(context.getArgByIndex(3)).toBeUndefined();

    const replacement = { headers: {} };
    args[0] = replacement;
    args[1] = undefined;
    args[2] = undefined;
    expect(http.getRequest()).toBe(replacement);
    expect(context.getArgByIndex(0)).toBe(replacement);
    expect(context.switchToHttp().getRequest()).toBe(replacement);
    expect(http.getResponse()).toBeUndefined();
    expect(http.getNext()).toBeUndefined();
  });

  it('leaves omitted HTTP arguments undefined and refuses unsupported transports', () => {
    const context = createHttpExecutionContext();

    expect(context.getArgs()).toEqual([undefined, undefined, undefined]);
    expect(context.switchToHttp().getRequest()).toBeUndefined();
    expect(context.switchToHttp().getResponse()).toBeUndefined();
    expect(context.switchToHttp().getNext()).toBeUndefined();
    expect(() => context.switchToRpc()).toThrow('supports HTTP only; switchToRpc() is unavailable');
    expect(() => context.switchToWs()).toThrow('supports HTTP only; switchToWs() is unavailable');
    expect(context.getType()).toBe('http');
  });

  it('returns actual metadata targets and requires them only when read', () => {
    class Controller {
      handle() {
        return 'ok';
      }
    }
    const context = createHttpExecutionContext({ class: Controller, handler: Controller.prototype.handle });

    expect(context.getClass()).toBe(Controller);
    expect(context.getHandler()).toBe(Controller.prototype.handle);
    expect(() => createHttpExecutionContext().getClass()).toThrow('pass { class: Controller } before calling getClass()');
    expect(() => createHttpExecutionContext().getHandler()).toThrow(
      'pass { handler: Controller.prototype.method } before calling getHandler()',
    );
  });
});
