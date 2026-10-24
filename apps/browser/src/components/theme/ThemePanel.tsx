import { OutsidePressArea, Surface, Symbol, VisualEffect } from "@ardia/shell";
import { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { create } from "zustand";
import { layout, useTheme } from "../../lib/theme";
import { useBrowser } from "../../store/browser";
import { useWindowId } from "../../store/hooks";
import { ThemeSection } from "../settings/ThemeEditor";

type ThemePanelState = { open: Record<string, string> };

export const useThemePanel = create<ThemePanelState>()(() => ({ open: {} }));

export function openThemePanel(windowId: string, profileId?: string) {
  const target = profileId ?? useBrowser.getState().windows[windowId]?.profileId;
  if (!target) return;
  useThemePanel.setState((s) => ({ open: { ...s.open, [windowId]: target } }));
}

export function closeThemePanel(windowId: string) {
  useThemePanel.setState((s) => {
    const { [windowId]: _, ...open } = s.open;
    return { open };
  });
}

export function toggleThemePanel(windowId: string) {
  if (useThemePanel.getState().open[windowId]) closeThemePanel(windowId);
  else openThemePanel(windowId);
}

const WIDTH = 580;
const RADIUS = 18;

export function ThemePanelHost() {
  const windowId = useWindowId();
  const profileId = useThemePanel((s) => s.open[windowId]);
  return profileId ? <ThemePanel windowId={windowId} profileId={profileId} /> : null;
}

function ThemePanel({ windowId, profileId }: { windowId: string; profileId: string }) {
  const theme = useTheme();
  const name = useBrowser((s) => s.profiles[profileId]?.name ?? "");
  const sidebarOpen = useBrowser((s) => !!s.windows[windowId]?.sidebarOpen);
  const sidebarWidth = useBrowser((s) => s.settings.sidebarWidth ?? layout.sidebarWidth);
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(appear, { toValue: 1, speed: 22, bounciness: 6, useNativeDriver: true }).start();
  }, []);
  const close = () => closeThemePanel(windowId);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: (sidebarOpen ? sidebarWidth : 0) + 14,
        top: 52,
        width: WIDTH,
        maxHeight: "86%",
        opacity: appear,
        transform: [
          { translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
          { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }}
    >
      <OutsidePressArea onOutsidePress={close}>
        <Surface
          fill="#00000000"
          cornerRadius={RADIUS}
          shadowColor="#000000"
          shadowOpacity={theme.dark ? 0.5 : 0.2}
          shadowRadius={30}
          shadowOffset={[0, 12]}
          style={StyleSheet.absoluteFill}
        />
        <VisualEffect material="popover" cornerRadius={RADIUS} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: RADIUS, borderWidth: 0.5, borderColor: theme.panelBorder, backgroundColor: theme.dark ? "#242426" : "#FFFFFF" },
          ]}
        />
        <View style={{ borderRadius: RADIUS, overflow: "hidden" }}>
          <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8 }}>
            <Symbol name="paintpalette" size={14} color={theme.textSecondary} style={{ width: 18, height: 18 }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "700", color: theme.textPrimary }}>
              {name} Theme
            </Text>
            <Pressable onPress={close} tooltip="Done (Esc)">
              <Symbol name="xmark.circle.fill" size={16} color={theme.textTertiary} style={{ width: 20, height: 20 }} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <ThemeSection profileId={profileId} openEditor />
          </ScrollView>
        </View>
      </OutsidePressArea>
    </Animated.View>
  );
}
