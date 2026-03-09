import { escapeHtml, formatMultilineText } from "./formatters.js";

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderMarkdownParagraphs(markdown = "") {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listBuffer = [];
  let paragraphBuffer = [];

  function flushList() {
    if (listBuffer.length === 0) {
      return;
    }
    html.push(`<ul>${listBuffer.join("")}</ul>`);
    listBuffer = [];
  }

  function flushParagraph() {
    if (paragraphBuffer.length === 0) {
      return;
    }
    html.push(`<p>${renderInlineMarkdown(paragraphBuffer.join(" "))}</p>`);
    paragraphBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level + 2}>${renderInlineMarkdown(headingMatch[2])}</h${level + 2}>`);
      continue;
    }

    const imageMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      html.push(
        `<figure class="guide-figure"><img src="${escapeHtml(imageMatch[2])}" alt="${escapeHtml(imageMatch[1])}">${imageMatch[1] ? `<figcaption>${escapeHtml(imageMatch[1])}</figcaption>` : ""}</figure>`,
      );
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listBuffer.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();
  return html.join("");
}

export function buildGuidePreview(entry) {
  const source = entry.guide_markdown
    ? entry.guide_markdown
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/^#+\s+/gm, "")
        .replace(/^[-*]\s+/gm, "")
    : entry.guide_text || "";
  return source.trim();
}

export function renderGuideBody(entry) {
  if (entry.guide_markdown) {
    return renderMarkdownParagraphs(entry.guide_markdown);
  }
  return `<p>${formatMultilineText(entry.guide_text || "暂无攻略说明。")}</p>`;
}
