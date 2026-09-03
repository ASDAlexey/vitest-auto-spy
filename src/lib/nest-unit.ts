/**
 * `createNestUnit` — build a NestJS provider from its own DI metadata, every collaborator auto-spied.
 *
 * The spec this replaces lists `provideAutoSpy(X)` once per constructor parameter and is rewritten
 * whenever the constructor changes. Nest already emits everything needed to avoid that: the
 * compiler writes `design:paramtypes`, `@Inject(token)` records `self:paramtypes`, `@Optional()`
 * records `optional:paramtypes`, and property injection lands in `self:properties_metadata`. This
 * reads those five keys through whatever `Reflect.getMetadata` the project loaded — `reflect-metadata`
 * is Nest's own requirement, not a new one — and answers each token with the same doubles the rest
 * of the library builds: a class spy read off the real prototype, so a mistyped method name still
 * fails, and a type mock for a string or symbol token.
 *
 * It is the Angular `createWithAutoSpies` over Nest's metadata instead of Angular's `ɵfac`, with the
 * one thing Nest's `Test.createTestingModule` does not offer: `expose` builds a collaborator for
 * real, its own dependencies spied, which is Suites' sociable unit.
 *
 * Nothing from `@nestjs/*` is imported. The metadata keys are the constants `@nestjs/common` writes;
 * they have been stable since Nest 5 and are read here as strings for that reason.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { createSpyForToken } from './track-injections';
import type { ClassType, Spy } from './types';

/** A class `new` accepts. An abstract class is not one, which is what keeps it out of `expose`. */
export type NestUnitClass<T = unknown> = new (...args: never[]) => T;

/**
 * A provider that wins over the auto-spies and over `expose`. The three shapes Nest accepts without
 * an `inject` list; `provideAutoSpy(X)` output is the `useValue` one.
 */
export type NestUnitProvider =
  { provide: unknown; useClass: NestUnitClass } | { provide: unknown; useFactory: () => unknown } | { provide: unknown; useValue: unknown };

/** Options for {@link createNestUnit}. */
export interface CreateNestUnitOptions {
  /**
   * Collaborators constructed for real, their own dependencies auto-spied — Suites' `sociable()
   * .expose()`. Sugar for `{ provide: X, useClass: X }`, minus the right to read it back as a spy.
   */
  expose?: readonly NestUnitClass[];
  /**
   * Wins over the auto-spies and over `expose`: `provideAutoSpy(X, config)` output, `{ provide:
   * 'CONFIG', useValue }`, `{ provide: Abstract, useClass: Impl }`, `{ provide, useFactory }` (zero
   * arguments, called once).
   */
  providers?: readonly NestUnitProvider[];
}

/** Resolve a dependency exactly as the unit sees it: the provided value if given, the auto-spy otherwise. */
export interface NestUnitSpies {
  get<D>(token: ClassType<D> | (abstract new (...args: never[]) => D)): Spy<D>;
  get<D = unknown>(token: unknown): Spy<D>;
  /** Tokens the graph asked for and nothing provided or exposed — the ones answered with a double. */
  autoSpiedTokens(): unknown[];
  /** The `expose` classes the graph actually built. */
  exposedTokens(): unknown[];
}

/** What {@link createNestUnit} hands back. */
export interface NestUnit<T> {
  unit: T;
  spies: NestUnitSpies;
}

type MetadataReader = (key: string, target: object) => unknown;

interface SelfDeclaredDep {
  index: number;
  param: unknown;
}

interface PropertyDep {
  key: PropertyKey;
  type: unknown;
}

/** The keys `@nestjs/common` writes — `constants.js` of the package, verified against 12.0.1. */
const DESIGN_PARAMTYPES = 'design:paramtypes';
const SELF_DECLARED_DEPS = 'self:paramtypes';
const OPTIONAL_DEPS = 'optional:paramtypes';
const PROPERTY_DEPS = 'self:properties_metadata';
const OPTIONAL_PROPERTY_DEPS = 'optional:properties_metadata';

/**
 * What `design:paramtypes` holds for a parameter whose type has no runtime class — an interface, a
 * union, a primitive, a generic — plus `undefined`, which is what a circular import leaves behind.
 * Nest refuses all of these at bootstrap; refusing them here keeps the unit honest with the app.
 */
const NOT_INJECTABLE = new Set<unknown>([Object, String, Number, Boolean, Symbol, Function, Array, Promise, undefined]);

