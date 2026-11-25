import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export const TRIGRAM_TABLE = parse(readFileSync(new URL('../data/trigrams.yaml', import.meta.url), 'utf8'));

export function linesFromTrigrams(lower, upper) {
  for (const name of [lower, upper]) {
    if (!Object.hasOwn(TRIGRAM_TABLE, name)) throw new Error(`未知三画卦：${name}`);
  }
  return [...TRIGRAM_TABLE[lower].lines, ...TRIGRAM_TABLE[upper].lines];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('用法：node scripts/lines-from-trigrams.mjs 下卦 上卦');
    console.log(JSON.stringify(linesFromTrigrams(process.argv[2], process.argv[3])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
