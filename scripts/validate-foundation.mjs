import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { ROOT, isMain } from './hexagram.mjs';
import { validateReferences } from './validate.mjs';
import { compactQuote } from './validate-trigram-sources.mjs';

export const CHAPTER_PATH = 'content/foundations/01-lines.md';
const hanCount = text => [...text.matchAll(/\p{Script=Han}/gu)].length;
const plain = text => text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '');
const displayQuote = text => compactQuote(text).replace(/[畫處為來徃]/g, char => ({ 畫: '画', 處: '处', 為: '为', 來: '来', 徃: '往' })[char]);

export async function loadFoundationEvidence() {
  const registry = parse(await readFile(resolve(ROOT, 'references/foundation-01-citations.yaml'), 'utf8'));
  const files = {};
  for (const record of Object.values(registry.citations)) {
    for (const path of [...(record.paths ?? []), ...(record.witnesses ?? []).map(witness => witness.path)]) {
      files[path] ??= await readFile(resolve(ROOT, path), 'utf8');
    }
  }
  return { registry, files };
}

export function validateFoundationChapter(markdown, registry, files) {
  const errors = [];
  const metaMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!metaMatch) return { errors: ['第一章缺少frontmatter'], metrics: {} };
  const meta = parse(metaMatch[1]);
  const body = markdown.slice(metaMatch[0].length);
  const definitions = Object.fromEntries([...body.matchAll(/^\[\^([^\]]+)\]:\s*(.+)$/gm)].map(match => [match[1], match[2]]));
  const referenced = body.replace(/^\[\^[^\]]+\]:.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  const narrative = referenced.replace(/\[\^[^\]]+\]/g, '');
  const bridgeStart = narrative.indexOf('## 经的两层：卦辞与爻辞');
  const checkStart = narrative.indexOf('## 怎样检查自己读对了');
  const exerciseStart = narrative.indexOf('## 练习');
  const answerStart = narrative.indexOf('## 参考答案');
  const namingStart = narrative.indexOf('## 九与六怎样组成爻名');
  if (!(namingStart >= 0 && bridgeStart > namingStart && checkStart > bridgeStart && exerciseStart > checkStart && answerStart > exerciseStart)) errors.push('第一章应按九六命名、经的两层、读图检查、练习、参考答案排序');
  const bridge = narrative.slice(bridgeStart, checkStart);
  const prose = narrative.slice(0, exerciseStart).replace(/^\|.*$/gm, '').replace(/^#{1,6}.*$/gm, '');
  const metrics = { visibleHan: hanCount(plain(narrative)), proseHan: hanCount(plain(prose)), bridgeHan: hanCount(plain(bridge)) };
  if (metrics.visibleHan < 1950 || metrics.visibleHan > 2500) errors.push('第一章需约2000–2500汉字（下限允许50字浮动；含正文、标题、表格与练习答案，不计脚注及draft备注）');
  if (metrics.bridgeHan < 250 || metrics.bridgeHan > 500) errors.push('经的两层需约半页（250–500汉字）');
  if (meta.chapter !== 1 || meta.status !== 'draft') errors.push('第一章元数据须为chapter 1、status draft');
  if (/六亲|世应|纳甲|六神|蓍草|老阳|少阳|老阴|少阴|河图|洛书/.test(body)) errors.push('第一章不得引入占筮体系或九六起源的展开');
  if (!body.includes('【设想】') || !body.includes('林舟')) errors.push('本章设想须沿用林舟设定并标注');
  if (!body.includes('/hexagrams/foundation-01-tai.svg') || !body.includes('/hexagrams/practice-01.svg')) errors.push('第一章缺少带位名主图或匿名练习图');
  const images = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  if (new Set(images).size !== images.length) errors.push('同一章不得重复使用同一张卦图');
  const headings = [...body.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  if (headings.at(-1) !== '参考答案') errors.push('最后一个板块必须是参考答案');
  for (const [label, section] of [['练习', narrative.slice(exerciseStart, answerStart)], ['答案', narrative.slice(answerStart)]]) {
    if ([...section.matchAll(/^\d+\. /gm)].length !== 3) errors.push(`第一章${label}须有3道编号项目`);
  }
  const blanks = narrative.match(/补全爻名：([^\n]+)/)?.[1] ?? '';
  if (!blanks.includes('初□、□二、□三、□四、□五、上□')) errors.push('练习2的每一空均须填写九或六');
  const rows = [...body.matchAll(/^\| (上位|五位|四位|三位|二位|初位)：([^|]+) \| ([阴阳]) \| ([^|]+) \|$/gm)];
  const headers = JSON.parse(files['references/sources/hexagram-headers.json']);
  const taiLabels = headers.entries.find(entry => entry.id === 11).line_labels;
  const tai = parse(files['data/hexagrams/11-tai.yaml']);
  if (rows.length !== 6 || rows.some((row, i) => row[2].trim() !== taiLabels[5 - i]
    || row[3] !== (tai.lines[5 - i] ? '阳' : '阴')
    || !row[4].includes(i < 3 ? '上卦坤' : '下卦乾'))) errors.push('六爻表须自上而下展示真实泰卦爻名、阴阳及上下分组');
  const citations = registry?.citations ?? {};
  const kinds = { B1: '传文', B2: '疏', B3: '疏', B4: '结构数据', B5: '经文', B6: '注' };
  if (!Array.isArray(meta.references) || Object.keys(citations).length !== 6
    || meta.references.length !== 6 || new Set(meta.references).size !== 6
    || meta.references.some(id => !citations[id])) errors.push('第一章须完整登记B1–B6六组引用');
  for (const [id, citation] of Object.entries(citations)) {
    if (citation.kind !== kinds[citation.marker]) errors.push(`${id}：传文、经文、注疏与结构资料的类别不符`);
    if (citation.kind !== '结构数据' && !citation.witnesses?.length) errors.push(`${id}：缺少原文底本`);
    const ids = Object.entries(registry.footnotes ?? {}).filter(([, source]) => source === id).map(([note]) => note);
    if (citation.kind === '结构数据' && citation.print_footnote === false) {
      if (ids.length) errors.push(`${id}：结构表资料不应生成正文脚注`);
    } else if (!ids.length || !ids.some(note => definitions[note] && referenced.includes(`[^${note}]`))) errors.push(`${id}：正文脚注或出处定义缺失`);
    for (const path of citation.paths ?? []) if (!files[path]) errors.push(`${id}：结构资料 ${path} 缺失`);
    if (citation.quote && displayQuote(citation.quote) !== displayQuote(citation.source_quote)) errors.push(`${id}：展示引文与底本原字的转换不一致`);
    for (const witness of citation.witnesses ?? []) {
      const source = files[witness.path];
      const [first, last] = witness.lines;
      if (!source || !Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || !witness.locator) { errors.push(`${id}：底本或定位缺失`); continue; }
      const fragment = source.split('\n').slice(first - 1, last).join('\n');
      if (!compactQuote(fragment).includes(compactQuote(witness.source_quote ?? citation.source_quote))) errors.push(`${id}：原文未见于指定底本行`);
    }
    if (citation.quote && !plain(body).includes(citation.quote.replace(/[。]$/, ''))) errors.push(`${id}：登记引文未出现在章稿`);
  }
  if (/\bB[1-6]\b/.test(referenced)) errors.push('正文不得显示内部B1–B6引用号');
  for (const section of referenced.split(/^## /m)) {
    const used = new Set();
    for (const [, note] of section.matchAll(/\[\^([^\]]+)\]/g)) {
      const source = registry.footnotes?.[note];
      if (!source || !definitions[note]) errors.push(`脚注${note}缺少登记或定义`);
      else if (used.has(source)) errors.push('同一来源在同一节内只能标注一次');
      used.add(source);
    }
  }
  return { errors, metrics };
}

if (isMain(import.meta.url)) {
  try {
    const { registry, files } = await loadFoundationEvidence();
    const markdown = await readFile(resolve(ROOT, CHAPTER_PATH), 'utf8');
    const result = validateFoundationChapter(markdown, registry, files);
    const metadata = parse(markdown.match(/^---\n([\s\S]*?)\n---/)[1]);
    const index = parse(await readFile(resolve(ROOT, 'references/index.yaml'), 'utf8'));
    result.errors.push(...await validateReferences(metadata, index));
    const chapters = (await readdir(resolve(ROOT, 'content/foundations'))).filter(file => file.endsWith('.md'));
    if (chapters.length !== 1 || chapters[0] !== '01-lines.md') result.errors.push('当前只授权第一章试点');
    for (const error of result.errors) console.error(`错误：${error}`);
    if (result.errors.length) process.exitCode = 1;
    else console.log(`第一章校验通过：全章 ${result.metrics.visibleHan} 汉字，叙述正文 ${result.metrics.proseHan}，经的两层 ${result.metrics.bridgeHan}；6组引用、3题及答案，draft；仅第一章。`);
  } catch (error) {
    console.error(`第一章校验失败：${error.message}`);
    process.exitCode = 1;
  }
}
