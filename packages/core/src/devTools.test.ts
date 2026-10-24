import assert from "node:assert/strict";
import { test } from "node:test";
import { devDecode, devJump } from "./devTools.ts";
import { buildSuggestions } from "./suggest.ts";

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const empty = { tabs: [], history: [] };

test("keywords jump to developer sites", () => {
  assert.deepEqual(devJump("gh mantrakp04/ardia"), { url: "https://github.com/mantrakp04/ardia", title: "mantrakp04/ardia on GitHub" });
  assert.equal(devJump("npm react")?.url, "https://www.npmjs.com/package/react");
  assert.equal(devJump("npm @types/node")?.url, "https://www.npmjs.com/package/@types/node");
  assert.equal(devJump("npm date picker")?.url, "https://www.npmjs.com/search?q=date%20picker");
  assert.equal(devJump("MDN grid")?.url, "https://developer.mozilla.org/en-US/search?q=grid");
  assert.equal(devJump("caniuse :has")?.url, "https://caniuse.com/?search=%3Ahas");
  assert.equal(devJump("so rust lifetimes")?.url, "https://stackoverflow.com/search?q=rust%20lifetimes");
  assert.equal(devJump("gh"), null);
  assert.equal(devJump("github react"), null);
});

test("gh with a number opens it in the current tab's repo, else searches", () => {
  assert.equal(devJump("gh 66", "https://github.com/mantrakp04/ardia/issues")?.url, "https://github.com/mantrakp04/ardia/pull/66");
  assert.equal(devJump("gh #66", "https://example.com/")?.url, "https://github.com/search?q=%2366");
});

test("a pasted JWT decodes to its payload", () => {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: "nana", exp: NOW / 1000 + 3 * 3600 })}.sig`;
  const decoded = devDecode(jwt, NOW);
  assert.equal(decoded?.summary, "JWT · alg HS256 · sub nana · expires in 3h");
  assert.deepEqual(JSON.parse(decoded!.value), { sub: "nana", exp: NOW / 1000 + 3 * 3600 });
  assert.equal(devDecode("eyJ.not.ajwt", NOW), null);
});

test("a Unix timestamp in seconds or milliseconds decodes to an ISO date", () => {
  assert.deepEqual(devDecode(String(NOW / 1000 + 86400), NOW), { summary: "Unix time · in 1d", value: "2026-10-25T12:00:00.000Z" });
  assert.equal(devDecode(String(NOW - 86_400_000), NOW)?.summary, "Unix time · 1d ago");
  assert.equal(devDecode("12345", NOW), null);
});

test("the command bar puts the jump first and the decoded value after the search", () => {
  const jump = buildSuggestions("npm react", empty, { now: NOW });
  assert.deepEqual(jump.items[0], { kind: "page", url: "https://www.npmjs.com/package/react", title: "react on npm", favicon: null });
  assert.equal(jump.items[1]?.kind, "search");
  const time = buildSuggestions(String(NOW / 1000 + 86400), empty, { now: NOW });
  assert.equal(time.items.find((s) => s.kind === "calc")?.kind === "calc" && time.items.find((s) => s.kind === "calc")?.value, "2026-10-25T12:00:00.000Z");
});
