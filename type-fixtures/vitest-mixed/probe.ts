import { type Observable, type Subject, of } from 'rxjs';
import { type MockInstance, expect, vi } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';
import { createRouterDouble } from 'vitest-auto-spy/angular-router';
import { installConsoleSpies } from 'vitest-auto-spy/console';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

class Service {
  load(id: string): Promise<string> {
    return Promise.resolve(id);
  }

  stream(id: string): Observable<string> {
    return of(id);
  }
}

const double = createRouterDouble();
const spies = installConsoleSpies();

export const spy: Spy<Service> = createSpyFromClass(Service);

double.navigateByUrl.calledWith('/next').resolveWith(true);
vi.mocked(double.navigate).mockResolvedValueOnce(false);
spies.consoleWarnSpy.mockImplementation(() => undefined);
expect(double.navigate).toHaveBeenCalledWith(['/next']);
expect(spies.consoleWarnSpy).not.toHaveBeenCalled();

const provider = provideAutoSpy(Service);

export const provided: Spy<Service> = provider.useValue;
export const injected: Spy<Service> = injectSpy({ get: (): unknown => spy }, Service);
export const same: typeof provided = spy;
export const load: MockInstance<(id: string) => Promise<string>> = injected.load;
export const subject: Subject<string> = spy.stream.returnSubject();
export const values: string[] = subscribeSpyTo(createObservableWithValues([{ value: 'a' }])).getValues();

injected.load.mockThrow(new Error('offline'));
spy.stream.calledWith('7').nextWith('8');
expect(injected.load).toHaveBeenCalledWith('7');
