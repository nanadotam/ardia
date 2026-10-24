import assert from "node:assert/strict";
import { test } from "node:test";
const { pickLocalModel, plainText, extractJson } = await import("./ai.ts");

test("the default local model skips cloud, vision and coder models and prefers a solid general one", () => {
  assert.equal(pickLocalModel(["kimi-k3:cloud", "qwen3:4b", "qwen2.5vl:7b", "qwen3.5:9b", "qwen3-coder:480b-cloud"]), "qwen3.5:9b");
  assert.equal(pickLocalModel(["qwen3:4b"]), "qwen3:4b");
  assert.equal(pickLocalModel([]), undefined);
});

test("summaries lose markdown but keep their bullets", () => {
  assert.equal(plainText("Arc is a browser.\n\n*   **Release**: 2023\n- Dia next"), "Arc is a browser.\n\n• Release: 2023\n• Dia next");
});

test("JSON is found inside fences or prose", () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"folders":[]}\n```'), { folders: [] });
  assert.deepEqual(extractJson('here: {"a":1} done'), { a: 1 });
  assert.equal(extractJson("no json"), null);
});
