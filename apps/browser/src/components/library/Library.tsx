import { openFile, Symbol, VisualEffect } from "@ardia/shell";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, findNodeHandle, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { claimFocusTag } from "../../lib/focusClaims";
import { ThemeScope, useTheme } from "../../lib/theme";
import { webviews } from "../../lib/webviews";
import { useBrowser } from "../../store/browser";
import { PageProfileContext, useWindowId } from "../../store/hooks";
import { activeTabId, viewTabIds } from "../../store/model";
import { cleanedTabsFor } from "../../store/organize";
import type { ClosedTab } from "../../store/types";
import { downloadsIn } from "../../store/ui";
import { DownloadCard } from "../pages/DownloadsPage";
import { hostLabel, matchesQuery } from "../pages/PageLayout";
import { Favicon, useHover } from "../primitives";
import { openThemePanel } from "../theme/ThemePanel";
import { byDay, closeLibrary, LIBRARY_FOCUS, openLibrary, useLibrary, type LibrarySection } from "./state";

const RAIL = 112;
const COLUMN = 262;
const SECTIONS: { id: LibrarySection; title: string; icon: string }[] = [
  { id: "spaces", title: "Spaces", icon: "square.on.square" },
  { id: "archive", title: "Archived Tabs", icon: "archivebox" },
  { id: "downloads", title: "Downloads", icon: "arrow.down.circle" },
  { id: "media", title: "Media", icon: "photo.on.rectangle" },
];
const IMAGE = /\.(png|jpe?g|gif|webp|heic|avif|bmp|tiff?)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

export function LibraryHost() {
  const windowId = useWindowId();
  const section = useLibrary((s) => s.open[windowId]);
  return section ? <Library windowId={windowId} section={section} /> : null;
}

