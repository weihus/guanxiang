import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { ROOT, loadRecords, relatedLines, renderInlineSVG, renderSVG, validateData } from './hexagram.mjs';
import { HEADINGS, validateChapter, validateDataset, validateInlineSymbols, validateProject, validateReferences } from './validate.mjs';
import { TRIGRAM_TABLE } from './lines-from-trigrams.mjs';
import { loadTrigramEvidence, validateTrigramSources } from './validate-trigram-sources.mjs';
import { CHAPTER_PATH, loadFoundationEvidence, validateFoundationChapter } from './validate-foundation.mjs';
import { validateChinesePunctuation } from './validate-punctuation.mjs';

const fixture = Promise.all([
  loadRecords(),
  readFile(resolve(ROOT, 'references/sources/hexagram-headers.json'), 'utf8').then(JSON.parse),
]);
const datasetFixture = async () => structuredClone(await fixture);
const dataAt = (records, id) => records.find(record => record.data.id === id).data;

function recomputeRelations(records) {
  const byLines = new Map(records.map(({ data }) => [data.lines.join(''), data.id]));
  for (const { data } of records) {
    for (const [field, lines] of Object.entries(relatedLines(data.lines))) data[field] = byLines.get(lines.join(''));
  }
}

// These fixtures are the actual M1 files; mutations stay in memory.
test('full dataset accepts only odd/even pairs, self-zong pairs and one-way hu', async () => {
  const [records, source] = await datasetFixture();
  assert.deepEqual(validateDataset(records, source), []);
  const qian = dataAt(records, 1); const kun = dataAt(records, 2);
  assert.equal(qian.zong, 1);
  assert.equal(kun.zong, 2);
  assert.equal(qian.cuo, 2);
  assert.equal(kun.cuo, 1);
  assert.notEqual(kun.zong, 3);
  assert.notEqual(kun.cuo, 3);
  const taiData = dataAt(records, 11);
  assert.notEqual(dataAt(records, taiData.hu).hu, 11);
  const result = await validateProject();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    total: 64, upper: 30, lower: 34, pairs: 32, zongPairs: 28, cuoPairs: 4,
    selfZong: 8, relationships: 192, sourceChecked: 64, taiChapter: true,
  });
  assert.ok(result.warnings.some(warning => warning.includes('候选来源许可')));
});

test('dataset rejects invalid IDs, missing IDs and duplicate identities', async () => {
  const [records, source] = await datasetFixture();
  const invalid = structuredClone(records); invalid[0].data.id = 0;
  assert.ok(validateDataset(invalid, source).some(error => error.includes('id 必须')));
  assert.ok(validateDataset(records.slice(1), source).some(error => error.includes('缺失 ID')));
  const duplicate = structuredClone(records); duplicate[1] = structuredClone(duplicate[0]);
  const errors = validateDataset(duplicate, source);
  for (const message of ['重复 ID', '重复卦名', '重复六爻', '重复上下卦组合', '重复文件名']) {
    assert.ok(errors.some(error => error.includes(message)), message);
  }
  assert.ok(validateDataset([], source).length < 10, 'empty data should produce aggregated errors');
});

test('dataset rejects wrong section, filename, canonical name and symbol', async () => {
  const [records, source] = await datasetFixture();
  dataAt(records, 31).section = '上经';
  records[0].file = 'wrong.yaml';
  dataAt(records, 1).name = '天';
  dataAt(records, 1).symbol = '䷁';
  const errors = validateDataset(records, source);
  for (const message of ['section', '上下经数量', '文件名', 'name', 'symbol']) {
    assert.ok(errors.some(error => error.includes(message)), message);
  }
});

test('dataset recomputes all three relations, enforces involution and rejects broken pairs', async () => {
  const [records, source] = await datasetFixture();
  for (const field of ['cuo', 'zong', 'hu']) {
    const changed = structuredClone(records);
    dataAt(changed, 11)[field] = 11;
    assert.ok(validateDataset(changed, source).some(error => error.includes(`11 ${field}：应为`)));
  }
  dataAt(records, 1).cuo = 3;
  const errors = validateDataset(records, source);
  assert.ok(errors.some(error => error.includes('对合互指')));
  assert.ok(errors.some(error => error.includes('奇偶卦对 1/2')));
});

