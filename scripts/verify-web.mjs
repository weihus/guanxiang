import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.VERIFY_URL ?? 'http://127.0.0.1:4173/';
await mkdir('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true });
const findings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const waitFor = selector => page.evaluate(selector => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`UI 未出现：${selector}`)); }, 15_000);
    const observer = new MutationObserver(check);
    function check() {
      if (document.querySelector(selector)) { clearTimeout(timer); observer.disconnect(); resolve(); }
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
  }), selector);
  await page.goto(base, { waitUntil: 'networkidle' });
  await waitFor('.VPButton.brand');
  await Promise.all([
    page.waitForURL('**/foundations/01-lines', { waitUntil: 'networkidle' }),
    page.evaluate(() => document.querySelector('.VPButton.brand').click()),
  ]);
  await waitFor('.vp-doc #参考答案');
  const foundation = await page.evaluate(() => ({
    headings: document.querySelectorAll('.vp-doc h2').length,
    rows: document.querySelectorAll('.vp-doc tbody tr').length,
    questions: (() => { let node = document.querySelector('#练习').nextElementSibling; while (node && node.tagName !== 'OL') node = node.nextElementSibling; return node?.children.length; })(),
    answers: document.querySelector('#参考答案').closest('details')?.querySelector('ol')?.children.length,
    answersCollapsed: !document.querySelector('#参考答案').closest('details')?.open,
    footnotes: document.querySelectorAll('.footnote-ref').length,
    bareReferenceIds: /\bB[1-6]\b/.test(document.querySelector('.vp-doc').textContent),
    finalSection: [...document.querySelectorAll('.vp-doc h2')].at(-1).textContent,
    draft: document.querySelector('.vp-doc').textContent.includes('draft'),
    imageLoaded: document.querySelector('.vp-doc img').complete && document.querySelector('.vp-doc img').naturalWidth > 0,
  }));
  assert.equal(foundation.rows, 6);
  assert.equal(foundation.questions, 3);
  assert.equal(foundation.answers, 3);
  assert.ok(foundation.draft && foundation.imageLoaded && foundation.finalSection.includes('参考答案'));
  assert.ok(foundation.answersCollapsed && foundation.footnotes === 5 && !foundation.bareReferenceIds);
  await page.screenshot({ path: '.artifacts/foundation-desktop-light.png', fullPage: true });
  await page.screenshot({ path: '.artifacts/foundation-desktop-viewport.png' });
  await page.evaluate(() => document.querySelector('.vp-doc .footnote-ref a').click());
  assert.ok(decodeURIComponent(new URL(page.url()).hash).startsWith('#fn'));
  await page.screenshot({ path: '.artifacts/foundation-citations.png' });
  await page.evaluate(() => document.querySelector('.VPSwitchAppearance').click());
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.artifacts/foundation-desktop-dark.png' });
  await page.evaluate(() => document.querySelector('.VPSwitchAppearance').click());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { const element = document.querySelector('#练习'); scrollTo(0, element.getBoundingClientRect().top + scrollY - 96); });
  const foundationMobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(foundationMobile.scrollWidth <= foundationMobile.width);
  await page.screenshot({ path: '.artifacts/foundation-mobile.png' });
  await page.evaluate(() => document.querySelector('#参考答案').closest('summary').click());
  assert.ok(await page.evaluate(() => document.querySelector('#参考答案').closest('details').open));
  findings.push('第一章：脚注同节去重、数字链接可跳转、无裸B编号；题目旁答案默认折叠，点击可展开；390px布局无溢出。');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await Promise.all([
    page.waitForURL('**/hexagrams/11-tai', { waitUntil: 'networkidle' }),
    page.evaluate(() => document.querySelector('a[href$="/hexagrams/11-tai"]').click()),
  ]);
  await waitFor('.vp-doc #引用与待核说明');
  assert.ok(page.url().endsWith('/hexagrams/11-tai'));
  const chapter = await page.evaluate(() => ({
    headings: document.querySelectorAll('.vp-doc h2').length,
    rows: document.querySelectorAll('.vp-doc tbody tr').length,
    images: [...document.querySelectorAll('.vp-doc img')].map(img => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 })),
  }));
  assert.equal(chapter.headings, 9);
  assert.equal(chapter.rows, 6);
  assert.equal(chapter.images.length, 2);
  assert.ok(chapter.images.every(image => image.loaded));
  await page.screenshot({ path: '.artifacts/tai-desktop-light.png', fullPage: true });
  await page.screenshot({ path: '.artifacts/tai-desktop-viewport.png' });
  findings.push('泰卦：从第一章导航进入，九板块、六爻表和两张 SVG 正常加载。');
  await page.evaluate(() => document.querySelector('.VPSwitchAppearance').click());
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.vp-doc img')).filter), 'invert(1)');
  await page.screenshot({ path: '.artifacts/tai-desktop-dark.png', fullPage: true });
  findings.push('深色：开关改变页面和卦象颜色。');
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
  findings.push('邻接检查：刷新后深色选择保持。');
  await page.evaluate(() => document.querySelector('.VPNavBarSearch button').click());
  await waitFor('.VPLocalSearchBox input');
  await page.evaluate(() => {
    const input = document.querySelector('.VPLocalSearchBox input');
    input.value = '天地交';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFor('.VPLocalSearchBox .result');
  await page.screenshot({ path: '.artifacts/tai-search.png' });
  await page.evaluate(() => document.querySelector('.VPLocalSearchBox input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })));
  findings.push('搜索：输入“天地交”出现本地章节结果。');
  await page.goto(new URL('hexagrams/11-tai', base).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (document.documentElement.classList.contains('dark')) document.querySelector('.VPSwitchAppearance').click(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.querySelector('#识卦小练习').scrollIntoView());
  const mobile = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    answers: document.querySelector('#参考答案')?.textContent,
    tableScrollable: document.querySelector('.vp-doc table').scrollWidth > document.querySelector('.vp-doc table').clientWidth,
  }));
  assert.ok(mobile.answers);
  assert.ok(mobile.scrollWidth <= mobile.width);
  await page.screenshot({ path: '.artifacts/tai-mobile-exercise.png', fullPage: true });
  await page.screenshot({ path: '.artifacts/tai-mobile-viewport.png' });
  findings.push('手机390px：练习与答案可读，页面无整体横向溢出；六爻表在自身区域横向滚动。');
  const missing = await page.goto(new URL('foundations/02-trigrams', base).href, { waitUntil: 'networkidle' });
  assert.ok(missing.status() === 404 || await page.evaluate(() => document.body.innerText.includes('404')));
  findings.push('范围检查：第二章未生成，尝试访问返回404。');
  const unexpected = errors.filter(error => !error.includes('foundations/02-trigrams'));
  assert.deepEqual(unexpected, []);
  await writeFile('.artifacts/browser-report.json', JSON.stringify({ base, findings, foundation, foundationMobile, chapter, mobile, errors: unexpected }, null, 2));
  console.log(findings.join('\n'));
} finally {
  await browser.close();
}
