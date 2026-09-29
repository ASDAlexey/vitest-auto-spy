import { createActivatedRoute, createRouterDouble } from 'vitest-auto-spy/angular-router';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/bun-angular';

class Service {
  load(id: string): Promise<string> {
    return Promise.resolve(id);
  }
}

const double = createRouterDouble({ url: '/start' });

double.navigate.mockResolvedValue(false);
double.navigateByUrl.calledWith('/next').resolveWith(true);
double.setUrl('/next');

export const route = createActivatedRoute({ params: { id: '7' } });
export const spy: Spy<Service> = createSpyFromClass(Service);
export const calls: readonly unknown[][] = double.navigate.mock.calls;
