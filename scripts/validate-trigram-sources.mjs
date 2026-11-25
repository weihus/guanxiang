import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { ROOT, isMain } from './hexagram.mjs';
import { TRIGRAM_TABLE } from './lines-from-trigrams.mjs';

export const compactQuote = text => text.replace(/<pb:[^>]+>/g, '').replace(/^#.*$/gm, '')
  .replace(/爲/g, '為').replace(/説/g, '說').replace(/兑/g, '兌')
  .replace(/[\s¶，、。；：:（）()\/《》]/g, '');
const simplified = text => compactQuote(text).replace(/[為順動麗說風電澤長離兌稱謂]/g, char => ({
  為: '为', 順: '顺', 動: '动', 麗: '丽', 說: '说', 風: '风', 電: '电', 澤: '泽', 長: '长', 離: '离', 兌: '兑', 稱: '称', 謂: '谓',
})[char]);
const list = value => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.length > 0);

export async function loadTrigramEvidence() {
  const registry = parse(await readFile(resolve(ROOT, 'references/shuogua-citations.yaml'), 'utf8'));
  const texts = {};
  for (const [key, source] of Object.entries(registry.sources)) texts[key] = await readFile(resolve(ROOT, source.path), 'utf8');
  return { registry, texts };
}

export function validateTrigramSources(table, registry, texts) {
  const errors = [];
  if (!table || Object.keys(table).length !== 8) return ['八卦来源数据须有八条'];
  if (!registry?.citations || !registry?.sources) return ['《说卦》引文登记缺失'];
  for (const [id, citation] of Object.entries(registry.citations)) {
    if (typeof citation.quote !== 'string' || !citation.quote.trim() || !list(citation.witnesses)) {
      errors.push(`${id}：缺少引文或底本`);
      continue;
    }
    if (!['传文', '疏', '音义'].includes(citation.kind)) errors.push(`${id}：须区分传文、疏、音义`);
    if (citation.kind === '传文' && (citation.work !== '周易·说卦传'
      || !['wyg', 'tls'].every(key => citation.witnesses.includes(key)))) errors.push(`${id}：传文须有两个已登记转录的文字证据`);
    if (citation.kind !== '传文' && citation.work !== '周易正义·说卦') errors.push(`${id}：释义须标注注疏来源`);
    for (const key of citation.witnesses) {
      const text = texts[key];
      const location = citation.locations?.[key];
      if (!registry.sources[key] || typeof text !== 'string') { errors.push(`${id}：底本 ${key} 不存在`); continue; }
      const range = location?.lines;
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger)
        || range[0] < 1 || range[1] < range[0] || range[1] > text.split('\n').length || !location.page) {
        errors.push(`${id}：底本 ${key} 行号或页码缺失`);
        continue;
      }
      const page = [...text.split('\n').slice(0, range[0]).join('\n').matchAll(/<pb:([^>]+)>/g)].at(-1)?.[1];
      if (page !== location.page) errors.push(`${id}：底本 ${key} 页码与行号不一致`);
      const excerpt = text.split('\n').slice(range[0] - 1, range[1]).join('\n');
      if (!compactQuote(excerpt).includes(compactQuote(citation.quote))) errors.push(`${id}：引文不在底本 ${key} 指定行内`);
    }
  }
  for (const [name, data] of Object.entries(table)) {
    if (data.status !== 'draft') errors.push(`${name}：角色数据须保持 draft`);
    for (const field of ['name', 'nature', 'virtue', 'family_role', 'personality']) {
      const item = data[field];
      const validValue = field === 'nature' ? list(item?.value) : typeof item?.value === 'string' && item.value.trim().length > 0;
      if (!validValue || !list(item?.references)) { errors.push(`${name}.${field}：缺少值或出处`); continue; }
      if (field === 'name' && item.value !== name) errors.push(`${name}.name：卦名须与键名一致`);
      if (field === 'personality' && item.kind !== '白话助记') errors.push(`${name}.personality：须标为白话助记`);
      const expectedField = field === 'personality' ? 'virtue' : field;
      const primary = item.references.map(id => registry.citations[id]).filter(ref => ref?.kind === '传文' && ref.field === expectedField && ref.trigram === name);
      if (!primary.length) errors.push(`${name}.${field}：缺少本卦对应的《说卦传》原文依据`);
      for (const id of item.references) {
        const ref = registry.citations[id];
        if (!ref || ref.trigram !== name) errors.push(`${name}.${field}：出处 ${id} 不存在或不属本卦`);
      }
      if (field !== 'personality') {
        const values = primary.flatMap(ref => {
          const quote = simplified(ref.quote);
          if (field === 'name') return quote.startsWith(name) ? [name] : [];
          if (field === 'nature') return quote.startsWith(`${name}为`) ? quote.slice(name.length + 1).split('为') : [];
          if (field === 'virtue') return quote.startsWith(name) && quote.endsWith('也') ? [quote.slice(name.length, -1)] : [];
          const match = quote.match(/故(?:称乎|谓之)(.+)$/);
          return match && quote.startsWith(name) ? [match[1]] : [];
        });
        const actual = field === 'nature' ? item.value : [item.value];
        const expected = new Set(values);
        if (new Set(actual).size !== actual.length || actual.length !== expected.size
          || actual.some(value => !expected.has(simplified(value)))) errors.push(`${name}.${field}：字段值与对应传文引句的取值不符`);
      }
    }
    const gloss = data.virtue?.gloss;
    if (gloss && (!list(gloss.references) || gloss.references.some(id => {
      const ref = registry.citations[id];
      return !ref || ref.trigram !== name || !['疏', '音义'].includes(ref.kind);
    }))) errors.push(`${name}.virtue.gloss：释字或注音须引用本卦注疏／音义`);
  }
  return errors;
}

if (isMain(import.meta.url)) {
  try {
    const { registry, texts } = await loadTrigramEvidence();
    const errors = validateTrigramSources(TRIGRAM_TABLE, registry, texts);
    for (const error of errors) console.error(`错误：${error}`);
    if (errors.length) process.exitCode = 1;
    else console.log(`八卦来源校验通过：8 卦 × 5 字段，${Object.keys(registry.citations).length} 条引文与本地底本指定行匹配；性格为白话助记，状态 draft。`);
  } catch (error) {
    console.error(`八卦来源校验失败：${error.message}`);
    process.exitCode = 1;
  }
}
