import assert from "node:assert/strict";
import { test } from "node:test";
import { byDay } from "./state.ts";

test("archived items group by day, newest first", () => {
  const now = new Date(2026, 9, 24, 15, 0);
  const at = (d, h = 10) => new Date(2026, 9, d, h).getTime();
  const items = [{ t: at(24, 9) }, { t: at(23) }, { t: at(24, 14) }, { t: at(20) }, { t: at(12) }, { t: new Date(2026, 7, 2).getTime() }];
  const groups = byDay(items, (i) => i.t, now);
  assert.deepEqual(groups.map((g) => [g.title, g.items.length]), [
    ["Today", 2],
    ["Yesterday", 1],
    ["4 days ago", 1],
    ["Last week", 1],
    [new Date(2026, 7, 2).toLocaleDateString(undefined, { month: "long", year: "numeric" }), 1],
  ]);
  assert.equal(groups[0].items[0].t, at(24, 14), "newest first within a day");
});
