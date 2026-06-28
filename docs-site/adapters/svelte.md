# Svelte

Svelte has no class-based dependency injection, so `vitest-auto-spy/svelte` adds **no** helper of
its own — it is a recipe, not a framework integration. Svelte apps typically keep their logic in
plain class-based services or stores; `createSpyFromClass` spies that class, and you inject the spy
into the component under test (props, context, or a mocked module) exactly the way the component
receives the real one.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/svelte';
import { render } from '@testing-library/svelte';
import Cart from './Cart.svelte';
import { CartStore } from './cart-store';

const cartStore = createSpyFromClass(CartStore);
cartStore.total.mockReturnValue(42);

render(Cart, { props: { store: cartStore } });
```

Importing this entry registers the default Vitest mock adapter and re-exports the whole core, so a
Svelte suite needs a single import. It pulls in neither `svelte` nor `@testing-library/svelte`.

<!-- TODO: expand — add a context-based injection example and a mocked-module example. -->
