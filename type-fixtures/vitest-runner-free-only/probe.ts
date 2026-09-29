import { type Observable, of } from 'rxjs';
import { expect, vi } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

class Service {
  load(id: string): Observable<string> {
    return of(id);
  }
}

const provider = provideAutoSpy(Service);
const spy = injectSpy({ get: (): unknown => provider.useValue }, Service);

spy.load.mockReturnValue(of('7'));
vi.mocked(spy.load).mockReturnValueOnce(of('8'));
expect(spy.load).toHaveBeenCalledWith('7');

export const values: string[] = subscribeSpyTo(spy.load('7')).getValues();
