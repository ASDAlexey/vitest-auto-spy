import { describe, expectTypeOf, it } from 'vitest';

import { registerAutoSpyDefaults } from '../lib/angular-spy-defaults';
import type { MethodReturns } from '../lib/types';

type Metric<Key extends number> = { [Name in `event${Key}`]: { value: Key } };
type Metrics = [
  Metric<1>,
  Metric<2>,
  Metric<3>,
  Metric<4>,
  Metric<5>,
  Metric<6>,
  Metric<7>,
  Metric<8>,
  Metric<9>,
  Metric<10>,
  Metric<11>,
  Metric<12>,
  Metric<13>,
  Metric<14>,
  Metric<15>,
  Metric<16>,
  Metric<17>,
  Metric<18>,
  Metric<19>,
  Metric<20>,
  Metric<21>,
  Metric<22>,
  Metric<23>,
  Metric<24>,
  Metric<25>,
  Metric<26>,
  Metric<27>,
  Metric<28>,
  Metric<29>,
  Metric<30>,
  Metric<31>,
];
type MoreMetrics = [Metric<32>, Metric<33>, Metric<34>, Metric<35>, Metric<36>, Metric<37>, Metric<38>, Metric<39>, Metric<40>];
type Intersection<T> = (T extends [infer Head, ...infer Rest] ? Head & Intersection<Rest> : unknown) extends infer R
  ? { [K in keyof R]: R[K] }
  : never;
type AllMetrics = Intersection<Metrics> & Intersection<MoreMetrics>;
type MetricMap<T> = { [P in keyof AllMetrics]: T extends { [K in P]: infer U } ? U : never };
type DomainMetrics = MetricMap<Metrics[number] | MoreMetrics[number]>;

declare class MetricsService {
  sendEvent<Key extends keyof DomainMetrics>(name: Key, event: DomainMetrics[Key] & { useConsumers?: string[] }): Promise<void>;
}

type Stringified<T> = string & { readonly stringified: T };
interface ConfigDefaults {
  value: Stringified<{ enabled: boolean }>;
  nullable: Stringified<{ count: number }> | null;
}
declare class ConfigService<T extends object = ConfigDefaults> {
  getJSONValue<K extends keyof T>(key: K): NonNullable<T[K]> extends Stringified<infer R> ? Extract<T[K], null> | R : never;
}

describe('return seeds for a generic method over a deeply composed event map', () => {
  it('preserves ReturnType semantics for a generic method with a conditional return', () => {
    expectTypeOf<MethodReturns<ConfigService>['getJSONValue']>().toEqualTypeOf<ReturnType<ConfigService['getJSONValue']> | undefined>();
    registerAutoSpyDefaults(ConfigService, { returns: { getJSONValue: { enabled: true } } });
    registerAutoSpyDefaults(ConfigService, { returns: { getJSONValue: null } });
  });

  it('infers only the return type without instantiating the parameter constraint', () => {
    registerAutoSpyDefaults(MetricsService, { returns: { sendEvent: Promise.resolve() } });
    expectTypeOf<MethodReturns<MetricsService>['sendEvent']>().toEqualTypeOf<Promise<void> | undefined>();

    // @ts-expect-error — keeping the deep parameter constraint cheap must not erase its return type
    registerAutoSpyDefaults(MetricsService, { returns: { sendEvent: Promise.resolve('wrong') } });
    // @ts-expect-error — only method keys may be seeded
    registerAutoSpyDefaults(MetricsService, { returns: { missing: Promise.resolve() } });
  });
});
