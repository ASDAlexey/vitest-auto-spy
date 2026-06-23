/**
 * Shared internal constants.
 */

/**
 * Buffer size used for every internal `ReplaySubject`.
 *
 * `1` means "replay the last emitted value to late subscribers", which is what
 * lets a configured spy emit a value *before* the consumer subscribes.
 */
export const REPLAY_BUFFER_SIZE = 1;
