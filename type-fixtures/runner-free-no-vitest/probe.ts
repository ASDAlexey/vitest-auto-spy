import { type Observable, Subject, of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/node';
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

class Service {
  load(id: string): Observable<string> {
    return of(id);
  }

  save(id: string): Promise<string> {
    return Promise.resolve(id);
  }
}

const provider = provideAutoSpy(Service);
const moduleRef = { get: (): unknown => provider.useValue };

export const injected: Spy<Service> = injectSpy(moduleRef, Service);
export const created: typeof injected = createSpyFromClass(Service);
export const subject: Subject<string> = created.load.returnSubject();

created.save.mockResolvedValue('7');
created.load.calledWith('7').nextWith('8');

const observer = subscribeSpyTo(createObservableWithValues([{ value: 'a' }]));

export const values: string[] = observer.getValues();
export const calls: readonly (readonly [string])[] = injected.save.mock.calls;