/** `Reflect.getMetadata` if `reflect-metadata` was loaded — it installs itself onto `Reflect`, so a structural read is the honest one. */
function metadataReader(): MetadataReader | undefined {
  const read: unknown = Reflect.get(Reflect, 'getMetadata');

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `reflect-metadata` is a peer of the *consumer*, not of this build, so its declaration is not available; a function under that name on `Reflect` is its polyfill.
  return typeof read === 'function' ? (read as MetadataReader) : undefined;
}

/** A token as a reader recognises it: a class by its name, a string or symbol token by its own `String` form. */
function describeToken(token: unknown): string {
  const name: unknown = Reflect.get(Object(token), 'name');

  return typeof name === 'string' ? name : String(token);
}

/** The class behind `forwardRef(() => X)`; anything else is already the token. */
function unwrapForwardRef(token: unknown): unknown {
  const ref: unknown = Reflect.get(Object(token), 'forwardRef');

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `forwardRef` is Nest's own `() => Class` thunk; narrowing to `function` is all that can be checked at runtime.
  return typeof ref === 'function' ? (ref as () => unknown)() : token;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function isSelfDeclaredDep(entry: unknown): entry is SelfDeclaredDep {
  return typeof Reflect.get(Object(entry), 'index') === 'number';
}

function isPropertyDep(entry: unknown): entry is PropertyDep {
  return Reflect.get(Object(entry), 'key') !== undefined;
}

/**
 * The provider graph of one unit: one instance per token, as Nest's default singleton scope gives.
 *
 * A token is answered by its `providers` entry, else built for real if it is in `expose` (or is the
 * unit itself, which only a cycle can ask for), else auto-spied.
 */
class NestGraph {
  readonly #read = metadataReader();
  readonly #provided: Map<unknown, NestUnitProvider>;
  readonly #exposed: Set<unknown>;
  readonly #instances = new Map<unknown, unknown>();
  readonly #autoSpied: unknown[] = [];
  readonly #built: unknown[] = [];
  readonly #building: NestUnitClass[] = [];

  constructor(
    readonly target: NestUnitClass,
    options: CreateNestUnitOptions,
  ) {
    this.#provided = new Map((options.providers ?? []).map((provider) => [provider.provide, provider]));
    this.#exposed = new Set(options.expose ?? []);
  }

  fail(message: string): Error {
    return new Error(withDocs(`[vitest-auto-spy] createNestUnit(${describeToken(this.target)}): ${message}`, DOCS_LINKS.nestjs));
  }

  autoSpiedTokens(): unknown[] {
    return [...this.#autoSpied];
  }

  exposedTokens(): unknown[] {
    return [...this.#built];
  }

  asked(token: unknown): boolean {
    return this.#instances.has(token);
  }

  provided(token: unknown): boolean {
    return this.#provided.has(token);
  }

  exposed(token: unknown): boolean {
    return this.#exposed.has(token);
  }

  resolve(token: unknown): unknown {
    if (!this.#instances.has(token)) {
      this.#instances.set(token, this.#build(token));
    }

    return this.#instances.get(token);
  }

  instantiate(Class: NestUnitClass): object {
    if (this.#building.includes(Class)) {
      throw this.fail(
        `${[...this.#building, Class].map(describeToken).join(' -> ')} is a cycle among the classes built for real, and this helper ` +
          'does not resolve `forwardRef` cycles. Expose one side less, or provide it (`{ provide: X, useValue }`).',
      );
    }

    this.#building.push(Class);

    const optionalParams = asArray(this.#read?.(OPTIONAL_DEPS, Class)) ?? [];
    const args = this.#constructorTokens(Class).map((token, index) =>
      this.#dependency(Class, `parameter #${index}`, token, optionalParams.includes(index)),
    );

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `never[]` is how the signature admits every concrete constructor; the arguments were just resolved from that constructor's own metadata.
    const instance: object = new (Class as new (...args: unknown[]) => object)(...args);
    const optionalProperties = asArray(this.#read?.(OPTIONAL_PROPERTY_DEPS, Class)) ?? [];

    for (const { key, type } of (asArray(this.#read?.(PROPERTY_DEPS, Class)) ?? []).filter(isPropertyDep)) {
      Reflect.set(instance, key, this.#dependency(Class, `property \`${String(key)}\``, type, optionalProperties.includes(key)));
    }

    this.#building.pop();

    return instance;
  }

  #build(token: unknown): unknown {
    const provider = this.#provided.get(token);

    if (provider) {
      return this.#materialise(provider);
    }

    if (this.#exposed.has(token)) {
      this.#built.push(token);

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the set holds exactly what `expose` was given, and its type admits only constructible classes.
      return this.instantiate(token as NestUnitClass);
    }

    if (token === this.target) {
      // Only a collaborator of the unit can ask for the unit, and the unit is on the stack already —
      // `instantiate` names the cycle instead of this minting a spy of the class under test.
      return this.instantiate(this.target);
    }

    this.#autoSpied.push(token);

    return createSpyForToken(token);
  }

  #materialise(provider: NestUnitProvider): unknown {
    if ('useValue' in provider) {
      return provider.useValue;
    }

    return 'useFactory' in provider ? provider.useFactory() : this.instantiate(provider.useClass);
  }

  #dependency(Class: NestUnitClass, slot: string, rawToken: unknown, optional: boolean): unknown {
    const token = unwrapForwardRef(rawToken);

    if (this.#provided.has(token) || !NOT_INJECTABLE.has(token)) {
      return this.resolve(token);
    }

    if (optional) {
      return undefined;
    }

    const shape =
      token === undefined
        ? 'undefined — usually a circular import, which `@Inject(forwardRef(() => X))` resolves'
        : `\`${describeToken(token)}\`, which is what the compiler emits for an interface, a union or a primitive`;

    throw this.fail(
      `${slot} of ${describeToken(Class)} is typed as ${shape}. Nest cannot inject that, and neither can this helper. Name the token ` +
        'with `@Inject(TOKEN)` and supply it in `providers` (`{ provide: TOKEN, useValue }`), or mark it `@Optional()` to receive undefined.',
    );
  }

  /** One token per constructor parameter: `@Inject(token)` where declared, the emitted type otherwise. */
  #constructorTokens(Class: NestUnitClass): unknown[] {
    const designTypes = asArray(this.#read?.(DESIGN_PARAMTYPES, Class));
    const selfDeclared = asArray(this.#read?.(SELF_DECLARED_DEPS, Class));

    if (!designTypes && !selfDeclared) {
      if (Class.length === 0) {
        return [];
      }

      throw this.fail(
        `${describeToken(Class)} declares ${Class.length} constructor parameter(s) but carries no \`design:paramtypes\` metadata, so there ` +
          'is nothing to resolve them from. The class needs `@Injectable()`, `emitDecoratorMetadata: true` and `reflect-metadata` imported ' +
          'before it is loaded — tsc and SWC (`decoratorMetadata: true`) emit that metadata, esbuild and Vite do not. Without the flag, ' +
          '`@Inject(X)` on every parameter records the token itself, and `providers` can supply whatever has no class.',
      );
    }

    const tokens: unknown[] = Array.from({ length: designTypes?.length ?? Class.length }, (_, index) => designTypes?.[index]);

    for (const { index, param } of (selfDeclared ?? []).filter(isSelfDeclaredDep)) {
      tokens[index] = param;
    }

    return tokens;
  }
}

/**
 * Build `Target` from its metadata with every unprovided dependency spied.
 *
 * ```ts
 * const { unit, spies } = createNestUnit(CartService, { expose: [PricingService] });
 *
 * spies.get(TaxService).rate.mockReturnValue(0.2);
 * expect(unit.checkout(3)).toBe(36);
 * ```
 */
export function createNestUnit<T>(Target: NestUnitClass<T>, options: CreateNestUnitOptions = {}): NestUnit<T> {
  const graph = new NestGraph(Target, options);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `instantiate` builds whatever class it is handed; for `Target` that is a `T`.
  const unit = graph.instantiate(Target) as T;

  return {
    unit,
    spies: {
      get: <D>(token: unknown): Spy<D> => {
        // Same guard as `createWithAutoSpies`: the unit is built by the time anyone can ask, so a token
        // it never asked for is refused rather than answered with a spy it will never see.
        if (!graph.asked(token) && !graph.provided(token)) {
          throw graph.fail(
            `spies.get(${describeToken(token)}): the unit never asked for that token, and nothing in \`providers\` supplies it, so the spy ` +
              `you would get back is not the one it uses. Auto-spied tokens: ${graph.autoSpiedTokens().map(describeToken).join(', ') || '(none)'}.`,
          );
        }

        if (graph.exposed(token)) {
          throw graph.fail(
            `spies.get(${describeToken(token)}): ${describeToken(token)} is in \`expose\`, so the unit got a real instance of it, not a ` +
              'spy. Read the spies of its own collaborators instead, or drop it from `expose`.',
          );
        }

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the graph holds the real `D` (a user provider) or the `Spy<D>` built for the token; both are read through the spy surface here.
        return graph.resolve(token) as Spy<D>;
      },
      autoSpiedTokens: () => graph.autoSpiedTokens(),
      exposedTokens: () => graph.exposedTokens(),
    },
  };
}
