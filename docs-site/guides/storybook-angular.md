---
title: Storybook stories with auto-spies (Angular)
description: Run Angular stories as Vitest tests with the Storybook Vitest addon, hand the component auto-spied services through applicationConfig and provideAutoSpy, configure them in beforeEach and assert on them in play.
---

# Storybook stories with auto-spies (Angular)

With the [Storybook Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon),
a story's `play` function runs as a Vitest test in a real browser. A story builds the component
through real Angular DI, so you replace its services the same way as in a `TestBed` spec: with
`provideAutoSpy`. Pass the provider to `applicationConfig`, keep the spy in a constant of the
stories file, and configure and assert on it in the stories.

```ts
// cart.test.stories.ts
import { type Meta, type StoryObj, applicationConfig } from '@storybook/angular-vite';
import { expect } from 'vitest';
import { resetAutoSpy } from 'vitest-auto-spy';
import { provideAutoSpy } from 'vitest-auto-spy/angular';

import { CartComponent } from './cart.component';
import { CartService } from './cart.service';

const cartProvider = provideAutoSpy(CartService);
const cart = cartProvider.useValue; // Spy<CartService>

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

Checked with Storybook 10.6 (`@storybook/angular-vite`, `@storybook/addon-vitest`), Angular 22 and
Vitest 4.1 in browser mode with Playwright's Chromium.

::: warning Vitest 4 for now
`@storybook/addon-vitest` 10.6 supports `vitest ^3.0.0 || ^4.0.0` only. On Vitest 5 you cannot run
stories through it yet. This library itself works on both.
:::

## The component

The stories above test this component. It reads `total()` in a field initializer, while it is being
built, and calls `checkout()` on a click.

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

What each part of the stories file does:

- **`provideAutoSpy(CartService)`** returns a plain `{ provide, useValue }` provider. `useValue` is
  the typed spy, `Spy<CartService>`. The provider goes to Angular through `applicationConfig`; the
  spy is kept in the `cart` constant, where the stories use it.
- **One spy per file, reset before each story.** `provideAutoSpy` runs once, when the file loads, so
  every story shares the same spy. That is why the meta's `beforeEach` calls `resetAutoSpy(cart)`: it
  clears the previous story's calls and answers. After the reset, a method returns `undefined` until
  you give it an answer again.
- **Configure in `beforeEach`, not in `play`.** `play` runs after the component has rendered, and
  this component calls `total()` while it is being built. Storybook runs the meta's `beforeEach`
  (it sets up `total`), then the story's (it sets up `checkout`), and only then renders the component.
- **`cart.checkout.resolveWith(order)`** answers every call with `order`. With
  **`calledWith('tok_abc')`** in front, only a call with that token gets the answer; any other call
  returns `undefined`.
- **`findByRole` waits** until the element appears, so it also covers data the component loads
  asynchronously, for example in `ngOnInit`. Use `getBy…` only for what is there on the first render.
- **`expect` comes from `vitest`**, not from `storybook/test`. All the usual spy matchers work:
  `toHaveBeenCalledWith`, `toHaveBeenCalledTimes`, `toHaveBeenCalled`. See
  [the next section](#why-expect-comes-from-vitest).
- **`tags: ['!dev', '!autodocs']`** hides these stories from the Storybook sidebar and docs page but
  keeps them in the test run. They import `vitest`, which does not load in `storybook dev`, so
  without these tags they would break the Storybook UI. Keep
  them in their own file, such as `*.test.stories.ts`, so the stories people browse stay clean.

## Why `expect` comes from `vitest`

`storybook/test` has its own `expect`, and Storybook's examples use it. With this library's spies it
fails:

```text
TypeError: [Function] is not a spy or a call to a spy!
```

Storybook's `expect` wraps the spy in a new function before the matcher sees it. The `expect` from
`vitest` passes the spy through unchanged.

Two ways around it:

- **Import `expect` from `vitest`**, as in the example. You lose the Interactions panel entries, but
  these stories are hidden from the UI anyway.
- **Switch the file to runner mocks:** call `setSpyEngine('runner')` from `vitest-auto-spy/setup` at
  the top of the stories file, before `provideAutoSpy`. Every method is then a `vi.fn()`, and Storybook's `expect` accepts
  it. You trade some speed and memory for the panel.

## What this is not

- **Not a Storybook adapter.** There is no `vitest-auto-spy/storybook` to install, and Storybook's
  own `fn()` from `storybook/test` works as before. You use `vitest-auto-spy/angular` exactly as in a
  spec.
- **Not a module mock.** `sb.mock()` in `.storybook/preview.ts` replaces a module for the whole
  Storybook build. A provider replaces one service for one file's stories.

## Related

- [Angular](/adapters/angular) — `provideAutoSpy`, `injectSpy` and the `TestBed` side of the same
  providers.
- [Control helpers](/core/control-helpers) — `calledWith`, `resolveWith`, `resetAutoSpy`.
- [Spec patterns](/recipes) — conventions for large Angular test suites; most apply to stories too.
