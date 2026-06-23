/**
 * Serializes argument lists into stable string keys, so that
 * `calledWith(1, 'a')` can be matched against the actual call arguments.
 */
import { stringify } from 'javascript-stringify';

type SerializedArgs = string;

export class ArgsMap {
  readonly #map: Record<SerializedArgs, unknown> = {};

  set(key: unknown, value: unknown): void {
    this.#map[this.#serialize(key)] = value;
  }

  get(key: unknown): unknown {
    return this.#map[this.#serialize(key)];
  }

  // Keys are always argument arrays, which `javascript-stringify` always renders
  // to a string. `String(...)` keeps the result total against its `string |
  // undefined` signature without an unreachable fallback branch.
  #serialize(key: unknown): SerializedArgs {
    return String(stringify(key));
  }
}
