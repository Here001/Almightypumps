import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/core/miniMarkdown";

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === "bold" ? <b key={i}>{p.v}</b>
          : p.t === "link" ? <a key={i} href={p.href} {...(/^https?:/i.test(p.href) ? { target: "_blank", rel: "noreferrer" } : {})}>{p.v}</a>
          : <Fragment key={i}>{p.v}</Fragment>,
      )}
    </>
  );
}

/** Renders admin-edited text (see src/core/miniMarkdown.ts). Plain React elements only: no HTML is injected. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseMarkdown(text).map((b, i) =>
        b.t === "h2" ? <h2 key={i}><Inlines parts={b.c} /></h2>
          : b.t === "h3" ? <h3 key={i}><Inlines parts={b.c} /></h3>
          : b.t === "ul" ? <ul key={i}>{b.items.map((it, k) => <li key={k}><Inlines parts={it} /></li>)}</ul>
          : <p key={i}><Inlines parts={b.c} /></p>,
      )}
    </>
  );
}
