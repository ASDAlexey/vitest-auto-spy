import { beforeAll, describe, expect, it } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { registerMockAdapter } from './mock-adapter';
import { asInstance, asSpy, createSpyClass } from './spy-typing';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class BackgroundWorker {
  #script: string;

  constructor(script = 'noop.js') {
    this.#script = script;
  }

  postMessage(payload: string): string {
    return `${this.#script}:${payload}`;
  }
}

describe('asInstance / asSpy', () => {
  it('are two views of the same object', () => {
    const spy = createSpyFromClass(BackgroundWorker);
    const instance: BackgroundWorker = asInstance(spy);

    expect(instance).toBe(spy);
    expect(asSpy(instance)).toBe(spy);
  });
});

describe('createSpyClass', () => {
  it('is construction-compatible and records every construction', () => {
    const WorkerSpy = createSpyClass(BackgroundWorker);

    const first = new WorkerSpy('task.js');
    const second = new WorkerSpy();

    expect(WorkerSpy.calls).toEqual([['task.js'], []]);
    expect(WorkerSpy.instances).toEqual([first, second]);
    expect(first).not.toBe(second);
  });

  it('hands out full auto-spies, honouring the spy configuration', () => {
    const WorkerSpy = createSpyClass(BackgroundWorker, { methodsToSpyOn: ['postMessage'] });
    const worker = new WorkerSpy();

    worker.postMessage.mockReturnValue('stubbed');

    expect(worker.postMessage('ping')).toBe('stubbed');
    expect(worker.postMessage).toHaveBeenCalledWith('ping');
  });
});
