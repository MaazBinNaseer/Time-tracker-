import { addDays, dayKey } from "./time.ts";
import type { Settings } from "./types.ts";

/**
 * Work week and holidays: which days are normal work days, and how many hours you're expected
 * to work in a period. Weekends and holidays aren't blocked; time logged on them still counts.
 */

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];
export const DEFAULT_HOURS_PER_DAY = 8;

/** The nth weekday of a month (n = -1 for the last one). weekday: 0 = Sunday. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}

/** A fixed-date holiday falling on Saturday is observed Friday; on Sunday, Monday. */
function observed(d: Date): Date {
  if (d.getDay() === 6) return addDays(d, -1);
  if (d.getDay() === 0) return addDays(d, 1);
  return d;
}

/** The 11 US federal holidays for a year, on the days they are observed. */
export function federalHolidays(year: number): { date: string; name: string }[] {
  const list: [Date, string][] = [
    [observed(new Date(year, 0, 1)), "New Year's Day"],
    [nthWeekday(year, 0, 1, 3), "Martin Luther King Jr. Day"],
    [nthWeekday(year, 1, 1, 3), "Washington's Birthday"],
    [nthWeekday(year, 4, 1, -1), "Memorial Day"],
    [observed(new Date(year, 5, 19)), "Juneteenth"],
    [observed(new Date(year, 6, 4)), "Independence Day"],
    [nthWeekday(year, 8, 1, 1), "Labor Day"],
    [nthWeekday(year, 9, 1, 2), "Columbus Day"],
    [observed(new Date(year, 10, 11)), "Veterans Day"],
    [nthWeekday(year, 10, 4, 4), "Thanksgiving Day"],
    [observed(new Date(year, 11, 25)), "Christmas Day"],
  ];
  return list.map(([d, name]) => ({ date: dayKey(d), name }));
}

/** Name of the holiday on this day, or null. Your own holidays win over federal ones. */
export function holidayOn(day: string, s: Settings | undefined): string | null {
  const own = s?.holidays?.find((h) => h.date === day);
  if (own) return own.name || "Day off";
  if (s?.federalHolidays) {
    const year = Number(day.slice(0, 4));
    // New Year's Day can be observed on 31 December of the year before.
    const hit = [...federalHolidays(year), ...federalHolidays(year + 1)].find((h) => h.date === day);
    if (hit) return hit.name;
  }
  return null;
}

/** "weekend", "holiday" (with its name) or "work". */
export function dayKind(date: Date, s: Settings | undefined): { kind: "work" | "weekend" | "holiday"; name?: string } {
  const holiday = holidayOn(dayKey(date), s);
  if (holiday) return { kind: "holiday", name: holiday };
  const workDays = s?.workDays ?? DEFAULT_WORK_DAYS;
  return workDays.includes(date.getDay()) ? { kind: "work" } : { kind: "weekend" };
}

/** Work days in [from, to) and the hours you'd normally work in them. */
export function expected(from: Date, to: Date, s: Settings | undefined) {
  let days = 0;
  for (let d = new Date(from); d < to; d = addDays(d, 1)) if (dayKind(d, s).kind === "work") days++;
  return { days, ms: days * (s?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY) * 3_600_000 };
}
