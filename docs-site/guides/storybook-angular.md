---
title: Storybook stories with auto-spies (Angular)
description: Run Angular stories as Vitest tests with the Storybook Vitest addon, hand the component auto-spied services through applicationConfig and provideAutoSpy, configure them in beforeEach and assert on them in play.
---

# Storybook stories with auto-spies (Angular)

A story renders a component the way a `TestBed` spec does — through real Angular DI — and with the
[Storybook Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) its
`play` function runs as a Vitest test in a real browser. That makes a story a natural place for an
interaction test, and it leaves the same question a spec has: what does the component get injected?
`provideAutoSpy` answers it the same way in both.

Everything on this page was run with Storybook 10.6 (`@storybook/angular-vite`,
`@storybook/addon-vitest`), Angular 22, Vitest 4.1 in browser mode with Playwright's Chromium.

::: warning Vitest 4, for now
`@storybook/addon-vitest` 10.6 declares `vitest ^3.0.0 || ^4.0.0` as its peer range. A project that
has moved to Vitest 5 cannot run stories through it yet; this library itself works on both.
:::

## The component

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  total(): number {
    /* reads the real cart */
  }

  checkout(token: string): Promise<Order> {
    /* charges the real card */
  }
}

@Component({
  selector: 'app-cart',
  template: `
    <p>Total: {{ total }}</p>
    <button type="button" (click)="checkout()">Check out</button>
    @if (orderId()) {
      <p role="status">Order {{ orderId() }}</p>
    }
  `,
})
export class CartComponent {
  readonly #cart = inject(CartService);

  readonly total = this.#cart.total();
  readonly orderId = signal<string | null>(null);

  async checkout(): Promise<void> {
    const order = await this.#cart.checkout('tok_abc');
    this.orderId.set(order.orderId);
  }
}
```

## The stories

```ts
// cart.test.stories.ts
import { type Meta, type StoryObj, applicationConfig } from '@storybook/angular-vite';
import { expect } from 'vitest';
import { resetAutoSpy } from 'vitest-auto-spy';
import { provideAutoSpy } from 'vitest-auto-spy/angular';

import { CartComponent } from './cart.component';
import { CartService } from './cart.service';

const cartProvider = provideAutoSpy(CartService);
const cart = cartProvider.useValue;

const meta = {
  title: 'Cart/Interactions',
  component: CartComponent,
  tags: ['!dev', '!autodocs'],
  decorators: [applicationConfig({ providers: [cartProvider] })],
  beforeEach: () => {
    resetAutoSpy(cart);
    cart.total.mockReturnValue(42);
  },
} satisfies Meta<CartComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ShowsTheTotal: Story = {
  play: async ({ canvas }) => {
    expect(canvas.getByText('Total: 42')).toBeTruthy();
  },
};

export const ChecksOut: Story = {
  beforeEach: () => {
    cart.checkout.calledWith('tok_abc').resolveWith({ orderId: 'ord_42' });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Check out' }));

    expect((await canvas.findByRole('status')).textContent).toContain('Order ord_42');
    expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
  },
};
```

What each piece is doing:

- **`provideAutoSpy(CartService)`** returns an ordinary `{ provide, useValue }` provider, and
  `useValue` is the spy — a `Spy<CartService>`, typed. The provider goes to Angular through
  `applicationConfig`; the spy stays in the file for the stories to configure and assert on. There
  is no `TestBed` here, so `injectSpy` has nothing to read: keeping the handle is what replaces it.
- **One spy for the file, reset per story.** The decorator is built once when the file loads, so the
  spy outlives each story. `resetAutoSpy(cart)` in the meta's `beforeEach` drops the previous story's
  calls and configuration before the next one renders.
- **Configure in `beforeEach`, not in `play`.** `play` runs after the component has rendered, and this
  component reads `total()` in a field initializer — during construction. Storybook runs the meta's
  `beforeEach` and then the story's before rendering, so the default and the per-story answer are both
  in place when the constructor asks. `calledWith('tok_abc')` makes the checkout succeed only for the
  token the component is supposed to send.
- **`expect` from `vitest`.** See [below](#why-expect-comes-from-vitest).
- **`tags: ['!dev', '!autodocs']`** keeps these stories out of the Storybook sidebar and the docs page
  while leaving them in the test run: they exist to be executed, and they import `vitest`, which only
  resolves inside a Vitest run. Keep them in a file of their own — `*.test.stories.ts` here — so the
  stories people browse stay free of it.

## Why `expect` comes from `vitest`

`storybook/test` has an `expect` of its own, and it is the one Storybook's examples use: it is
instrumented, so each assertion shows up in the Interactions panel. With these spies it fails:

```text
TypeError: [Function] is not a spy or a call to a spy!
```

The instrumenter wraps every function argument of an instrumented call in a fresh arrow unless the
function has own enumerable keys — a heuristic that recognises `vi.fn()`, whose `mock*` methods are
own properties. This library's spies keep those methods on a shared prototype, which is where their
memory saving comes from, so the check does not see them and the matcher receives the wrapper. The
`expect` from `vitest` is not instrumented and receives the spy itself. Two ways around it:

- **Import `expect` from `vitest` in these stories**, as above. The stories are hidden from the UI,
  so the Interactions panel that the instrumented `expect` feeds is not where anyone reads them.
- **Switch the file to runner mocks** with `setSpyEngine('runner')` from `vitest-auto-spy/setup`,
  called before the spies are built: every method is then a `vi.fn()`, and the instrumented `expect`
  accepts it. It trades the engine's speed and memory for the panel, per file.

## What this is not

- **Not a `/storybook` adapter.** Storybook's own `fn()` from `storybook/test` is untouched; nothing
  here wires it into this library's engine. The recipe uses the Angular entry exactly as a spec does.
- **Not a module mock.** `sb.mock()` in `.storybook/preview.ts` replaces a module for the whole
  Storybook build, before any story runs. A provider replaces one injectable for one file's stories,
  which is the granularity a DI-built component already offers.

## Related

- [Angular](/adapters/angular) — `provideAutoSpy`, `injectSpy` and the `TestBed` side of the same
  providers.
- [Control helpers](/core/control-helpers) — `calledWith`, `resolveWith`, `resetAutoSpy`.
- [Spec patterns](/recipes) — the conventions a large Angular suite converged on, most of which hold
  for stories too.
