import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKind, expected, federalHolidays, holidayOn } from "../src/lib/workdays.ts";

test("federal holidays land on the right days", () => {
  const h = Object.fromEntries(federalHolidays(2026).map((x) => [x.name, x.date]));
  assert.equal(h["Thanksgiving Day"], "2026-11-26");
  assert.equal(h["Memorial Day"], "2026-05-25");
  assert.equal(h["Martin Luther King Jr. Day"], "2026-01-19");
  assert.equal(h["Independence Day"], "2026-07-03"); // 4 July 2026 is a Saturday
  assert.equal(h["Columbus Day"], "2026-10-12");
  assert.equal(federalHolidays(2026).length, 11);
});

test("holidays only count when switched on; your own always do", () => {
  assert.equal(holidayOn("2026-11-26", {}), null);
  assert.equal(holidayOn("2026-11-26", { federalHolidays: true }), "Thanksgiving Day");
  assert.equal(holidayOn("2026-12-24", { holidays: [{ date: "2026-12-24", name: "Office closed" }] }), "Office closed");
  // New Year's Day 2028 is a Saturday, observed Friday 31 Dec 2027.
  assert.equal(holidayOn("2027-12-31", { federalHolidays: true }), "New Year's Day");
});

test("weekends and expected hours", () => {
  assert.equal(dayKind(new Date(2026, 9, 17), {}).kind, "weekend"); // Saturday
  assert.equal(dayKind(new Date(2026, 9, 16), {}).kind, "work");
  // Week of Mon 23 Nov 2026 has Thanksgiving: 4 work days, 32 hours.
  const week = expected(new Date(2026, 10, 23), new Date(2026, 10, 30), { federalHolidays: true });
  assert.equal(week.days, 4);
  assert.equal(week.ms, 32 * 3_600_000);
  // A 4-day week with 10-hour days.
  assert.equal(expected(new Date(2026, 9, 12), new Date(2026, 9, 19), { workDays: [1, 2, 3, 4], hoursPerDay: 10 }).ms, 40 * 3_600_000);
});