test('source evidence catches two swapped structures even after relationships are recomputed', async () => {
  const [records, source] = await datasetFixture();
  const a = dataAt(records, 11); const b = dataAt(records, 12);
  for (const field of ['lines', 'lower', 'upper']) [a[field], b[field]] = [b[field], a[field]];
  recomputeRelations(records);
  assert.deepEqual(validateData(a), []);
  assert.deepEqual(validateData(b), []);
  const errors = validateDataset(records, source);
  assert.ok(errors.some(error => error.includes('来源 11：爻标签阴阳')));
  assert.ok(errors.some(error => error.includes('来源 12：上下卦')));
  assert.ok(!errors.some(error => /\b(?:cuo|zong|hu)：应为/.test(error)));
});

test('source labels require six valid positions and independently matching polarity', async () => {
  const [records, source] = await datasetFixture();
  for (const labels of [[], ['初九'], ['初九', '六二', '九三', '九四', '九五', '上九'],
    ['初九', '九三', '九二', '九四', '九五', '上九'],
    ['初九', '九二', '九三', '九四', '九五', '用九'],
    ['初九', '九二', null, '九四', '九五', '上九']]) {
    const changed = structuredClone(source);
    changed.entries.find(entry => entry.id === 1).line_labels = labels;
    assert.ok(validateDataset(records, changed).some(error => /来源 1：(?:line_labels|爻标签阴阳)/.test(error)));
  }
});

test('source evidence must be complete, unique and agree on identity and trigrams', async () => {
  const [records, source] = await datasetFixture();
  assert.ok(validateDataset(records).some(error => error.includes('来源目次证据缺失')));
  const missing = structuredClone(source); missing.entries.pop();
  assert.ok(validateDataset(records, missing).some(error => error.includes('来源目次缺失 ID')));
  const duplicate = structuredClone(source); duplicate.entries[1] = structuredClone(duplicate.entries[0]);
  assert.ok(validateDataset(records, duplicate).some(error => error.includes('来源目次重复 ID')));
  for (const [field, value, expected] of [
    ['source_name', '坤', 'source_name'], ['canonical_name', '坤', 'canonical_name'],
    ['symbol', '䷁', 'symbol'], ['lower', '離', '上下卦'], ['path', '', 'path/blob'], ['blob', null, 'path/blob'],
  ]) {
    const changed = structuredClone(source);
    changed.entries.find(entry => entry.id === 1)[field] = value;
    assert.ok(validateDataset(records, changed).some(error => error.includes(`来源 1：`) && error.includes(expected)), field);
  }
});

test('trigram table rejects malformed bits, duplicate structures and incorrect names', async () => {
  const [records, source] = await datasetFixture();
  const original = structuredClone(TRIGRAM_TABLE);
  try {
    for (const lines of [[1, 1], ['1', 1, 1], [0, 0, 0], null]) {
      TRIGRAM_TABLE.乾.lines = lines;
      assert.ok(validateDataset(records, source).some(error => error.includes('八卦表')));
    }
    TRIGRAM_TABLE.乾 = structuredClone(original.乾);
    TRIGRAM_TABLE.天 = TRIGRAM_TABLE.乾; delete TRIGRAM_TABLE.乾;
    assert.ok(validateDataset(records, source).some(error => error.includes('八卦表')));
  } finally {
    for (const name of Object.keys(TRIGRAM_TABLE)) delete TRIGRAM_TABLE[name];
    Object.assign(TRIGRAM_TABLE, original);
  }
});

const tai = () => ({
  id: 11, name: '泰', symbol: '䷊', lines: [1, 1, 1, 0, 0, 0],
  lower: '乾', upper: '坤', cuo: 12, zong: 12, hu: 54, status: 'draft', section: '上经',
  keywords: ['通'], references: ['test-source'],
});
function chapter(data = tai()) {
  const { id, name, symbol, status, keywords, references } = data;
  const sections = [
    '上下沟通起来了。', '三阳在下，三阴在上。', '【设想】小店店主开始听取店员的建议。',
    '测试用内容，不引用经文。', '初始、发展与转折需要一起观察。', '泰与否的上下卦不同。',
    '象数解读，非定论：错、综为否，互为归妹。',
    '1. 看三阳在下、三阴在上的卦象，说出卦名。\n2. 泰的错卦是什么？\n\n### 答案\n\n1. 泰。\n2. 否。',
    '保持沟通，及时调整。',
  ];
  return `---\n${stringify({ id, name, symbol, status, keywords, references })}---\n\n`
    + HEADINGS.map((heading, i) => `## ${heading}\n\n${sections[i]}`).join('\n\n');
}

