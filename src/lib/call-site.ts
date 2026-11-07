import { stackFrames } from './stack-frames';

/** `file:///app/src/pay.ts:12:5` out of one stack frame; empty when the frame has no position. */
export function frameLocation(frame: string): string {
  return /((?:file:\/\/)?[^\s()]+:\d+:\d+)\)?$/.exec(frame)?.[1] ?? '';
}

let libraryDirectory: string | undefined;

// In the repository the library's source sits next to its specs, where a report would quote the library.
// Lazy: the first stack in a spec file costs ~1 ms under Vitest.
export function ownDirectory(): string {
  libraryDirectory ??= frameLocation(String(stackFrames(new Error('probe').stack)[0])).replace(/[^/\\]*$/, '');

  return libraryDirectory;
}

/** A frame of the calling code: not a dependency, not the runtime, and not the library unless it is a spec. */
export function isCallingCode(location: string, library = ownDirectory()): boolean {
  return (
    location !== '' &&
    !/node_modules|node:/.test(location) &&
    (library === '' || !location.startsWith(library) || /\.(spec|test)\.[cm]?[jt]sx?:/.test(location))
  );
}
