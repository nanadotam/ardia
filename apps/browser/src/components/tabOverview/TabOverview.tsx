import { onWindowEvent, Symbol, VisualEffect, watchPinch } from "@ardia/shell";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, findNodeHandle, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { closeTab, switchToTab } from "../../lib/actions";
import { claimFocusTag } from "../../lib/focusClaims";
import { webviews } from "../../lib/webviews";
import { lastPicture, rememberPicture, startTabPictures } from "../../lib/tabPictures";
import { filterOverviewTabs, moveSelection, overviewColumns } from "../../lib/tabOverviewFilter";
import { useTheme } from "../../lib/theme";
import { useBrowser } from "../../store/browser";
import { useWindowId } from "../../store/hooks";
import { activeTabId, viewTabIds } from "../../store/model";
import { Favicon, useHover } from "../primitives";
import { closeTabOverview, openTabOverview, pagePinched, TAB_OVERVIEW_FOCUS, tabOverviewOpen, useTabOverview } from "./state";

const GAP = 22;
const MIN_CARD = 230;
const ASPECT = 1.5;
const SIDE = 40;
const TOP = 52;
const KEYS = ["Escape", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((key) => ({ key }));

let pinchWatchers = 0;

export function TabOverviewHost() {
  const windowId = useWindowId();
  const open = useTabOverview((s) => !!s.open[windowId]);
  useEffect(startTabPictures, []);
  useEffect(() => {
    if (pinchWatchers++ === 0) watchPinch(true);
    const sub = onWindowEvent((e) => {
      if (e.type !== "pinch" || e.id !== windowId) return;
      const s = useBrowser.getState();
      if (s.peeks[windowId]) return;
      if (e.direction === "in" && !pagePinched(activeTabId(s, windowId)) && !s.windowUi[windowId]?.panel.open) openTabOverview(windowId);
      else if (e.direction === "out" && tabOverviewOpen(windowId)) closeTabOverview(windowId);
    });
    return () => {
      sub.remove();
      if (--pinchWatchers === 0) watchPinch(false);
    };
  }, [windowId]);
  return open ? <TabOverview windowId={windowId} /> : null;
}

function TabOverview({ windowId }: { windowId: string }) {
  const theme = useTheme();
  const ids = useBrowser(useShallow((s) => viewTabIds(s, windowId)));
  const active = useBrowser((s) => activeTabId(s, windowId));
  const records = useBrowser(useShallow((s) => ids.map((id) => s.tabs[id])));
  const tabs = useMemo(
    () => records.filter((t) => !!t).map((t) => ({ id: t.id, title: t.title, url: t.url || t.pinnedUrl || "", favicon: t.favicon, profileId: t.profileId })),
    [records],
  );
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterOverviewTabs(tabs, query), [tabs, query]);
  const [width, setWidth] = useState(0);
  const columns = overviewColumns(width - SIDE * 2, MIN_CARD, GAP);
  const card = width > 0 ? Math.floor((width - SIDE * 2 - GAP * (columns - 1)) / columns) : MIN_CARD;
  const [selected, setSelected] = useState(() => Math.max(0, tabs.findIndex((t) => t.id === active)));
  const [fresh, setFresh] = useState(0);
  const appear = useRef(new Animated.Value(0)).current;
  const input = useRef<TextInput>(null);

  useEffect(() => {
    input.current?.focus();
    claimFocusTag(windowId, TAB_OVERVIEW_FOCUS, () => findNodeHandle(input.current));
    return () => {
      const now = activeTabId(useBrowser.getState(), windowId);
      if (now) void webviews.get(now)?.focus();
    };
  }, []);
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    if (active) void rememberPicture(active).then(() => setFresh((n) => n + 1));
  }, []);
  useEffect(() => setSelected((i) => Math.min(Math.max(i, 0), shown.length - 1)), [shown.length]);

  const choose = (tabId: string | undefined) => {
    closeTabOverview(windowId);
    if (tabId) switchToTab(tabId);
  };

  return (
    <Animated.View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[StyleSheet.absoluteFill, { opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] }) }] }]}
    >
      <VisualEffect material="fullScreenUI" blendingMode="withinWindow" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? "rgba(28,28,30,0.97)" : "rgba(246,246,248,0.97)" }]} />
      <Pressable onPress={() => closeTabOverview(windowId)} style={StyleSheet.absoluteFill} />
      <View style={{ paddingTop: TOP, paddingHorizontal: SIDE, paddingBottom: 18, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: theme.textPrimary }}>All Tabs</Text>
        <Text style={{ fontSize: 13, color: theme.textSecondary, fontVariant: ["tabular-nums"] }}>{shown.length === tabs.length ? tabs.length : `${shown.length} of ${tabs.length}`}</Text>
        <View style={{ flex: 1 }} />
        <View
          style={{
            width: 260,
            height: 30,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 9,
            gap: 6,
            backgroundColor: theme.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          }}
        >
          <Symbol name="magnifyingglass" size={12} color={theme.textSecondary} style={{ width: 14, height: 14 }} />
          <TextInput
            ref={input}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search Tabs"
            placeholderTextColor={theme.placeholder}
            selectionColor={theme.selection}
            enableFocusRing={false}
            keyDownEvents={KEYS}
            onKeyDown={(e) => {
              const { key } = e.nativeEvent;
              if (key === "Escape") return query ? setQuery("") : closeTabOverview(windowId);
              if (key === "Enter") return choose(shown[selected]?.id);
              setSelected((i) => moveSelection(i, shown.length, columns, key));
            }}
            style={{ flex: 1, fontSize: 13, color: theme.textPrimary, paddingVertical: 0 }}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: SIDE, flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
        {shown.map((t, i) => (
          <OverviewCard
            key={t.id}
            index={i}
            tabId={t.id}
            title={t.title}
            url={t.url}
            favicon={t.favicon}
            profileId={t.profileId}
            width={card}
            selected={i === selected}
            current={t.id === active}
            fresh={fresh}
            onOpen={() => choose(t.id)}
            onClose={() => void closeTab(t.id)}
          />
        ))}
        {!shown.length && (
          <Text style={{ width: "100%", textAlign: "center", marginTop: 80, fontSize: 14, color: theme.textSecondary }}>{query ? "No tabs match" : "No tabs"}</Text>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const OverviewCard = memo(function OverviewCard({
  index,
  tabId,
  title,
  url,
  favicon,
  profileId,
  width,
  selected,
  current,
  fresh,
  onOpen,
  onClose,
}: {
  index: number;
  tabId: string;
  title: string;
  url: string;
  favicon: string | null;
  profileId: string;
  width: number;
  selected: boolean;
  current: boolean;
  fresh: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { hovered, hoverProps } = useHover();
  const close = useHover();
  const picture = useMemo(() => lastPicture(tabId), [tabId, fresh]);
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, delay: Math.min(index, 12) * 8, speed: 18, bounciness: 4, useNativeDriver: false }).start();
  }, []);
  const lifted = hovered || selected;
  const ring = selected || current ? theme.accent : theme.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
  const name = title || hostOf(url) || "New Tab";
  return (
    <Animated.View
      style={{ width, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, lifted ? 1.02 : 1] }) }] }}
    >
      <Pressable {...hoverProps} onPress={onOpen} tooltip={url || undefined}>
        <View style={{ height: 26, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 }}>
          <Favicon url={url} favicon={favicon} profileId={profileId} size={14} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontWeight: current ? "600" : "500", color: theme.textPrimary }}>
            {name}
          </Text>
          {hovered && (
            <Pressable {...close.hoverProps} onPress={onClose} tooltip="Close Tab">
              <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: close.hovered ? (theme.dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)") : "transparent" }}>
                <Symbol name="xmark" size={9} weight="bold" color={theme.textSecondary} style={{ width: 10, height: 10 }} />
              </View>
            </Pressable>
          )}
        </View>
        <View
          style={{
            width,
            height: Math.round(width / ASPECT),
            borderRadius: 10,
            overflow: "hidden",
            borderWidth: selected || current ? 2.5 : 1,
            borderColor: ring,
            backgroundColor: theme.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {picture ? (
            <Image source={{ uri: `data:image/jpeg;base64,${picture.data}` }} resizeMode="cover" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} />
          ) : (
            <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
              <Favicon url={url} favicon={favicon} profileId={profileId} size={40} />
              <Text numberOfLines={1} style={{ fontSize: 12, color: theme.textSecondary }}>
                {hostOf(url)}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return match?.[1] ?? "";
}
