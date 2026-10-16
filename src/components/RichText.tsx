"use client";

import { Fragment } from "react";
import { parseLines, type Line } from "@/lib/richtext";

/** **bold** inside a line. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

type Block =
  | { kind: "p"; lines: { line: Line; i: number }[] }
  | { kind: "ul" | "ol" | "checks"; lines: { line: Line; i: number }[] }
  | { kind: "gap" };

/**
 * Shows Activity text with its formatting: bold, bullet and numbered lists, and checkboxes.
 * Pass `onToggle` to make the checkboxes clickable (it gets the line number to flip).
 */
export function RichText({ text, onToggle, className = "" }: { text: string; onToggle?: (line: number) => void; className?: string }) {
  const blocks: Block[] = [];
  parseLines(text).forEach((line, i) => {
    const kind = line.kind === "bullet" ? "ul" : line.kind === "number" ? "ol" : line.kind === "check" ? "checks" : line.kind === "text" ? "p" : "gap";
    const last = blocks.at(-1);
    if (kind === "gap") {
      if (last && last.kind !== "gap") blocks.push({ kind: "gap" });
    } else if (last && last.kind === kind) last.lines.push({ line, i });
    else blocks.push({ kind, lines: [{ line, i }] } as Block);
  });

  return (
    <div className={`space-y-1 break-words ${className}`}>
      {blocks.map((b, k) => {
        if (b.kind === "gap") return <div key={k} className="h-1" />;
        if (b.kind === "p") return <p key={k} className="whitespace-pre-line">{b.lines.map(({ line }, j) => <Fragment key={j}>{j > 0 && "\n"}<Inline text={(line as { text: string }).text} /></Fragment>)}</p>;
        if (b.kind === "ul")
          return <ul key={k} className="list-disc space-y-0.5 pl-5">{b.lines.map(({ line, i }) => <li key={i}><Inline text={(line as { text: string }).text} /></li>)}</ul>;
        if (b.kind === "ol") {
          const first = b.lines[0].line as { n: number };
          return <ol key={k} start={first.n} className="list-decimal space-y-0.5 pl-5">{b.lines.map(({ line, i }) => <li key={i}><Inline text={(line as { text: string }).text} /></li>)}</ol>;
        }
        return (
          <ul key={k} className="space-y-0.5">
            {b.lines.map(({ line, i }) => {
              const l = line as { done: boolean; text: string };
              return (
                <li key={i} className="flex items-start gap-2">
                  {onToggle ? (
                    <input
                      type="checkbox"
                      className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-current"
                      checked={l.done}
                      onChange={() => onToggle(i)}
                      aria-label={l.text || "to do"}
                    />
                  ) : (
                    // Read-only (reports, PDF): a drawn box prints crisply, unlike a greyed-out checkbox.
                    <span className="mt-px w-4 shrink-0 text-center" aria-label={l.done ? "done" : "to do"}>{l.done ? "☑" : "☐"}</span>
                  )}
                  <span className={l.done ? "text-muted line-through decoration-1" : ""}><Inline text={l.text} /></span>
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}
