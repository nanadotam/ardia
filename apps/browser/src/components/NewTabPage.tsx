import { PowerUp } from "@ardia/shaders";
import { useEffect, useState } from "react";
import { Surface } from "@ardia/shell";
import { StyleSheet, View } from "react-native";
import { hex, layout, useTheme } from "../lib/theme";
import { useBrowser } from "../store/browser";
import { useWindowId } from "../store/hooks";
import { useCardAnchors } from "./layout/windowLayout";
import { NewTabExtras } from "./ntp";
import { NtpBackdrop } from "./ntp/Backdrop";
import { Greeting, HomeSections } from "./ntp/HomeSections";
import { useOnboarding } from "./onboarding/state";
import { Omnibox } from "./Omnibox";

const BAR_HEIGHT = 112;
const BAR_BORDER = 0.5;
const DIA_OFFSET = 1;

type Size = { width: number; height: number };
let lastSize: { card: Size; size: Size } | null = null;
const introPlayed = new Set<string>();


function sameSize(a: Size, b: Size) {
  return a.width === b.width && a.height === b.height;
}

export function barWidth(viewWidth: number) {
  const content = viewWidth < 708 ? (viewWidth <= 636 ? viewWidth - 20 : 616) : viewWidth < 1700 ? 652 : 774;
  return Math.min(content, viewWidth - 28);
}

export function NewTabPage({ tabId, toolbar = true }: { tabId: string; toolbar?: boolean }) {
  const theme = useTheme();
  const windowId = useWindowId();
  const onboarding = useOnboarding((s) => s.windowId === windowId);
  const incognito = useBrowser((s) => !!s.windows[windowId]?.incognito);
  const card = useCardAnchors((s) => s[windowId]);
  const [size, setSizeState] = useState<Size | null>(() => (lastSize && (!card || sameSize(lastSize.card, card)) ? lastSize.size : null));
  const setSize = (next: Size) => setSizeState((prev) => (prev && sameSize(prev, next) ? prev : next));
  useEffect(() => {
    if (size && card) lastSize = { card: { width: card.width, height: card.height }, size };
  }, [size, card?.width, card?.height]);
  const [panelHeight, setPanelHeight] = useState(BAR_HEIGHT);
  const [playIntro] = useState(() => !introPlayed.has(tabId));
  useEffect(() => {
    introPlayed.add(tabId);
  }, [tabId]);

  if (!size) return <View style={{ flex: 1 }} onLayout={(e) => setSize(e.nativeEvent.layout)} />;

  const width = barWidth(size.width);
  const x = Math.max(size.width / 2 - width / 2, 14) + DIA_OFFSET;
  const under = toolbar ? 0 : layout.toolbarHeight;
  const top = Math.max((size.height - under) / 2 - 200, 100) + 38 + DIA_OFFSET + under;

  const bar = { x, y: top, width, height: panelHeight };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <NtpBackdrop radius={layout.cardRadius} />
      {playIntro && theme.powerUpPalette && (
        <PowerUp
          style={StyleSheet.absoluteFill}
          palette={theme.powerUpPalette}
          speed={1}
          origin={0.5}
          cornerRadius={20}
          halo={bar}
        />
      )}
      {!onboarding && !incognito && <Greeting left={x} top={top - 74} width={width} />}
      <View onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)} style={{ position: "absolute", left: x, top, width }}>
        <Surface style={StyleSheet.absoluteFill} fill="#00000000" cornerRadius={20} shadowColor="#000000" shadowOpacity={0.08} shadowRadius={2} shadowOffset={[0, 0.5]} />
        <Surface style={StyleSheet.absoluteFill} fill="#00000000" cornerRadius={20} shadowColor="#000000" shadowOpacity={0.04} shadowRadius={1} shadowOffset={[0, 2]} />
        <Surface
          fill={hex(theme.ntpBarSolid)}
          cornerRadius={20}
          borderColor={hex(theme.ntpBarBorder)}
          borderWidth={BAR_BORDER}
        >
          {onboarding ? <View style={{ height: BAR_HEIGHT - 2 * BAR_BORDER }} /> : <Omnibox variant="hero" tabId={tabId} />}
        </Surface>
      </View>
      {!onboarding && <HomeSections tabId={tabId} left={x + 6} top={top + panelHeight + 30} width={width - 12} />}
      <NewTabExtras size={size} bar={bar} />
    </View>
  );
}
