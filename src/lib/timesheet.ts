import { addDays, parseDayKey, toSegments } from "./time.ts";
import type { TimeEntry } from "./types.ts";

/**
 * Typing a new total into a week-view cell (one project, one day). The sessions behind the cell
 * are adjusted the way you'd do it by hand:
 *  - more time:  the day's last session on that project runs longer (or, with no session yet,
 *                a new one is added after the day's last session of any project, or at 9:00)
 *  - less time:  time comes off the end of the last session; if that isn't enough, the session
 *                before it shrinks too, and sessions that reach zero are removed
 * Only finished sessions are touched; a running timer is left alone.
 */
export function setCellTotal(
  entries: TimeEntry[],
  projectId: string | null,
  day: string,
  targetMs: number,
  now: Date,
  newEntry: (fields: Omit<TimeEntry, "id">) => TimeEntry,
): TimeEntry[] {
  const segs = toSegments(entries, now)
    .filter((s) => s.day === day && s.entry.projectId === projectId)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const current = segs.reduce((sum, s) => sum + s.ms, 0);
  let diff = Math.round((targetMs - current) / 60000) * 60000; // whole minutes
  if (diff === 0) return entries;

  const dayStart = parseDayKey(day);
  const dayEnd = addDays(dayStart, 1);
  const iso = (ms: number) => new Date(ms).toISOString();
  let out = entries;
  const replace = (id: string, patch: Partial<TimeEntry> | null) => {
    out = patch === null ? out.filter((e) => e.id !== id) : out.map((e) => (e.id === id ? { ...e, ...patch } : e));
  };

  if (diff > 0) {
    const last = segs.at(-1);
    // Grow the last session, as long as it stays on this day.
    if (last && last.entry.end !== null && last.end.getTime() + diff <= dayEnd.getTime() && new Date(last.entry.end).getTime() === last.end.getTime()) {
      replace(last.entry.id, { end: iso(last.end.getTime() + diff) });
      return out;
    }
    // Otherwise add a session: after everything else that day, else from 9:00, kept inside the day.
    const dayEnds = toSegments(entries, now).filter((s) => s.day === day).map((s) => s.end.getTime());
    let start = dayEnds.length ? Math.max(...dayEnds) : dayStart.getTime() + 9 * 3_600_000;
    if (start + diff > dayEnd.getTime()) start = dayEnd.getTime() - diff;
    const like = last?.entry;
    out = [
      ...out,
      newEntry({
        projectId,
        description: like?.description ?? "",
        typeId: like?.typeId,
        billable: like?.billable,
        start: iso(start),
        end: iso(start + diff),
      }),
    ];
    return out;
  }

  // Less time: trim from the end, latest session first.
  for (const s of [...segs].reverse()) {
    if (diff === 0) break;
    if (s.entry.end === null) continue; // never cut a running timer
    const cut = Math.min(s.ms, -diff);
    diff += cut;
    const startsToday = new Date(s.entry.start).getTime() === s.start.getTime();
    const endsToday = new Date(s.entry.end).getTime() === s.end.getTime();
    if (cut === s.ms && startsToday && endsToday) replace(s.entry.id, null);
    else if (endsToday) replace(s.entry.id, { end: iso(s.end.getTime() - cut) });
    else replace(s.entry.id, { start: iso(s.start.getTime() + cut) }); // runs past midnight: trim this day's start
  }
  return out;
}
