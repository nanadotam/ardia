import assert from "node:assert/strict";
import { test } from "node:test";
const { kindOf, matchesFilter, filterCounts, summarize } = await import("./downloadManager.ts");

const dl = (over) => ({ id: "1", url: "https://x.example/f", filename: "f.bin", path: "", state: "downloading", paused: false, received: 0, total: 0, speed: 0, mimeType: "", ...over });

test("downloads sort into kinds by extension, then by mime type", () => {
  assert.equal(kindOf(dl({ filename: "Report.PDF" })), "document");
  assert.equal(kindOf(dl({ filename: "Ardia.dmg" })), "app");
  assert.equal(kindOf(dl({ filename: "clip.mov" })), "video");
  assert.equal(kindOf(dl({ filename: "noext", mimeType: "audio/mpeg" })), "audio");
  assert.equal(kindOf(dl({ filename: "weird.xyz" })), "other");
});

test("filters split active, finished and failed, and count each", () => {
  const list = [dl({ id: "a" }), dl({ id: "b", state: "finished", filename: "a.zip" }), dl({ id: "c", state: "failed" }), dl({ id: "d", state: "cancelled" })];
  assert.deepEqual(list.filter((d) => matchesFilter(d, "failed")).map((d) => d.id), ["c", "d"]);
  const counts = filterCounts(list);
  assert.equal(counts.all, 4);
  assert.equal(counts.active, 1);
  assert.equal(counts.archive, 1);
});

test("the summary adds up running speed and gives one time left only when every active size is known", () => {
  const s = summarize([dl({ received: 50, total: 100, speed: 10 }), dl({ id: "2", received: 0, total: 100, speed: 15 }), dl({ id: "3", paused: true, received: 10, total: 20, speed: 99 })]);
  assert.equal(s.active, 3);
  assert.equal(s.paused, 1);
  assert.equal(s.speed, 25);
  assert.equal(s.secondsLeft, (220 - 60) / 25);
  assert.equal(summarize([dl({ speed: 5 })]).secondsLeft, null);
});
