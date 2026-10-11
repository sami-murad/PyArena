import { Fragment, type ReactNode } from "react";

/**
 * Renders a tiny, safe subset of Markdown used in problem statements:
 * paragraphs (blank-line separated), `inline code` and **bold**.
 * Everything is rendered as React text nodes, never as HTML.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    out.push(token.startsWith("`") ? <code key={key}>{token.slice(1, -1)}</code> : <strong key={key}>{token.slice(2, -2)}</strong>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((p, pi) => (
        <p key={pi}>
          {p.split("\n").map((line, li, lines) => (
            <Fragment key={li}>
              {inline(line, `${pi}-${li}`)}
              {li < lines.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export function InlineText({ text }: { text: string }) {
  return <>{inline(text, "i")}</>;
}
