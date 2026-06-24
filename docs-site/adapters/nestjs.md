# NestJS

The `vitest-auto-spy/nestjs` entry ships a `{ provide, useValue }` provider tailored for
`Test.createTestingModule({ providers: [...] })`, plus a typed `injectSpy` that pulls a spy out of
the resulting `TestingModule`.

```ts
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/nestjs';

const moduleRef = await Test.createTestingModule({
  providers: [
    provideAutoSpy(MyService),
    provideAutoSpy(ApiService, { methodsToSpyOn: ['get', 'post'] }),
  ],
}).compile();

const myService = injectSpy(moduleRef, MyService);
```

Dependency-free by design: `@nestjs/common` / `@nestjs/testing` are optional peers, so the entry
describes the module reference with a minimal structural type instead of importing them.

<!-- TODO: expand — note that injectSpy takes (moduleRef, token), cover abstract-class tokens, and add a full createTestingModule example. -->
