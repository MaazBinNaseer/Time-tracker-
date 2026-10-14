import { test } from "node:test";
import assert from "node:assert/strict";
import { setCellTotal } from "../src/lib/timesheet.ts";
import { rollupByDay } from "../src/lib/time.ts";
import type { TimeEntry } from "../src/lib/types.ts";

const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString(); // Mon 12 Oct, local time
const e = (id: string, pid: string | null, s: string, en: string | null): TimeEntry => ({ id, projectId: pid, description: id, start: s, end: en });
const now = new Date(2026, 9, 14, 12);
let n = 0;
const make = (f: Omit<TimeEntry, "id">): TimeEntry => ({ ...f, id: `new${++n}` });
const total = (entries: TimeEntry[], pid: string | null) =>
  rollupByDay(entries, now).find((d) => d.day === "2026-10-12")?.projects.find((p) => p.projectId === pid)?.ms ?? 0;
const H = 3_600_000;

test("more time stretches the day's last session", () => {
  const before = [e("a", "p", at(9), at(10)), e("b", "p", at(13), at(14))];
  const after = setCellTotal(before, "p", "2026-10-12", 3.5 * H, now, make);
  assert.equal(total(after, "p"), 3.5 * H);
  assert.equal(after.find((x) => x.id === "b")!.end, at(15, 30));
  assert.equal(after.find((x) => x.id === "a")!.end, at(10));
});

test("an empty day gets a new session after the day's other work", () => {
  const before = [e("x", "other", at(8), at(12))];
  const after = setCellTotal(before, "p", "2026-10-12", 2 * H, now, make);
  const added = after.find((x) => x.projectId === "p")!;
  assert.equal(added.start, at(12));
  assert.equal(added.end, at(14));
});

test("less time trims from the end and removes sessions that reach zero", () => {
  const before = [e("a", "p", at(9), at(11)), e("b", "p", at(13), at(14))];
  const after = setCellTotal(before, "p", "2026-10-12", 1.5 * H, now, make);
  assert.equal(total(after, "p"), 1.5 * H);
  assert.ok(!after.some((x) => x.id === "b"));
  assert.equal(after.find((x) => x.id === "a")!.end, at(10, 30));
});

test("zero clears the cell and leaves other projects alone", () => {
  const before = [e("a", "p", at(9), at(11)), e("x", "other", at(11), at(12))];
  const after = setCellTotal(before, "p", "2026-10-12", 0, now, make);
  assert.equal(total(after, "p"), 0);
  assert.equal(total(after, "other"), H);
});
