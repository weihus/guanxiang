# M0-TASK.md — 第一个任务：脚手架 + 两版构建 spike

> 可直接作为 prompt 交给 codex / claude code / antigravity。

## 目标

搭好仓库骨架，并让**泰卦样章**在网站和 PDF 两端都成功渲染。目的是尽早验证技术路线，不写其他卦。

## 前置阅读

项目总纲与泰卦样章原文见 `docs/PRD.md`（即 zhouyi-book-prd.md）。泰卦页以其中样章为底稿，记忆锚点替换为 STYLE.md 第 5 节的故事化版本。

`AGENTS.md`、`docs/STYLE.md`、`docs/REVIEW.md`。

## 任务

1. 初始化仓库结构（见 AGENTS.md 第 4 节），添加 `.gitignore`、`LICENSE`（代码 MIT）、`LICENSE-CONTENT`（CC BY-NC-SA 4.0 说明）、`README.md`（含"AI 辅助撰写、未经行家审校"披露）。
2. 添加 `content/hexagrams/11-tai.md`（泰卦样章，按 STYLE.md 的模板，记忆锚点用故事化版本）与 `data/hexagrams/11-tai.yaml`。
3. 编写 `scripts/gen-hexagram-svg`：根据 `lines` 生成矢量卦象 SVG（阳爻一条实线，阴爻中间断开），输出到 `web/public/hexagrams/` 与 `pdf/assets/`。
4. 编写校验脚本 `npm run validate`：先只实现对泰卦的检查（lines 与上下卦一致、错综互卦推算与手填值一致、模板九板块齐全）。
5. 网站：用 VitePress 搭建，能显示泰卦页、卦象 SVG、深浅色切换、手机适配。
6. PDF：用 Pandoc + Typst 生成包含封面、目录、泰卦页的 PDF，使用思源宋体/黑体，A5 版式。若 Pandoc + Typst 方案遇阻，说明原因并提供 Playwright 打印网页的备选实现。
7. 添加 GitHub Actions：校验 → 构建网站 → 部署 Pages；打 tag 时构建 PDF 并上传 Release。

## 验收标准

- `npm run validate` 通过
- `npm run build` 成功，本地预览能看到泰卦页与卦象图
- `make pdf` 成功，PDF 中中文无缺字、卦象图清晰、目录与页码正常
- README 含披露与许可说明
- 提交信息清晰，并在最后给出：遇到的问题、做出的取舍、下一步建议

## 不要做

- 不要写其他 63 卦。
- 不要修改泰卦文字内容（除非发现原文错误，须在说明中列出）。
- 不要引入付费服务或需要密钥的依赖。
