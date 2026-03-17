import { escapeHtml } from "./formatters.js";

const IMAGE_SYNTAX = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const ORDERED_ITEM = /^\d+\.\s+(.+)$/;
const BULLET_ITEM = /^[-*+]\s+(.+)$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /\*([^*]+)\*/g;
const CODE = /`([^`]+)`/g;
const HTML_BREAK = /<br\s*\/?>/gi;

function normalize(text = "") {
  return String(text || "").replace(/\r\n/g, "\n");
}

function isSafeUrl(url = "") {
  const trimmed = String(url || "").trim();
  return /^(https?:\/\/|\.{0,2}\/|\/)/i.test(trimmed);
}

function renderInline(raw = "") {
  let safe = escapeHtml(raw);
  // 只允许 <br> 这一种标签恢复为真正换行
  safe = safe.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  safe = safe.replace(CODE, "<code>$1</code>");
  safe = safe.replace(BOLD, "<strong>$1</strong>");
  safe = safe.replace(ITALIC, "<em>$1</em>");
  safe = safe.replace(LINK, (_m, text, href) => {
    if (!isSafeUrl(href)) {
      return escapeHtml(text);
    }
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(text)}</a>`;
  });
  return safe;
}

function renderImage(line) {
  const matched = line.match(IMAGE_SYNTAX);
  if (!matched) {
    return null;
  }

  const alt = matched[1] || "";
  const src = matched[2] || "";
  if (!isSafeUrl(src)) {
    return `<p>${renderInline(line)}</p>`;
  }
  return `<figure class="guide-image"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"></figure>`;
}

function parseTableRow(line = "") {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) {
    return null;
  }

  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = content.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
}

function isTableSeparator(line = "", expectedColumnCount = null) {
  const cells = parseTableRow(line);
  if (!cells) {
    return false;
  }
  if (expectedColumnCount !== null && cells.length !== expectedColumnCount) {
    return false;
  }
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines, index) {
  const header = parseTableRow(lines[index]);
  if (!header) {
    return false;
  }
  const separator = lines[index + 1];
  return isTableSeparator(separator, header.length);
}

function normalizeTimeRanges(text = "") {
  return String(text).replace(
    /(\d{1,2}:\d{2})\s*(?:[-~—–]|至|到)?\s*(?=\d{1,2}:\d{2})/g,
    "$1 - ",
  );
}

function stripInlineMarkdown(raw = "") {
  return String(raw)
    .replace(HTML_BREAK, " / ")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(CODE, "$1")
    .replace(BOLD, "$1")
    .replace(ITALIC, "$1");
}

function cleanTextFragment(raw = "") {
  return normalizeTimeRanges(stripInlineMarkdown(raw))
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tableRowToText(line = "") {
  const cells = parseTableRow(line);
  if (!cells || isTableSeparator(line, cells.length)) {
    return "";
  }
  return cells.map((cell) => cleanTextFragment(cell)).filter(Boolean).join(" · ");
}

export function markdownToHtml(markdown = "") {
  const text = normalize(markdown).trim();
  if (!text) {
    return "<p>暂无攻略说明。</p>";
  }

  const lines = text.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const imageBlock = renderImage(line);
    if (imageBlock) {
      blocks.push(imageBlock);
      index += 1;
      continue;
    }

    const headingMatch = line.match(HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headerCells = parseTableRow(lines[index]);
      index += 2;

      const bodyRows = [];
      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine) {
          break;
        }
        const rowCells = parseTableRow(rowLine);
        if (!rowCells || rowCells.length !== headerCells.length) {
          break;
        }
        bodyRows.push(rowCells);
        index += 1;
      }

      const headerHtml = `<tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr>`;
      const bodyHtml = bodyRows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("");
      blocks.push(`<table class="guide-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    const orderedMatch = line.match(ORDERED_ITEM);
    if (orderedMatch) {
      const items = [];
      while (index < lines.length) {
        const next = lines[index].trim().match(ORDERED_ITEM);
        if (!next) {
          break;
        }
        items.push(`<li>${renderInline(next[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const bulletMatch = line.match(BULLET_ITEM);
    if (bulletMatch) {
      const items = [];
      while (index < lines.length) {
        const next = lines[index].trim().match(BULLET_ITEM);
        if (!next) {
          break;
        }
        items.push(`<li>${renderInline(next[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || HEADING.test(next) || IMAGE_SYNTAX.test(next) || ORDERED_ITEM.test(next) || BULLET_ITEM.test(next) || isTableStart(lines, index)) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    const paragraphHtml = renderInline(paragraphLines.join("\n")).replace(/\n/g, "<br>");
    blocks.push(`<p>${paragraphHtml}</p>`);
  }

  return blocks.join("");
}

export function markdownToPlainText(markdown = "") {
  const normalized = normalize(markdown);
  if (!normalized.trim()) {
    return "";
  }

  const parts = [];
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line || IMAGE_SYNTAX.test(line)) {
      continue;
    }

    const tableText = tableRowToText(line);
    if (tableText) {
      parts.push(tableText);
      continue;
    }

    const cleaned = cleanTextFragment(line);
    if (cleaned) {
      parts.push(cleaned);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function markdownToSummary(markdown = "") {
  const normalized = normalize(markdown);
  if (!normalized.trim()) {
    return "";
  }

  let fallbackTableText = "";
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line || IMAGE_SYNTAX.test(line)) {
      continue;
    }

    const tableText = tableRowToText(line);
    if (tableText) {
      fallbackTableText ||= tableText;
      continue;
    }

    const cleaned = cleanTextFragment(line);
    if (cleaned) {
      return cleaned;
    }
  }

  return fallbackTableText;
}
