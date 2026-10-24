import { hostOf } from "@ardia/core";
import { siteKey, siteName } from "../../store/groupNames";

export type TidyTab = { id: string; title: string; url: string };
export type TidyFolder = { name: string; tabIds: string[] };

export const TIDY_MIN_TABS = 6;
const MAX_FOLDERS = 6;
const MAX_NAME = 28;

export const TIDY_INSTRUCTIONS =
  "You organise a browser's open tabs into folders, like Arc's Tidy Tabs. Group tabs that belong to the same task, topic or site. " +
  "Each folder needs at least two tabs and a short, plain name of one to three words in Title Case (for example \"Job Search\", \"Figma Files\", \"Recipes\"). " +
  "Leave tabs that fit nowhere out of every folder. Use between one and six folders. " +
  'Answer with JSON only, no prose: {"folders":[{"name":"...","tabs":[0,3]}]} where the numbers are the tab indexes you were given.';

export function tidyPrompt(tabs: TidyTab[]): string {
  return tabs.map((t, i) => `${i}. ${t.title.slice(0, 90)} — ${hostOf(t.url) || t.url.slice(0, 60)}`).join("\n");
}

function tabIndex(value: unknown): number {
  if (typeof value === "number") return Number.isInteger(value) ? value : -1;
  const m = typeof value === "string" ? /^\s*(\d+)/.exec(value) : null;
  return m ? Number(m[1]) : -1;
}

export function foldersFromAnswer(answer: unknown, tabs: TidyTab[]): TidyFolder[] {
  const folders = (answer as { folders?: unknown } | null)?.folders;
  if (!Array.isArray(folders)) return [];
  const used = new Set<number>();
  const out: TidyFolder[] = [];
  for (const f of folders) {
    const name = typeof f?.name === "string" ? f.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME) : "";
    const indexes: number[] = Array.isArray(f?.tabs)
      ? [...new Set<number>(f.tabs.map(tabIndex))].filter((i) => i >= 0 && i < tabs.length && !used.has(i))
      : [];
    if (!name || indexes.length < 2) continue;
    indexes.forEach((i) => used.add(i));
    out.push({ name, tabIds: indexes.map((i) => tabs[i]!.id) });
    if (out.length === MAX_FOLDERS) break;
  }
  return out;
}

export function foldersBySite(tabs: TidyTab[]): TidyFolder[] {
  const bySite = new Map<string, TidyTab[]>();
  for (const t of tabs) {
    const key = siteKey(t.url);
    if (key) bySite.set(key, [...(bySite.get(key) ?? []), t]);
  }
  return [...bySite.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_FOLDERS)
    .map((group) => ({ name: siteName(group.map((t) => ({ url: t.url, title: t.title }))), tabIds: group.map((t) => t.id) }));
}
