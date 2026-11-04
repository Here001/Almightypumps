/**
 * Tiny, safe text format for admin-edited pages (Privacy, Terms). No HTML is ever passed through.
 *   ## Heading        ### Smaller heading
 *   - bullet          (consecutive lines form one list)
 *   blank line        = new paragraph
 *   **bold**          [link text](https://… | mailto:… | /path)
 */
export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string };
export type Block =
  | { t: "h2"; c: Inline[] }
  | { t: "h3"; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] };

/** Only links that can't run code: web, email and same-site paths. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s@]+@[^\s@]+$/i.test(h) || /^\/(?!\/)[^\s]*$/.test(h) || /^#[\w-]+$/.test(h)) return h;
  return null;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else {
      const href = safeHref(m[3]);
      out.push(href ? { t: "link", v: m[2], href } : { t: "text", v: m[0] });
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push({ t: "p", c: parseInline(para.join(" ")) }); para = []; } };
  const flushList = () => { if (list.length) { blocks.push({ t: "ul", items: list.map(parseInline) }); list = []; } };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    const li = /^[-*•]\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); blocks.push({ t: h[1].length === 2 ? "h2" : "h3", c: parseInline(h[2]) }); }
    else if (li) { flushPara(); list.push(li[1]); }
    else { flushList(); para.push(line); }
  }
  flushPara();
  flushList();
  return blocks;
}
