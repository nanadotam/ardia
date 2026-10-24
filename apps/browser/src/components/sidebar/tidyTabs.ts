import { create } from "zustand";
import { ask, extractJson, providerName } from "../../lib/ai";
import { useBrowser, type BrowserState } from "../../store/browser";
import { plural } from "../../store/model";
import { showToast } from "../layout/splitActions";
import { sidebarEntries } from "./entries";
import { foldersBySite, foldersFromAnswer, TIDY_INSTRUCTIONS, TIDY_MIN_TABS, tidyPrompt, type TidyFolder, type TidyTab } from "./tidyTabsPlan";

export const useTidyingTabs = create<{ busy: Record<string, true> }>(() => ({ busy: {} }));

export function looseTabs(s: BrowserState, windowId: string, profileId?: string): TidyTab[] {
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

export async function tidyTabs(windowId: string) {
  if (useTidyingTabs.getState().busy[windowId]) return;
  const tabs = looseTabs(useBrowser.getState(), windowId);
  if (tabs.length < 2) return;
  setBusy(windowId, true);
  try {
    const { folders, by } = await plan(tabs);
    const s = useBrowser.getState();
    const live = folders.map((f) => ({ ...f, tabIds: f.tabIds.filter((id) => s.tabs[id] && !s.tabs[id]!.pinned) })).filter((f) => f.tabIds.length >= 2);
    if (!live.length) {
      showToast(windowId, "Nothing to tidy", "No tabs here belong together yet.", { icon: "sparkles" });
      return;
    }
    const created = live.map((f) => useBrowser.getState().createGroup(f.tabIds, { name: f.name }));
    const count = live.reduce((n, f) => n + f.tabIds.length, 0);
    showToast(windowId, `Tidied ${plural(count, "Tab")} into ${plural(created.length, "Folder")}`, by === "site" ? "Grouped by site" : `With ${by}`, {
      icon: "sparkles",
      action: { title: "Undo", run: () => created.forEach((id) => useBrowser.getState().groups[id] && useBrowser.getState().ungroup(id)) },
    });
  } finally {
    setBusy(windowId, false);
  }
}
