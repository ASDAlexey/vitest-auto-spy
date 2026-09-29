import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

class Service {
  load(id: string): Promise<string> {
    return Promise.resolve(id);
  }
}

export const spy: Spy<Service> = createSpyFromClass(Service);

spy.load.mockResolvedValue('7');
spy.load.calledWith('7').resolveWith('8');
