#!/usr/bin/env node
// The one table every benchmark command prints.
//
// There were four of these — the head-to-head report drew an aligned block, the memory harness built
// markdown by hand, the suite script printed tab-separated columns, and `npm run bench` handed the
// terminal Vitest's own ten-column reporter. Four shapes for one thing, and the tab-separated one
// was unreadable the moment a column held a ratio next to a megabyte count.
//
// Two styles, chosen by where the output is going rather than by a flag: a **box** for a terminal,
// because that is what makes a number findable in a scrollback, and **markdown** for a pipe, because
// every published table in this repository is pasted from one of these commands and must arrive as
// markdown. `stdout.isTTY` is the switch; `--markdown` forces the pipe form for a human who wants to
// copy a table out of an interactive run.

/**
 * How many terminal cells a string occupies.
 *
 * CJK ideographs and fullwidth forms take two, combining marks take none — counting code points
 * would leave the Chinese and Japanese tables ragged, which is the whole reason this is not
 * `String.length`.
 */
export function cellWidth(value) {
  let width = 0;

  for (const character of value) {
    const code = character.codePointAt(0);

    if (
      code >= 0x1100 &&
      (code <= 0x115f ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6))
    ) {
      width += 2;
    } else if (!/\p{M}/u.test(character)) {
      width += 1;
    }
  }

  return width;
}

/**
 * Colour, and when it is allowed.
 *
 * A terminal gets it, a pipe never does — the markdown these commands write is pasted into
 * documentation pages, and an escape sequence in one is a bug that survives review. `NO_COLOR` is
 * honoured because it is the convention, and `FORCE_COLOR` because CI logs are not TTYs and
 * sometimes want it anyway.
 */
const ANSI = { green: '\u001B[32m', red: '\u001B[31m', yellow: '\u001B[33m', reset: '\u001B[0m' };

export function supportsColor(stream) {
  if (process.env['NO_COLOR']) {
    return false;
  }

  if (process.env['FORCE_COLOR']) {
    return true;
  }

  return Boolean(stream.isTTY);
}

/** Wrap `text` in `color`, or hand it back untouched when colour is off or the name is unknown. */
export function paint(text, color, stream = process.stdout) {
  return color && ANSI[color] && supportsColor(stream) ? `${ANSI[color]}${text}${ANSI.reset}` : text;
}

/** Column alignment: the first column names the row, the rest carry numbers. */
function defaultAlign(headers) {
  return headers.map((_, index) => (index === 0 ? 'left' : 'right'));
}

/** Pad `value` to `width` cells on the side its alignment asks for. */
function pad(value, width, alignment) {
  const fill = ' '.repeat(Math.max(0, width - cellWidth(value)));

  return alignment === 'left' ? value + fill : fill + value;
}

/**
 * Render one table.
 *
 * @param {string[]} headers Column headings.
 * @param {string[][]} rows One array of cells per row; a missing cell renders empty.
 * @param {{ style?: 'box' | 'markdown', align?: ('left' | 'right')[], indent?: string }} options
 *   `style` defaults to `'box'`; `align` defaults to left for the first column and right for the
 *   rest; `indent` prefixes every line, for a table nested under a heading; `color` paints the frame
 *   — green when the verdict is good, red when it is not — and is ignored in markdown and in a pipe.
 * @returns {string[]} Lines, without trailing newlines.
 */
export function renderTable(headers, rows, options = {}) {
  const { style = 'box', align = defaultAlign(headers), indent = '', color } = options;

  if (style === 'markdown') {
    return [
      `| ${headers.join(' | ')} |`,
      `| ${align.map((side) => (side === 'left' ? '---' : '---:')).join(' | ')} |`,
      ...rows.map((cells) => `| ${headers.map((_, index) => cells[index] ?? '').join(' | ')} |`),
    ];
  }

  const table = [headers, ...rows];
  const widths = headers.map((_, index) => Math.max(...table.map((cells) => cellWidth(cells[index] ?? ''))));
  // Only the frame is painted, never the cells: the escape sequences would then land inside the
  // widths, and a coloured number is harder to read than a black one, not easier.
  const glyph = (text) => paint(text, color);
  const rule = (left, middle, right) =>
    `${indent}${glyph(`${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`)}`;
  const line = (cells) =>
    `${indent}${glyph('│')} ${widths.map((width, index) => pad(cells[index] ?? '', width, align[index] ?? 'right')).join(` ${glyph('│')} `)} ${glyph('│')}`;

  return [rule('┌', '┬', '┐'), line(headers), rule('├', '┼', '┤'), ...rows.map(line), rule('└', '┴', '┘')];
}

/**
 * The style this process should print.
 *
 * A terminal gets the box, a pipe gets markdown — so `npm run bench:vs > table.md` still produces
 * something a documentation page can take verbatim, which several of them do.
 */
export function styleFor(stream, argv = []) {
  if (argv.includes('--markdown')) {
    return 'markdown';
  }

  // A child process writing through a pipe cannot see the terminal its parent is attached to, and
  // would fall back to markdown while the parent draws boxes. `npm run bench` runs the memory pass
  // that way, so the parent passes its own answer down.
  const forced = process.env['BENCH_TABLE_STYLE'];

  if (forced === 'box' || forced === 'markdown') {
    return forced;
  }

  return stream.isTTY ? 'box' : 'markdown';
}

/** A heading above a table: underlined in a terminal, an `####` heading in markdown. */
export function renderHeading(title, style, level = 4) {
  return style === 'markdown' ? [`${'#'.repeat(level)} ${title}`] : [title, '─'.repeat(cellWidth(title))];
}
