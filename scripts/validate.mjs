import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { ROOT, HEXAGRAM_NAMES, isMain, loadRecords, relatedLines, same, stemFor, stringList, validateData } from './hexagram.mjs';
import { TRIGRAM_TABLE } from './lines-from-trigrams.mjs';

export const HEADINGS = [
  '一句话神韵', '认卦：为什么是这个样子', '记忆锚点（故事）', '卦辞与彖、象',
  '六爻：一条时间线', '易混淆对比', '关系网络', '识卦小练习', '本卦启示',
];
export const WARNINGS = [
  'M1 校验 64 卦数据、来源目次与爻标签、引用路径及泰卦正文模板；其他卦正文不在本阶段范围内。',
  '来源目次与爻标签校对不等于多底本全文审核；候选来源许可及引用对应关系仍待负责人确认（存疑），不得视为已通过内容审核。',
  '故事人物真实性、解读准确性、练习答案正确性及多厂商多轮审核不由本脚本判定；状态保持 draft。',
];

// Ignore comments and fenced examples so they cannot masquerade as chapter sections.
function prose(markdown) {
  let fence;
  return markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n').filter(line => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length
        && line.slice(match[0].length).trim() === '') fence = undefined;
      return false;
    }
    if (match) { fence = match[1]; return false; }
    return true;
  }).join('\n');
}
function text(markdown) {
  return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '')
    .replace(/^[ \t]*#{1,6}[^\n]*$/gm, '').replace(/[*_`>#|\s-]/g, '');
}
function substantive(markdown) {
  const value = text(markdown);
  return /[\p{L}\p{N}]/u.test(value) && !/^(待补充|待完善|TODO|TBD|存疑)[。.!！…]*$/i.test(value);
}

