"use client";

import { useLayoutEffect, useRef } from "react";
import { Bold, List, ListChecks, ListOrdered } from "lucide-react";
import { hasFormatting, parseLine, toggleCheck } from "@/lib/richtext";
import { RichText } from "./RichText";

type ListKind = "bullet" | "number" | "check";
const PREFIX: Record<ListKind, (n: number) => string> = { bullet: () => "- ", number: (n) => `${n}. `, check: () => "[ ] " };
const MARKER = /^\s*(?:(?:[-*•]\s+)?\[(?: |x|X)\]\s?|[-*•]\s+|\d+[.)]\s+)/;

/**
 * The Activity box with a small formatting bar: bold, bullet list, numbered list and checkboxes.
 * The text is stored with simple marks (**bold**, "- ", "1. ", "[ ] ") and a preview shows how it looks.
 */
export function ActivityEditor({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  // Put the cursor back right after the new text is on screen, before the next key press lands.
  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    if (!sel || !ref.current) return;
    pendingSelection.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  /** Replace the text and put the cursor/selection where it belongs. */
  const apply = (next: string, selStart: number, selEnd = selStart) => {
    pendingSelection.current = [selStart, selEnd];
    onChange(next);
  };

  const bold = () => {
    const el = ref.current!;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = value.slice(s, e);
    // Already bold: unwrap.
    if (value.slice(s - 2, s) === "**" && value.slice(e, e + 2) === "**")
      return apply(value.slice(0, s - 2) + picked + value.slice(e + 2), s - 2, e - 2);
    const inner = picked || "bold text";
    apply(value.slice(0, s) + `**${inner}**` + value.slice(e), s + 2, s + 2 + inner.length);
  };

  /** Turn the selected lines (or the current line) into a list of this kind, or back to plain text. */
  const list = (kind: ListKind) => {
    const el = ref.current!;
    const lineStart = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    let lineEnd = value.indexOf("\n", el.selectionEnd);
    if (lineEnd === -1) lineEnd = value.length;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const allThisKind = lines.every((l) => parseLine(l).kind === kind);
    let n = 0;
    const changed = lines.map((l) => {
      const bare = l.replace(MARKER, "");
      if (allThisKind) return bare;
      if (!l.trim() && lines.length > 1) return l; // leave blank lines in a selection alone
      return PREFIX[kind](++n) + bare;
    });
    const block = changed.join("\n");
    apply(value.slice(0, lineStart) + block + value.slice(lineEnd), lineStart + block.length);
  };

  /** Enter inside a list starts the next item; Enter on an empty item ends the list. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      return bold();
    }
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    const line = value.slice(lineStart, pos);
    const parsed = parseLine(line);
    if (parsed.kind !== "bullet" && parsed.kind !== "number" && parsed.kind !== "check") return;
    e.preventDefault();
    if (!parsed.text.trim()) {
      // Empty item: end the list.
      apply(value.slice(0, lineStart) + value.slice(pos), lineStart);
      return;
    }
    const prefix = parsed.kind === "number" ? `${parsed.n + 1}. ` : parsed.kind === "check" ? "[ ] " : "- ";
    apply(value.slice(0, pos) + "\n" + prefix + value.slice(pos), pos + 1 + prefix.length);
  };

  const tools: { label: string; icon: typeof Bold; run: () => void }[] = [
    { label: "Bold (Ctrl+B)", icon: Bold, run: bold },
    { label: "Bullet list", icon: List, run: () => list("bullet") },
    { label: "Numbered list", icon: ListOrdered, run: () => list("number") },
    { label: "Checklist", icon: ListChecks, run: () => list("check") },
  ];
  const formatted = hasFormatting(value);

  return (
    <div className="rounded-xl border border-border focus-within:border-accent">
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        {tools.map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            // Keep the cursor in the text box when clicking a button.
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
            className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className="block w-full resize-y bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted"
        placeholder="What are you working on?"
        // Grows with the text (up to 14 lines) so lists aren't hidden behind a scrollbar.
        rows={Math.min(14, Math.max(4, value.split("\n").length + 1))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
      />
      {formatted && (
        <div className="border-t border-border bg-surface-2/50 px-3 py-2 text-sm font-normal text-text">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Preview</div>
          <RichText text={value} onToggle={(i) => onChange(toggleCheck(value, i))} />
        </div>
      )}
    </div>
  );
}
