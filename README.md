# 认卦

从一幅卦图、几句经文开始读《周易》。

**[在线阅读](https://weihus.github.io/guanxiang/)** · **[下载 A5 试读 PDF](https://weihus.github.io/guanxiang/zhouyi-reading.pdf)**

全册十五章。前九章从泰、否两幅图起步，认八卦、找爻位，分辨经文、传文和古注。后六章练习错、综、互，到最后用井和困自己读一遍。

> 公开试读稿。经 AI 辅助撰写，未经行家审校。 [底本与校读记录](references/sources/README.md)

## 本地阅读

需要 Node.js 22 或更高版本。首次校验和构建 PDF 时会联网准备底本与工具。

```sh
npm ci
npm run dev
```

| 用途 | 命令 |
| --- | --- |
| 校验卦象数据与引用 | `npm run validate` |
| 构建网页版 | `npm run build` |
| 生成十五章 A5 试读 PDF，并准备网页下载文件 | `make pdf-reading` |

网站和 PDF 共用 [试读章稿](content/reading/)。项目资料见 [协作规范](AGENTS.md)、[写作风格](docs/STYLE.md) 和 [审校流程](docs/REVIEW.md)。

## 纠错与许可

欢迎指出错字、卦图或解读问题。提交时请附章节、原句、建议和出处。 [GitHub Issues](https://github.com/weihus/guanxiang/issues)

代码采用 [MIT](LICENSE)，原创正文采用 [CC BY-NC-SA 4.0](LICENSE-CONTENT)。[古籍底本](references/sources/README.md) 和[网页字体](web/.vitepress/theme/fonts/README.md) 的权利按各自说明处理。
