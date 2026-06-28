# Vitest

The default, zero-config entry point. Importing `vitest-auto-spy` registers the Vitest mock
adapter (`vi.fn()` / `vi.spyOn()`) and exposes the full core API.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest (default, zero-config)
```

The core is runner-agnostic behind a `MockAdapter`; the Vitest entry registers the default adapter
on import, so existing usage stays unchanged. Native mock methods (e.g. `mockReturnValue`) remain
Vitest's own — only the auto-spy helpers are normalised across runtimes.

<!-- TODO: expand — add vitest.config / setup-file guidance and a note on the rxjs + Angular subpaths. -->
