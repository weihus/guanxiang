import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { ROOT, HEXAGRAM_NAMES, sectionFor, stemFor, same } from './hexagram.mjs';
import { linesFromTrigrams } from './lines-from-trigrams.mjs';

// Reviewed stored IDs stay separate from the validator's six-line calculations.
const relations = [
  [2, 1, 1], [1, 2, 2], [50, 4, 23], [49, 3, 24],
  [35, 6, 38], [36, 5, 37], [13, 8, 24], [14, 7, 23],
  [16, 10, 38], [15, 9, 37], [12, 12, 54], [11, 11, 53],
  [7, 14, 44], [8, 13, 43], [10, 16, 40], [9, 15, 39],
  [18, 18, 53], [17, 17, 54], [33, 20, 24], [34, 19, 23],
  [48, 22, 39], [47, 21, 40], [43, 24, 2], [44, 23, 2],
  [46, 26, 53], [45, 25, 54], [28, 27, 2], [27, 28, 1],
  [30, 29, 27], [29, 30, 28], [41, 32, 44], [42, 31, 43],
  [19, 34, 44], [20, 33, 43], [5, 36, 39], [6, 35, 40],
  [40, 38, 64], [39, 37, 63], [38, 40, 64], [37, 39, 63],
  [31, 42, 24], [32, 41, 23], [23, 44, 1], [24, 43, 1],
  [26, 46, 53], [25, 45, 54], [22, 48, 37], [21, 47, 38],
  [4, 50, 44], [3, 49, 43], [57, 52, 39], [58, 51, 40],
  [54, 54, 64], [53, 53, 63], [59, 56, 28], [60, 55, 28],
  [51, 58, 38], [52, 57, 37], [55, 60, 27], [56, 59, 27],
  [62, 61, 27], [61, 62, 28], [64, 64, 64], [63, 63, 63],
];
const simplifyTrigram = name => name.replace('離', '离').replace('兌', '兑');
const source = JSON.parse(await readFile(resolve(ROOT, 'references/sources/hexagram-headers.json'), 'utf8'));
const entries = source.entries;
if (entries.length !== 64 || new Set(entries.map(entry => entry.id)).size !== 64) throw new Error('来源必须有64个不同卦序');

let created = 0;
let retained = 0;
for (let id = 1; id <= 64; id++) {
  const entry = entries.find(entry => entry.id === id);
  if (!entry || entry.canonical_name !== HEXAGRAM_NAMES[id - 1]) throw new Error(`来源卦序或名称不符：${id}`);
  const lower = simplifyTrigram(entry.lower);
  const upper = simplifyTrigram(entry.upper);
  const lines = linesFromTrigrams(lower, upper);
  if (!same(lines, entry.line_labels.map(label => label.includes('九') ? 1 : 0))) throw new Error(`八卦表与来源爻位不符：${id}`);
  const [cuo, zong, hu] = relations[id - 1];
  const facts = { id, name: entry.canonical_name, symbol: entry.symbol, lines, lower, upper, cuo, zong, hu };
  const target = resolve(ROOT, `data/hexagrams/${stemFor(id)}.yaml`);
  let exists;
  try { await access(target); exists = true; } catch { exists = false; }
  if (exists) {
    const existing = parse(await readFile(target, 'utf8'));
    for (const [key, value] of Object.entries(facts)) {
      if (!same(existing[key], value)) throw new Error(`${target} 的 ${key} 与生成输入不同；保留原文件，请先裁决`);
    }
    if (existing.section === undefined) {
      existing.section = sectionFor(id);
      await writeFile(target, stringify(existing, { lineWidth: 0, defaultStringType: 'PLAIN' }));
    } else if (existing.section !== sectionFor(id)) throw new Error(`${target} 上下经归属错误`);
    retained++;
    continue;
  }
  const data = {
    ...facts,
    status: 'draft',
    keywords: [`下${lower}`, `上${upper}`],
    section: sectionFor(id),
    references: ['hexagram-structure'],
  };
  await writeFile(target, stringify(data, { lineWidth: 0, defaultStringType: 'PLAIN' }));
  created++;
}
console.log(`由八卦表和来源上下卦生成：新增 ${created} 卦，保留 ${retained} 卦；全部 lines 与来源六爻位名一致。`);