test('valid draft passes; invalid relation ranges, polarity and numeric types fail', () => {
  assert.deepEqual(validateData(tai()), []);
  for (const field of ['cuo', 'zong', 'hu']) {
    const data = tai(); data[field] = 65;
    assert.ok(validateData(data).some(error => error.includes(field)));
  }
  assert.ok(validateData({ ...tai(), lines: [0, 0, 0, 1, 1, 1] }).some(error => error.includes('上下卦')));
  for (const value of ['1', true, null, 2]) {
    const data = tai(); data.lines[0] = value;
    assert.ok(validateData(data).some(error => error.includes('严格数值')));
  }
  assert.ok(validateData({ ...tai(), status: 'ai-reviewed' }).length);
});

test('SVG geometry puts solid yang at bottom and split yin at top', () => {
  const svg = renderSVG(tai());
  const rows = [...svg.matchAll(/<g data-line="(\d)" data-value="([01])">(.*?)<\/g>/g)];
  assert.equal(rows.length, 6);
  const ys = rows.map(row => Number(row[3].match(/y="(\d+)"/)[1]));
  assert.ok(ys.every((y, i) => i === 0 || y < ys[i - 1]));
  rows.forEach((row, i) => {
    const rects = [...row[3].matchAll(/<rect x="(\d+)" y="\d+" width="(\d+)" height="(\d+)"\/>/g)];
    assert.equal(rects.length, i < 3 ? 1 : 2);
    if (i >= 3) assert.ok(Number(rects[0][1]) + Number(rects[0][2]) < Number(rects[1][1]));
  });
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title id="hexagram-title">泰卦<\/title>/);
  assert.match(svg, /<desc id="hexagram-desc">/);
  assert.throws(() => renderSVG({ ...tai(), lines: [0, 0, 0, 1, 1, 1] }));
});

