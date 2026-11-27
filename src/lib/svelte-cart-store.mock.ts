export class CartStore {
  readonly #items: string[] = [];

  add(item: string): void {
    this.#items.push(item);
  }

  total(): number {
    return this.#items.length;
  }

  priceOf(item: string): number {
    return item.length;
  }

  async checkout(): Promise<string> {
    return 'ok';
  }
}

export const cartStore = new CartStore();
