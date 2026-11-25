local mode = os.getenv('PDF_MODE') or 'draft'
local reading = os.getenv('PDF_EDITION') == 'reading'
local chapter_count = 0

local function destination(identifier)
  return 'section-' .. pandoc.utils.sha1(identifier)
end

-- Keep mode-dependent blocks in source order; never accumulate tips at section end.
local function process_blocks(blocks)
  local output = pandoc.List()
  local skip_level = nil
  local first_chapter_opening = false
  for _, block in ipairs(blocks) do
    if block.t == 'Header' then
      if skip_level and block.level <= skip_level then skip_level = nil end
      local title = pandoc.utils.stringify(block.content)
      if mode == 'release' and title == '引用与待核说明' then
        skip_level = block.level
      elseif not skip_level then
        if block.identifier ~= '' then block.identifier = destination(block.identifier) end
        if block.level == 1 then
          chapter_count = chapter_count + 1
          first_chapter_opening = title:match('^第一章') ~= nil
          if chapter_count > 1 then output:insert(pandoc.RawBlock('typst', '#pagebreak(weak: true)')) end
          output:insert(pandoc.RawBlock('typst', '#counter(footnote).update(0)'))
        else
          first_chapter_opening = false
        end
        if title == '参考答案' then output:insert(pandoc.RawBlock('typst', '#pagebreak(weak: true)')) end
        output:insert(block)
      end
    elseif skip_level then
    elseif reading and block.t == 'Para' and #block.content == 1
        and block.content[1].t == 'Link' and block.content[1].target:match('^%.%.?/') then
      -- Standalone chapter navigation belongs to the website.
    elseif block.t == 'BlockQuote' then
      local paragraphs = pandoc.List()
      for _, paragraph in ipairs(block.content) do
        local text = pandoc.utils.stringify(paragraph)
        if mode == 'release' and first_chapter_opening and text:find('审校状态') then
          -- The first chapter's opening status is draft-only; cover disclosure stays.
        elseif mode == 'release' and text:find('审校状态') and (text:find('待核') or text:find('存疑') or text:find('尚未')) then
          paragraphs:insert(pandoc.Para({ pandoc.Str('审校状态：draft（初稿）。本书经 AI 辅助撰写，未经行家审校。原文中的吉凶表述属于古籍文本，不是对读者命运的预测。') }))
        else
          paragraphs:insert(paragraph)
        end
      end
      if #paragraphs > 0 then
        if pandoc.utils.stringify(paragraphs[1]):match('^九二：') then
          output:insert(pandoc.Div(paragraphs, pandoc.Attr('', { 'variant-note' })))
        else
          output:insert(pandoc.BlockQuote(paragraphs))
        end
      end
    elseif block.t == 'RawBlock' and block.format == 'html' then
      local note = block.text:match('^<!%-%-%s*draft%-note:%s*(.-)%s*%-%->$')
      if note and mode == 'draft' then
        output:insert(pandoc.BlockQuote({ pandoc.Para({ pandoc.Str('待核：' .. note) }) }))
      elseif not note then
        output:insert(block)
      end
    else
      first_chapter_opening = false
      output:insert(block)
    end
  end
  return output
end

local function tip_companion(block)
  if not block then return false end
  if block.t == 'Para' or block.t == 'Plain' then return true end
  if block.t == 'Figure' then
    local has_table = false
    pandoc.Pandoc({ block }):walk({ Table = function() has_table = true end })
    return not has_table
  end
  if block.t ~= 'BulletList' and block.t ~= 'OrderedList' then return false end
  -- Only short lists qualify, and a nested table must never be locked to a tip.
  local has_table = false
  pandoc.Pandoc({ block }):walk({ Table = function() has_table = true end })
  return not has_table and #block.content <= 6
    and utf8.len(pandoc.utils.stringify(block)) <= 600
end