test('chapter rejects missing, reordered or empty sections and mismatched frontmatter', () => {
  const valid = chapter();
  assert.deepEqual(validateChapter(tai(), valid), []);
  assert.ok(validateChapter(tai(), valid.replace('## 易混淆对比', '### 易混淆对比')).length);
  assert.ok(validateChapter(tai(), valid.replace('## 易混淆对比', '## 关系网络')).length);
  assert.ok(validateChapter(tai(), valid.replace('保持沟通，及时调整。', '<!-- 还没写 -->')).length);
  assert.ok(validateChapter(tai(), valid.replace('name: 泰', 'name: 否')).length);
  assert.ok(validateChapter(tai(), valid.replace('【设想】', '')).length);
  assert.ok(validateChapter(tai(), valid.replace('上下沟通起来了。', '通'.repeat(31))).length);
  assert.ok(validateChapter(tai(), valid.replace(/### 答案[\s\S]*?(?=## 本卦启示)/, '')).length);
  const fake = valid.replace('## 易混淆对比\n\n泰与否的上下卦不同。', '```md\n## 易混淆对比\n\n假板块\n```');
  assert.ok(validateChapter(tai(), fake).length);
});

test('reference checker rejects missing records, missing files and root traversal without editing fixtures', async () => {
  assert.deepEqual(await validateReferences(tai(), { 'test-source': { path: 'docs/PRD.md' } }, ROOT), []);
  assert.ok((await validateReferences(tai(), {}, ROOT)).some(error => error.includes('记录缺失')));
  assert.ok((await validateReferences(tai(), { 'test-source': { path: 'docs/no-such-reference-m0.yaml' } }, ROOT)).some(error => error.includes('不存在')));
  assert.ok((await validateReferences(tai(), { 'test-source': { path: '../outside.md' } }, ROOT)).some(error => error.includes('越出')));
  assert.ok((await validateReferences(tai(), { 'test-source': { path: 'docs' } }, ROOT)).some(error => error.includes('不是文件')));
});

test('eight trigram metadata records have located sources without changing the M1 line table', async () => {
  const { registry, texts } = await loadTrigramEvidence();
  assert.deepEqual(validateTrigramSources(TRIGRAM_TABLE, registry, texts), []);
  assert.ok(validateTrigramSources({}, registry, texts).length);
});

test('trigram facts cannot silently substitute modern traits or another family role', async () => {
  const { registry, texts } = await loadTrigramEvidence();
  const table = structuredClone(TRIGRAM_TABLE);
  table.离.virtue.value = '聪明';
  table.坎.family_role.value = '长男';
  table.巽.nature.value.push('太阳');
  table.乾.personality.references = ['missing-source'];
  const errors = validateTrigramSources(table, registry, texts);
  for (const label of ['离.virtue', '坎.family_role', '巽.nature', '乾.personality']) assert.ok(errors.some(error => error.includes(label)), label);
});

test('trigram citations reject fabricated quotations, wrong pages and mislabeled commentary', async () => {
  const { registry, texts } = await loadTrigramEvidence();
  const altered = structuredClone(registry);
  altered.citations['shuogua-zhen-virtue'].quote = '震聪明也';
  altered.citations['shuogua-kun-family'].locations.wyg.page = 'wrong-page';
  altered.citations['shuogua-li-gloss'].kind = '传文';
  altered.citations['shuogua-li-gloss'].work = '周易·说卦传';
  const errors = validateTrigramSources(TRIGRAM_TABLE, altered, texts);
  for (const id of ['shuogua-zhen-virtue', 'shuogua-kun-family', 'shuogua-li-gloss']) assert.ok(errors.some(error => error.includes(id)), id);
});

test('trigram fields must match the quoted relation rather than an incidental substring', async () => {
  const { registry, texts } = await loadTrigramEvidence();
  const table = structuredClone(TRIGRAM_TABLE);
  table.乾.nature.value = ['乾'];
  table.坎.family_role.value = '男';
  table.坤.virtue.value = '坤';
  table.巽.nature.value = ['木'];
  const errors = validateTrigramSources(table, registry, texts);
  for (const label of ['乾.nature', '坎.family_role', '坤.virtue', '巽.nature']) assert.ok(errors.some(error => error.includes(label)), label);
});

const foundationFixture = async () => ({
  markdown: await readFile(resolve(ROOT, CHAPTER_PATH), 'utf8'),
  ...await loadFoundationEvidence(),
});

test('first chapter satisfies word count, chapter-end order and verified citations', async () => {
  const { markdown, registry, files } = await foundationFixture();
  assert.deepEqual(validateFoundationChapter(markdown, registry, files).errors, []);
  const tooShort = markdown.replace(/## 先认实线与断线[\s\S]*?(?=## 三画与六画各指什么)/, '## 先认实线与断线\n\n');
  const tooLong = `${markdown}\n${'字'.repeat(2500)}`;
  for (const changed of [tooShort, tooLong]) assert.ok(validateFoundationChapter(changed, registry, files).errors.some(error => error.includes('2000–2500')));
  const changed = markdown.replace('## 先认实线与断线', '## 六亲');
  assert.ok(validateFoundationChapter(changed, registry, files).errors.some(error => error.includes('占筮体系')));
  const extraEnd = `${markdown}\n## 章末之后的注释\n后补。`;
  assert.ok(validateFoundationChapter(extraEnd, registry, files).errors.some(error => error.includes('最后一个板块')));
});

test('first chapter rejects wrong line labels and missing or altered citation evidence', async () => {
  const { markdown, registry, files } = await foundationFixture();
  const wrongTable = markdown.replace('| 三位：九三 | 阳', '| 三位：六三 | 阴');
  assert.ok(validateFoundationChapter(wrongTable, registry, files).errors.some(error => error.includes('六爻表')));
  const changed = structuredClone(registry);
  changed.citations['foundation-six-positions'].kind = '传文';
  changed.citations['foundation-eight-base'].source_quote = '八卦爲五十四卦之本';
  const errors = validateFoundationChapter(markdown, changed, files).errors;
  assert.ok(errors.some(error => error.includes('类别不符')));
  assert.ok(errors.some(error => error.includes('原文未见')));
});

test('Chinese punctuation checks prose without treating markup, code or URLs as prose', () => {
  for (const text of ['中文说"原句"。', "中文说'原句'。", '中文:说明。', '中文;说明。', 'A "quote"\n中文段落。']) {
    assert.ok(validateChinesePunctuation(text).length, text);
  }
  assert.deepEqual(validateChinesePunctuation('---\ntitle: "中文"\n---\n中文：“原句”；说明。\n\n中文示例`value: "ok";`，见[资料](https://example.org/a)。\n\n[^n]: 中文脚注。'), []);
});

test('Chinese sentence endings reject rendered spaces and preserve Markdown boundaries', () => {
  for (const text of ['句末。 下一句。', '句末！\t下一句。', '句末？　下一句。', '句末； 下一句。', '“引用” 后续。', '**往上。** 首行。', '汇报。\n一个月后。', '句末。[^n] 下一句。', '| 原文 | 白话 |\n|---|---|\n| 经文。 | 句末。 下一句。 |']) {
    assert.ok(validateChinesePunctuation(text).some(error => error.includes('句末标点后不得有空格')), text);
  }
  for (const text of ['**往上。**首行。', '句末。\n\n下一段。', '句末。\n## 下一节', '1. 一项。\n2. 二项。', '| 原文 | 白话 |\n|---|---|\n| 经文。 | 白话。 |', '| 原文 | 白话 |\n|---|---|\n| 经文。<br> 下一行。 | 白话。 |', '句末。\n| 原文 |\n|---|\n| 内容。 |', '```text\n句末。 下一句。\n```', '中文`句末。 下一句。`。']) {
    assert.deepEqual(validateChinesePunctuation(text), [], text);
  }
});

test('chapter footnotes deduplicate a source within each section', async () => {
  const { markdown, registry, files } = await foundationFixture();
  const duplicate = markdown.replace('## 三画与六画各指什么', '## 三画与六画各指什么\n\n再次引用。[^c01-02]');
  assert.ok(validateFoundationChapter(duplicate, registry, files).errors.some(error => error.includes('同一来源')));
});

test('annotated teaching diagrams use thinner lines and anonymous exercises reveal no name', async () => {
  const records = await loadRecords();
  const diagram = renderSVG(dataAt(records, 11), { annotated: true });
  assert.match(diagram, /viewBox="0 0 360 204"/);
  assert.match(diagram, /height="8"/);
  for (const label of ['初九', '九二', '九三', '六四', '六五', '上六']) assert.ok(diagram.includes(`>${label}</text>`));
  const practice = renderSVG(dataAt(records, 4), { anonymous: true });
  assert.ok(!practice.includes('蒙') && !practice.includes('上九'));
});

test('all blanks ask for polarity names and structural references stay metadata-only', async () => {
  const { markdown, registry, files } = await foundationFixture();
  assert.ok(!markdown.includes('本书八卦及六十四卦结构表；《周易》乾、泰。'));
  assert.deepEqual(validateFoundationChapter(markdown, registry, files).errors, []);
  const mixedBlank = markdown.replace('□三、□四', '六□、□四');
  assert.ok(validateFoundationChapter(mixedBlank, registry, files).errors.some(error => error.includes('每一空')));
});

test('inline SVGs share one geometry style with three or six bottom-up rows', () => {
  const three = renderInlineSVG([1, 1, 1]);
  const six = renderInlineSVG([1, 0, 1, 0, 1, 0]);
  assert.match(three, /viewBox="0 0 96 72"/);
  assert.equal([...three.matchAll(/<rect/g)].length, 3);
  assert.equal([...six.matchAll(/<rect/g)].length, 9);
  assert.ok(!three.includes('<text') && !six.includes('<text'));
});

test('prose symbols follow King Wen order independently of trigram symbols', async () => {
  const records = await loadRecords();
  const markdown = records.map(({ data }) => `${data.name}（${String.fromCodePoint(0x4dc0 + data.id - 1)}）`).join('\n');
  assert.deepEqual(validateInlineSymbols(markdown), []);
  assert.deepEqual(validateInlineSymbols('乾 ☰，坤 ☷；乾 ䷀，**泰 vs 既济**（䷾）。'), []);
  assert.ok(validateInlineSymbols('既济（䷿）').some(error => error.includes('第 63 卦')));
  assert.deepEqual(validateInlineSymbols('大过（䷛）'), []);
  assert.ok(validateInlineSymbols('䷊').some(error => error.includes('缺少可核对的卦名')));
  assert.deepEqual(validateInlineSymbols('<!-- 既济（䷿） -->\n`既济（䷿）`\n```md\n既济（䷿）\n```'), []);
});

test('Tai comparison and each relationship require their own correct symbol', async () => {
  const markdown = await readFile(resolve(ROOT, 'content/hexagrams/11-tai.md'), 'utf8');
  assert.deepEqual(validateInlineSymbols(markdown, '泰', tai()), []);
  for (const [location, wrong] of [
    ['错卦：否（䷋）', '错卦：否（䷊）'],
    ['综卦：否（䷋）', '综卦：否（䷊）'],
    ['互卦为归妹（䷵）', '互卦为归妹（䷴）'],
    ['**泰 vs 既济**（䷾）', '**泰 vs 既济**（䷿）'],
  ]) {
    assert.ok(markdown.includes(location), location);
    assert.ok(validateInlineSymbols(markdown.replace(location, wrong), '泰', tai()).length >= 2, location);
    assert.ok(validateInlineSymbols(markdown.replace(location, location.replace(/[䷀-䷿]/u, '')), '泰', tai()).length, location);
  }
});
