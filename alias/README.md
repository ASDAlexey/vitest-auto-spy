# vitest-auto-spies

> **This is an alias.** The real package is **[`vitest-auto-spy`](https://www.npmjs.com/package/vitest-auto-spy)** (singular).
> This package simply re-exports it, so `vitest-auto-spies` and `vitest-auto-spy` are the same code.

**Auto-generate fully-typed test spies from a class — across Vitest, Bun and `node:test`, with
RxJS / Angular / NestJS / React / Vue / Svelte recipes.** A drop-in replacement for
[`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies).

## Install

Prefer the canonical name:

```bash
npm install -D vitest-auto-spy
```

…or install this alias — identical API:

```bash
npm install -D vitest-auto-spies
```

## Usage

```ts
import { createSpyFromClass, type Spy } from 'vitest-auto-spies';

const userService: Spy<UserService> = createSpyFromClass(UserService);
userService.getName.mockReturnValue('Ada');
```

Every entry point of `vitest-auto-spy` is re-exported here:
`vitest-auto-spies`, `/bun`, `/node`, `/rxjs`, `/console`, `/angular`, `/nestjs`, `/react`,
`/vue`, `/svelte`.

👉 **Full documentation:** https://github.com/ASDAlexey/vitest-auto-spy#readme
