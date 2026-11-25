import { defineConfig } from 'vitepress';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import footnote from 'markdown-it-footnote';

const tai = parse(readFileSync(new URL('../../data/hexagrams/11-tai.yaml', import.meta.url), 'utf8'));
const hasReadingPdf = existsSync(new URL('../public/zhouyi-reading.pdf', import.meta.url));
const base = process.env.SITE_BASE ?? '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('SITE_BASE 必须以 / 开头及结尾');

export default defineConfig({
  srcDir: '../content',
  vite: { publicDir: fileURLToPath(new URL('../public', import.meta.url)) },
  base,
  lang: 'zh-CN',
  title: '认卦',
  description: '从零读懂周易六十四卦 · 第一章试点与泰卦样章',
  cleanUrls: true,
  lastUpdated: false,
  markdown: {
    config(md) {
      md.use(footnote);
      md.core.ruler.push('fold-answers', state => {
        const html = (content: string) => {
          const token = new state.Token('html_block', '', 0);
          token.content = content;
          return token;
        };
        for (let i = state.tokens.length - 3; i >= 0; i--) {
          const token = state.tokens[i];
          if (token.type !== 'heading_open' || state.tokens[i + 1]?.content !== '参考答案') continue;
          const level = Number(token.tag.slice(1));
          let end = i + 3;
          while (end < state.tokens.length) {
            const next = state.tokens[end];
            if ((next.type === 'heading_open' && Number(next.tag.slice(1)) <= level)
              || next.type === 'footnote_block_open'
              || (next.type === 'html_block' && next.content.includes('draft-note:'))) break;
            end++;
          }
          state.tokens.splice(end, 0, html('</details>\n'));
          state.tokens.splice(i + 3, 0, html('</summary>\n'));
          state.tokens.splice(i, 0, html('<details class="answers"><summary>\n'));
        }
      });
    },
  },
  themeConfig: {
    siteTitle: '认卦',
    nav: [
      { text: '开始阅读', link: '/reading/01-tai' },
      {
        text: '试读章节',
        items: [
          { text: '泰与否', link: '/reading/01-tai' },
          { text: '八卦初识', link: '/reading/02-trigrams' },
          { text: '一卦六爻', link: '/reading/03-lines' },
          { text: '雷在山下', link: '/reading/04-yi' },
          { text: '水与火', link: '/reading/05-water-fire' },
          { text: '既济与未济', link: '/reading/06-jiji-weiji' },
          { text: '一口井', link: '/reading/07-well' },
          { text: '经与传', link: '/reading/08-text-and-commentary' },
          { text: '自己读一卦', link: '/reading/09-xian' },
          { text: '倒看卦图', link: '/reading/10-turn-the-figure' },
          { text: '逐层换线', link: '/reading/11-paired-lines' },
          { text: '从中间取卦', link: '/reading/12-overlapping-trigrams' },
          { text: '居中与当位', link: '/reading/13-position-and-center' },
          { text: '成对读卦', link: '/reading/14-sequence' },
          { text: '自己读下去', link: '/reading/15-read-a-hexagram' },
        ],
      },
      { text: '泰卦样章', link: '/hexagrams/11-tai' },
      { text: '关于本书', link: '/#关于本书' },
      ...(hasReadingPdf ? [{ text: '下载 PDF', link: `${base}zhouyi-reading.pdf` }] : []),
    ],
    sidebar: [
      { text: '地基 · 第一章试点', items: [{ text: '一条线怎样成为卦', link: '/foundations/01-lines' }] },
      { text: '卦页样章', items: [{ text: `${tai.name} · 天地交，万物通`, link: '/hexagrams/11-tai' }] },
    ],
    outline: { label: '本页目录', level: [2, 3] },
    search: { provider: 'local', options: { locales: { root: { translations: { button: { buttonText: '搜索', buttonAriaLabel: '搜索本书' }, modal: { noResultsText: '没有找到相关内容', resetButtonTitle: '清空搜索', footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } } } } } } },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色',
    darkModeSwitchTitle: '切换到深色',
    sidebarMenuLabel: '章节导航',
    returnToTopLabel: '返回顶部',
    docFooter: { prev: '上一页', next: '下一页' },
    footer: { message: '本书经 AI 辅助撰写，未经行家审校。第一章与泰卦样章均为 draft；独立底本核对与多模型审核尚未完成。', copyright: '代码 MIT · 原创正文 CC BY-NC-SA 4.0' },
  },
});
