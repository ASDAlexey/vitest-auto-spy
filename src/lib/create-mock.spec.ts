/**
 * `createMock` is one assertion behind a checked signature. These specs pin the two properties that
 * make it worth having: the seeded fields survive verbatim (same reference, not a copy of a copy),
 * and an unseeded call still produces a usable object rather than `undefined`.
 */
import { describe, expect, it } from 'vitest';

import { createMock } from './create-mock';

interface ReportSnapshot {
  data: { title: string };
  id: string;
  enabled: boolean;
  refresh(): void;
}

describe('createMock', () => {
  it('returns the seeded fields verbatim', () => {
    const data = { title: 'Report' };

    const snapshot = createMock<ReportSnapshot>({ data, id: '1', enabled: true });

    expect(snapshot.data).toBe(data);
    expect(snapshot.id).toBe('1');
    expect(snapshot.enabled).toBe(true);
  });

  it('defaults to an empty object, leaving unseeded members undefined', () => {
    const snapshot = createMock<ReportSnapshot>();

    expect(snapshot).toEqual({});
    expect(snapshot.refresh).toBeUndefined();
  });

  it('hands back the very object it was given, not a clone', () => {
    const partial: Partial<ReportSnapshot> = { id: '2' };

    const snapshot = createMock<ReportSnapshot>(partial);

    expect(snapshot).toBe(partial);
  });
});
