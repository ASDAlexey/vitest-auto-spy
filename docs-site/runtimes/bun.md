# Bun (`bun:test`)

The `vitest-auto-spy/bun` entry runs the exact same core on Bun's `bun:test` mocks instead of
Vitest.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun — bun:test
```

The public API (`createSpyFromClass`, `calledWith`, `resolveWith`, `nextWith`, …) is **identical**
to the Vitest entry. Only **native** mock methods stay the runner's own; the auto-spy helpers are
normalised. Import the entry matching your runner — it registers the Bun adapter on import.

`mock.settledResults` — which Bun does not track natively — is provided by a built-in polyfill,
so it reads identically to Vitest (`{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`).
See [Control helpers → Inspecting promise outcomes](/core/control-helpers#settled-results).

<!-- TODO: expand — add a runnable bun:test example and note any helpers that differ from Vitest. -->
