/**
 * What a console line the stray-console guard caught most likely means, for the lines whose cause is
 * known. Read from the whole output, not from the quote the report cuts at 200 characters.
 */

const COMPONENT_ID_COLLISION =
  /NG0912: Component ID generation collision detected\. Components '([^']+)' and '([^']+)' with selector '([^']*)'/;

const ANGULAR_CODE = /\bNG0*(\d{3,4})\b/;

const ANGULAR_LINK = /Find more at (https?:\/\/\S+?)\.?(?:\s|$)/;

function componentIdCollision(match: RegExpExecArray): string {
  const [first, second, selector] = match.slice(1).map(String);

  return (
    `Angular gave \`${String(first)}\` and \`${String(second)}\` (selector \`${String(selector)}\`) one component id, so the ` +
    'bundle holds two copies of one component — a local fork beside its package, or two versions of one package (a leading ' +
    '`_` is the bundler renaming the second). Import the component from one place.'
  );
}

/** One sentence on why this output was written, or `undefined` when nothing here recognises it. */
export function consoleCause(output: string): string | undefined {
  const collision = COMPONENT_ID_COLLISION.exec(output);

  if (collision) {
    return componentIdCollision(collision);
  }

  const code = ANGULAR_CODE.exec(output);

  if (!code) {
    return undefined;
  }

  const link = ANGULAR_LINK.exec(output);
  const url = link ? String(link[1]) : `https://angular.dev/errors/NG${String(code[1]).padStart(4, '0')}`;

  return `Angular explains this error at ${url}`;
}
