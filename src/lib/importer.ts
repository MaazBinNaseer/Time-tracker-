/**
 * Importing time from other apps (Toggl Track, Jibble, Clockify, Harvest, or any spreadsheet saved as CSV).
 *
 * The steps, in plain words:
 *  1. Read the CSV file into rows of text (`parseCsv`).
 *  2. Guess which column means what (`guessMapping`), e.g. "Start time" or "Clock in" -> start time.
 *     The import screen shows this guess and lets you change any of it.
 *  3. Turn each row into a session with a start and an end (`buildEntries`). Two layouts are understood:
 *     - one row per session (Toggl, Clockify, Harvest): date + start/end times, or date + duration
 *     - one row per clock event (Jibble "time entries"): an "In" row starts work, the next In/Out ends it
 *  4. Skip anything already in the tracker, so importing the same file twice is harmless.
 */

import type { AppData } from "./types";

// ---- 1. CSV -------------------------------------------------------------------------------

/** Parse CSV text (comma, semicolon or tab separated; quotes and line breaks inside quotes handled). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, ""); // byte-order mark that Excel adds
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

// ---- 2. Which column is which ---------------------------------------------------------------

export const FIELDS = [
  ["member", "Person"],
  ["date", "Date"],
  ["startTime", "Start time"],
  ["endDate", "End date"],
  ["endTime", "End time"],
  ["duration", "Duration / hours"],
  ["entryType", "Clock in / out type"],
  ["project", "Project"],
  ["projectCode", "Project code"],
  ["client", "Client"],
  ["task", "Task / activity"],
  ["description", "Description / notes"],
  ["billable", "Billable"],
] as const;
export type Field = (typeof FIELDS)[number][0];
export type Mapping = Partial<Record<Field, number>>; // field -> column index

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Header names used by common apps, most specific first.
const SYNONYMS: Record<Field, string[]> = {
  member: ["user", "member", "member name", "full name", "employee", "name", "person", "first name"],
  date: ["start date", "date", "day", "clock in date", "entry date", "spent date"],
  startTime: ["start time", "clock in time", "time in", "clock in", "in", "first in", "from", "start"],
  endDate: ["end date", "clock out date"],
  endTime: ["end time", "clock out time", "time out", "clock out", "out", "last out", "to", "end"],
  duration: ["duration", "duration h", "duration decimal", "hours", "tracked hours", "worked hours", "total hours", "time h", "decimal hours"],
  entryType: ["entry type", "type", "event", "action"],
  project: ["project", "project name"],
  projectCode: ["project code", "project external reference", "code"],
  client: ["client", "client name", "customer", "company"],
  task: ["task", "activity", "activity name", "task name"],
  description: ["description", "notes", "note", "comment", "comments", "work description", "memo"],
  billable: ["billable", "is billable", "billable status"],
};

export function guessMapping(header: string[], rows: string[][] = []): Mapping {
  const h = header.map(norm);
  const used = new Set<number>();
  const m: Mapping = {};
  for (const [field] of FIELDS) {
    for (const name of SYNONYMS[field]) {
      const i = h.findIndex((x, idx) => x === name && !used.has(idx));
      if (i !== -1) {
        m[field] = i;
        used.add(i);
        break;
      }
    }
  }
  // Jibble's raw time entries have a plain "Time" column holding the clock event time.
  if (m.entryType !== undefined && m.startTime === undefined) {
    const i = h.findIndex((x, idx) => x === "time" && !used.has(idx));
    if (i !== -1) m.startTime = i;
  }
  // A "type" column only counts as clock in/out if its values look like In/Out.
  if (m.entryType !== undefined && rows.length) {
    const looksLikeClock = rows.slice(0, 50).some((r) => clockKind(r[m.entryType!] ?? "") !== null);
    if (!looksLikeClock) delete m.entryType;
  }
  return m;
}

export function detectSource(header: string[]): string {
  const h = new Set(header.map(norm));
  if (h.has("entry type") || (h.has("type") && h.has("time"))) return "Jibble (time entries)";
  if (h.has("first in") || h.has("last out")) return "Jibble (timesheets)";
  if (h.has("start date") && h.has("start time") && (h.has("user") || h.has("member")) && h.has("task")) return "Toggl Track";
  if (h.has("start date") && h.has("start time") && h.has("duration")) return "Clockify / Toggl-style";
  if (h.has("spent date") || (h.has("date") && h.has("hours"))) return "Harvest-style (date + hours)";
  return "Spreadsheet (CSV)";
}

// ---- 3. Values -------------------------------------------------------------------------------

export type DateOrder = "ymd" | "mdy" | "dmy";

/** Look at all the dates: "13/10/2026" can only be day-first, "10/13/2026" only month-first. */
export function guessDateOrder(values: string[]): { order: DateOrder; ambiguous: boolean } {
  let dmy = false;
  let mdy = false;
  let slashy = false;
  for (const v of values) {
    const m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
    if (!m) continue;
    slashy = true;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
    if (v.includes(".")) dmy = true; // 13.10.2026 is the European style
  }
  if (!slashy) return { order: "ymd", ambiguous: false };
  if (dmy && !mdy) return { order: "dmy", ambiguous: false };
  if (mdy && !dmy) return { order: "mdy", ambiguous: false };
  return { order: "mdy", ambiguous: true };
}

