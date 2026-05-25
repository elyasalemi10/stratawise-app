// Converts an AI-authored post (JSON) into the editor's TipTap document JSON
// AND body HTML. Block shapes mirror the editor's capabilities. content_json
// is the source of truth (loaded by the editor); body HTML is what the
// marketing site renders.
import { iconDataUri } from "./timeline-icons";

export type AiBlock =
  | { type: "heading"; level?: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "orderedList"; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; url: string; alt: string }
  | { type: "youtube"; url: string }
  | { type: "timeline"; steps: { icon: string; title: string }[] }
  | { type: "divider" };

export interface AiPost {
  title: string;
  slug?: string;
  excerpt?: string;
  audience?: "lot_owners" | "strata_managers";
  /** Author byline shown at the top of the post. New field; older imports
   *  may omit it and fall back to the signed-in admin. */
  writtenBy?: string;
  tags?: string[];
  seo?: { metaTitle?: string; metaDescription?: string; keywords?: string[]; canonicalUrl?: string };
  cover?: { url?: string; alt?: string };
  body: AiBlock[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TNode = Record<string, any>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Inline markdown: **bold**, *italic*, `code`, [text](url). Non-nested.
const INLINE_RE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

function inlineToNodes(text: string): TNode[] {
  const nodes: TNode[] = [];
  let last = 0;
  const push = (t: string, marks?: TNode[]) => {
    if (!t) return;
    nodes.push(marks && marks.length ? { type: "text", text: t, marks } : { type: "text", text: t });
  };
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index));
    if (m[2] != null) push(m[2], [{ type: "bold" }]);
    else if (m[3] != null) push(m[3], [{ type: "italic" }]);
    else if (m[4] != null) push(m[4], [{ type: "code" }]);
    else if (m[5] != null) push(m[5], [{ type: "link", attrs: { href: m[6] } }]);
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last));
  return nodes;
}

function inlineToHtml(text: string): string {
  let last = 0;
  let out = "";
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) out += escapeHtml(text.slice(last, m.index));
    if (m[2] != null) out += `<strong>${escapeHtml(m[2])}</strong>`;
    else if (m[3] != null) out += `<em>${escapeHtml(m[3])}</em>`;
    else if (m[4] != null) out += `<code>${escapeHtml(m[4])}</code>`;
    else if (m[5] != null) out += `<a href="${escapeHtml(m[6])}">${escapeHtml(m[5])}</a>`;
    last = m.index + m[0].length;
  }
  if (last < text.length) out += escapeHtml(text.slice(last));
  return out;
}

function youtubeId(url: string): string | null {
  const patterns = [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /embed\/([\w-]{11})/, /shorts\/([\w-]{11})/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

const para = (text: string): TNode => ({
  type: "paragraph",
  ...(text.trim() ? { content: inlineToNodes(text) } : {}),
});

export function blocksToDoc(blocks: AiBlock[]): TNode {
  const content: TNode[] = [];
  for (const b of blocks ?? []) {
    switch (b.type) {
      case "heading":
        content.push({ type: "heading", attrs: { level: b.level ?? 2 }, content: inlineToNodes(b.text) });
        break;
      case "paragraph":
        content.push(para(b.text));
        break;
      case "blockquote":
        content.push({ type: "blockquote", content: [para(b.text)] });
        break;
      case "bulletList":
        content.push({ type: "bulletList", content: (b.items ?? []).map((it) => ({ type: "listItem", content: [para(it)] })) });
        break;
      case "orderedList":
        content.push({ type: "orderedList", attrs: { start: 1 }, content: (b.items ?? []).map((it) => ({ type: "listItem", content: [para(it)] })) });
        break;
      case "table": {
        const rows: TNode[] = [];
        rows.push({ type: "tableRow", content: (b.headers ?? []).map((h) => ({ type: "tableHeader", content: [para(h)] })) });
        for (const r of b.rows ?? []) rows.push({ type: "tableRow", content: r.map((c) => ({ type: "tableCell", content: [para(c)] })) });
        content.push({ type: "table", content: rows });
        break;
      }
      case "image":
        if (b.url) content.push({ type: "image", attrs: { src: b.url, alt: b.alt ?? "" } });
        break;
      case "youtube": {
        const id = youtubeId(b.url);
        if (id) content.push({ type: "youtube", attrs: { src: `https://www.youtube.com/watch?v=${id}` } });
        break;
      }
      case "timeline":
        content.push({ type: "timeline", attrs: { items: (b.steps ?? []).map((s) => ({ icon: s.icon || "Rocket", title: s.title || "" })) } });
        break;
      case "divider":
        content.push({ type: "horizontalRule" });
        break;
    }
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

export function blocksToHtml(blocks: AiBlock[]): string {
  const out: string[] = [];
  for (const b of blocks ?? []) {
    switch (b.type) {
      case "heading":
        out.push(`<h${b.level ?? 2}>${inlineToHtml(b.text)}</h${b.level ?? 2}>`);
        break;
      case "paragraph":
        out.push(`<p>${inlineToHtml(b.text)}</p>`);
        break;
      case "blockquote":
        out.push(`<blockquote><p>${inlineToHtml(b.text)}</p></blockquote>`);
        break;
      case "bulletList":
        out.push(`<ul>${(b.items ?? []).map((it) => `<li><p>${inlineToHtml(it)}</p></li>`).join("")}</ul>`);
        break;
      case "orderedList":
        out.push(`<ol>${(b.items ?? []).map((it) => `<li><p>${inlineToHtml(it)}</p></li>`).join("")}</ol>`);
        break;
      case "table": {
        const head = `<tr>${(b.headers ?? []).map((h) => `<th><p>${inlineToHtml(h)}</p></th>`).join("")}</tr>`;
        const body = (b.rows ?? []).map((r) => `<tr>${r.map((c) => `<td><p>${inlineToHtml(c)}</p></td>`).join("")}</tr>`).join("");
        out.push(`<table><tbody>${head}${body}</tbody></table>`);
        break;
      }
      case "image":
        if (b.url) out.push(`<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt ?? "")}" loading="lazy" decoding="async">`);
        break;
      case "youtube": {
        const id = youtubeId(b.url);
        if (id) out.push(`<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/${id}" frameborder="0" allowfullscreen></iframe></div>`);
        break;
      }
      case "timeline": {
        const items = (b.steps ?? []).map((s) => ({ icon: s.icon || "Rocket", title: s.title || "" }));
        const inner = items
          .map((it) => `<div class="sw-timeline-item"><div class="sw-timeline-emoji"><img src="${iconDataUri(it.icon)}" alt="" width="20" height="20"></div><div class="sw-timeline-body"><div class="sw-timeline-title">${escapeHtml(it.title)}</div></div></div>`)
          .join("");
        out.push(`<div data-type="timeline" class="sw-timeline" data-items='${escapeHtml(JSON.stringify(items))}'>${inner}</div>`);
        break;
      }
      case "divider":
        out.push("<hr>");
        break;
    }
  }
  return out.join("");
}
