import { onDeviceModelStatus } from "@ardia/shell";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  API_SERVICES,
  apiModels,
  getApiKey,
  getClaudeKey,
  localModels,
  pickLocalModel,
  providerName,
  resolveProvider,
  setApiKey,
  setClaudeKey,
  type AiProvider,
  type ApiService,
  type ResolvedProvider,
} from "../../../lib/ai";
import { useTheme } from "../../../lib/theme";
import { useBrowser } from "../../../store/browser";
import { Button, Group, PopUp, Row, SectionHeader, TextField } from "../controls";

const PROVIDERS: { value: AiProvider; title: string }[] = [
  { value: "auto", title: "Automatic" },
  { value: "apple", title: "Apple Intelligence" },
  { value: "local", title: "Local model" },
  { value: "claude", title: "Claude API key" },
  { value: "api", title: "Other API key" },
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

export function AiPane() {
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
        title="Arc Max, kept small"
        description="Powers Tidy Tabs and Summarize Page. To chat with your own Claude or ChatGPT subscription, type claude or chatgpt in the command bar and press Tab."
      />
      <Group>
        <Row anchor="ai.provider" description={using === undefined ? " " : using ? `Using ${providerName(using)}.` : "Nothing is set up, so Tidy Tabs groups by site."}>
          <PopUp value={provider} options={PROVIDERS} onChange={(v) => update({ aiProvider: v })} minWidth={170} />
        </Row>
        <Row anchor="ai.apple" description={APPLE_STATUS[apple] ?? APPLE_STATUS.unavailable}>
          <Text style={{ fontSize: 12, color: apple === "available" ? theme.textPrimary : theme.textTertiary }}>{apple === "available" ? "On-device" : "—"}</Text>
        </Row>
        <Row anchor="ai.local" description={models.length ? `${models.length} model${models.length === 1 ? "" : "s"} found.` : "Start Ollama or LM Studio, then refresh."}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <TextField value={localUrl} onChangeText={(v) => update({ aiLocalUrl: v })} placeholder="http://localhost:11434/v1" style={{ width: 200 }} />
            {models.length ? (
              <PopUp value={localModel || pickLocalModel(models)!} options={models.map((m) => ({ value: m, title: m }))} onChange={(v) => update({ aiLocalModel: v })} minWidth={140} />
            ) : (
              <Button title="Refresh" onPress={refresh} />
            )}
          </View>
        </Row>
        <Row anchor="ai.claudeKey" description={hasKey ? "A key is saved in your Keychain." : "From console.anthropic.com. Billed to your API account, not your Claude subscription."}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <TextField value={key} onChangeText={setKey} secure placeholder={hasKey ? "••••••••" : "sk-ant-…"} style={{ width: 200 }} onSubmit={() => void setClaudeKey(key).then(() => (setKey(""), refresh()))} />
            <Button title={key ? "Save" : hasKey ? "Remove" : "Save"} onPress={() => void setClaudeKey(key).then(() => (setKey(""), refresh()))} />
          </View>
        </Row>
      </Group>
      <ApiKeyGroup onChange={refresh} />
    </>
  );
}

const SERVICES = (Object.keys(API_SERVICES) as ApiService[]).map((value) => ({ value, title: API_SERVICES[value].name }));

function ApiKeyGroup({ onChange }: { onChange: () => void }) {
  const service = useBrowser((s) => s.settings.aiApiService);
  const base = useBrowser((s) => s.settings.aiApiBase);
  const model = useBrowser((s) => s.settings.aiApiModel);
  const update = useBrowser((s) => s.updateSettings);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const info = API_SERVICES[service];
  const load = () =>
    void getApiKey(service).then((k) => {
      setSaved(k);
      setModels(null);
      if (k) void apiModels(service, k).then(setModels);
    });
  useEffect(load, [service, base]);
  const save = () =>
    void setApiKey(service, key).then(() => {
      setKey("");
      load();
      onChange();
    });
  const keyDescription = saved
    ? models === null
      ? "Checking the key…"
      : models.length
        ? `Key saved in your Keychain. ${models.length} models available.`
        : "Key saved, but the service didn't list any models. Check the key or the address."
    : `From ${info.keyUrl}. Billed to that account.`;
  return (
    <Group style={{ marginTop: 14 }}>
      <Row anchor="ai.apiService">
        <PopUp value={service} options={SERVICES} onChange={(v) => update({ aiApiService: v, aiApiModel: "" })} minWidth={200} />
      </Row>
      {service === "custom" ? (
        <Row anchor="ai.apiBase">
          <TextField value={base} onChangeText={(v) => update({ aiApiBase: v })} placeholder="https://api.example.com/v1" style={{ width: 260 }} />
        </Row>
      ) : null}
      <Row anchor="ai.apiKey" description={keyDescription}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <TextField value={key} onChangeText={setKey} secure placeholder={saved ? "••••••••" : info.keyHint} style={{ width: 200 }} onSubmit={save} />
          <Button title={key || !saved ? "Save" : "Remove"} onPress={save} />
        </View>
      </Row>
      {models?.length ? (
        <Row anchor="ai.apiModel">
          <PopUp value={model || models[0]!} options={models.map((m) => ({ value: m, title: m }))} onChange={(v) => update({ aiApiModel: v })} minWidth={220} />
        </Row>
      ) : null}
    </Group>
  );
}
