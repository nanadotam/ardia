import assert from "node:assert/strict";
import { test } from "node:test";
const { useBrowser } = await import("../../store/browser.ts");
const { runTidy: tidyTabs, looseTabs } = await import("./tidyTabsRun.ts");
const { aiAllowedIn, isWebPage } = await import("../../lib/ai.ts");

const S = () => useBrowser.getState();

function windowWithTabs(options = {}) {
  S().hydrate({});
  S().updateSettings({ aiProvider: "off" });
  const w = S().createWindow({ url: "https://start.example/", ...options });
  const ids = ["https://a.site.example/1", "https://a.site.example/2", "https://b.other.example/1", "https://b.other.example/2", "https://c.third.example/1", "https://c.third.example/2"].map((url) =>
    S().newTab(w, { url, background: true }),
  );
  return { w, ids };
}

test("Tidy Tabs and summaries are off in private windows", async () => {
  const { w } = windowWithTabs({ incognito: true });
  assert.equal(aiAllowedIn(S(), w), false);
  assert.deepEqual(looseTabs(S(), w), []);
  await tidyTabs(w);
  assert.equal(Object.keys(S().groups).length, 0, "nothing in a private window is grouped or sent anywhere");
});

test("a tab you file into your own folder while Tidy Tabs is thinking stays in your folder", async () => {
  const { w, ids } = windowWithTabs();
  const running = tidyTabs(w);
  const mine = S().createGroup([ids[0], ids[1]], { name: "Mine" });
  await running;
  assert.deepEqual(S().groups[mine].tabIds, [ids[0], ids[1]], "your folder keeps its tabs");
  const tidied = Object.values(S().groups).filter((g) => g.id !== mine);
  assert.ok(tidied.every((g) => !g.tabIds.includes(ids[0]) && !g.tabIds.includes(ids[1])));
  assert.ok(tidied.length >= 1, "the other tabs still get tidied");
});

test("only web pages can be summarized or sent to an AI", () => {
  assert.equal(isWebPage("https://example.com/"), true);
  assert.equal(isWebPage("file:///Users/me/taxes.pdf"), false);
  assert.equal(isWebPage("ardia://settings"), false);
  assert.equal(isWebPage(undefined), false);
});