/** Returns [year, monthIndex, day] or null. Accepts 2026-10-13, 10/13/2026, 13.10.2026, "Oct 13, 2026". */
export function parseDate(v: string, order: DateOrder): [number, number, number] | null {
  v = v.trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return order === "dmy" ? [y, b - 1, a] : [y, a - 1, b];
  }
  const t = Date.parse(v);
  if (!isNaN(t)) {
    const d = new Date(t);
    return [d.getFullYear(), d.getMonth(), d.getDate()];
  }
  return null;
}

/** Returns minutes since midnight. Accepts 09:05, 9:05:30, 9:05 PM, 21.05, and full date-times. */
export function parseTime(v: string): number | null {
  const m = v.trim().match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  const ap = m[4]?.toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min + sec / 60;
}

/** Returns minutes. Accepts 1:30, 01:30:00, 1.5, 1,5, "1h 30m", "90m", "2h". */
export function parseDuration(v: string): number | null {
  v = v.trim().toLowerCase();
  if (!v) return null;
  let m = v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 60;
  m = v.match(/^(?:(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/);
  if (m && (m[1] || m[2] || m[3]))
    return Number((m[1] ?? "0").replace(",", ".")) * 60 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n * 60 : null; // plain number = hours
}

const truthy = (v: string) => /^(y|yes|true|1|billable|x|✓)$/i.test(v.trim());

function clockKind(v: string): "in" | "out" | null {
  const s = v.trim().toLowerCase();
  if (/(^|\b)(in|clock ?in|clocked ?in|jibble ?in|start|check ?in)\b/.test(s) && !/out/.test(s)) return "in";
  if (/(^|\b)(out|clock ?out|clocked ?out|jibble ?out|stop|end|check ?out)\b/.test(s)) return "out";
  return null;
}

// ---- 4. Rows -> sessions ---------------------------------------------------------------------

export interface ImportedEntry {
  start: Date;
  end: Date;
  member: string;
  project: string;
  client: string;
  projectCode: string;
  description: string;
  billable: boolean;
  row: number; // line in the file, for error messages
}

export interface BuildResult {
  entries: ImportedEntry[];
  problems: { row: number; reason: string }[];
  members: string[];
}

const at = (ymd: [number, number, number], minutes: number) =>
  new Date(ymd[0], ymd[1], ymd[2], 0, 0, 0, Math.round(minutes * 60000));

export function buildEntries(rows: string[][], m: Mapping, order: DateOrder, onlyMember?: string): BuildResult {
  const get = (r: string[], f: Field) => (m[f] !== undefined ? (r[m[f]!] ?? "").trim() : "");
  const members = [...new Set(rows.map((r) => get(r, "member")).filter(Boolean))].sort();
  const problems: BuildResult["problems"] = [];
  const entries: ImportedEntry[] = [];
  const rowOf = (i: number) => i + 2; // +1 for the header, +1 because people count from 1

  const describe = (r: string[]) => [get(r, "task"), get(r, "description")].filter(Boolean).join(" · ");
  const base = (r: string[], i: number) => ({
    member: get(r, "member"),
    project: get(r, "project"),
    client: get(r, "client"),
    projectCode: get(r, "projectCode"),
    description: describe(r),
    billable: truthy(get(r, "billable")),
    row: rowOf(i),
  });
  const wanted = (r: string[]) => !onlyMember || get(r, "member") === onlyMember;

  if (m.entryType !== undefined) {
    // Clock events: sort each person's events by time; an "In" opens a session that the next
    // In (switching project/activity) or Out closes.
    const events: { when: Date; kind: "in" | "out"; r: string[]; i: number }[] = [];
    rows.forEach((r, i) => {
      if (!wanted(r)) return;
      const kind = clockKind(get(r, "entryType"));
      const ymd = parseDate(get(r, "date"), order);
      const t = parseTime(get(r, "startTime"));
      if (!kind) return; // breaks and other event types are ignored
      if (!ymd || t === null) return problems.push({ row: rowOf(i), reason: "No readable date or time" });
      events.push({ when: at(ymd, t), kind, r, i });
    });
    const byMember = new Map<string, typeof events>();
    for (const e of events) {
      const k = get(e.r, "member");
      byMember.set(k, [...(byMember.get(k) ?? []), e]);
    }
    for (const list of byMember.values()) {
      list.sort((a, b) => a.when.getTime() - b.when.getTime());
      let open: (typeof events)[number] | null = null;
      for (const e of list) {
        if (open && e.when > open.when) entries.push({ ...base(open.r, open.i), start: open.when, end: e.when });
        open = e.kind === "in" ? e : null;
      }
      if (open) problems.push({ row: rowOf(open.i), reason: "Clock-in without a clock-out (still running?)" });
    }
    return { entries, problems, members };
  }

  // One row per session.
  const nextFree = new Map<string, number>(); // for date + hours only: stack sessions from 9:00
  rows.forEach((r, i) => {
    if (!wanted(r)) return;
    const ymd = parseDate(get(r, "date"), order);
    if (!ymd) return problems.push({ row: rowOf(i), reason: `Unreadable date "${get(r, "date")}"` });
    const startMin = parseTime(get(r, "startTime"));
    const endMin = parseTime(get(r, "endTime"));
    const dur = parseDuration(get(r, "duration"));
    let start: Date;
    let end: Date;
    if (startMin !== null && endMin !== null) {
      start = at(ymd, startMin);
      const endYmd = (get(r, "endDate") && parseDate(get(r, "endDate"), order)) || ymd;
      end = at(endYmd, endMin);
      if (end <= start) end = new Date(end.getTime() + 864e5); // ran past midnight
    } else if (startMin !== null && dur !== null) {
      start = at(ymd, startMin);
      end = new Date(start.getTime() + dur * 60000);
    } else if (dur !== null) {
      const key = `${ymd.join("-")}|${get(r, "member")}`;
      const from = nextFree.get(key) ?? 9 * 60;
      start = at(ymd, from);
      end = new Date(start.getTime() + dur * 60000);
      nextFree.set(key, from + dur);
    } else {
      return problems.push({ row: rowOf(i), reason: "No end time or duration" });
    }
    if (end.getTime() - start.getTime() < 60000) return problems.push({ row: rowOf(i), reason: "Shorter than a minute" });
    if (end.getTime() - start.getTime() > 24 * 3600000) return problems.push({ row: rowOf(i), reason: "Longer than 24 hours" });
    entries.push({ ...base(r, i), start, end });
  });
  return { entries, problems, members };
}

// ---- 5. Merge into the tracker -------------------------------------------------------------

const sig = (start: string, end: string, project: string, desc: string) =>
  `${new Date(start).getTime()}|${new Date(end).getTime()}|${project.toLowerCase()}|${desc.trim().toLowerCase()}`;

/** Which sessions are new, and which projects need creating (matched by name, ignoring case). */
export function planImport(data: AppData, imported: ImportedEntry[]) {
  const projectName = (id: string | null) => data.projects.find((p) => p.id === id)?.name ?? "";
  const existing = new Set(data.entries.filter((e) => e.end).map((e) => sig(e.start, e.end!, projectName(e.projectId), e.description)));
  const known = new Set(data.projects.map((p) => p.name.toLowerCase()));
  const newProjects = new Map<string, { name: string; client?: string; code?: string }>();
  const fresh: ImportedEntry[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const e of imported) {
    const s = sig(e.start.toISOString(), e.end.toISOString(), e.project, e.description);
    if (existing.has(s) || seen.has(s)) {
      duplicates++;
      continue;
    }
    seen.add(s);
    fresh.push(e);
    const key = e.project.toLowerCase();
    if (e.project && !known.has(key) && !newProjects.has(key))
      newProjects.set(key, { name: e.project, client: e.client || undefined, code: e.projectCode || undefined });
  }
  return { fresh, newProjects: [...newProjects.values()], duplicates };
}
