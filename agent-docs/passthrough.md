## 22. Call the original on a `calledWith` miss

Use `{ passthrough: 'unmatched' }` on `createSpyFromInstance(instance, options)`, `adoptMock(mock, options)`, or `moduleNamespace(exports, options)` to stub selected arguments and delegate the rest.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';

const prices = createSpyFromInstance({ price: (sku: string) => sku.length }, { passthrough: 'unmatched' });
prices.price.calledWith('sale').mockReturnValue(0);
prices.price('sale'); // 0
prices.price('apple'); // 5, from the original
```

- A matching `calledWith` or `mustBeCalledWith` answer wins, including `undefined`. A strict argument miss throws.
- On a lenient miss or exhausted `.once()` / `.times(n)` rule, the configured default wins. Without one, the original runs once.
- Instance methods keep the original instance as `this`; adopted mocks and module exports keep the call receiver. A mock with no previous implementation returns `undefined` on a lenient miss.
- Set the option on first adoption or when building the namespace. Use `adoptMock(namespace.price)` to configure an already wrapped export.
- `passthrough: true` (instance or namespace) and adoption without options retain the existing behavior: configuring a `calledWith` rule switches off the original for that method.
- On `createSpyFromInstance`, do not combine passthrough with `strict: true` or `onUnstubbedCall`. Each would decide how to handle an unconfigured call.
