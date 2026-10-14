import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeData, stampChanges } from "../src/lib/merge.ts";
import { DEFAULT_WORK_TYPES, type AppData, type TimeEntry } from "../src/lib/types.ts";

const base = (): AppData => ({ version: 1, projects: [], entries: [], updatedAt: "2026-10-13T08:00:00.000Z" });
const entry = (id: string, start: string, end: string | null, desc = id): TimeEntry => ({
  id, projectId: null, description: desc, start, end,
});
const t = (h: number) => new Date(Date.UTC(2026, 9, 13, h)).toISOString();

test("sessions added in two windows are both kept", () => {
  const start = base();
  const tabA = stampChanges(start, { ...start, entries: [entry("a", t(9), t(10))] }, new Date(t(10)));
  const tabB = stampChanges(start, { ...start, entries: [entry("b", t(11), t(12))] }, new Date(t(12)));
  const merged = mergeData(tabA, tabB);
  assert.deepEqual(merged.entries.map((e) => e.id).sort(), ["a", "b"]);
});

test("the most recent edit of the same session wins", () => {
  const start = stampChanges(base(), { ...base(), entries: [entry("a", t(9), t(10), "old")] }, new Date(t(10)));
  const tabA = stampChanges(start, { ...start, entries: [{ ...start.entries[0], description: "from A" }] }, new Date(t(11)));
  const tabB = stampChanges(start, { ...start, entries: [{ ...start.entries[0], description: "from B" }] }, new Date(t(12)));
  assert.equal(mergeData(tabA, tabB).entries[0].description, "from B");
  assert.equal(mergeData(tabB, tabA).entries[0].description, "from B");
});

test("a deletion in one window is not undone by the other", () => {
  const start = stampChanges(base(), { ...base(), entries: [entry("a", t(9), t(10)), entry("b", t(10), t(11))] }, new Date(t(11)));
  const tabA = stampChanges(start, { ...start, entries: start.entries.filter((e) => e.id !== "a") }, new Date(t(12)));
  const merged = mergeData(start, tabA);
  assert.deepEqual(merged.entries.map((e) => e.id), ["b"]);
});

test("two running timers: the later one keeps running, the earlier stops when it began", () => {
  const tabA = stampChanges(base(), { ...base(), entries: [entry("a", t(9), null)] }, new Date(t(9)));
  const tabB = stampChanges(base(), { ...base(), entries: [entry("b", t(10), null)] }, new Date(t(10)));
  const merged = mergeData(tabA, tabB);
  assert.equal(merged.entries.find((e) => e.id === "b")!.end, null);
  assert.equal(merged.entries.find((e) => e.id === "a")!.end, t(10));
});

test("work type edits from two windows combine, and a removed starter type stays removed", () => {
  const start = base(); // still on the starter list
  // Window A removes "Leave"; window B renames "Fieldwork" and adds "Lab work".
  const tabA = stampChanges(start, { ...start, workTypes: DEFAULT_WORK_TYPES.filter((t) => t.id !== "type-leave") }, new Date(t(10)));
  const tabB = stampChanges(start, {
    ...start,
    workTypes: [
      ...DEFAULT_WORK_TYPES.map((x) => (x.id === "type-field" ? { ...x, name: "Field work" } : x)),
      { id: "type-lab", name: "Lab work", color: "#000000", billable: "project" as const },
    ],
  }, new Date(t(11)));
  const merged = mergeData(tabA, tabB);
  const names = merged.workTypes!.map((x) => x.name);
  assert.ok(!names.includes("Leave / Time off"));
  assert.ok(names.includes("Field work") && !names.includes("Fieldwork"));
  assert.ok(names.includes("Lab work"));
});

test("data without a type list keeps none after merging", () => {
  assert.equal(mergeData(base(), base()).workTypes, undefined);
});
