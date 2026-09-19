---
title: Стори Storybook с авто-спаями (Angular)
description: Запуск Angular-стори как тестов Vitest через аддон Storybook Vitest, передача компоненту авто-спаев сервисов через applicationConfig и provideAutoSpy, настройка в beforeEach и проверки в play.
---

# Стори Storybook с авто-спаями (Angular)

Стори рендерит компонент так же, как спека на `TestBed`, — через настоящий Angular DI, — а с
[аддоном Storybook Vitest](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) её
функция `play` выполняется как тест Vitest в настоящем браузере. Это делает стори естественным местом
для интерактивного теста, и оставляет тот же вопрос, что и у спеки: что компоненту инжектится?
`provideAutoSpy` отвечает на него одинаково в обоих местах.

Всё на этой странице выполнено на Storybook 10.6 (`@storybook/angular-vite`,
`@storybook/addon-vitest`), Angular 22 и Vitest 4.1 в browser mode с Chromium от Playwright.

::: warning Пока что Vitest 4
`@storybook/addon-vitest` 10.6 объявляет peer-диапазон `vitest ^3.0.0 || ^4.0.0`. Проект, уже
переехавший на Vitest 5, пока не может гонять через него стори; сама библиотека работает на обоих.
:::

## Компонент {#the-component}

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  total(): number {
    /* читает настоящую корзину */
  }

  checkout(token: string): Promise<Order> {
    /* списывает с настоящей карты */
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

Что делает каждая часть:

- **`provideAutoSpy(CartService)`** возвращает обычный провайдер `{ provide, useValue }`, и `useValue`
  — это спай, типизированный `Spy<CartService>`. Провайдер уходит в Angular через
  `applicationConfig`; спай остаётся в файле, чтобы стори его настраивали и проверяли. `TestBed` здесь
  нет, так что `injectSpy` читать нечего: его заменяет сохранённая ссылка.
- **Один спай на файл, сброс на каждую стори.** Декоратор собирается один раз при загрузке файла,
  поэтому спай переживает каждую стори. `resetAutoSpy(cart)` в `beforeEach` меты сбрасывает вызовы и
  конфигурацию предыдущей стори до того, как отрендерится следующая.
- **Настройка в `beforeEach`, а не в `play`.** `play` выполняется после рендера компонента, а этот
  компонент читает `total()` в инициализаторе поля — во время конструирования. Storybook выполняет
  `beforeEach` меты, затем стори, и только потом рендерит, так что и значение по умолчанию, и ответ
  конкретной стори уже на месте, когда о них спрашивает конструктор. `calledWith('tok_abc')` делает
  оплату успешной только для того токена, который компонент обязан отправить.
- **`expect` из `vitest`.** См. [ниже](#why-expect-comes-from-vitest).
- **`tags: ['!dev', '!autodocs']`** убирает эти стори из сайдбара Storybook и со страницы документации,
  оставляя их в тестовом прогоне: они существуют, чтобы выполняться, и импортируют `vitest`, который
  разрешается только внутри прогона Vitest. Держите их в отдельном файле — здесь `*.test.stories.ts`,
  — чтобы стори, которые люди листают, оставались от него свободны.

## Почему `expect` берётся из `vitest` {#why-expect-comes-from-vitest}

У `storybook/test` есть свой `expect`, и именно его используют примеры Storybook: он
инструментирован, поэтому каждая проверка появляется в панели Interactions. С этими спаями он падает:

```text
TypeError: [Function] is not a spy or a call to a spy!
```

Инструментатор оборачивает каждый аргумент-функцию инструментированного вызова в свежую стрелку,
если у функции нет собственных перечислимых ключей, — эвристика, которая узнаёт `vi.fn()`, чьи
методы `mock*` — собственные свойства. Спаи этой библиотеки держат эти методы на общем прототипе —
отсюда и их экономия памяти, — так что проверка их не видит, и матчер получает обёртку. `expect` из
`vitest` не инструментирован и получает сам спай. Обойти можно двумя способами:

- **Импортируйте `expect` из `vitest` в этих стори**, как выше. Стори скрыты из интерфейса, так что
  панель Interactions, которую кормит инструментированный `expect`, всё равно не то место, где их
  читают.
- **Переключите файл на моки раннера** через `setSpyEngine('runner')` из `vitest-auto-spy/setup`,
  вызванный до сборки спаев: каждый метод тогда — `vi.fn()`, и инструментированный `expect` его
  принимает. Это обмен скорости и памяти движка на панель, пофайлово.

## Чем это не является {#what-this-is-not}

- **Не адаптер `/storybook`.** Собственный `fn()` Storybook из `storybook/test` не тронут; ничто здесь
  не подключает его к движку этой библиотеки. Рецепт использует Angular-точку входа ровно так же, как
  спека.
- **Не мок модуля.** `sb.mock()` в `.storybook/preview.ts` подменяет модуль для всей сборки Storybook
  ещё до того, как выполнится хоть одна стори. Провайдер подменяет один инжектируемый класс для стори
  одного файла — ту гранулярность, которую уже даёт компонент, собранный через DI.

## Смотрите также {#related}

- [Angular](/ru/adapters/angular) — `provideAutoSpy`, `injectSpy` и сторона `TestBed` у тех же
  провайдеров.
- [Управляющие хелперы](/ru/core/control-helpers) — `calledWith`, `resolveWith`, `resetAutoSpy`.
- [Паттерны спек](/ru/recipes) — соглашения, к которым пришла большая Angular-сюита; большинство
  из них верны и для стори.
