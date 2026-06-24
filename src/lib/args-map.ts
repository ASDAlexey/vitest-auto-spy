/**
 * Serializes argument lists into stable string keys, so that
 * `calledWith(1, 'a')` can be matched against the actual call arguments.
 */
import { serializeValue } from './serialize-args';

type SerializedArgs = string;

export class ArgsMap {
  readonly #map: Record<SerializedArgs, unknown> = {};

  set(key: unknown, value: unknown): void {
    this.#map[this.#serialize(key)] = value;
  }

  get(key: unknown): unknown {
    return this.#map[this.#serialize(key)];
  }

  // Keys are always argument arrays; `serializeValue` renders them to a stable,
  // total string (single-quoted strings, bracketed arrays, distinct `undefined`
  // / function / symbol / BigInt / Date renderings, circular-ref safe).
  #serialize(key: unknown): SerializedArgs {
    return serializeValue(key);
  }
}
