import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ROOT, isMain, loadRecords, renderInlineSVG, renderSVG, stemFor } from './hexagram.mjs';
import { TRIGRAM_TABLE } from './lines-from-trigrams.mjs';

export async function generateSVG() {
  const records = await loadRecords();
  const outputs = [];
  for (const { data } of records) {
    const svg = renderSVG(data);
    for (const directory of ['web/public/hexagrams', 'pdf/assets']) {
      const output = `${directory}/${stemFor(data.id)}.svg`;
      const target = resolve(ROOT, output);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, svg, 'utf8');
      outputs.push(output);
    }
  }
  const teaching = [
    { id: 11, name: 'foundation-01-tai', options: { annotated: true } },
    { id: 4, name: 'practice-01', options: { anonymous: true } },
    { id: 63, name: 'practice-tai', options: { anonymous: true } },
  ];
  for (const item of teaching) {
    const data = records.find(record => record.data.id === item.id).data;
    const svg = renderSVG(data, item.options);
    for (const directory of ['web/public/hexagrams', 'pdf/assets']) {
      const output = `${directory}/${item.name}.svg`;
      await writeFile(resolve(ROOT, output), svg, 'utf8');
      outputs.push(output);
    }
  }
  const symbols = [
    ...Object.values(TRIGRAM_TABLE).map(data => ({ symbol: data.symbol, lines: data.lines })),
    ...records.map(record => ({ symbol: record.data.symbol, lines: record.data.lines })),
  ];
  for (const directory of ['web/public/hexagrams/inline', 'pdf/assets/inline']) {
    await mkdir(resolve(ROOT, directory), { recursive: true });
    for (const data of symbols) {
      const name = `u${data.symbol.codePointAt(0).toString(16)}.svg`;
      await writeFile(resolve(ROOT, directory, name), renderInlineSVG(data.lines), 'utf8');
    }
  }
  return outputs;
}

if (isMain(import.meta.url)) {
  try {
    const outputs = await generateSVG();
    console.log(`已生成64卦普通SVG、3张教学/练习图及72个行内卦符SVG；两端资源一致（主图每端${outputs.length / 2}份）。`);
  } catch (error) {
    console.error(`SVG 生成失败：${error.message}`);
    process.exitCode = 1;
  }
}
