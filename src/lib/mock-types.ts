/* eslint-disable @typescript-eslint/no-explicit-any -- the shapes mirror `@vitest/spy`, whose `Procedure` and `Constructable` are `any`-typed so that any function or class fits. */
// One `Spy<T>` for every entry: its mock type comes from a registry the Vitest entries fill in
// (`./vitest-mock-types`), so entries that never load Vitest never name it (TS2307 without it).

type Procedure = (...args: any[]) => any;

interface Constructable {
  new (...args: any[]): any;
}

type MockParameters<T extends Constructable | Procedure> = T extends Constructable
  ? ConstructorParameters<T>
  : T extends Procedure
    ? Parameters<T>
    : never;

type MockReturnType<T extends Constructable | Procedure> = T extends Constructable
  ? InstanceType<T>
  : T extends Procedure
    ? ReturnType<T>
    : never;

type MockProcedureContext<T extends Constructable | Procedure> = T extends Constructable ? InstanceType<T> : ThisParameterType<T>;

type MockResult<T> = { type: 'incomplete'; value: undefined } | { type: 'return'; value: T } | { type: 'throw'; value: any };

type MockSettledResult<T> = { type: 'fulfilled'; value: T } | { type: 'incomplete'; value: undefined } | { type: 'rejected'; value: any };

export interface PortableMockContext<T extends Constructable | Procedure = Procedure> {
  calls: MockParameters<T>[];
  instances: MockProcedureContext<T>[];
  contexts: MockProcedureContext<T>[];
  invocationCallOrder: number[];
  results: MockResult<MockReturnType<T>>[];
  settledResults: MockSettledResult<Awaited<MockReturnType<T>>>[];
  lastCall: MockParameters<T> | undefined;
}

type NormalizedProcedure<T extends Constructable | Procedure> = T extends Constructable
  ? { (this: InstanceType<T>, ...args: ConstructorParameters<T>): void } | { new (...args: ConstructorParameters<T>): InstanceType<T> }
  : T extends Procedure
    ? (...args: Parameters<T>) => ReturnType<T>
    : never;

export interface PortableMockInstance<T extends Constructable | Procedure = Procedure> {
  getMockName(): string;
  mockName(name: string): this;
  mock: PortableMockContext<T>;
  mockClear(): this;
  mockReset(): this;
  mockRestore(): void;
  getMockImplementation(): NormalizedProcedure<T> | undefined;
  mockImplementation(fn: NormalizedProcedure<T>): this;
  mockImplementationOnce(fn: NormalizedProcedure<T>): this;
  withImplementation(fn: NormalizedProcedure<T>, cb: () => Promise<unknown>): Promise<this>;
  withImplementation(fn: NormalizedProcedure<T>, cb: () => unknown): this;
  mockReturnThis(): this;
  mockReturnValue(value: MockReturnType<T>): this;
  mockReturnValueOnce(value: MockReturnType<T>): this;
  mockResolvedValue(value: Awaited<MockReturnType<T>>): this;
  mockResolvedValueOnce(value: Awaited<MockReturnType<T>>): this;
  mockRejectedValue(error: unknown): this;
  mockRejectedValueOnce(error: unknown): this;
}

export type PortableMock<T extends Procedure = Procedure> = PortableMockInstance<T> & {
  [P in keyof T]: T[P];
} & {
  new (...args: Parameters<T>): ReturnType<T>;
  (...args: Parameters<T>): ReturnType<T>;
};

declare global {
  /**
   * The registry {@link Mock} and {@link MockInstance} read. Global rather than exported so that an
   * entry can fill it in without loading the root entry, which `vitest-auto-spy/rxjs` must not do.
   */
  interface VitestAutoSpyMockTypes<T extends (...args: any[]) => any> {
    portable: { mock: PortableMock<T>; instance: PortableMockInstance<T> };
  }
}

type MockFlavour = VitestAutoSpyMockTypes<Procedure> extends { vitest: unknown } ? 'vitest' : 'portable';

/** Vitest's `Mock<T>` where an entry that loads Vitest is in the program, {@link PortableMock} otherwise. */
export type Mock<T extends Procedure = Procedure> = VitestAutoSpyMockTypes<T>[MockFlavour]['mock'];

/** Vitest's `MockInstance<T>` where an entry that loads Vitest is in the program, {@link PortableMockInstance} otherwise. */
export type MockInstance<T extends Procedure = Procedure> = VitestAutoSpyMockTypes<T>[MockFlavour]['instance'];
/* eslint-enable @typescript-eslint/no-explicit-any -- end of the mirrored shapes. */
