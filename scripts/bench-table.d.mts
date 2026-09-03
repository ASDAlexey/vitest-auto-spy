/**
 * Types for `bench-table.mjs`, so the benchmark files — which are part of the TypeScript program —
 * can import the same renderer the scripts use. The implementation stays plain JavaScript because
 * `scripts/` is run by `node` directly, with no build step.
 */
export type TableStyle = 'box' | 'markdown';

export type ColumnAlign = 'left' | 'right';

export type TableColor = 'green' | 'red' | 'yellow';

export interface RenderTableOptions {
  /** `'box'` for a terminal, `'markdown'` for a pipe. Defaults to `'box'`. */
  style?: TableStyle;
  /** Per-column alignment. Defaults to left for the first column, right for the rest. */
  align?: ColumnAlign[];
  /** Prefix for every line, for a table nested under a heading. */
  indent?: string;
  /** Paints the frame — green when the verdict is good, red when it is not. Ignored outside a terminal. */
  color?: TableColor | undefined;
}

/** How many terminal cells a string occupies — fullwidth characters count two, combining marks none. */
export declare function cellWidth(value: string): number;

/** Render one table as an array of lines. */
export declare function renderTable(headers: string[], rows: string[][], options?: RenderTableOptions): string[];

/** The style this process should print: a box for a terminal, markdown for a pipe or `--markdown`. */
export declare function styleFor(stream: { isTTY?: boolean }, argv?: string[]): TableStyle;

/** Wrap `text` in `color`, or hand it back untouched when colour is off. */
export declare function paint(text: string, color?: TableColor | undefined, stream?: { isTTY?: boolean }): string;

/** Whether this stream should carry ANSI colour — `NO_COLOR` and `FORCE_COLOR` are honoured. */
export declare function supportsColor(stream: { isTTY?: boolean }): boolean;

/** A heading above a table — underlined in a terminal, an `#`-prefixed heading in markdown. */
export declare function renderHeading(title: string, style: TableStyle, level?: number): string[];
