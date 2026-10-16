/**
 * Activity text can carry a little formatting, typed as plain characters so it stays readable
 * everywhere (CSV, copy as text, other apps):
 *   **bold**      - bullet      1. numbered      [ ] to do      [x] done
 * This file reads that format; components/RichText.tsx draws it.
 */

export type Line =
  | { kind: "text"; text: string }
  | { kind: "blank" }
  | { kind: "bullet"; text: string }
  | { kind: "number"; n: number; text: string }
  | { kind: "check"; done: boolean; text: string };

const CHECK = /^\s*(?:[-*•]\s+)?\[( |x|X)\]\s?(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;

export function parseLine(raw: string): Line {
  let m = CHECK.exec(raw);
  if (m) return { kind: "check", done: m[1] !== " ", text: m[2] };
  m = BULLET.exec(raw);
  if (m) return { kind: "bullet", text: m[1] };
  m = NUMBER.exec(raw);
  if (m) return { kind: "number", n: Number(m[1]), text: m[2] };
  return raw.trim() ? { kind: "text", text: raw } : { kind: "blank" };
}

export const parseLines = (text: string) => text.split("\n").map(parseLine);

/** True if the text uses any of the formatting above (so a preview is worth showing). */
export const hasFormatting = (text: string) => /\*\*[^*]+\*\*/.test(text) || parseLines(text).some((l) => l.kind !== "text" && l.kind !== "blank");

const stripBold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");

/** Readable plain text: bold markers removed, checkboxes as ☐ / ☑, lists kept. For copy and CSV. */
export function toPlain(text: string): string {
  return parseLines(text)
    .map((l) => {
      if (l.kind === "blank") return "";
      if (l.kind === "check") return `${l.done ? "☑" : "☐"} ${stripBold(l.text)}`;
      if (l.kind === "bullet") return `• ${stripBold(l.text)}`;
      if (l.kind === "number") return `${l.n}. ${stripBold(l.text)}`;
      return stripBold(l.text);
    })
    .join("\n")
    .trim();
}

/** One line for tight spaces (lists, calendar blocks): lines joined with " · ". */
export const toSummary = (text: string) =>
  toPlain(text)
    .split("\n")
    .map((s) => s.replace(/^•\s*/, "").trim()) // the " · " separators already split the items
    .filter(Boolean)
    .join(" · ");

/** Flip the checkbox on line `index` between [ ] and [x]. */
export function toggleCheck(text: string, index: number): string {
  const lines = text.split("\n");
  lines[index] = lines[index].replace(/\[( |x|X)\]/, (_, c: string) => (c === " " ? "[x]" : "[ ]"));
  return lines.join("\n");
}
