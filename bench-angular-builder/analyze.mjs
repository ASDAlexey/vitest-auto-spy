#!/usr/bin/env node
// Usage: node analyze.mjs <runs-N.jsonl> — medians and spreads per arm x provider, plus deltas.
import { readFileSync } from 'node:fs';

import { isMain } from './common.mjs';

const METRICS = [
  ['wall_s', 'wall s'],
  ['peak_tree_rss_mb', 'tree RSS MB'],
  ['time_top_maxrss_mb', 'top RSS MB'],
];

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Round half to even, as Python's format() does, so the tables match the ones already published.
const fixed = (x, d) => {
  const scaled = x * 10 ** d;
  const floor = Math.floor(scaled);
  const even = scaled - floor === 0.5 ? (floor % 2 ? floor + 1 : floor) : Math.round(scaled);
  return (even / 10 ** d).toFixed(d);
};

function stat(values) {
  const med = median(values);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return [med, lo, hi, ((hi - lo) / med) * 100];
}

export function analyze(rows) {
  const out = [];
  const cells = new Map();
  for (const r of rows) {
    const key = `${r.arm}\t${r.provider}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(r);
  }
  const med = new Map();
  out.push('| arm | provider | n | all passed | tests | ' + METRICS.map(([, n]) => `${n} median (min–max, spread)`).join(' | ') + ' |');
  out.push('|---|---|---|---|---|' + '---|'.repeat(METRICS.length));
  const keys = [...cells.keys()].sort((a, b) => {
    const [aa, ap] = a.split('\t');
    const [ba, bp] = b.split('\t');
    return ap === bp ? aa.localeCompare(ba) : ap.localeCompare(bp);
  });
  for (const key of keys) {
    const rs = cells.get(key);
    const [arm, provider] = key.split('\t');
    const ok = rs.every((r) => r.rc === 0 && r.tests && !r.tests.includes('failed'));
    const tests = [...new Set(rs.map((r) => r.tests))].join('/');
    const parts = METRICS.map(([m]) => {
      const values = rs.map((r) => r[m]).filter((v) => typeof v === 'number');
      if (!values.length) return 'n/a';
      const s = stat(values);
      med.set(`${key}\t${m}`, s[0]);
      const d = m === 'wall_s' ? 2 : 0;
      return `${fixed(s[0], d)} (${fixed(s[1], d)}–${fixed(s[2], d)}, ${fixed(s[3], 1)}%)`;
    });
    out.push(`| ${arm} | ${provider} | ${rs.length} | ${ok ? 'True' : 'False'} | ${tests} | ${parts.join(' | ')} |`);
  }
  out.push('');
  for (const provider of ['v8', 'istanbul']) {
    for (const [a, b] of [
      ['B', 'C'],
      ['A', 'C'],
      ['A', 'B'],
    ]) {
      const ka = `${a}\t${provider}`;
      const kb = `${b}\t${provider}`;
      if (!med.has(`${ka}\twall_s`) || !med.has(`${kb}\twall_s`)) continue;
      const line = [`${provider}: ${b} vs ${a}`];
      for (const [m, n] of METRICS) {
        const x = med.get(`${ka}\t${m}`);
        const y = med.get(`${kb}\t${m}`);
        if (x === undefined || y === undefined) continue;
        const pct = ((y - x) / x) * 100;
        line.push(`${n} ${fixed(x, 2)} -> ${fixed(y, 2)} (${pct >= 0 ? '+' : ''}${fixed(pct, 1)}%)`);
      }
      out.push(line.join('; '));
    }
  }
  return out.join('\n');
}

export const readJsonl = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

if (isMain(import.meta.url)) {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error('usage: node analyze.mjs <runs-N.jsonl>');
    process.exit(2);
  }
  console.log(analyze(readJsonl(path)));
}