local function bind_tips(blocks)
  local output = pandoc.List()
  local index = 1
  while index <= #blocks do
    local block = blocks[index]
    local previous = output[#output]
    local following = blocks[index + 1]
    if reading and block.t == 'Para' and following and following.t == 'Table'
        and (previous and previous.t == 'Header' or #following.colspecs == 3) then
      output:insert(pandoc.Div({ block, following }, pandoc.Attr('', { 'keep-tip' })))
      index = index + 1
    elseif block.t == 'Para' and previous and (previous.t == 'Table' or previous.t == 'Figure')
        and pandoc.utils.stringify(block):match('^表格是纸面上到下，读爻仍从底往上。') then
      output:remove(#output)
      output:insert(pandoc.Div({ previous, block }, pandoc.Attr('', { 'keep-tip' })))
    elseif block.t == 'BlockQuote' and tip_companion(previous) then
      output:remove(#output)
      output:insert(pandoc.Div({ previous, block }, pandoc.Attr('', { 'keep-tip' })))
    elseif block.t == 'BlockQuote' and previous and previous.t == 'Header'
        and tip_companion(blocks[index + 1]) then
      output:insert(pandoc.Div({ block, blocks[index + 1] }, pandoc.Attr('', { 'keep-tip' })))
      index = index + 1
    else
      output:insert(block)
    end
    index = index + 1
  end
  return output
end

local function inline_symbols(str)
  local output = pandoc.List()
  local start = 1
  local changed = false
  for position, codepoint in utf8.codes(str.text) do
    if (codepoint >= 0x2630 and codepoint <= 0x2637)
        or (codepoint >= 0x4dc0 and codepoint <= 0x4dff) then
      if position > start then output:insert(pandoc.Str(str.text:sub(start, position - 1))) end
      output:insert(pandoc.RawInline('typst', string.format('#inline-gua("/pdf/assets/inline/u%04x.svg")', codepoint)))
      start = position + #utf8.char(codepoint)
      changed = true
    end
  end
  if not changed then return nil end
  if start <= #str.text then output:insert(pandoc.Str(str.text:sub(start))) end
  return output
end

function Pandoc(doc)
  chapter_count = 0
  doc.blocks = bind_tips(process_blocks(doc.blocks))
  -- Finish all inline transformations (including inside notes and tips) before
  -- serializing keep-tip Divs. Input must enable Pandoc's +native_spans.
  doc = doc:walk({
    Str = inline_symbols,
    Span = function(span)
      if span.classes:includes('draft-only') then
        if mode == 'draft' then return span.content end
        return {}
      end
    end,
    Link = function(link)
      if reading and link.target:match('^%.%.?/') then
        return link.content
      end
      if link.target:sub(1, 1) == '#' and #link.target > 1 then link.target = '#' .. destination(link.target:sub(2)) end
      return link
    end,
    Image = function(image)
      local inline = image.src:match('^/hexagrams/inline/(u[%da-f]+%.svg)$')
      if inline then
        image.src = '/pdf/assets/inline/' .. inline
        image.attributes.width = '28mm'
        return image
      end
      local name = image.src:match('^/hexagrams/([%w%-]+%.svg)$')
      if name then
        image.src = '/pdf/assets/' .. name
        image.attributes.width = name == 'foundation-01-tai.svg' and '58mm' or '37mm'
        image.attributes.height = nil
        if name:match('^practice%-') then image.caption = pandoc.Inlines({}) end
      end
      return image
    end,
    Table = function(tbl)
      if reading then
        if #tbl.colspecs == 4 then
          return tbl:walk({
            Image = function(image)
              image.attributes.width = '18mm'
              return image
            end,
          })
        end
        return tbl
      end
      local widths = #tbl.colspecs == 4 and { 0.12, 0.28, 0.38, 0.22 } or { 0.32, 0.14, 0.54 }
      if #tbl.colspecs == #widths then
        for i, spec in ipairs(tbl.colspecs) do tbl.colspecs[i] = { spec[1], widths[i] } end
      end
      return tbl
    end,
  })
  return doc:walk({
    Div = function(div)
      if div.classes:includes('variant-note') then
        local body = pandoc.write(pandoc.Pandoc(div.content), 'typst')
        return pandoc.RawBlock('typst', '#reading-tip(compact: true)[\n' .. body .. '\n]')
      end
      if div.classes:includes('keep-tip') then
        local body = pandoc.write(pandoc.Pandoc(div.content), 'typst')
        local above = div.content[1].t == 'BlockQuote' and '9pt' or '1.12em'
        local below = div.content[#div.content].t == 'BlockQuote' and '9pt' or '1.12em'
        return pandoc.RawBlock('typst', '#block(breakable: false, above: ' .. above .. ', below: ' .. below .. ')[\n' .. body .. '\n]')
      end
    end,
  })
end
