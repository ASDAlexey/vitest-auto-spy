import { expectTypeOf, it } from 'vitest';

import { invokeNestParamDecorator } from '../lib/nest-param-decorator';

const symbol = Symbol('handler');
class Controller {
  field = 'value';
  handle(): string {
    return 'value';
  }

  [symbol](): void {}
}

it('accepts callable handler keys and returns an unchecked factory result', () => {
  expectTypeOf(invokeNestParamDecorator(Controller, 'handle', 0, {})).toEqualTypeOf<unknown>();
  invokeNestParamDecorator(Controller, symbol, 0, {});
  // @ts-expect-error A data property is not a controller method.
  invokeNestParamDecorator(Controller, 'field', 0, {});
  // @ts-expect-error A misspelled handler is not accepted.
  invokeNestParamDecorator(Controller, 'missing', 0, {});
  // @ts-expect-error An execution context must be an object.
  invokeNestParamDecorator(Controller, 'handle', 0, null);
});
