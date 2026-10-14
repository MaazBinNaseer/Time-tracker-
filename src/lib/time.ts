import type { TimeEntry } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day as "YYYY-MM-DD" (used as a grouping key). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday-based week start. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const offset = (s.getDay() + 6) % 7;
  return addDays(s, -offset);
}

export function entryEnd(e: TimeEntry, now: Date): Date {
  return e.end ? new Date(e.end) : now;
}

export function entryDuration(e: TimeEntry, now: Date): number {
  return Math.max(0, entryEnd(e, now).getTime() - new Date(e.start).getTime());
}

/** The part of one entry that falls on a single calendar day. */
export interface Segment {
  entry: TimeEntry;
  day: string;
  start: Date;
  end: Date;
  ms: number;
}

/**
 * Cut entries at local midnight so a session from 23:00 to 01:00 counts
 * one hour towards each day instead of two hours towards the first.
 */
export function toSegments(entries: TimeEntry[], now: Date): Segment[] {
  const out: Segment[] = [];
  for (const entry of entries) {
    let cursor = new Date(entry.start);
    const end = entryEnd(entry, now);
    while (cursor < end) {
      const nextMidnight = addDays(startOfDay(cursor), 1);
      const segEnd = nextMidnight < end ? nextMidnight : end;
      out.push({ entry, day: dayKey(cursor), start: cursor, end: segEnd, ms: segEnd.getTime() - cursor.getTime() });
      cursor = segEnd;
    }
  }
  return out;
}

/** One project's rolled-up total for one day, with the sessions behind it. */
export interface ProjectDay {
  projectId: string | null;
  ms: number;
  billableMs: number;
  sessions: Segment[];
  descriptions: string[];
  running: boolean;
}

export interface DayRollup {
  day: string;
  ms: number;
  projects: ProjectDay[];
}

/**
 * The core rule of the app: however many times you start and stop work on a
 * project during a day, that day shows ONE row for the project with the sum.
 */
export function rollupByDay(entries: TimeEntry[], now: Date): DayRollup[] {
  const days = new Map<string, Map<string | null, ProjectDay>>();
  for (const seg of toSegments(entries, now)) {
    let projects = days.get(seg.day);
    if (!projects) days.set(seg.day, (projects = new Map()));
    const pid = seg.entry.projectId;
    let pd = projects.get(pid);
    if (!pd) projects.set(pid, (pd = { projectId: pid, ms: 0, billableMs: 0, sessions: [], descriptions: [], running: false }));
    pd.ms += seg.ms;
    if (seg.entry.billable) pd.billableMs += seg.ms;
    pd.sessions.push(seg);
    if (seg.entry.end === null) pd.running = true;
    const desc = seg.entry.description.trim();
    if (desc && !pd.descriptions.includes(desc)) pd.descriptions.push(desc);
  }
  return [...days.entries()]
    .map(([day, projects]) => {
      const list = [...projects.values()];
      list.forEach((p) => p.sessions.sort((a, b) => b.start.getTime() - a.start.getTime()));
      list.sort((a, b) => b.ms - a.ms);
      return { day, ms: list.reduce((s, p) => s + p.ms, 0), projects: list };
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Totals for a date range [from, to): per project, and per day per project. */
export function rangeStats(entries: TimeEntry[], from: Date, to: Date, now: Date) {
  const byProject = new Map<string | null, number>();
  const byDay = new Map<string, Map<string | null, number>>();
  const byHour = new Array<number>(24).fill(0);
  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  let total = 0;
  let billable = 0;
  for (const seg of toSegments(entries, now)) {
    if (seg.day < fromKey || seg.day >= toKey) continue;
    const pid = seg.entry.projectId;
    total += seg.ms;
    if (seg.entry.billable) billable += seg.ms;
    byProject.set(pid, (byProject.get(pid) ?? 0) + seg.ms);
    let d = byDay.get(seg.day);
    if (!d) byDay.set(seg.day, (d = new Map()));
    d.set(pid, (d.get(pid) ?? 0) + seg.ms);
    // Spread the segment over the hours of the day it covers.
    let c = seg.start.getTime();
    const e = seg.end.getTime();
    while (c < e) {
      const h = new Date(c).getHours();
      const hourEnd = new Date(c);
      hourEnd.setMinutes(60, 0, 0);
      const stop = Math.min(hourEnd.getTime(), e);
      byHour[h] += stop - c;
      c = stop;
    }
  }
  const days: string[] = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) days.push(dayKey(d));
  return { total, billable, byProject, byDay, byHour, days };
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** 3725000 -> "1:02:05" (timer style). */
export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 3725000 -> "1h 02m" (report style). */
export function formatHM(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatHours(ms: number, digits = 1): string {
  return (ms / 3_600_000).toFixed(digits);
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(key: string, today = new Date()): string {
  const todayKey = dayKey(today);
  if (key === todayKey) return "Today";
  if (key === dayKey(addDays(today, -1))) return "Yesterday";
  return parseDayKey(key).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Per-project totals over [from, to) with the tasks (descriptions) behind them
 * and on how many distinct days each project was worked on.
 */
export function projectTotals(entries: TimeEntry[], from: Date, to: Date, now: Date) {
  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  const map = new Map<string | null, { ms: number; billableMs: number; sessions: Set<string>; days: Set<string>; tasks: Map<string, number> }>();
  for (const seg of toSegments(entries, now)) {
    if (seg.day < fromKey || seg.day >= toKey) continue;
    const pid = seg.entry.projectId;
    let t = map.get(pid);
    if (!t) map.set(pid, (t = { ms: 0, billableMs: 0, sessions: new Set(), days: new Set(), tasks: new Map() }));
    t.ms += seg.ms;
    if (seg.entry.billable) t.billableMs += seg.ms;
    t.sessions.add(seg.entry.id);
    t.days.add(seg.day);
    const desc = seg.entry.description.trim() || "No description";
    t.tasks.set(desc, (t.tasks.get(desc) ?? 0) + seg.ms);
  }
  return [...map.entries()]
    .map(([projectId, t]) => ({
      projectId,
      ms: t.ms,
      billableMs: t.billableMs,
      sessions: t.sessions.size,
      days: t.days.size,
      tasks: [...t.tasks.entries()].sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => b.ms - a.ms);
}

/** Accepts "4", "4.5", "4,5" or "4:30" and returns minutes, or null if unreadable. */
export function parseHours(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const hm = t.match(/^(\d+):([0-5]?\d)$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : null;
}
