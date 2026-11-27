---
title: Call the original when arguments do not match
description: Stub selected arguments with calledWith and keep the real implementation for all other calls.
---

# Call the original when arguments do not match

Use `passthrough: 'unmatched'` to stub one argument value without replacing the whole method.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';

const prices = createSpyFromInstance({ price: (sku: string) => sku.length }, { passthrough: 'unmatched' });
prices.price.calledWith('sale').mockReturnValue(0);

prices.price('sale'); // 0 on every matching call
prices.price('apple'); // 5 from the original
```

With `passthrough: true`, configuring `calledWith` still turns off the original for that method. Use `'unmatched'` if you want both answers.

For a runner mock, pass the option when you first adopt it. For a module, pass it when you build the namespace:

```ts
import { vi } from 'vitest';
import { adoptMock, moduleNamespace } from 'vitest-auto-spy';

const mock = adoptMock(
  vi.fn((sku: string) => sku.length),
  { passthrough: 'unmatched' },
);
mock.calledWith('sale').mockReturnValue(0);

const namespace = moduleNamespace({ price: (sku: string) => sku.length }, { passthrough: 'unmatched' });
adoptMock(namespace.price).calledWith('sale').mockReturnValue(0);
```

A matched answer wins, even `undefined`. A `mustBeCalledWith` miss throws instead of running the original. On a `calledWith` miss, an explicit default such as `returns: { price: 10 }` wins. Otherwise the original runs once. A limited rule such as `calledWith('sale').once()` stops matching after its last use.

Instance methods run on the original instance. Module functions and adopted mocks receive the caller’s `this`. If the adopted mock had no implementation, a miss returns `undefined`.
