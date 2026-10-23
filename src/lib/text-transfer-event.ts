/** Text-only paste/drop events for calling handlers directly or dispatching to a DOM target. */

function textTransfer(text: string): DataTransfer {
  const transfer = {
    getData: (format: string): string => {
      const normalized = format.toLowerCase();

      return normalized === 'text' || normalized === 'text/plain' ? text : '';
    },
    types: Object.freeze(['text/plain']),
  };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately implements only text reads; other DataTransfer members fail by name.
  return new Proxy(transfer, {
    get(target, key, receiver): unknown {
      if (typeof key === 'string' && !Reflect.has(target, key)) {
        throw new Error(
          `[vitest-auto-spy] text-transfer event: DataTransfer.${key} is not implemented. ` +
            'createPasteEvent/createDropEvent support only getData() and types; provide a custom event for other transfer data.',
        );
      }

      return Reflect.get(target, key, receiver);
    },
  }) as DataTransfer;
}

function transferEvent(type: 'drop' | 'paste', property: 'clipboardData' | 'dataTransfer', text: string | null, init: EventInit): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });

  Object.defineProperty(event, property, { value: text === null ? null : textTransfer(text), enumerable: true });

  return event;
}

/**
 * A bubbling, cancelable paste event carrying plain text. `null` represents absent clipboard data.
 * `preventDefault()` updates the real `defaultPrevented` flag, including when dispatched.
 * Does not require the environment to implement `ClipboardEvent` or `DataTransfer` constructors.
 * Supports only `clipboardData.getData()` (`text/plain` / `text`, case-insensitive) and `types`.
 */
export function createPasteEvent(text: string | null, init: EventInit = {}): ClipboardEvent {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a native Event with the ClipboardEvent-specific readonly member; no ClipboardEvent constructor is required.
  return transferEvent('paste', 'clipboardData', text, init) as ClipboardEvent;
}

/**
 * A bubbling, cancelable drop event carrying plain text. `null` represents absent transfer data.
 * Supports only `dataTransfer.getData()` (`text/plain` / `text`, case-insensitive) and `types`.
 * Mouse coordinates, files and writes to the transfer are outside this text-only helper.
 */
export function createDropEvent(text: string | null, init: EventInit = {}): DragEvent {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a native Event with the DragEvent-specific readonly member; no DragEvent constructor is required.
  return transferEvent('drop', 'dataTransfer', text, init) as DragEvent;
}
