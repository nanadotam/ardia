import { useBrowser } from "../../store/browser";
import { plural } from "../../store/model";
import { showToast } from "../layout/splitActions";
import { runTidy } from "./tidyTabsRun";

export { canTidyTabs, looseTabs, useTidyingTabs } from "./tidyTabsRun";

export async function tidyTabs(windowId: string) {
  const outcome = await runTidy(windowId);
  if (outcome.kind === "private") return showToast(windowId, "Tidy Tabs is off in private windows", undefined, { icon: "sparkles" });
  if (outcome.kind === "nothing") return showToast(windowId, "Nothing to tidy", "No tabs here belong together yet.", { icon: "sparkles" });
  if (outcome.kind !== "tidied") return;
  const { created, tabs, by } = outcome;
  showToast(windowId, `Tidied ${plural(tabs, "Tab")} into ${plural(created.length, "Folder")}`, by === "site" ? "Grouped by site" : `With ${by}`, {
    icon: "sparkles",
    action: { title: "Undo", run: () => created.forEach((id) => useBrowser.getState().groups[id] && useBrowser.getState().ungroup(id)) },
  });
}
