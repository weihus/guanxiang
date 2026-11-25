import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { TRIGRAM_TABLE, linesFromTrigrams } from './lines-from-trigrams.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DATA_DIR = resolve(ROOT, 'data/hexagrams');
export const DATA_PATH = resolve(DATA_DIR, '11-tai.yaml');
export const TRIGRAMS = Object.freeze(Object.fromEntries(Object.entries(TRIGRAM_TABLE).map(([name, value]) => [value.lines.join(''), name])));
export const HEXAGRAM_NAMES = '乾 坤 屯 蒙 需 讼 师 比 小畜 履 泰 否 同人 大有 谦 豫 随 蛊 临 观 噬嗑 贲 剥 复 无妄 大畜 颐 大过 坎 离 咸 恒 遁 大壮 晋 明夷 家人 睽 蹇 解 损 益 夬 姤 萃 升 困 井 革 鼎 震 艮 渐 归妹 丰 旅 巽 兑 涣 节 中孚 小过 既济 未济'.split(' ');
export const SLUGS = 'qian kun zhun meng xu song shi bi xiaoxu lv tai pi tongren dayou qian yu sui gu lin guan shike bi bo fu wuwang daxu yi daguo kan li xian heng dun dazhuang jin mingyi jiaren kui jian xie sun yi guai gou cui sheng kun jing ge ding zhen gen jian guimei feng lv xun dui huan jie zhongfu xiaoguo jiji weiji'.split(' ');
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const stringList = value => Array.isArray(value) && value.length > 0
  && value.every(item => typeof item === 'string' && item.trim().length > 0)
  && new Set(value).size === value.length;
export const isMain = url => Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(url);
export const loadData = async () => parse(await readFile(DATA_PATH, 'utf8'));
export const sectionFor = id => id <= 30 ? '上经' : '下经';
export const stemFor = id => `${String(id).padStart(2, '0')}-${SLUGS[id - 1]}`;

export async function loadRecords(directory = DATA_DIR) {
  const files = (await readdir(directory)).filter(file => /\.ya?ml$/.test(file)).sort();
  return Promise.all(files.map(async file => ({ file, data: parse(await readFile(resolve(directory, file), 'utf8')) })));
}

export function relatedLines(lines) {
  return {
    cuo: lines.map(line => 1 - line),
    zong: [...lines].reverse(),
    hu: [1, 2, 3, 2, 3, 4].map(index => lines[index]),
  };
}

export function validateData(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['数据必须为 YAML 映射'];
  const validId = Number.isInteger(data.id) && data.id >= 1 && data.id <= 64;
  if (!validId) errors.push('id 必须为 1–64 的整数');
  if (validId && data.name !== HEXAGRAM_NAMES[data.id - 1]) errors.push('name 与通行卦序不符');
  if (validId && data.symbol !== String.fromCodePoint(0x4dc0 + data.id - 1)) errors.push('symbol 与卦序不符');
  if (data.status !== 'draft') errors.push('M1 status 必须保持 draft');
  if (validId && data.section !== sectionFor(data.id)) errors.push('section 与上经 1–30 / 下经 31–64 不符');
  for (const field of ['keywords', 'references']) {
    if (!stringList(data[field])) errors.push(`${field} 必须为非空且不重复的字符串数组`);
  }
  const validLines = Array.isArray(data.lines) && data.lines.length === 6 && data.lines.every(line => line === 0 || line === 1);
  if (!validLines) errors.push('lines 必须为六个严格数值 0/1，自下而上');
  const validTrigrams = [data.lower, data.upper].every(name => Object.hasOwn(TRIGRAM_TABLE, name));
  if (!validTrigrams) errors.push('lower、upper 必须为八卦名称');
  if (validLines && validTrigrams && !same(data.lines, linesFromTrigrams(data.lower, data.upper))) errors.push('lines 与上下卦不一致（下卦三爻在前）');
  for (const field of ['cuo', 'zong', 'hu']) {
    if (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 64) errors.push(`${field} 必须为 1–64 的整数`);
  }
  return errors;
}

const escapeXML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);

export function renderInlineSVG(lines) {
  if (![3, 6].includes(lines.length) || !lines.every(line => line === 0 || line === 1)) throw new Error('行内卦图须为三爻或六爻');
  const step = lines.length === 3 ? 30 : 12;
  const rows = lines.map((line, index) => {
    const y = 64 - index * step;
    return line
      ? `<rect x="8" y="${y}" width="80" height="4"/>`
      : `<rect x="8" y="${y}" width="32" height="4"/><rect x="56" y="${y}" width="32" height="4"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72"><g fill="#222">${rows.join('')}</g></svg>\n`;
}

export function renderSVG(data, { annotated = false, anonymous = false } = {}) {
  const errors = validateData(data);
  if (errors.length) throw new Error(errors.join('\n'));
  const positions = ['初', '二', '三', '四', '五', '上'];
  const x = annotated ? 84 : 24;
  const rows = data.lines.map((line, index) => {
    const y = 164 - index * 28;
    const rects = line === 1
      ? `<rect x="${x}" y="${y}" width="192" height="8"/>`
      : `<rect x="${x}" y="${y}" width="80" height="8"/><rect x="${x + 112}" y="${y}" width="80" height="8"/>`;
    return `  <g data-line="${index + 1}" data-value="${line}">${rects}</g>`;
  });
  const labels = annotated ? data.lines.map((line, index) => {
    const y = 168 - index * 28;
    const label = index === 0 || index === 5 ? `${positions[index]}${line ? '九' : '六'}` : `${line ? '九' : '六'}${positions[index]}`;
    return `  <text x="60" y="${y}" dy=".35em" text-anchor="end">${positions[index]}</text><text x="298" y="${y}" dy=".35em">${label}</text>`;
  }).join('\n') : '';
  const title = anonymous ? '练习卦图' : `${escapeXML(data.name)}卦`;
  const description = anonymous ? '请观察六层爻画，辨认阴阳并从下往上编号。'
    : `自下而上：${data.lines.map(line => line ? '阳' : '阴').join('、')}；下${escapeXML(data.lower)}上${escapeXML(data.upper)}。`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${annotated ? 360 : 240} 204" role="img" aria-labelledby="hexagram-title hexagram-desc">
  <title id="hexagram-title">${title}</title>
  <desc id="hexagram-desc">${description}</desc>
  <style>rect { fill: #222; } text { fill: #333; font-family: 'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif; font-size: 20px; }</style>
${rows.join('\n')}
${labels}
</svg>
`;
}
