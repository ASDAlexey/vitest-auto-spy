/**
 * Spec files that reach their subject through a barrel.
 *
 * A barrel is one module that re-exports many, so importing it loads all of them — the spec pays
 * for the whole directory to get one class. This is invisible per file and only shows up as import
 * time spread over the suite, which is why it belongs to a command that has the measurement in
 * hand rather than to a linter.
 */
import type { SourceGraph } from './graph';
import { isSpecFile } from './graph';

const BARREL_NAME = /(?:^|\/)(?:index|public[_-]api)\.[cm]?[jt]sx?$/;

const RE_EXPORT = /\bexport\s+(?:type\s+)?(?:\*|{[^}]*})[^;]*?\bfrom\s*["'][^"']+["']/g;

/** A declaration of its own is what separates a module that re-exports from one that only does. */
const OWN_DECLARATION =
  /(?:^|\n)\s*export\s+(?:abstract\s+)?(?:default|class|function|const|let|var|enum|namespace|interface|type\s+\w+\s*=)\b/;

export interface BarrelImport {
  readonly spec: string;
  readonly barrel: string;
  /** Repository modules the barrel pulls in behind it. */
  readonly reach: number;
}

export function isBarrel(file: string, text: string): boolean {
  if (!BARREL_NAME.test(file) || OWN_DECLARATION.test(text)) {
    return false;
  }

  return (text.match(RE_EXPORT) ?? []).length >= 2;
}

/** Every repository module reachable from `file`, itself excluded. */
export function reachOf(file: string, graph: SourceGraph): number {
  const seen = new Set([file]);
  const order = [file];

  for (const current of order) {
    for (const edge of graph.imports.get(current) ?? []) {
      if (!seen.has(edge)) {
        seen.add(edge);
        order.push(edge);
      }
    }
  }

  return seen.size - 1;
}

/** Spec → barrel pairs, the widest barrel first. */
export function findBarrelImports(graph: SourceGraph): BarrelImport[] {
  const barrels = new Map<string, number>();
  const found: BarrelImport[] = [];

  for (const [file, text] of graph.texts) {
    if (isBarrel(file, text)) {
      barrels.set(file, reachOf(file, graph));
    }
  }

  for (const [spec, imported] of graph.imports) {
    if (!isSpecFile(spec)) {
      continue;
    }

    for (const target of imported) {
      const reach = barrels.get(target);

      if (reach !== undefined) {
        found.push({ spec, barrel: target, reach });
      }
    }
  }

  return found.sort((a, b) => b.reach - a.reach || a.spec.localeCompare(b.spec) || a.barrel.localeCompare(b.barrel));
}
