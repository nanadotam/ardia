import assert from "node:assert/strict";
import { test } from "node:test";
const { foldersFromAnswer, foldersBySite, tidyPrompt } = await import("./tidyTabsPlan.ts");

const tabs = [
  { id: "a", title: "Senior Designer – LinkedIn", url: "https://www.linkedin.com/jobs/1" },
  { id: "b", title: "Product Designer | Indeed", url: "https://www.indeed.com/viewjob?jk=2" },
  { id: "c", title: "Pinterest", url: "https://www.pinterest.com/" },
  { id: "d", title: "Living room ideas", url: "https://www.pinterest.com/search/pins/?q=living" },
  { id: "e", title: "Lonely tab", url: "https://example.com/" },
];

test("the model's folders keep only real, unused tabs, two or more each, with tidy names", () => {
  const answer = { folders: [{ name: "  Job   Search ", tabs: [0, 1, 99] }, { name: "Home Ideas", tabs: [1, 2, 3] }, { name: "Solo", tabs: [4] }, { tabs: [2, 3] }] };
  assert.deepEqual(foldersFromAnswer(answer, tabs), [
    { name: "Job Search", tabIds: ["a", "b"] },
    { name: "Home Ideas", tabIds: ["c", "d"] },
  ]);
  assert.deepEqual(foldersFromAnswer("nonsense", tabs), []);
});

test("without a model, tabs from the same site share a folder and singles stay loose", () => {
  const folders = foldersBySite(tabs);
  assert.equal(folders.length, 1);
  assert.deepEqual(folders[0].tabIds, ["c", "d"]);
  assert.match(folders[0].name, /pinterest/i);
});

test("the prompt numbers each tab with its title and host", () => {
  assert.match(tidyPrompt(tabs), /^0\. Senior Designer – LinkedIn — (www\.)?linkedin\.com/);
});

test("indexes written as the tab's line, as small local models do, still count", () => {
  const answer = { folders: [{ name: "Job Search", tabs: ["0. Senior Designer – LinkedIn — linkedin.com", "1. Product Designer"] }] };
  assert.deepEqual(foldersFromAnswer(answer, tabs), [{ name: "Job Search", tabIds: ["a", "b"] }]);
});
