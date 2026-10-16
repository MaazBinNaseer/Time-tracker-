import { test } from "node:test";
import assert from "node:assert/strict";
import { hasFormatting, parseLine, toPlain, toSummary, toggleCheck } from "../src/lib/richtext.ts";

test("reads bullets, numbers and checkboxes", () => {
  assert.deepEqual(parseLine("- Sampled MW-3"), { kind: "bullet", text: "Sampled MW-3" });
  assert.deepEqual(parseLine("2. Wrote memo"), { kind: "number", n: 2, text: "Wrote memo" });
  assert.deepEqual(parseLine("[x] Call client"), { kind: "check", done: true, text: "Call client" });
  assert.deepEqual(parseLine("- [ ] Resample"), { kind: "check", done: false, text: "Resample" });
  assert.equal(parseLine("Plain sentence").kind, "text");
});

test("plain and one-line versions drop the marks", () => {
  const t = "**Site visit**\n- MW-3\n[x] Access sorted";
  assert.equal(toPlain(t), "Site visit\n• MW-3\n☑ Access sorted");
  assert.equal(toSummary(t), "Site visit · MW-3 · ☑ Access sorted");
  assert.ok(hasFormatting(t));
  assert.ok(!hasFormatting("Just text\nover two lines"));
});

test("toggling a checkbox only changes that line", () => {
  assert.equal(toggleCheck("[ ] a\n[ ] b", 1), "[ ] a\n[x] b");
  assert.equal(toggleCheck("[x] a", 0), "[ ] a");
});
