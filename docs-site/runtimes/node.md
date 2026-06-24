# node:test

The `vitest-auto-spy/node` entry runs the same core on `node:test`'s `mock.fn()`.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
```

The public API is identical to the Vitest entry. With `node:test`, native mock methods are the
runner's own — for example `spy.method.mock.mockImplementation` — while the auto-spy helpers
(`calledWith`, `resolveWith`, `nextWith`, …) are normalised. Importing the entry registers the
`node:test` adapter.

<!-- TODO: expand — add a runnable node:test example and document the native-mock surface differences. -->
