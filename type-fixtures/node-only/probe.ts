import { installConsoleSpies } from 'vitest-auto-spy/console';
import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/node';

class Service {
  load(id: string): Promise<string> {
    return Promise.resolve(id);
  }
}

export const spy: Spy<Service> = createSpyFromClass(Service);

spy.load.mockResolvedValue('7');
spy.load.calledWith('7').resolveWith('8');
enableJasmineCompat();

export const calls: readonly (readonly [string])[] = spy.load.mock.calls;

export const warnings: readonly unknown[][] = installConsoleSpies().consoleWarnSpy.mock.calls;
