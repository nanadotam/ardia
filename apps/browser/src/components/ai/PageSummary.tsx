import { OutsidePressArea, Surface, Symbol } from "@ardia/shell";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { create } from "zustand";
import { ask, plainText, PROVIDER_NAMES } from "../../lib/ai";
import { hex, useTheme } from "../../lib/theme";
import { webviews } from "../../lib/webviews";
import { useBrowser } from "../../store/browser";
import { useWindowId } from "../../store/hooks";
import { activeTabId } from "../../store/model";
import { openUrl } from "../bookmarks/actions";

type Summary = { tabId: string; title: string; url: string; state: "loading" | "done" | "failed"; text: string; by?: string };

const useSummaries = create<{ open: Record<string, Summary> }>(() => ({ open: {} }));
const PAGE_CHARS = 12_000;
const READ_TIMEOUT_MS = 5000;
const SUMMARY_INSTRUCTIONS =
  "Summarise the web page you're given for someone deciding whether to read it. Start with one plain sentence on what it is, then three to five short bullet points with the key facts. No preamble, no markdown headings.";

function put(windowId: string, summary: Summary | null) {
  useSummaries.setState((s) => {
    const { [windowId]: _, ...rest } = s.open;
    return { open: summary ? { ...rest, [windowId]: summary } : rest };
  });
}

export function closePageSummary(windowId: string) {
  put(windowId, null);
}

export function summarizePage(windowId: string) {
  const s = useBrowser.getState();
  const tabId = activeTabId(s, windowId);
  const tab = tabId ? s.tabs[tabId] : undefined;
  if (!tabId || !tab?.url) return;
  const base: Summary = { tabId, title: tab.title || tab.url, url: tab.url, state: "loading", text: "" };
  put(windowId, base);
  const view = webviews.get(tabId);
  const read = view ? view.evaluate<string>(`post('result', JSON.stringify((document.body && document.body.innerText || "").slice(0, ${PAGE_CHARS})))`) : Promise.resolve(null);
  const text = Promise.race([read, new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS))]);
  void text
    .then((body) => {
      if (!body?.trim()) throw new Error("This page has no readable text.");
      return ask(SUMMARY_INSTRUCTIONS, `Title: ${base.title}\nURL: ${base.url}\n\n${body}`);
    })
    .then(({ text, provider }) => {
      if (useSummaries.getState().open[windowId]?.tabId === tabId) put(windowId, { ...base, state: "done", text: plainText(text), by: PROVIDER_NAMES[provider] });
    })
    .catch((e: Error) => {
      if (useSummaries.getState().open[windowId]?.tabId === tabId) put(windowId, { ...base, state: "failed", text: e.message });
    });
}

export function askClaudeAboutPage(windowId: string) {
  const s = useBrowser.getState();
  const tabId = activeTabId(s, windowId);
  const url = tabId ? s.tabs[tabId]?.url : undefined;
  if (!url) return;
  openUrl(`https://claude.ai/new?q=${encodeURIComponent(`Read ${url} and tell me what it's about in a few bullet points.`)}`, windowId, "foreground");
}

export function PageSummaryHost() {
  const windowId = useWindowId();
  const summary = useSummaries((s) => s.open[windowId]);
  const sidebarWidth = useBrowser((s) => (s.windows[windowId]?.sidebarOpen ? s.settings.sidebarWidth : 0));
  return summary ? <PageSummaryCard key={summary.tabId} windowId={windowId} summary={summary} right={18} top={58} maxLeft={sidebarWidth} /> : null;
}

function PageSummaryCard({ windowId, summary, right, top }: { windowId: string; summary: Summary; right: number; top: number; maxLeft: number }) {
  const theme = useTheme();
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 240, easing: Easing.bezier(0.2, 0.9, 0.25, 1), useNativeDriver: true }).start();
  }, []);
  const close = () => closePageSummary(windowId);
  return (
    <Animated.View
      style={{
        position: "absolute",
        right,
        top,
        width: 380,
        opacity: appear,
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }}
    >
      <OutsidePressArea onOutsidePress={close}>
        <Surface
          fill={hex(theme.panel)}
          cornerRadius={16}
          borderColor={hex(theme.panelBorder)}
          borderWidth={0.5}
          shadowColor="#000000"
          shadowOpacity={theme.panelShadowOpacity}
          shadowRadius={26}
          shadowOffset={[0, 10]}
        >
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Symbol name="text.quote" size={13} color={theme.textSecondary} style={{ width: 16, height: 16 }} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "700", color: theme.textPrimary }}>
                {summary.title}
              </Text>
              <Pressable onPress={close} tooltip="Close">
                <Symbol name="xmark.circle.fill" size={15} color={theme.textTertiary} style={{ width: 18, height: 18 }} />
              </Pressable>
            </View>
            {summary.state === "loading" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
                <ActivityIndicator size="small" />
                <Text style={{ fontSize: 12.5, color: theme.textSecondary }}>Reading the page…</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                <Text selectable style={{ fontSize: 13, lineHeight: 19, color: summary.state === "failed" ? theme.textSecondary : theme.textPrimary }}>
                  {summary.text}
                </Text>
              </ScrollView>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 }}>
              <Text style={{ flex: 1, fontSize: 11, color: theme.textTertiary }}>{summary.by ? `Summarised with ${summary.by}` : summary.state === "failed" ? "Settings › General › AI" : ""}</Text>
              <Pressable onPress={() => askClaudeAboutPage(windowId)} style={StyleSheet.flatten({ paddingHorizontal: 9, height: 24, borderRadius: 7, justifyContent: "center", backgroundColor: theme.rowHover })}>
                <Text style={{ fontSize: 11.5, fontWeight: "600", color: theme.textPrimary }}>Ask Claude</Text>
              </Pressable>
            </View>
          </View>
        </Surface>
      </OutsidePressArea>
    </Animated.View>
  );
}
