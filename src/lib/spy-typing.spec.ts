import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { registerMockAdapter } from './mock-adapter';
import { asInstance, asInstances, asSpy, createSpyClass } from './spy-typing';
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

describe('asInstances', () => {
  it('views a whole argument list at once, leaving non-spies alone', () => {
    const first = createSpyFromClass(BackgroundWorker);
    const second = createSpyFromClass(BackgroundWorker);
    const [a, b, plain] = asInstances(first, second, 'not a spy');

    const worker: BackgroundWorker = a;

    expect(worker).toBe(first);
    expect(b).toBe(second);
    expect(plain).toBe('not a spy');
  });
});

class BaseSdk {
  static create(): string {
    return 'real';
  }
}

class Sdk extends BaseSdk {
  static readonly VERSION = '2.1.0';

  static isSupported(): boolean {
    return true;
  }

  static get probe(): string {
    throw new Error('a static getter must not be read while the double is built');
  }

  send(payload: string): string {
    return payload;
  }
}

describe('createSpyClass', () => {
  it('is construction-compatible and records every construction', () => {
    const WorkerSpy = createSpyClass(BackgroundWorker);

    const first = new WorkerSpy('task.js');
    const second = new WorkerSpy();

    expect(WorkerSpy.calls).toEqual([['task.js'], []]);
    expect(WorkerSpy.instances).toEqual([first, second]);
    expect(first).not.toBe(second);
  });

  it('leaves the statics off the double by default', () => {
    const SdkSpy = createSpyClass(Sdk);

    expect('isSupported' in SdkSpy).toBe(false);
  });

  it("carries the statics, its own and its base class', when asked", () => {
    const SdkSpy = createSpyClass(Sdk, undefined, { statics: true }) as unknown as typeof Sdk;

    (SdkSpy.isSupported as unknown as { mockReturnValue(value: boolean): void }).mockReturnValue(false);

    expect(SdkSpy.isSupported()).toBe(false);
    expect(SdkSpy.VERSION).toBe('2.1.0');
    expect(vi.isMockFunction(SdkSpy.create)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(SdkSpy, 'probe')).toBeUndefined();
    expect(new SdkSpy().send).toBeDefined();
  });

  it('keeps its own members when a static is named like one of them', () => {
    class Collides {
      static instances = ['real'];
    }

    const CollidesSpy = createSpyClass(Collides, undefined, { statics: true });

    expect(CollidesSpy.instances).toEqual([]);
  });

  it('hands out full auto-spies, honouring the spy configuration', () => {
    const WorkerSpy = createSpyClass(BackgroundWorker, { methodsToSpyOn: ['postMessage'] });
    const worker = new WorkerSpy();

    worker.postMessage.mockReturnValue('stubbed');

    expect(worker.postMessage('ping')).toBe('stubbed');
    expect(worker.postMessage).toHaveBeenCalledWith('ping');
  });
});