function Library({ windowId, section }: { windowId: string; section: LibrarySection }) {
  const theme = useTheme();
  const appear = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");
  const search = useRef<TextInput>(null);
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    search.current?.focus();
    claimFocusTag(windowId, LIBRARY_FOCUS, () => findNodeHandle(search.current));
    return () => {
      const now = activeTabId(useBrowser.getState(), windowId);
      if (now) void webviews.get(now)?.focus();
    };
  }, []);
  useEffect(() => setQuery(""), [section]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { opacity: appear, transform: [{ translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
      ]}
    >
      <VisualEffect material="sidebar" blendingMode="withinWindow" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? "rgba(30,30,32,1)" : "rgba(244,242,240,1)" }]} />
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ width: RAIL, paddingTop: 72, alignItems: "center", gap: 6 }}>
          {SECTIONS.map((s) => (
            <RailButton key={s.id} title={s.title} icon={s.icon} selected={s.id === section} onPress={() => openLibrary(windowId, s.id)} />
          ))}
          <View style={{ flex: 1 }} />
          <RailButton title="Back" icon="arrow.left" selected={false} onPress={() => closeLibrary(windowId)} />
          <View style={{ height: 16 }} />
        </View>
        <View style={{ flex: 1, paddingTop: 44 }}>
          <View style={{ height: 40, flexDirection: "row", alignItems: "center", paddingRight: 24, gap: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: theme.textPrimary }}>{SECTIONS.find((s) => s.id === section)!.title}</Text>
            <View style={{ flex: 1 }} />
            <View style={{ width: 260, height: 30, borderRadius: 8, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, gap: 6, backgroundColor: theme.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
              <Symbol name="magnifyingglass" size={12} color={theme.textSecondary} style={{ width: 14, height: 14 }} />
              <TextInput
                ref={search}
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${SECTIONS.find((s) => s.id === section)!.title}`}
                placeholderTextColor={theme.placeholder}
                selectionColor={theme.selection}
                enableFocusRing={false}
                keyDownEvents={[{ key: "Escape" }]}
                onKeyDown={(e) => {
                  if (e.nativeEvent.key !== "Escape") return;
                  if (query) setQuery("");
                  else closeLibrary(windowId);
                }}
                style={{ flex: 1, fontSize: 13, color: theme.textPrimary, paddingVertical: 0 }}
              />
            </View>
          </View>
          <View style={{ flex: 1, marginTop: 14 }}>
            {section === "spaces" && <SpacesSection windowId={windowId} query={query} />}
            {section === "archive" && <ArchiveSection windowId={windowId} query={query} />}
            {section === "downloads" && <DownloadsSection windowId={windowId} query={query} />}
            {section === "media" && <MediaSection windowId={windowId} query={query} />}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function RailButton({ title, icon, selected, onPress }: { title: string; icon: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable {...hoverProps} onPress={onPress} style={{ width: RAIL - 18, paddingVertical: 10, borderRadius: 12, alignItems: "center", gap: 5, backgroundColor: selected ? (theme.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)") : hovered ? theme.rowHover : "transparent" }}>
      <Symbol name={icon} size={20} weight="regular" color={selected ? theme.textPrimary : theme.textSecondary} style={{ width: 26, height: 24 }} />
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: selected ? "700" : "500", color: selected ? theme.textPrimary : theme.textSecondary }}>
        {title}
      </Text>
    </Pressable>
  );
}

function SpacesSection({ windowId, query }: { windowId: string; query: string }) {
  const profileIds = useBrowser(useShallow((s) => s.profileOrder.filter((id) => s.profiles[id])));
  return (
    <ScrollView horizontal contentContainerStyle={{ paddingRight: 24, paddingBottom: 24, gap: 18 }}>
      {profileIds.map((id, i) => (
        <PageProfileContext.Provider key={id} value={id}>
          <ThemeScope>
            <SpaceColumn windowId={windowId} profileId={id} query={query} index={i} />
          </ThemeScope>
        </PageProfileContext.Provider>
      ))}
    </ScrollView>
  );
}

const SpaceColumn = memo(function SpaceColumn({ windowId, profileId, query, index }: { windowId: string; profileId: string; query: string; index: number }) {
  const theme = useTheme();
  const name = useBrowser((s) => s.profiles[profileId]?.name ?? "");
  const icon = useBrowser((s) => s.profiles[profileId]?.icon ?? null);
  const current = useBrowser((s) => s.windows[windowId]?.profileId === profileId);
  const ids = useBrowser(useShallow((s) => viewTabIds(s, windowId, profileId)));
  const tabs = useBrowser(useShallow((s) => ids.map((id) => s.tabs[id])));
  const shown = tabs.filter((t) => !!t && matchesQuery(query, t.customTitle ?? t.title, t.url || t.pinnedUrl || ""));
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, delay: index * 40, speed: 16, bounciness: 4, useNativeDriver: true }).start();
  }, []);
  const go = (tabId: string) => {
    const s = useBrowser.getState();
    if (s.windows[windowId]?.profileId !== profileId) s.switchProfile(windowId, profileId);
    useBrowser.getState().activate(tabId);
    closeLibrary(windowId);
  };
  return (
    <Animated.View
      style={{
        width: COLUMN,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: current ? 2 : StyleSheet.hairlineWidth,
        borderColor: current ? theme.accent : theme.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      <ColumnTint colors={theme.windowTint} accent={theme.profileColor === "incognito" ? null : theme.accent} />
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 }}>
        {icon ? <Text style={{ fontSize: 15 }}>{icon}</Text> : null}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: theme.textPrimary }}>
          {name}
        </Text>
        <Pressable
          onPress={() => {
            closeLibrary(windowId);
            openThemePanel(windowId, profileId);
          }}
          tooltip="Edit Theme"
        >
          <Symbol name="paintbrush.pointed" size={13} color={theme.textSecondary} style={{ width: 18, height: 18 }} />
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 10 }}>
        {shown.map((t) => (
          <TabLine key={t!.id} title={t!.customTitle ?? t!.title} url={t!.url || t!.pinnedUrl || ""} favicon={t!.favicon} profileId={profileId} pinned={!!t!.pinned} onPress={() => go(t!.id)} />
        ))}
        {!shown.length && <Text style={{ padding: 12, fontSize: 12, color: theme.textSecondary }}>{query ? "No matches" : "No tabs"}</Text>}
      </ScrollView>
    </Animated.View>
  );
});

function TabLine({ title, url, favicon, profileId, pinned, onPress, detail }: { title: string; url: string; favicon: string | null; profileId: string; pinned?: boolean; onPress: () => void; detail?: string }) {
  const theme = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable {...hoverProps} onPress={onPress} tooltip={url} style={{ height: detail ? 44 : 34, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 8, borderRadius: 9, backgroundColor: hovered ? theme.rowHover : "transparent" }}>
      <Favicon url={url} favicon={favicon} profileId={profileId} size={16} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, color: theme.textPrimary, fontWeight: pinned ? "600" : "400" }}>
          {title || (url ? hostLabel(url) : "New Tab")}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.textTertiary }}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ArchiveSection({ windowId, query }: { windowId: string; query: string }) {
  const theme = useTheme();
  const cleaned = useBrowser((s) => cleanedTabsFor(s, windowId));
  const closed = useBrowser((s) => s.closedTabs);
  const groups = useMemo(() => {
    const entries: { entry: ClosedTab; from: "cleaned" | "closed" }[] = [
      ...cleaned.map((entry) => ({ entry, from: "cleaned" as const })),
      ...closed.filter((c) => c.kind === "tab").map((entry) => ({ entry, from: "closed" as const })),
    ].filter(({ entry }) => matchesQuery(query, entry.tab.title, entry.tab.url));
    return byDay(entries, (e) => e.entry.closedAt);
  }, [cleaned, closed, query]);
  const restore = ({ entry, from }: { entry: ClosedTab; from: "cleaned" | "closed" }) => {
    const s = useBrowser.getState();
    if (from === "cleaned") s.restoreCleaned(entry.id, windowId);
    else s.restoreClosed(entry.id, windowId);
    closeLibrary(windowId);
  };
  if (!groups.length) return <Empty icon="archivebox" text={query ? "No archived tabs match" : "Tabs you close or clean up land here"} />;
  return (
    <ScrollView contentContainerStyle={{ paddingRight: 24, paddingBottom: 30, maxWidth: 760 }}>
      {groups.map((g) => (
        <View key={g.title} style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textSecondary, marginBottom: 4, marginLeft: 8 }}>{g.title}</Text>
          {g.items.map((item) => (
            <TabLine
              key={`${item.from}:${item.entry.id}`}
              title={item.entry.tab.title}
              url={item.entry.tab.url}
              favicon={item.entry.tab.favicon ?? null}
              profileId={item.entry.tab.profileId}
              detail={item.entry.tab.url.replace(/^https?:\/\/(www\.)?/, "")}
              onPress={() => restore(item)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function DownloadsSection({ windowId, query }: { windowId: string; query: string }) {
  const downloads = useBrowser(useShallow((s) => downloadsIn(s, windowId)));
  const shown = downloads.filter((d) => matchesQuery(query, d.filename, d.url));
  if (!shown.length) return <Empty icon="arrow.down.circle" text={query ? "No downloads match" : "Files you download appear here"} />;
  return (
    <ScrollView contentContainerStyle={{ paddingRight: 24, paddingBottom: 30, gap: 8, maxWidth: 760 }}>
      {shown.map((d) => (
        <DownloadCard key={d.id} d={d} windowId={windowId} />
      ))}
    </ScrollView>
  );
}

function MediaSection({ windowId, query }: { windowId: string; query: string }) {
  const theme = useTheme();
  const downloads = useBrowser(useShallow((s) => downloadsIn(s, windowId)));
  const media = downloads.filter((d) => d.state === "finished" && (IMAGE.test(d.path) || VIDEO.test(d.path)) && matchesQuery(query, d.filename, d.url));
  if (!media.length) return <Empty icon="photo.on.rectangle" text={query ? "No media matches" : "Images and videos you download appear here"} />;
  return (
    <ScrollView contentContainerStyle={{ paddingRight: 24, paddingBottom: 30, flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {media.map((d) => (
        <Pressable key={d.id} onPress={() => void openFile(d.path)} tooltip={d.filename} style={{ width: 168, gap: 6 }}>
          <View style={{ width: 168, height: 118, borderRadius: 12, overflow: "hidden", backgroundColor: theme.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
            {IMAGE.test(d.path) ? (
              <Image source={{ uri: `file://${encodeURI(d.path)}` }} resizeMode="cover" style={StyleSheet.absoluteFill} />
            ) : (
              <Symbol name="play.rectangle.fill" size={30} color={theme.textSecondary} style={{ width: 40, height: 34 }} />
            )}
          </View>
          <Text numberOfLines={1} style={{ fontSize: 12, color: theme.textPrimary }}>
            {d.filename}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingRight: 24 }}>
      <Symbol name={icon} size={30} color={theme.textTertiary} style={{ width: 40, height: 40 }} />
      <Text style={{ fontSize: 13, color: theme.textSecondary }}>{text}</Text>
    </View>
  );
}

const BANDS = 32;

function ColumnTint({ colors, accent }: { colors: readonly [string, string]; accent: string | null }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors[0] }]}>
      <View style={{ flex: 1 }}>
        {Array.from({ length: BANDS }, (_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: colors[1], opacity: i / (BANDS - 1) }} />
        ))}
      </View>
      {accent ? <View style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: 0.08 }]} /> : null}
    </View>
  );
}
