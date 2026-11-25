#set document(title: "认卦 · $if(reading)$入门试读$else$第一章试点与泰卦样章$endif$")
// Build mode controls the artifact, never the editorial review status.
#let build-mode = "$if(mode)$$mode$$else$draft$endif$"
#set page(
  paper: "a5",
  margin: (top: $if(reading)$17mm$else$20mm$endif$, bottom: $if(reading)$17mm$else$20mm$endif$, left: 18mm, right: 18mm),
  numbering: none,
  header: none,
  footer: none,
)
#set text(
  font: ("Source Han Serif SC", "Source Han Sans SC", "Noto Sans Symbols2"),
  size: 10.5pt,
  lang: "zh",
)
#set par(
  justify: true,
  leading: $if(reading)$0.85em$else$0.97em$endif$,
  // The paragraph-box gap includes leading; only the extra 0.15em separates paragraphs.
  spacing: $if(reading)$0.99em$else$1.12em$endif$,
  first-line-indent: (amount: 2em, all: true),
)
#set smartquote(enabled: false)
#let inline-gua(path) = box(width: 1.12em, height: 0.72em, baseline: 0pt)[
  #place(bottom + center, dy: 0.06em, image(path, width: 1.05em, height: 0.85em, fit: "contain"))
]

#set heading(numbering: none, outlined: true, bookmarked: true)
#show heading: set text(font: ("Source Han Sans SC", "Source Han Serif SC", "Noto Sans Symbols2"), weight: "bold")
#show heading: set par(first-line-indent: 0em, justify: false)
#show heading.where(level: 1): set text(size: 18pt)
#show heading.where(level: 1): set block(above: 20pt, below: 16pt)
#show heading.where(level: 2): set text(size: 13pt)
#show heading.where(level: 2): set block(above: 17pt, below: 8pt)
#show heading.where(level: 3): set text(size: 11pt)
#show heading.where(level: 3): set block(above: 12pt, below: 6pt)
// Chapter and answer page breaks are supplied by the Pandoc Lua filter.

#set list(
  marker: box(baseline: -0.25em, move(dy: 2.2pt, circle(radius: 1.4pt, fill: black, stroke: none))),
  indent: 0em,
  body-indent: 0.9em,
)
#set enum(indent: 0em, body-indent: 0.9em)
#show list: set par(first-line-indent: 0em)
#show enum: set par(first-line-indent: 0em)
#show terms: set par(first-line-indent: 0em)

// Column widths are supplied by the Lua filter. Keep only horizontal rules.
#set table(
  inset: (x: 4pt, y: 5pt),
  stroke: (x: none, y: 0.4pt + luma(75%)),
)
#set table.cell(breakable: false)
#set table.header(repeat: true)
#show table: set text(size: 9pt)
#show table: set par(first-line-indent: 0em, justify: false, leading: 0.5em, spacing: 0.65em)
// Pandoc wraps tables in figures; the outer block must permit page breaks.
#show figure.where(kind: table): set block(breakable: true)
#show figure: set par(first-line-indent: 0em)
#set figure(gap: 0.5em)
#show figure.caption: set text(size: 9pt)

// Block quotes are reading aids; native footnotes retain their page-bottom flow.
#let reading-tip(body, compact: false) = block(
  width: 100%,
  breakable: compact,
  fill: luma(96%),
  stroke: (left: 0.5pt + luma(60%)),
  inset: (x: 9pt, y: if compact { 2pt } else { 7pt }),
  above: if compact { 0pt } else { 9pt },
  below: if compact { 4pt } else { 9pt },
)[
  #set text(size: if compact { 8.5pt } else { 9pt }, fill: luma(25%))
  #set par(first-line-indent: 0em, leading: if compact { 0.35em } else { 0.55em }, spacing: if compact { 0.3em } else { 0.7em })
  #body
]
#show quote.where(block: true): it => reading-tip(it.body)
#show footnote: it => [#sym.wj#it]
#show footnote.entry: set text(size: 8.5pt)
#show footnote.entry: set par(first-line-indent: 0em, leading: 0.65em, spacing: 0.65em)

#page(numbering: none, header: none, footer: none)[
  #set par(first-line-indent: 0em, justify: false)
  #v(24mm)
  #align(center)[
    #text(font: "Source Han Sans SC", size: 28pt, weight: "bold")[认卦]
    #v(8mm)
    #text(size: 15pt)[从零读懂周易六十四卦]
    #v(14mm)
    #text(size: 13pt)[$if(reading)$从认卦到对读$else$地基第一章试点 · 泰卦样章$endif$]
    #v(1fr)
    #text(size: 9pt)[AI 辅助撰写 · 未经行家审校]
    #v(3mm)
    #text(size: 9pt)[$if(reading)$试读 · 十五章$else$初稿 · M2 第一章试点$endif$]
    #v(3mm)
    #text(size: 8.5pt)[审校状态：draft]
  ]
]
#page(numbering: none, header: none, footer: none)[
  #set par(first-line-indent: 0em, justify: false)
  #outline(title: [目录], depth: 1)
]

// Suppress headers on every chapter's physical opening page.
// Use the reset logical counter only for parity and the printed page number.
#set page(
  numbering: "1",
  header: context {
    set text(font: "Source Han Sans SC", size: 8pt, fill: luma(40%))
    set par(first-line-indent: 0em, justify: false)
    let logical-page = counter(page).get().first()
    let chapters = query(heading.where(level: 1)).filter(
      h => h.outlined and h.location().page() <= here().page()
    )
    let chapter-opening = chapters.any(h => h.location().page() == here().page())
    if not chapter-opening {
      align(center)[
        #if calc.rem(logical-page, 2) == 0 {
          [《认卦》]
        } else if chapters.len() > 0 {
          chapters.last().body
        }
      ]
    }
  },
  footer: context {
    set text(size: 9pt)
    set par(first-line-indent: 0em, justify: false)
    align(center, counter(page).display("1"))
  },
)
#counter(page).update(1)

$body$
