import { create } from "zustand";
import { expectFocus } from "../../lib/focusClaims";

export type LibrarySection = "spaces" | "archive" | "downloads" | "media";

type LibraryState = { open: Record<string, LibrarySection> };

export const LIBRARY_FOCUS = "library";

export const useLibrary = create<LibraryState>()(() => ({ open: {} }));

export const librarySection = (windowId: string): LibrarySection | undefined => useLibrary.getState().open[windowId];

export function openLibrary(windowId: string, section: LibrarySection = librarySection(windowId) ?? "spaces") {
  expectFocus(windowId, LIBRARY_FOCUS);
  useLibrary.setState((s) => ({ open: { ...s.open, [windowId]: section } }));
}

export function closeLibrary(windowId: string) {
  if (!librarySection(windowId)) return;
  useLibrary.setState((s) => {
    const { [windowId]: _, ...open } = s.open;
    return { open };
  });
}

export function toggleLibrary(windowId: string) {
  if (librarySection(windowId)) closeLibrary(windowId);
  else openLibrary(windowId);
}

export type DayGroup<T> = { title: string; items: T[] };

export function byDay<T>(items: readonly T[], at: (item: T) => number, now = new Date()): DayGroup<T>[] {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  const day = 86_400_000;
  const label = (t: number) => {
    if (t >= today) return "Today";
    if (t >= today - day) return "Yesterday";
    const days = Math.floor((today - startOf(new Date(t))) / day);
    if (days < 7) return `${days} days ago`;
    if (days < 14) return "Last week";
    return new Date(t).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  };
  const groups: DayGroup<T>[] = [];
  for (const item of [...items].sort((a, b) => at(b) - at(a))) {
    const title = label(at(item));
    const last = groups[groups.length - 1];
    if (last?.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}
