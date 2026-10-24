import { writeDocument } from "@ardia/shell";
import type { Settings } from "../store/settings";

export const ENGINE_PREFS_DOC = "engine-prefs.json";

export function enginePrefsJson(settings: Pick<Settings, "scrolling">) {
  return JSON.stringify({ version: 1, scrolling: settings.scrolling });
}

export function writeEnginePrefs(settings: Pick<Settings, "scrolling">) {
  writeDocument(ENGINE_PREFS_DOC, enginePrefsJson(settings));
}
