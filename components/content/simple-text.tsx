import type { ReactNode } from 'react';

/**
 * Renders the plain-text bodies staff write (lessons, docs) as paragraphs
 * and lists, without accepting any HTML: everything is text nodes, so a
 * pasted <script> is just characters on the page.
 *
 *   A blank line starts a new block.
 *   Lines starting with "- " or "* " are list items.
 *   A short line on its own just before a list is that list's heading.
 *   A line starting with "# " is a heading.
 */
export function SimpleText({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim() !== ''));
  const out: ReactNode[] = [];

  blocks.forEach((lines, bi) => {
    if (lines.length === 0) return;
    const isItem = (l: string) => /^\s*[-*]\s+/.test(l);
    const items = lines.filter(isItem);

    if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
      out.push(
        <h3 key={bi} className="mt-6 font-display text-lg font-semibold text-foreground">
          {lines[0].replace(/^#{1,3}\s+/, '')}
        </h3>,
      );
      return;
    }

    if (items.length > 0 && items.length >= lines.length - 1) {
      const head = isItem(lines[0]) ? null : lines[0];
      out.push(
        <div key={bi} className="mt-4">
          {head && <p className="font-semibold text-foreground">{head.replace(/^#{1,3}\s+/, '')}</p>}
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {items.map((l, i) => (
              <li key={i}>{l.replace(/^\s*[-*]\s+/, '')}</li>
            ))}
          </ul>
        </div>,
      );
      return;
    }

    out.push(
      <p key={bi} className="mt-4 whitespace-pre-wrap">
        {lines.join('\n')}
      </p>,
    );
  });

  return <div className={className}>{out}</div>;
}
