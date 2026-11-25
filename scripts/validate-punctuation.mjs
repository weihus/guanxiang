import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, isMain } from './hexagram.mjs';

export function validateChinesePunctuation(markdown, label = '正文') {
  const masked = markdown.replace(/^---\n[\s\S]*?\n---\n/, value => value.replace(/[^\n]/g, ''))
    .replace(/<!--[\s\S]*?-->/g, value => value.replace(/[^\n]/g, ''));
  let fence = null;
  const sourceLines = masked.split('\n');
  const lines = sourceLines.map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { fence = fence ? null : marker[1][0]; return ''; }
    if (fence || /^\s*\|?[\s:|\-]+\|?\s*$/.test(line)) return '';
    return line.replace(/`[^`]*`/g, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*\[\^[^\]]+\]:\s*/, '')
      .replace(/https?:\/\/[^\s<>)]+/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '');
  });
  const errors = [];
  const spacingLines = lines.map(line => line.replace(/[*_~]/g, '').replace(/\[\^[^\]]+\]/g, ''));
  const blockStart = /^\s*(?:#{1,6}(?:\s|$)|>|\||(?:[-+*]|\d+[.)])\s|\[\^[^\]]+\]:)/;
  for (let i = 0; i < spacingLines.length; i++) {
    const line = /^\s*\|/.test(sourceLines[i])
      ? spacingLines[i].split('|').map(cell => cell.trim()).join('|') : spacingLines[i];
    const softBreak = /[。！？；”]$/.test(line) && spacingLines[i + 1]?.trim()
      && !blockStart.test(sourceLines[i]) && !blockStart.test(sourceLines[i + 1]);
    if (/[。！？；”][^\S\r\n]/u.test(line) || softBreak) {
      errors.push(`${label}:${i + 1}：中文句末标点后不得有空格（含加粗、脚注标记后的空格及段内软换行）`);
    }
  }
  let start = 0;
  const check = end => {
    const paragraph = lines.slice(start, end).join('\n');
    if (/\p{Script=Han}/u.test(paragraph) && /["':;]/.test(paragraph)) {
      errors.push(`${label}:${start + 1}：中文段落含直引号或半角冒号／分号，请使用中文标点`);
    }
  };
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || !lines[i].trim()) { check(i); start = i + 1; }
  }
  return errors;
}

if (isMain(import.meta.url)) {
  try {
    const paths = ['content/index.md'];
    for (const directory of ['content/foundations', 'content/hexagrams']) {
      for (const file of await readdir(resolve(ROOT, directory))) if (file.endsWith('.md')) paths.push(`${directory}/${file}`);
    }
    const errors = [];
    for (const path of paths) errors.push(...validateChinesePunctuation(await readFile(resolve(ROOT, path), 'utf8'), path));
    for (const error of errors) console.error(`错误：${error}`);
    if (errors.length) process.exitCode = 1;
    else console.log(`中文标点校验通过：${paths.length} 个正文文件；代码、URL与Markdown语法除外。`);
  } catch (error) {
    console.error(`中文标点校验失败：${error.message}`);
    process.exitCode = 1;
  }
}
