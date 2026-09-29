---
title: Стори Storybook с авто-спаями (Angular)
description: Запуск Angular-стори как тестов Vitest через аддон Storybook Vitest, передача компоненту авто-спаев сервисов через applicationConfig и provideAutoSpy, настройка в beforeEach и проверки в play.
---

# Стори Storybook с авто-спаями (Angular)

С [аддоном Storybook Vitest](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)
функция `play` у стори выполняется как тест Vitest в настоящем браузере. Стори создаёт компонент
через настоящий Angular DI, поэтому сервисы подменяются так же, как в спеке на `TestBed`: через
`provideAutoSpy`. Провайдер передайте в `applicationConfig`, спай сохраните в константу файла со
стори, а настраивайте и проверяйте его в самих стори.

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

Проверено на Storybook 10.6 (`@storybook/angular-vite`, `@storybook/addon-vitest`), Angular 22 и
Vitest 4.1 в browser mode с Chromium от Playwright.

::: warning Пока что Vitest 4
`@storybook/addon-vitest` 10.6 поддерживает только `vitest ^3.0.0 || ^4.0.0`. На Vitest 5 запускать
через него стори пока нельзя. Сама библиотека работает на обеих версиях.
:::

## Компонент {#the-component}

Стори выше тестируют этот компонент. Он читает `total()` в инициализаторе поля, то есть пока
создаётся, и вызывает `checkout()` по клику.

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

## Стори {#the-stories}

Что делает каждая часть файла со стори:

- **`provideAutoSpy(CartService)`** возвращает обычный провайдер `{ provide, useValue }`. `useValue` —
  типизированный спай `Spy<CartService>`. Провайдер уходит в Angular через `applicationConfig`, а спай
  хранится в константе `cart`, через неё его используют стори.
- **Один спай на файл, сброс перед каждой стори.** `provideAutoSpy` выполняется один раз, при
  загрузке файла, и все стори работают с одним спаем. Поэтому `beforeEach` у `meta` вызывает
  `resetAutoSpy(cart)`: он стирает вызовы и ответы предыдущей стори. После сброса метод возвращает
  `undefined`, пока вы снова не зададите ему ответ.
- **Настраивайте в `beforeEach`, а не в `play`.** `play` запускается после рендера, а этот компонент
  вызывает `total()` ещё при создании. Storybook выполняет `beforeEach` у `meta` (он настраивает `total`), затем у
  стори (он настраивает `checkout`) и только потом рендерит компонент.
- **`cart.checkout.resolveWith(order)`** отвечает `order` на любой вызов. С **`calledWith('tok_abc')`**
  перед ним ответ получает только вызов с этим токеном; любой другой вернёт `undefined`.
- **`findByRole` ждёт**, пока элемент появится, поэтому подходит и для данных, которые компонент
  загружает асинхронно, например в `ngOnInit`. `getBy…` — только для того, что есть при первом рендере.
- **`expect` берётся из `vitest`**, а не из `storybook/test`. Работают все привычные матчеры спаев:
  `toHaveBeenCalledWith`, `toHaveBeenCalledTimes`, `toHaveBeenCalled`. Почему — в
  [следующем разделе](#why-expect-comes-from-vitest).
- **`tags: ['!dev', '!autodocs']`** прячет эти стори из боковой панели и страницы документации
  Storybook, но оставляет их в прогоне тестов. Они импортируют `vitest`, который не загружается в `storybook dev`,
  поэтому без этих тегов стори сломали бы интерфейс Storybook. Держите их в отдельном файле, например `*.test.stories.ts`, чтобы стори для
  просмотра оставались чистыми.

## Почему `expect` берётся из `vitest` {#why-expect-comes-from-vitest}

У `storybook/test` есть свой `expect`, и примеры Storybook используют его. Со спаями этой библиотеки
он падает:

```text
TypeError: [Function] is not a spy or a call to a spy!
```

`expect` из Storybook оборачивает спай в новую функцию, и матчер получает обёртку. `expect` из
`vitest` передаёт спай как есть.

Два способа обойти:

- **Импортировать `expect` из `vitest`**, как в примере. Вы теряете записи в панели Interactions, но
  эти стори и так скрыты из интерфейса.
- **Перевести файл на моки раннера:** вызвать `setSpyEngine('runner')` из `vitest-auto-spy/setup` в
  начале файла со стори, до `provideAutoSpy`. Тогда каждый метод — `vi.fn()`, и `expect` из Storybook его принимает. Вы платите за
  панель частью скорости и памяти.

## Чем это не является {#what-this-is-not}

- **Не адаптер Storybook.** Отдельного `vitest-auto-spy/storybook` нет, а собственный `fn()` из
  `storybook/test` работает как прежде. `vitest-auto-spy/angular` используется ровно так же, как в
  спеке.
- **Не мок модуля.** `sb.mock()` в `.storybook/preview.ts` подменяет модуль на всю сборку Storybook.
  Провайдер подменяет один сервис для стори одного файла.

## Смотрите также {#related}

- [Angular](/ru/adapters/angular) — `provideAutoSpy`, `injectSpy` и те же провайдеры со стороны
  `TestBed`.
- [Хелперы управления](/ru/core/control-helpers) — `calledWith`, `resolveWith`, `resetAutoSpy`.
- [Паттерны спек](/ru/recipes) — соглашения больших наборов тестов на Angular; большинство подходит и
  для стори.
