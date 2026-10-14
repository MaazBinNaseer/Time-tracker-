import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEntries, detectSource, guessDateOrder, guessMapping, parseCsv, parseDuration, parseTime, planImport } from "../src/lib/importer.ts";
import { emptyData } from "../src/lib/types.ts";

const load = (name: string) => parseCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const mins = (e: { start: Date; end: Date }) => (e.end.getTime() - e.start.getTime()) / 60000;

test("Toggl detailed export: one row per session, quotes, midnight crossing, member filter", () => {
  const [header, ...rows] = load("toggl.csv");
  assert.equal(detectSource(header), "Toggl Track");
  const m = guessMapping(header, rows);
  const { order } = guessDateOrder(rows.map((r) => r[m.date!]));
  const all = buildEntries(rows, m, order);
  assert.deepEqual(all.members, ["Omar", "Sara"]);
  const sara = buildEntries(rows, m, order, "Sara");
  assert.equal(sara.entries.length, 3);
  assert.equal(sara.entries[1].description, "Review, with client");
  assert.equal(sara.entries[0].billable, true);
  assert.equal(sara.entries[0].client, "Acme");
  assert.equal(mins(sara.entries[2]), 60); // 23:30 -> 00:30 next day
});

test("Jibble time entries: clock in/out events become sessions", () => {
  const [header, ...rows] = load("jibble.csv");
  assert.equal(detectSource(header), "Jibble (time entries)");
  const m = guessMapping(header, rows);
  assert.equal(header[m.startTime!], "Time");
  const { order, ambiguous } = guessDateOrder(rows.map((r) => r[m.date!]));
  assert.equal(order, "dmy");
  assert.equal(ambiguous, false);
  const { entries, problems } = buildEntries(rows, m, order);
  assert.equal(problems.length, 0);
  assert.deepEqual(entries.map(mins), [135, 45, 270]); // 8:00-10:15, 10:15-11:00, 13:00-17:30
  assert.equal(entries[0].description, "Design · Hero section");
  assert.equal(entries[2].projectCode, "ACM-APP");
});

test("importing the same file twice adds nothing the second time", () => {
  const [header, ...rows] = load("toggl.csv");
  const m = guessMapping(header, rows);
  const { entries } = buildEntries(rows, m, "ymd");
  const first = planImport(emptyData(), entries);
  assert.equal(first.fresh.length, 4);
  assert.deepEqual(first.newProjects.map((p) => p.name).sort(), ["Learning", "Mobile app", "Website redesign"]);
  const data = {
    ...emptyData(),
    projects: first.newProjects.map((p, i) => ({ id: `p${i}`, name: p.name, color: "#000", createdAt: "" })),
  };
  data.entries = first.fresh.map((e, i) => ({
    id: `e${i}`,
    projectId: data.projects.find((p) => p.name === e.project)!.id,
    description: e.description,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
  }));
  const second = planImport(data, entries);
  assert.equal(second.fresh.length, 0);
  assert.equal(second.duplicates, 4);
});

test("value formats", () => {
  assert.equal(parseTime("9:05 PM"), 21 * 60 + 5);
  assert.equal(parseTime("12:00 AM"), 0);
  assert.equal(parseTime("2026-10-13 08:30:00"), 8 * 60 + 30);
  assert.equal(parseDuration("1:30"), 90);
  assert.equal(parseDuration("1.5"), 90);
  assert.equal(parseDuration("1,25"), 75);
  assert.equal(parseDuration("2h 15m"), 135);
  assert.equal(parseDuration("45m"), 45);
});
