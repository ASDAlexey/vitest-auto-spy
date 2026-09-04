/**
 * Point a failure at the line that called the helper, when the failure is built much later.
 *
 * `vi.defineHelper` solves this for a helper that throws while the caller's frame is still on the
 * stack, and it is what `error-handler`, `narrow` and `module-mocks` use. The emission helpers are
 * the case it cannot serve: their failures are constructed inside a `subscribe` or timer callback,
 * long after the call returned, so the stack the runner sees starts at `expect-emission.ts` and
 * contains no spec frame at all. Wrapping them measurably made it worse — the `__VITEST_HELPER__`
 * frame ends up *last*, and Vitest's parser then drops the whole stack, code frame included.
 *
 * So the stack is captured at helper entry — before anything subscribes — and pinned onto the
 * failure when it is finally built. Rewriting a stack is a lie whenever the error is not ours, so
 * only errors made by {@link ownFailure} are ever touched: `expectError` resolves with the error the
 * stream threw, and moving that one's stack would point the reader away from where it was created.
 */
import type { Func } from './types';

/** Pins a failure this package built onto the stack captured at helper entry. */
export type StackAnchor = (error: Error) => Error;

/** `Error`, or a stand-in without `captureStackTrace` — how a spec reaches the runtimes that lack it. */
export interface StackHost {
  captureStackTrace?: (target: object, boundary?: Func) => void;
}

const OWN_FAILURE = Symbol('vitest-auto-spy.own-failure');

/**
 * An `Error` this package owns, and the only kind an anchor will rewrite.
 *
 * The brand is a symbol rather than a class so `instanceof`, `toThrow` and `matchObject` keep seeing
 * a plain `Error`; it is non-enumerable so it never reaches a serialized diff.
 */
export function ownFailure(message: string, options?: ErrorOptions): Error {
  const error = new Error(message, options);

  Object.defineProperty(error, OWN_FAILURE, { value: true });

  return error;
}

/**
 * The anchor for a stack that has already been taken.
 *
 * Internal — no entry re-exports it. It is the seam {@link captureAnchor} is built on, and the only
 * way a spec can exercise a runtime that hands back no stack at all. `boundaryName` empty means the
 * frames are already trimmed.
 */
export function anchorOf(stack: string | undefined, boundaryName: string): StackAnchor {
  const frames = framesAfter(frameLines(stack), boundaryName);

  return (error) => anchor(frames, error);
}

/**
 * Take the caller's stack now, to be pinned onto a failure built later.
 *
 * `boundary` is the helper itself: V8 drops every frame up to and including it, so the first frame
 * left is the spec line. Where `Error.captureStackTrace` is missing — JSC, and anything else this
 * package runs on — the same cut is made by name, which costs nothing when it finds nothing.
 */
export function captureAnchor(boundary: Func, host: StackHost = Error): StackAnchor {
  const holder = new Error();
  const capture = host.captureStackTrace;

  if (capture) {
    capture(holder, boundary);

    return anchorOf(holder.stack, '');
  }

  return anchorOf(holder.stack, boundary.name);
}

function anchor(frames: string[], error: Error): Error {
  if (frames.length === 0 || Reflect.get(error, OWN_FAILURE) !== true) {
    return error;
  }

  error.stack = [`${error.name}: ${error.message}`, ...frames].join('\n');

  return error;
}

/** The frame lines of a stack, without the `Error: message` header a header-carrying runtime puts first. */
function frameLines(stack: string | undefined): string[] {
  const lines = String(stack).split('\n');
  const first = lines.findIndex(isFrame);

  return first < 0 ? [] : lines.slice(first);
}

/** V8 (`    at fn (file:1:1)`) and JSC (`fn@file:1:1`) name their frames differently; both are frames. */
function isFrame(line: string): boolean {
  return /^\s*at\s/.test(line) || /^\S*@/.test(line);
}

function framesAfter(frames: string[], boundaryName: string): string[] {
  const boundary = boundaryName === '' ? -1 : frames.findIndex((frame) => frame.includes(boundaryName));

  return boundary < 0 ? frames : frames.slice(boundary + 1);
}
