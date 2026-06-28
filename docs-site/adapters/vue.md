# Vue / Pinia

The `vitest-auto-spy/vue` entry re-exports the full core (zero-config on Vitest) and adds a small
`provideAutoSpy(token, Class)` that builds a `global.provide` entry for `@vue/test-utils`. Nothing
here imports `vue`, `pinia` or `@vue/test-utils` — they stay optional peers.

Class-based services injected via `provide`/`inject` and class-based Pinia stores are the natural
fit:

```ts
import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/vue';

// Spy a Pinia store's actions
const store = createSpyFromClass(CartStore);
store.checkout.resolveWith({ ok: true });

// Provide a spied service to a mounted component
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Fake Name');
```

<!-- TODO: expand — full mount({ global: { provide } }) example and a Pinia store walkthrough. -->
