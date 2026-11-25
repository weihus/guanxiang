# 认卦：从零读懂周易六十四卦

文化与思想入门读物。当前提供九章入门试读和六章进阶试读、地基第一章试点、泰卦样章，以及 M1 的 64 卦结构化数据、矢量卦象、速查表与关系数据。网站与 A5 PDF 共用这些章稿，均保留初稿状态。

**本书经 AI 辅助撰写，未经行家审校。** 当前泰卦为 `draft`，尚未完成双底本逐字核对及三厂商模型的两轮独立审核。结构校验通过不代表经文或解读已审校。来源与许可待确认事项见 [底本记录](references/sources/README.md)。

## 快速开始

需要 Node.js 22 或更高版本、npm，以及 Make。首次下载 PDF 工具需要联网、curl、tar（macOS 还需 unzip）；不需要付费服务或自行申请 API 密钥。

```sh
npm ci
npm run validate
npm run dev
```

打开终端显示的本地地址，从“开始阅读”进入九章入门试读和六章进阶试读。网站支持深浅色、本地搜索和手机布局。

运行 `make pdf-reading` 可生成 A5 十五章试读 PDF（`pdf/dist/zhouyi-reading-draft.pdf`）。该命令同时准备网页下载文件。随后再运行 `npm run build`，站点导航会显示“下载 PDF”。

```sh
npm run build
npm run preview
make pdf
```

首次运行 `npm run validate` 时会从上游下载缺少的底本摘录，并按固定版本和校验值验证。四份候选摘录用于校读，随项目提交的是出处与核对记录。 [底本记录](references/sources/README.md)

网站产物为 `web/.vitepress/dist/`。`make pdf` 生成 `pdf/dist/zhouyi-book-draft.pdf` 与 `pdf/dist/zhouyi-book-release.pdf`；默认入口 `zhouyi-book.pdf` 同步为 draft 副本。PDF 包含封面、一级目录、书签、正文页码、页底脚注和矢量卦象。上述构建产物不提交版本控制。重新构建或切换 `SITE_BASE` 后，请重启 `npm run preview` 再检查。

可分别运行 `make pdf-draft`、`make pdf-release`，或 `npm run pdf -- --mode release`（模式可选 `draft`、`release`、`all`）。draft 保留编校待核备注和校勘句，release 省略内部编号、待核说明与校勘信息；两种构建均保持审校状态 `draft`，release 不代表审校通过或对外发布。

行内卦符由数据生成的小号 SVG 统一呈现，固定行盒高度，保持所在段落行距；列表采用校准基线的圆点。提示框不拆页并绑定相邻文字，章／卦首页不显示页眉。构建末写入 PDF page labels：封面、目录为独立标签，正文从 `1` 起，与印刷页脚一致。

`make pdf` 会执行结构与章节校验，下载项目本地 Pandoc 3.6.4、Typst 0.13.1 及字体到 `.tools/`，生成 SVG，再从第一章与泰卦的同源 Markdown 构建 PDF。支持 macOS/Linux 的 x64/arm64，不修改系统工具或字体目录；已下载的依赖可以复用。Pandoc 与 Typst 可分别通过 `PANDOC_PATH`、`TYPST_PATH` 指向已有工具，字体仍由 `npm run pdf:setup` 准备。

如果本机处于 Rosetta 环境且 `/usr/bin/make` 提示 xcrun 架构不匹配，可使用：

```sh
arch -arm64 /usr/bin/make pdf
```

字体通过 GitHub 公开 API 读取固定提交中的文件并核验 Git blob SHA-1，不需要密钥。若本机仅 `gh` 的网络通道可用且已配置，可选择 `PDF_GITHUB_API=gh npm run pdf:setup`；默认路径使用 curl 匿名访问。工具下载写入临时文件后再归位，失败时按错误修复网络并重试。

## 内容与规范

