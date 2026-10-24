import { keychainDelete, keychainGet, keychainSet, onDeviceModelStatus, onDeviceRespond } from "@ardia/shell";
import { useBrowser } from "../store/browser";

export type AiProvider = "auto" | "apple" | "local" | "claude" | "off";
export type ResolvedProvider = Exclude<AiProvider, "auto" | "off">;

const CLAUDE_KEY_ACCOUNT = "anthropic-api-key";
const CLAUDE_MODEL = "claude-haiku-5-5";
const LOCAL_TIMEOUT_MS = 1500;
const REQUEST_TIMEOUT_MS = 60_000;

export const PROVIDER_NAMES: Record<ResolvedProvider, string> = { apple: "Apple Intelligence", local: "Local model", claude: "Claude" };

export const getClaudeKey = () => keychainGet(CLAUDE_KEY_ACCOUNT).catch(() => null);
export const setClaudeKey = (key: string) => (key.trim() ? keychainSet(CLAUDE_KEY_ACCOUNT, key.trim()) : keychainDelete(CLAUDE_KEY_ACCOUNT));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The model took too long to answer.")), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

function localBase(): string {
  return useBrowser.getState().settings.aiLocalUrl.replace(/\/+$/, "");
}

const PREFERRED_LOCAL = [/^qwen3\.5/i, /^gemma/i, /^llama/i, /^mistral/i, /^qwen/i];

export function pickLocalModel(models: string[]): string | undefined {
  const local = models.filter((m) => !/[-:]cloud$/i.test(m) && !/vl|coder|embed/i.test(m));
  for (const pattern of PREFERRED_LOCAL) {
    const hit = local.find((m) => pattern.test(m));
    if (hit) return hit;
  }
  return local[0] ?? models[0];
}

export function localModels(base = localBase()): Promise<string[]> {
  return withTimeout(fetch(`${base}/models`), LOCAL_TIMEOUT_MS)
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j: { data?: { id: string }[] }) => (j.data ?? []).map((m) => m.id))
    .catch(() => []);
}

export async function resolveProvider(): Promise<ResolvedProvider | null> {
  const chosen = useBrowser.getState().settings.aiProvider;
  if (chosen === "off") return null;
  if (chosen !== "auto") return chosen;
  if (onDeviceModelStatus() === "available") return "apple";
  if ((await localModels()).length) return "local";
  if (await getClaudeKey()) return "claude";
  return null;
}

const isOllama = (base: string) => /:11434(\/|$)/.test(base);

async function askOllama(base: string, model: string, system: string, prompt: string, json: boolean): Promise<string> {
  const r = await withTimeout(
    fetch(`${base.replace(/\/v1$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        ...(json ? { format: "json" } : {}),
        options: { temperature: 0.2 },
        messages: [{ role: "system", content: system }, { role: "user", content: /^qwen3/i.test(model) ? `${prompt}\n/no_think` : prompt }],
      }),
    }),
    REQUEST_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`Ollama answered ${r.status}.`);
  const j = (await r.json()) as { message?: { content?: string } };
  return j.message?.content ?? "";
}

async function askLocal(system: string, prompt: string, json: boolean): Promise<string> {
  const base = localBase();
  const model = useBrowser.getState().settings.aiLocalModel || pickLocalModel(await localModels(base));
  if (!model) throw new Error("No local model is running. Start Ollama or LM Studio.");
  if (isOllama(base)) return askOllama(base, model, system, prompt, json);
  const r = await withTimeout(
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    }),
    REQUEST_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`The local model answered ${r.status}.`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

async function askClaude(system: string, prompt: string): Promise<string> {
  const key = await getClaudeKey();
  if (!key) throw new Error("Add a Claude API key in Settings › General › AI.");
  const r = await withTimeout(
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, system, messages: [{ role: "user", content: prompt }] }),
    }),
    REQUEST_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(r.status === 401 ? "Claude didn't accept the API key." : `Claude answered ${r.status}.`);
  const j = (await r.json()) as { content?: { type: string; text?: string }[] };
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

export async function ask(system: string, prompt: string, { json = false }: { json?: boolean } = {}): Promise<{ text: string; provider: ResolvedProvider }> {
  const provider = await resolveProvider();
  if (!provider) throw new Error("No AI is set up. Choose one in Settings › General › AI.");
  const text = provider === "apple" ? await withTimeout(onDeviceRespond(system, prompt), REQUEST_TIMEOUT_MS) : provider === "local" ? await askLocal(system, prompt, json) : await askClaude(system, prompt);
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), provider };
}

export function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^[ \t]*[*-][ \t]+/gm, "• ")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const body = fenced ?? text;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