export function validateChapter(data, markdown) {
  const errors = [];
  if (typeof markdown !== 'string') return ['正文不存在或不是文本'];
  const normalized = markdown.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return ['正文缺少 YAML frontmatter'];
  let meta;
  try { meta = parse(match[1]); } catch (error) { return [`frontmatter 无法解析：${error.message}`]; }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return ['frontmatter 必须为映射'];
  for (const field of ['id', 'name', 'symbol', 'status', 'keywords']) {
    if (!same(meta[field], data?.[field])) errors.push(`frontmatter ${field} 与 YAML 不一致`);
  }
  const refs = meta.references ?? meta.reference;
  if (!stringList(refs) || !same(refs, data?.references)
    || (meta.reference !== undefined && !same(meta.reference, data?.references))) {
    errors.push('frontmatter references/reference 与 YAML 不一致');
  }
  const body = prose(normalized.slice(match[0].length));
  const headings = [...body.matchAll(/^ {0,3}##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)];
  if (!same(headings.map(item => item[1]), HEADINGS)) errors.push('九个二级板块标题及顺序必须与 STYLE 完全一致');
  const sections = new Map(headings.map((item, index) => [item[1], body.slice(
    item.index + item[0].length, headings[index + 1]?.index ?? body.length,
  ).trim()]));
  for (const heading of HEADINGS) {
    if (!substantive(sections.get(heading) ?? '')) errors.push(`板块缺少实质内容：${heading}`);
  }
  const spirit = (sections.get(HEADINGS[0]) ?? '').split(/\n\s*\n/)[0];
  if ([...text(spirit)].length > 30) errors.push('一句话神韵首段超过 30 字（不计空白及 Markdown 标记）');
  if (!(sections.get(HEADINGS[2]) ?? '').includes('【设想】')) errors.push('记忆锚点故事必须标注【设想】');
  const exercise = sections.get(HEADINGS[7]) ?? '';
  const answerStart = exercise.search(/答案/);
  const questions = answerStart < 0 ? exercise : exercise.slice(0, answerStart);
  const count = [...questions.matchAll(/^\s*(?:\d+[.、)]|[一二三][、.]|#{3,6}\s*第?[123一二三]\s*[题问]|[题问]\s*[123一二三])[ \t]*\S.+$/gm)].length;
  if (count < 2 || count > 3) errors.push('识卦小练习应含 2–3 道编号题目');
  if (answerStart < 0 || !substantive(exercise.slice(answerStart + 2))) errors.push('识卦小练习须另附非空答案');
  return errors;
}

export function validateInlineSymbols(markdown, label = '正文', data) {
  const body = prose(markdown.replace(/^---\n[\s\S]*?\n---\n/, value => value.replace(/[^\n]/g, '')))
    .replace(/`[^`\n]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_]/g, '');
  const names = [...HEXAGRAM_NAMES].sort((a, b) => b.length - a.length);
  const namePattern = new RegExp(`(${names.join('|')})(?:卦)?[\\s（(\\[“「『]*$`);
  const errors = [];
  for (const [index, line] of body.split('\n').entries()) {
    for (const match of line.matchAll(/[䷀-䷿]/gu)) {
      const name = line.slice(0, match.index).match(namePattern)?.[1];
      if (!name) {
        errors.push(`${label}:${index + 1}：行内卦符 ${match[0]} 前缺少可核对的卦名`);
        continue;
      }
      const id = HEXAGRAM_NAMES.indexOf(name) + 1;
      const expected = String.fromCodePoint(0x4dc0 + id - 1);
      if (match[0] !== expected) errors.push(`${label}:${index + 1}：${name}（第 ${id} 卦）行内卦符应为 ${expected}，实际 ${match[0]}`);
    }
  }
  if (data?.id === 11) {
    const compact = body.replace(/\s/g, '');
    for (const [prefix, id, location] of [
      ['错卦：', data.cuo, '错卦：否'],
      ['综卦：', data.zong, '综卦：否'],
      ['互卦(?:：|为)', data.hu, '互卦：归妹'],
      ['泰vs', 63, '泰 vs 既济'],
    ]) {
      const name = HEXAGRAM_NAMES[id - 1];
      const symbol = String.fromCodePoint(0x4dc0 + id - 1);
      const pattern = new RegExp(`${prefix}${name}[（(]${symbol}[）)]`);
      if (!pattern.test(compact)) errors.push(`${label}：${location}须标出正确卦名与卦符 ${name}（${symbol}）`);
    }
  }
  return errors;
}

const within = (root, target) => {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
};

// Both lexical traversal and symlinks must stay inside the repository.
export async function validateReferences(data, index, root = ROOT) {
  const errors = [];
  if (!index || typeof index !== 'object' || Array.isArray(index)) return ['引用索引必须为 id 到记录的映射'];
  if (!stringList(data?.references)) return ['references 必须为非空字符串数组'];
  const canonicalRoot = await realpath(root);
  for (const id of data.references) {
    const record = Object.hasOwn(index, id) ? index[id] : undefined;
    if (!record || typeof record.path !== 'string' || !record.path.trim()) {
      errors.push(`引用记录缺失或缺少 path：${id}`);
      continue;
    }
    const target = resolve(root, record.path);
    if (!within(root, target)) { errors.push(`引用 path 越出根目录：${id}`); continue; }
    try {
      if (!within(canonicalRoot, await realpath(target))) errors.push(`引用实际路径越出根目录：${id}`);
      else if (!(await stat(target)).isFile()) errors.push(`引用 path 不是文件：${id}`);
    } catch { errors.push(`引用 path 不存在或不可读：${id} (${record.path})`); }
  }
  return errors;
}

const validId = id => Number.isInteger(id) && id >= 1 && id <= 64;
const bits = (value, length) => Array.isArray(value) && value.length === length
  && value.every(bit => bit === 0 || bit === 1);
const expectedIds = Array.from({ length: 64 }, (_, i) => i + 1);
const normalizeSourceName = value => typeof value === 'string'
  ? [...value].map(char => ({ 訟: '讼', 師: '师', 謙: '谦', 隨: '随', 蠱: '蛊', 臨: '临',
    觀: '观', 賁: '贲', 剝: '剥', 復: '复', 頤: '颐', 過: '过', 離: '离', 恆: '恒',
    遯: '遁', 壯: '壮', 晉: '晋', 損: '损', 漸: '渐', 歸: '归', 豐: '丰', 兌: '兑',
    渙: '涣', 節: '节', 無: '无', 濟: '济', 習: '习' })[char] ?? char).join('').replace(/^习坎$/, '坎')
  : undefined;

function datasetStats(records) {
  const data = records.map(record => record?.data).filter(Boolean);
  const byId = new Map(data.map(item => [item.id, item]));
  let zongPairs = 0;
  let cuoPairs = 0;
  for (let id = 1; id <= 63; id += 2) {
    const a = byId.get(id); const b = byId.get(id + 1);
    if (!a || !b) continue;
    if (a.zong === b.id && b.zong === a.id) zongPairs++;
    else if (a.cuo === b.id && b.cuo === a.id) cuoPairs++;
  }
  return {
    total: records.length,
    upper: data.filter(item => item.section === '上经').length,
    lower: data.filter(item => item.section === '下经').length,
    pairs: zongPairs + cuoPairs, zongPairs, cuoPairs,
    selfZong: data.filter(item => item.zong === item.id).length,
  };
}

export function validateDataset(records, sourceHeaders) {
  const errors = [];
  const expectedTrigrams = { 乾: '111', 坤: '000', 震: '100', 巽: '011', 坎: '010', 离: '101', 艮: '001', 兑: '110' };
  const trigrams = Object.entries(TRIGRAM_TABLE ?? {});
  if (trigrams.length !== 8
    || trigrams.some(([name, value]) => !bits(value?.lines, 3) || value.lines.join('') !== expectedTrigrams[name])
    || new Set(trigrams.map(([, value]) => value.lines.join(''))).size !== 8) {
    errors.push('八卦表必须包含乾坤震巽坎离艮兑八种正确且不重复的三位数值 0/1');
    // Invalid trigram entries can otherwise make validateData throw.
    return errors;
  }
  if (!Array.isArray(records)) return [...errors, '卦数据 records 必须为数组'];
  const byId = new Map(); const byLines = new Map();
  const names = new Set(); const combinations = new Set(); const files = new Set();
  for (const record of records) {
    const data = record?.data;
    const label = record?.file ?? '未知文件';
    errors.push(...validateData(data).map(error => `${label}：${error}`));
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    if (files.has(label)) errors.push(`重复文件名：${label}`);
    files.add(label);
    if (validId(data.id)) {
      if (byId.has(data.id)) errors.push(`重复 ID：${data.id}`);
      else byId.set(data.id, data);
      if (label !== `${stemFor(data.id)}.yaml`) errors.push(`${label}：文件名应为 ${stemFor(data.id)}.yaml`);
    }
    if (names.has(data.name)) errors.push(`${label}：重复卦名 ${data.name}`);
    names.add(data.name);
    const combination = `${data.lower}/${data.upper}`;
    if (combinations.has(combination)) errors.push(`${label}：重复上下卦组合 ${combination}`);
    combinations.add(combination);
    if (bits(data.lines, 6)) {
      const key = data.lines.join('');
      if (byLines.has(key)) errors.push(`${label}：重复六爻 ${key}`);
      else byLines.set(key, data.id);
    }
  }
  const missing = expectedIds.filter(id => !byId.has(id));
  if (records.length !== 64) errors.push(`卦数据应为 64 条，实际 ${records.length} 条`);
  if (missing.length) errors.push(`缺失 ID：${missing.join('、')}`);
  const stats = datasetStats(records);
  if (stats.upper !== 30 || stats.lower !== 34) errors.push(`上下经数量应为 30/34，实际 ${stats.upper}/${stats.lower}`);
  for (const [id, data] of byId) {
    if (!bits(data.lines, 6)) continue;
    for (const [field, lines] of Object.entries(relatedLines(data.lines))) {
      const target = byLines.get(lines.join(''));
      if (!validId(target)) errors.push(`${id} ${field}：推导结果缺少目标卦`);
      else if (data[field] !== target) errors.push(`${id} ${field}：应为 ${target}，实际 ${data[field]}`);
      if (field !== 'hu' && byId.has(data[field]) && byId.get(data[field])[field] !== id) {
        errors.push(`${id} ${field}：错/综关系必须对合互指`);
      }
    }
  }
  for (let id = 1; id <= 63; id += 2) {
    const a = byId.get(id); const b = byId.get(id + 1);
    if (!a || !b) continue;
    if (!((a.zong === b.id && b.zong === a.id) || (a.cuo === b.id && b.cuo === a.id))) {
      errors.push(`奇偶卦对 ${id}/${id + 1} 必须综互指或错互指`);
    }
  }
  if (!missing.length && records.length === 64
    && (stats.zongPairs !== 28 || stats.cuoPairs !== 4 || stats.selfZong !== 8)) {
    errors.push(`卦对统计应为 28 综对、4 错对、8 自综，实际 ${stats.zongPairs}/${stats.cuoPairs}/${stats.selfZong}`);
  }

  const entries = sourceHeaders?.entries;
  if (!Array.isArray(entries)) return [...errors, '来源目次证据缺失：sourceHeaders.entries 必须为数组'];
  const sourceIds = new Set();
  if (entries.length !== 64) errors.push(`来源目次应为 64 条，实际 ${entries.length} 条`);
  for (const source of entries) {
    if (!validId(source?.id)) { errors.push('来源目次 id 必须为 1–64 整数'); continue; }
    const { id } = source;
    if (sourceIds.has(id)) errors.push(`来源目次重复 ID：${id}`);
    sourceIds.add(id);
    const expectedName = HEXAGRAM_NAMES[id - 1];
    if (normalizeSourceName(source.source_name) !== expectedName) errors.push(`来源 ${id}：source_name 与通行卦序不符`);
    for (const field of ['canonical_name', 'nameNormalized']) {
      if (source[field] !== undefined && source[field] !== expectedName) errors.push(`来源 ${id}：${field} 与通行卦序不符`);
    }
    if (source.symbol !== String.fromCodePoint(0x4dc0 + id - 1)) errors.push(`来源 ${id}：symbol 与卦序不符`);
    if (['path', 'blob'].some(field => typeof source[field] !== 'string' || !source[field].trim())) {
      errors.push(`来源 ${id}：缺少 path/blob 源头证据`);
    }
    const patterns = [/^初([九六])$/, /^([九六])二$/, /^([九六])三$/, /^([九六])四$/, /^([九六])五$/, /^上([九六])$/];
    const labels = source.line_labels;
    const matches = Array.isArray(labels) && labels.length === 6
      ? labels.map((label, i) => typeof label === 'string' ? label.match(patterns[i]) : null) : [];
    const validLabels = matches.length === 6 && matches.every(Boolean);
    if (!validLabels) errors.push(`来源 ${id}：line_labels 必须按初二三四五上排列，且各含九或六`);
    const lower = normalizeSourceName(source.lower); const upper = normalizeSourceName(source.upper);
    if (!Object.hasOwn(expectedTrigrams, lower) || !Object.hasOwn(expectedTrigrams, upper)) errors.push(`来源 ${id}：上下卦名称无效`);
    const data = byId.get(id);
    if (!data) continue;
    if (data.lower !== lower || data.upper !== upper) errors.push(`来源 ${id}：上下卦与 YAML 不符`);
    // Derive polarity directly from source labels, never from the YAML trigrams.
    if (validLabels && !same(matches.map(match => match[1] === '九' ? 1 : 0), data.lines)) {
      errors.push(`来源 ${id}：爻标签阴阳与 YAML lines 不符`);
    }
  }
  const missingSources = expectedIds.filter(id => !sourceIds.has(id));
  if (missingSources.length) errors.push(`来源目次缺失 ID：${missingSources.join('、')}`);
  return errors;
}

export async function validateProject() {
  const errors = [];
  let records = []; let sourceHeaders;
  try { records = await loadRecords(); }
  catch (error) { errors.push(`无法读取卦数据：${error.message}`); }
  try { sourceHeaders = JSON.parse(await readFile(resolve(ROOT, 'references/sources/hexagram-headers.json'), 'utf8')); }
  catch (error) { errors.push(`无法读取来源目次证据：${error.message}`); }
  const datasetErrors = validateDataset(records, sourceHeaders);
  errors.push(...datasetErrors);
  let taiChapter = false;
  const tai = records.find(record => record.data?.id === 11)?.data;
  if (tai) {
    try {
      const chapterErrors = validateChapter(tai, await readFile(resolve(ROOT, 'content/hexagrams/11-tai.md'), 'utf8'));
      errors.push(...chapterErrors.map(error => `泰卦正文：${error}`));
      taiChapter = chapterErrors.length === 0;
    } catch (error) { errors.push(`无法读取泰卦正文：${error.message}`); }
  }
  try {
    for (const path of await readdir(resolve(ROOT, 'content'), { recursive: true })) {
      if (!path.endsWith('.md')) continue;
      const markdown = await readFile(resolve(ROOT, 'content', path), 'utf8');
      errors.push(...validateInlineSymbols(markdown, `content/${path}`, path === 'hexagrams/11-tai.md' ? tai : undefined));
    }
  } catch (error) { errors.push(`无法校验正文行内卦符：${error.message}`); }
  try {
    const index = parse(await readFile(resolve(ROOT, 'references/index.yaml'), 'utf8'));
    if (!index || typeof index !== 'object' || Array.isArray(index)) errors.push('引用索引必须为 id 到记录的映射');
    else for (const { file, data } of records) {
      errors.push(...(await validateReferences(data, index)).map(error => `${file}：${error}`));
    }
  } catch (error) { errors.push(`无法校验引用索引：${error.message}`); }
  const summary = {
    ...datasetStats(records),
    relationships: datasetErrors.length === 0 ? records.length * 3 : null,
    sourceChecked: datasetErrors.length === 0 ? sourceHeaders.entries.length : null,
    taiChapter,
  };
  return { errors, warnings: [...WARNINGS], summary };
}

if (isMain(import.meta.url)) {
  try {
    const result = await validateProject();
    for (const warning of result.warnings) console.warn(`警告：${warning}`);
    for (const error of result.errors) console.error(`错误：${error}`);
    const s = result.summary;
    console.log(`M1：${s.total} 卦（上经 ${s.upper} / 下经 ${s.lower}）；${s.pairs}/32 卦对（综 ${s.zongPairs} / 错 ${s.cuoPairs}；自综 ${s.selfZong}）；错综互 ${s.relationships ?? '未通过'}/192；来源目次与爻标签 ${s.sourceChecked ?? '未通过'}/64；泰卦正文 ${s.taiChapter ? '通过' : '未通过'}。`);
    if (result.errors.length) process.exitCode = 1;
    else console.log('M1 数据、来源结构校对与泰卦模板校验通过（draft；多底本内容审核及许可确认待完成）。');
  } catch (error) {
    for (const warning of WARNINGS) console.warn(`警告：${warning}`);
    console.error(`校验失败：${error.message}`);
    process.exitCode = 1;
  }
}