- [AGENTS.md](AGENTS.md)：协作规范与质量红线。
- [docs/PRD.md](docs/PRD.md)：产品目标与原始样章。
- [docs/STYLE.md](docs/STYLE.md)、[docs/REVIEW.md](docs/REVIEW.md)：写作模板与审核门槛。
- [docs/M0-TASK.md](docs/M0-TASK.md)：本阶段任务与验收标准。
- `content/hexagrams/11-tai.md`：网站和 PDF 共用正文；保留 PRD 样章，故事换为 STYLE 指定版本，另附术语、答案与待核说明。
- `data/hexagrams/11-tai.yaml`：卦象唯一事实来源，六爻自下而上。
- `references/index.yaml`：引用索引；`references/sources/`：底本和许可状态。

`npm run generate` 从 YAML 生成 `web/public/hexagrams/` 与 `pdf/assets/` 下各 64 份普通 SVG，另生成首章带位名／爻名主图与两张匿名练习图，每端共 67 份主图及 72 份行内卦符 SVG；同时生成 `data/generated/hexagrams.csv` 速查表和 `data/generated/relations.json` 关系数据。两端同名 SVG 内容一致，不要手工修改生成结果。

`npm run validate` 检查 64 卦齐全、卦序与名称/卦符、ID/卦名/六爻/上下卦组合不重复、文件命名、八卦表、上下卦、错综互卦重算及引用路径。另以来源六爻位名中的“九/六”独立核对阴阳，避免数据内部自洽却卦象错位。正文只检查泰卦模板，不要求其余 63 卦正文。

## M1 数据流程

```sh
# 参数顺序：下卦、上卦；输出六爻自下而上
node scripts/lines-from-trigrams.mjs 震 坎
# [1,0,0,0,1,0]

# 初始化缺失数据；已有事实不同则报错，不覆盖裁决
npm run seed:data
npm run validate
npm run generate
npm test
```

八卦三爻表位于 `data/trigrams.yaml`。初始化脚本读取固定来源中的上下卦，经上述小脚本的同一函数生成 `lines`，并将已逐项检查的错综互 ID 表写入 YAML；校验器再从六爻重算全部关系。平时构建与导出只读取 `data/hexagrams/`，不从初始化脚本取得事实。

新增 `section` 字段：上经为 1–30，下经为 31–64。序卦配对检查的是 `(1,2)、(3,4)…(63,64)`，不是所有连续两个编号；28 对以综卦配对，4 对自综卦以错卦配对。关系 JSON 保留一对同时为错与综的情况、全部自综/自互边，共 64 节点、192 有向边、32 个卦对；互卦不要求反向互指。

`references/sources/hexagram-headers.json` 保存 64 个来源条目的固定提交、路径和 blob，以及原名、上下卦、卦符和爻位标签，不保存其他卦的正文。原名“習坎”规范为“坎”，“遯”规范为“遁”，其余繁简转换保留在 `source_name` / `canonical_name` 对照中。来源许可及独立性仍待确认，结构校验不等于全文审校。

新增卦的 `keywords` 暂用“下某卦、上某卦”结构标签，不据此撰写义理解读；全部状态保持 `draft`。速查表和关系数据尚未接入网站或 PDF 页面。

## M2 第一步：八卦与地基大纲草稿

`data/trigrams.yaml` 保留原有 `symbol`、`lines`，新增 `name`（卦名）、`nature`（本轮选取的自然之象）、`virtue`（德性原词）、`family_role`（父母六子）和 `personality`（一句话白话助记）。五字段均通过 `references` 指向《说卦》引用登记；自然之象选取八卦入门主象，巽并录木、风，离并录火、日、电。

德性保留“健、顺、动、入、陷、丽、止、说”。离的附着释义标为孔疏，兑的悦读标为陆德明音义，分别存于 `virtue.gloss`；性格句标为 `白话助记`。底本原字、引用类型、行号与页码见 `references/shuogua-citations.yaml`，固定提交见 `references/sources/shuogua-provenance.json`。这些核对不替代来源独立性、转录许可及全文审校的负责人确认。

