// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupByDay, rangeStats } from "../src/lib/time.ts";
import type { TimeEntry } from "../src/lib/types.ts";

const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();
const e = (id: string, projectId: string | null, day: string, from: string, to: string): TimeEntry => ({
  id, projectId, description: id, start: at(day, from), end: at(day, to),
});
const H = 3_600_000;
const now = new Date("2026-10-13T23:00:00");

test("several sessions on one project in a day become one row with the total", () => {
  const days = rollupByDay([
    e("a", "web", "2026-10-13", "09:00", "10:00"),
    e("b", "app", "2026-10-13", "10:00", "11:30"),
    e("c", "web", "2026-10-13", "13:00", "13:30"),
    e("d", "web", "2026-10-13", "16:00", "17:00"),
  ], now);
  assert.equal(days.length, 1);
  assert.equal(days[0].projects.length, 2);
  const web = days[0].projects.find((p) => p.projectId === "web")!;
  assert.equal(web.ms, 2.5 * H);
  assert.equal(web.sessions.length, 3);
  assert.equal(days[0].ms, 4 * H);
  assert.equal(days[0].projects[0].projectId, "web"); // biggest first
});

test("a session across midnight is split between the two days", () => {
  const entry: TimeEntry = { id: "x", projectId: "web", description: "", start: at("2026-10-11", "23:00"), end: at("2026-10-12", "01:30") };
  const days = rollupByDay([entry], now);
  assert.deepEqual(days.map((d) => [d.day, d.ms]), [["2026-10-12", 1.5 * H], ["2026-10-11", 1 * H]]);
});

test("a running timer counts up to now", () => {
  const running: TimeEntry = { id: "r", projectId: "web", description: "", start: at("2026-10-13", "21:00"), end: null };
  const [day] = rollupByDay([running], now);
  assert.equal(day.ms, 2 * H);
  assert.equal(day.projects[0].running, true);
});

test("range stats total per project and per hour", () => {
  const s = rangeStats([e("a", "web", "2026-10-13", "09:30", "11:00")], new Date("2026-10-13T00:00:00"), new Date("2026-10-14T00:00:00"), now);
  assert.equal(s.total, 1.5 * H);
  assert.equal(s.byProject.get("web"), 1.5 * H);
  assert.equal(s.byHour[9], 0.5 * H);
  assert.equal(s.byHour[10], 1 * H);
});

import { parseHours } from "../src/lib/time.ts";

test("hours box accepts 4, 4.5, 4,5 and 4:30", () => {
  assert.equal(parseHours("4"), 240);
  assert.equal(parseHours("4.5"), 270);
  assert.equal(parseHours("4,5"), 270);
  assert.equal(parseHours("4:30"), 270);
  assert.equal(parseHours("abc"), null);
  assert.equal(parseHours(""), null);
});

test("billable time is rolled up alongside the total", () => {
  const days = rollupByDay([
    { ...e("a", "web", "2026-10-13", "08:00", "12:00"), billable: true },
    e("b", "web", "2026-10-13", "13:00", "14:00"),
  ], now);
  assert.equal(days[0].projects[0].ms, 5 * H);
  assert.equal(days[0].projects[0].billableMs, 4 * H);
});
