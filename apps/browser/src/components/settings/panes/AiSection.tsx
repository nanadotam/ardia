import { onDeviceModelStatus } from "@ardia/shell";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { getClaudeKey, localModels, pickLocalModel, resolveProvider, setClaudeKey, PROVIDER_NAMES, type AiProvider, type ResolvedProvider } from "../../../lib/ai";
import { useTheme } from "../../../lib/theme";
import { useBrowser } from "../../../store/browser";
import { Button, Group, PopUp, Row, SectionHeader, TextField } from "../controls";

const PROVIDERS: { value: AiProvider; title: string }[] = [
  { value: "auto", title: "Automatic" },
  { value: "apple", title: "Apple Intelligence" },
  { value: "local", title: "Local model" },
  { value: "claude", title: "Claude API key" },
  { value: "off", title: "Off" },
];

const APPLE_STATUS: Record<string, string> = {
  available: "Ready on this Mac.",
  notEnabled: "Turn on Apple Intelligence in System Settings to use it.",
  notReady: "Apple Intelligence is still getting ready on this Mac.",
  notEligible: "This Mac can't run Apple Intelligence.",
  unavailable: "Not available right now.",
  unsupported: "Needs macOS 26 or later.",
};

export function AiSection() {
  const theme = useTheme();
  const provider = useBrowser((s) => s.settings.aiProvider);
  const localUrl = useBrowser((s) => s.settings.aiLocalUrl);
  const localModel = useBrowser((s) => s.settings.aiLocalModel);
  const update = useBrowser((s) => s.updateSettings);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [using, setUsing] = useState<ResolvedProvider | null | undefined>(undefined);
  const refresh = () => {
    void getClaudeKey().then((k) => setHasKey(!!k));
    void localModels(localUrl.replace(/\/+$/, "")).then(setModels);
    void resolveProvider().then(setUsing);
  };
  useEffect(refresh, [provider, localUrl]);
  const apple = onDeviceModelStatus();
  return (
    <>
      <SectionHeader
        title="AI"
        description="Powers Tidy Tabs and Summarize Page. To chat with your own Claude or ChatGPT subscription, type claude or chatgpt in the command bar and press Tab."
      />
      <Group>
        <Row anchor="general.aiProvider" description={using === undefined ? " " : using ? `Using ${PROVIDER_NAMES[using]}.` : "Nothing is set up, so Tidy Tabs groups by site."}>
          <PopUp value={provider} options={PROVIDERS} onChange={(v) => update({ aiProvider: v })} minWidth={170} />
        </Row>
        <Row anchor="general.aiApple" description={APPLE_STATUS[apple] ?? APPLE_STATUS.unavailable}>
          <Text style={{ fontSize: 12, color: apple === "available" ? theme.textPrimary : theme.textTertiary }}>{apple === "available" ? "On-device" : "—"}</Text>
        </Row>
        <Row anchor="general.aiLocal" description={models.length ? `${models.length} model${models.length === 1 ? "" : "s"} found.` : "Start Ollama or LM Studio, then refresh."}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <TextField value={localUrl} onChangeText={(v) => update({ aiLocalUrl: v })} placeholder="http://localhost:11434/v1" style={{ width: 200 }} />
            {models.length ? (
              <PopUp value={localModel || pickLocalModel(models)!} options={models.map((m) => ({ value: m, title: m }))} onChange={(v) => update({ aiLocalModel: v })} minWidth={140} />
            ) : (
              <Button title="Refresh" onPress={refresh} />
            )}
          </View>
        </Row>
        <Row anchor="general.aiClaudeKey" description={hasKey ? "A key is saved in your Keychain." : "From console.anthropic.com. Billed to your API account, not your Claude subscription."}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <TextField value={key} onChangeText={setKey} secure placeholder={hasKey ? "••••••••" : "sk-ant-…"} style={{ width: 200 }} onSubmit={() => void setClaudeKey(key).then(() => (setKey(""), refresh()))} />
            <Button title={key ? "Save" : hasKey ? "Remove" : "Save"} onPress={() => void setClaudeKey(key).then(() => (setKey(""), refresh()))} />
          </View>
        </Row>
      </Group>
    </>
  );
}
