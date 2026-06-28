# Auto-mock by type

`vitest-auto-spy` picks each method's helper surface from its **return type**: sync methods get
`mockReturnValue` / `calledWith` / `mustBeCalledWith`, `Promise`-returning methods get
`resolveWith` / `rejectWith` / `resolveWithPerCall`, and `Observable`-returning methods/properties
get `nextWith` and friends.

::: warning Work in progress
A **type-based auto-mock** (inferring and generating mock instances directly from a type, not just
a runtime class) is being added in parallel. This page is a stub for that feature.
:::

<!-- TODO: expand — document the type-based auto-mock API once it lands. Confirm the exact export name and signature against src/ before writing examples; do not invent the API. -->
