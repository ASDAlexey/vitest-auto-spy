import { expectTypeOf, it } from 'vitest';

import { createDropEvent, createPasteEvent } from '../dom-stubs';

it('returns native DOM types suitable for typed handlers and dispatch', () => {
  const paste = createPasteEvent('123');
  const drop = createDropEvent(null, { bubbles: false, cancelable: false, composed: true });

  expectTypeOf(paste).toEqualTypeOf<ClipboardEvent>();
  expectTypeOf(drop).toEqualTypeOf<DragEvent>();
  expectTypeOf(paste.clipboardData).toEqualTypeOf<DataTransfer | null>();
  expectTypeOf(drop.dataTransfer).toEqualTypeOf<DataTransfer | null>();
  expectTypeOf(paste.defaultPrevented).toEqualTypeOf<boolean>();
  expectTypeOf(document.dispatchEvent).toBeCallableWith(paste);
  expectTypeOf(document.dispatchEvent).toBeCallableWith(drop);
});

it('requires text or an explicit missing-transfer value and accepts only EventInit flags', () => {
  createPasteEvent(null);
  createDropEvent('');
  // @ts-expect-error -- missing data is null, never an accidentally omitted argument
  createPasteEvent();
  // @ts-expect-error -- the helper carries text, not arbitrary transfer objects
  createDropEvent({ getData: () => 'text' });
  // @ts-expect-error -- mouse properties are outside the text-only event helper
  createDropEvent('text', { clientX: 1 });
  // @ts-expect-error -- the data argument supplies clipboardData
  createPasteEvent('text', { clipboardData: null });
});
