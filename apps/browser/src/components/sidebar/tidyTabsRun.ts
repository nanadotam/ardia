import { create } from "zustand";
import { aiAllowedIn, ask, extractJson, providerName } from "../../lib/ai";
import { useBrowser, type BrowserState } from "../../store/browser";
import { sidebarEntries } from "./entries";
import { foldersBySite, foldersFromAnswer, TIDY_INSTRUCTIONS, TIDY_MIN_TABS, tidyPrompt, type TidyFolder, type TidyTab } from "./tidyTabsPlan";

export const useTidyingTabs = create<{ busy: Record<string, true> }>(() => ({ busy: {} }));

export type TidyOutcome =
  | { kind: "private" }
  | { kind: "busy" }
  | { kind: "nothing" }
  | { kind: "tidied"; tabs: number; created: string[]; by: string };

export function looseTabs(s: BrowserState, windowId: string, profileId?: string): TidyTab[] {
  if (!aiAllowedIn(s, windowId)) return [];
  return sidebarEntries(s, windowId, profileId).list.flatMap((entry) => {
    const tab = entry.startsWith("t:") ? s.tabs[entry.slice(2)] : undefined;
    return tab && tab.url ? [{ id: tab.id, title: tab.customTitle || tab.title || tab.url, url: tab.url }] : [];
  });
}

export function canTidyTabs(s: BrowserState, windowId: string, profileId?: string): boolean {
  return looseTabs(s, windowId, profileId).length >= TIDY_MIN_TABS;
}

function setBusy(windowId: string, on: boolean) {
  useTidyingTabs.setState((s) => {
    const { [windowId]: _, ...rest } = s.busy;
    return { busy: on ? { ...rest, [windowId]: true } : rest };
  });
}

async function plan(tabs: TidyTab[]): Promise<{ folders: TidyFolder[]; by: string }> {
  try {
    const { text, provider } = await ask(TIDY_INSTRUCTIONS, tidyPrompt(tabs), { json: true });
    const folders = foldersFromAnswer(extractJson(text), tabs);
    if (folders.length) return { folders, by: providerName(provider) };
  } catch {}
  return { folders: foldersBySite(tabs), by: "site" };
}

export async function runTidy(windowId: string): Promise<TidyOutcome> {
  if (!aiAllowedIn(useBrowser.getState(), windowId)) return { kind: "private" };
  if (useTidyingTabs.getState().busy[windowId]) return { kind: "busy" };
  const tabs = looseTabs(useBrowser.getState(), windowId);
  if (tabs.length < 2) return { kind: "nothing" };
  setBusy(windowId, true);
  try {
    const { folders, by } = await plan(tabs);
    const stillLoose = new Set(looseTabs(useBrowser.getState(), windowId).map((t) => t.id));
    const live = folders.map((f) => ({ ...f, tabIds: f.tabIds.filter((id) => stillLoose.has(id)) })).filter((f) => f.tabIds.length >= 2);
    if (!live.length) return { kind: "nothing" };
    const created = live.map((f) => useBrowser.getState().createGroup(f.tabIds, { name: f.name }));
    return { kind: "tidied", tabs: live.reduce((n, f) => n + f.tabIds.length, 0), created, by };
  } finally {
    setBusy(windowId, false);
  }
}
