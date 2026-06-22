/**
 * Serializes argument lists into stable string keys, so that
 * `calledWith(1, 'a')` can be matched against the actual call arguments.
 */

import { stringify } from 'javascript-stringify';

type SerializedArgs = string;

export class ArgsMap {
  private readonly map: Record<SerializedArgs, unknown> = {};

  set(key: unknown, value: unknown): void {
    this.map[this.serialize(key)] = value;
  }

  get(key: unknown): any {
    return this.map[this.serialize(key)];
  }

  // `stringify` always serializes an argument array to a string, so the cast is safe.
  private serialize(key: unknown): SerializedArgs {
    return stringify(key) as SerializedArgs;
  }
}
