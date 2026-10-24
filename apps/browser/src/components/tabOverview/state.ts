import { create } from "zustand";
import { expectFocus } from "../../lib/focusClaims";

export const TAB_OVERVIEW_FOCUS = "tabOverview";

type TabOverviewState = { open: Record<string, true> };

export const useTabOverview = create<TabOverviewState>()(() => ({ open: {} }));

const pinchScales = new Map<string, number>();

export function notePinchScale(tabId: string, scale: number) {
  if (scale > 1.01) pinchScales.set(tabId, scale);
  else pinchScales.delete(tabId);
}

export function pagePinched(tabId: string | null | undefined): boolean {
  return !!tabId && pinchScales.has(tabId);
}

export function tabOverviewOpen(windowId: string): boolean {
  return !!useTabOverview.getState().open[windowId];
}

export function openTabOverview(windowId: string) {
  if (tabOverviewOpen(windowId)) return;
  expectFocus(windowId, TAB_OVERVIEW_FOCUS);
  useTabOverview.setState((s) => ({ open: { ...s.open, [windowId]: true } }));
}

export function closeTabOverview(windowId: string) {
  if (!tabOverviewOpen(windowId)) return;
  useTabOverview.setState((s) => {
    const { [windowId]: _, ...open } = s.open;
    return { open };
  });
}

export function toggleTabOverview(windowId: string) {
  if (tabOverviewOpen(windowId)) closeTabOverview(windowId);
  else openTabOverview(windowId);
}
