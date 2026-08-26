/**
 * The optional rxjs layer on `bun:test`. The observable helpers are pure rxjs on top of the shared
 * `MockAdapter`, so what this proves is that nothing on the way reaches for a Vitest-only
 * primitive — and that `expectEmission` / `expectNoEmission` resolve against Bun's event loop.
 */
import { describe, expect, it } from 'bun:test';
import { type Observable, firstValueFrom, of } from 'rxjs';

import { type Spy, createSpyFromClass, expectEmission, expectNoEmission } from '../bun';
import '../rxjs';

class ProductsService {
  products$: Observable<string[]> = of([]);

  load(_id: number): Observable<string> {
    return of('real');
  }
}

describe('observable spies on bun:test', () => {
  it('emits from an observable-returning method', async () => {
    const service: Spy<ProductsService> = createSpyFromClass(ProductsService);

    service.load.nextOneTimeWith('emitted');

    expect(await firstValueFrom(service.load(1))).toBe('emitted');
  });

  it('emits from an observable property', async () => {
    const service = createSpyFromClass(ProductsService, { observablePropsToSpyOn: ['products$'] });

    service.products$.nextOneTimeWith(['a', 'b']);

    expect(await firstValueFrom(service.products$)).toEqual(['a', 'b']);
  });

  it('errors a stream with throwWith', async () => {
    const service = createSpyFromClass(ProductsService);

    service.load.throwWith('stream failed');

    await expect(firstValueFrom(service.load(1))).rejects.toThrow('stream failed');
  });

  it('asserts an emission, and the absence of one', async () => {
    const service = createSpyFromClass(ProductsService, { observablePropsToSpyOn: ['products$'] });
    const emitted = expectEmission(service.products$);

    service.products$.nextWith(['x']);

    expect(await emitted).toEqual(['x']);

    const silent = createSpyFromClass(ProductsService, { observablePropsToSpyOn: ['products$'] });

    await expectNoEmission(silent.products$);
  });
});