- [八卦角色卡草稿](docs/M2-TRIGRAM-CARDS.md)：每卡 100–200 字白话，另附同一位林舟、同一小院和同一天里的【设想】场景。
- [地基六章详细大纲](docs/M2-FOUNDATION-OUTLINE.md)：小节、问题、图表、练习及学习目标已按反馈调整；顺序已确认，当前只推进第一章试点。

本阶段角色卡仍放在 `docs/`。六章顺序与调整已获确认，当前仅编入 `content/foundations/01-lines.md` 第一章试点，第二章未开始。网站与 PDF 均收录该章和原有泰卦样章。

第一章保留 `draft`，九、六仅说明命名；顺序为九六命名、经的两层、读图检查、练习与答案。完整引用及延后处理的问题见 `references/foundation-01-citations.yaml`，正文以标准脚注引用，同节同源只标一次；结构表资料仅保留元数据来源，不生成可见脚注。首章练习图采用蒙卦，泰页图4采用既济，图旁不标答案；练习2的所有空格均填写九或六。网页答案默认折叠，PDF答案另页。`npm run validate` 检查章稿字数、爻名表、引用原字与底本定位、收尾顺序及试点范围，并拒绝中文段落中的直引号、半角冒号／分号；代码、URL、frontmatter及Markdown语法除外。

后续写作边界见 `AGENTS.md` 第 6 节：每章 3000–5000 字；第五章主线只讲位、中、当位，承／乘／应只作短旁栏；林舟仅用于角色卡与地基部分，六十四卦页的设想各自独立。

## 复现检查

```sh
node --test scripts/validate.test.mjs
npm run build
npm run preview -- --port 4173
# 在另一个终端中，使用已安装的 Google Chrome
node scripts/verify-web.mjs
```

浏览器脚本通过页面事件操作首页、泰卦、深浅色、搜索与手机布局，截图及观察结果写入 `.artifacts/`。可用 `VERIFY_URL` 指定已有服务器，`BROWSER_CHANNEL` 选择本机浏览器；不会发布内容。PDF 可用阅读器打开，核对中文、卦象、表格分页、目录和页码。

## GitHub Pages 与 PDF Release

`.github/workflows/pages.yml` 在 main 推送、PR 和手动触发时校验并构建；PR 只构建，main 或手动触发时部署 Pages。仓库所有者需要在 Settings → Pages 中选择 GitHub Actions。仓库站点路径由仓库名计算，本地可用 `SITE_BASE=/zhouyi-book/ npm run build` 检查子路径部署。

`.github/workflows/pdf.yml` 在 `v*` tag 推送时构建 PDF 并附到对应 Release，手动触发只生成可下载的 workflow artifact。仅使用 GitHub 自动提供的工作流令牌，无需添加外部密钥。当前交付仅提供工作流，尚未推送或验证线上部署。

## 许可与纠错

代码采用 [MIT](LICENSE)，原创正文采用 [CC BY-NC-SA 4.0](LICENSE-CONTENT)。古籍原文不据为原创，其底本及转录权利仍需按来源确认。

PDF 使用 Adobe 思源宋体和思源黑体，以及 Noto Sans Symbols 2，均依 SIL Open Font License 1.1 使用。固定版本分别来自 `adobe-fonts/source-han-serif` 提交 `7889f11bf31170b5d092a083b357c8c8130f89e0`、`adobe-fonts/source-han-sans` 提交 `a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2` 和 `notofonts/noto-fonts` 提交 `ffebf8c1ee449e544955a7e813c54f9b73848eac`，原许可随字体下载到 `.tools/fonts/`。Pandoc、Typst 为独立构建工具，不受本仓库 MIT 许可覆盖。

欢迎提交纠错，请附章节、原句、建议与可核查出处。 [GitHub Issues](https://github.com/weihus/guanxiang/issues)
