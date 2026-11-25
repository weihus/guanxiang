import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, isMain, loadRecords, sectionFor } from './hexagram.mjs';
import { validateProject } from './validate.mjs';

export async function generateReferenceData() {
  const result = await validateProject();
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  const data = (await loadRecords()).map(record => record.data).sort((a, b) => a.id - b.id);
  const byId = new Map(data.map(entry => [entry.id, entry]));
  const headings = ['id', 'name', 'symbol', 'section', 'lower', 'upper', 'lines_bottom_to_top', 'cuo_id', 'cuo_name', 'zong_id', 'zong_name', 'hu_id', 'hu_name', 'status'];
  const rows = data.map(entry => [
    entry.id, entry.name, entry.symbol, entry.section, entry.lower, entry.upper, entry.lines.join(''),
    entry.cuo, byId.get(entry.cuo).name, entry.zong, byId.get(entry.zong).name, entry.hu, byId.get(entry.hu).name, entry.status,
  ]);
  const csv = [headings, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
  const edges = data.flatMap(entry => ['cuo', 'zong', 'hu'].map(type => ({ source: entry.id, target: entry[type], type })));
  const pairs = [];
  for (let id = 1; id < 64; id += 2) {
    const first = byId.get(id);
    const second = byId.get(id + 1);
    pairs.push({
      ids: [id, id + 1],
      section: sectionFor(id),
      types: ['zong', 'cuo'].filter(type => first[type] === id + 1 && second[type] === id),
    });
  }
  const graph = {
    schemaVersion: 1,
    lineOrder: 'bottom-to-top',
    sections: [
      { name: '上经', first: 1, last: 30, count: data.filter(entry => entry.section === '上经').length },
      { name: '下经', first: 31, last: 64, count: data.filter(entry => entry.section === '下经').length },
    ],
    nodes: data.map(({ id, name, symbol, section, lower, upper, lines, status }) => ({ id, name, symbol, section, lower, upper, lines, status })),
    edges,
    pairs,
  };
  const directory = resolve(ROOT, 'data/generated');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'hexagrams.csv'), csv);
  await writeFile(resolve(directory, 'relations.json'), JSON.stringify(graph, null, 2) + '\n');
  return { rows: rows.length, edges: edges.length, pairs: pairs.length };
}

if (isMain(import.meta.url)) {
  try {
    const result = await generateReferenceData();
    console.log(`已生成速查表 ${result.rows} 行、关系数据 ${result.edges} 条有向边、${result.pairs} 对序卦配对（保留自综、自互）。`);
  } catch (error) {
    console.error(`速查表与关系数据生成失败：${error.message}`);
    process.exitCode = 1;
  }
}
