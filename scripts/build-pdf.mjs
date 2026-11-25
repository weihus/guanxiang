import { execFileSync } from 'node:child_process';
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setPrintedPageLabels } from './pdf-page-labels.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(root, 'pdf', 'dist');
const modes = process.argv.length === 2 ? ['draft', 'release']
  : process.argv[2] === '--mode' && process.argv.length === 4
    ? process.argv[3] === 'all' ? ['draft', 'release'] : [process.argv[3]]
    : [];
const reading = process.env.PDF_EDITION === 'reading';
const setupHint = '请先运行 npm run pdf:setup，然后重新构建 PDF。';

function executable(label, override, candidates) {
  const paths = override ? [resolve(root, override)] : candidates.map((path) => join(root, path));
  for (const path of paths) {
    try {
      accessSync(path, constants.X_OK);
      if (statSync(path).isFile()) return path;
    } catch {
      // Try the next supported installation layout.
    }
  }
  throw new Error(`${label} 未安装或不可执行（已检查：${paths.join('、')}）。${setupHint}`);
}

async function build(mode) {
  const typOutput = join(outputDir, `${reading ? 'zhouyi-reading' : 'zhouyi-book'}-${mode}.typ`);
  const pdfOutput = join(outputDir, `${reading ? 'zhouyi-reading' : 'zhouyi-book'}-${mode}.pdf`);
  const pandoc = executable('Pandoc', process.env.PANDOC_PATH, [
    '.tools/pandoc/bin/pandoc',
    '.tools/pandoc/pandoc',
  ]);
  const typst = executable('Typst', process.env.TYPST_PATH, ['.tools/typst/typst']);
  const fonts = join(root, '.tools', 'fonts');
  for (const name of [
    'SourceHanSerifSC-Regular.otf',
    'SourceHanSerifSC-Bold.otf',
    'SourceHanSansSC-Regular.otf',
    'SourceHanSansSC-Bold.otf',
    'NotoSansSymbols2-Regular.ttf',
  ]) {
    const path = join(fonts, name);
    if (!existsSync(path) || statSync(path).size === 0) {
      throw new Error(`缺少 PDF 字体：${path}。${setupHint}`);
    }
  }
  if (!existsSync(join(root, 'pdf', 'assets', '11-tai.svg'))) {
    throw new Error('缺少 pdf/assets/11-tai.svg，请先运行项目的卦象 SVG 生成脚本。');
  }

  mkdirSync(outputDir, { recursive: true });
  // Remove stale artifacts so a failed build cannot look successful.
  rmSync(pdfOutput, { force: true });
  rmSync(typOutput, { force: true });
  execFileSync(pandoc, [
    ...(reading
      ? ['content/reading/01-tai.md', 'content/reading/02-trigrams.md', 'content/reading/03-lines.md', 'content/reading/04-yi.md', 'content/reading/05-water-fire.md', 'content/reading/06-jiji-weiji.md', 'content/reading/07-well.md', 'content/reading/08-text-and-commentary.md', 'content/reading/09-xian.md', 'content/reading/10-turn-the-figure.md', 'content/reading/11-paired-lines.md', 'content/reading/12-overlapping-trigrams.md', 'content/reading/13-position-and-center.md', 'content/reading/14-sequence.md', 'content/reading/15-read-a-hexagram.md']
      : ['content/foundations/01-lines.md', 'content/hexagrams/11-tai.md']),
    '--file-scope',
    '--from=markdown-smart+native_spans',
    '-V', `mode:${mode}`,
    ...(reading ? ['-V', 'reading=true'] : []),
    '-t', 'typst',
    '--standalone',
    '--template', 'pdf/template.typ',
    '--lua-filter', 'pdf/filter.lua',
    '--output', typOutput,
  ], { cwd: root, stdio: 'inherit', env: { ...process.env, PDF_MODE: mode } });
  execFileSync(typst, [
    'compile',
    '--ignore-system-fonts',
    '--root', root,
    '--font-path', fonts,
    typOutput,
    pdfOutput,
  ], { cwd: root, stdio: 'inherit' });
  if (!existsSync(pdfOutput) || statSync(pdfOutput).size === 0) {
    throw new Error(`PDF 未生成：${pdfOutput}。${setupHint}`);
  }
  await setPrintedPageLabels(pdfOutput);
  if (mode === 'draft' && !reading) {
    copyFileSync(pdfOutput, join(outputDir, 'zhouyi-book.pdf'));
    copyFileSync(typOutput, join(outputDir, 'zhouyi-book.typ'));
  }
  console.log(`已生成 ${typOutput}\n已生成 ${pdfOutput}`);
}

try {
  if (!modes.length || modes.some(mode => !['draft', 'release'].includes(mode))) throw new Error('用法：npm run pdf -- --mode draft|release|all');
  for (const mode of modes) await build(mode);
} catch (error) {
  console.error(`PDF 构建失败：${error.message}`);
  process.exitCode = 1;
}
