# React

React has no DI container, so `vitest-auto-spy/react` ships **no** `provide*` helper — it is a
*recipe*: spy the **classes** you own (services, stores, API clients, the deps you inject into
hooks or hand to a Context provider), not the components themselves.

```ts
import { createSpyFromClass, type Spy } from 'vitest-auto-spy/react';
```

The spy is a plain object of mocks, so you pass it straight into a `<Context.Provider value={spy}>`
or a hook's dependency argument, then drive return values with `calledWith` / `resolveWith` /
`mockReturnValue` and assert against `spy.method.mock.calls`.

Importing this entry registers the default Vitest mock adapter and re-exports the same public API
as the core. It pulls in `vitest` only — never `react` or `@testing-library/react`, which stay your
own dev dependencies.

<!-- TODO: expand — add a Context.Provider example and a hook-dependency example with assertions. -->
