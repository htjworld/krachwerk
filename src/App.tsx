import { useEffect, useState } from "react";
import { I18nProvider } from "./i18n/i18n";
import { SeedScreen } from "./ui/SeedScreen";
import { ResultScreen } from "./ui/ResultScreen";
import {
  generatePattern,
  decodePatternOverride,
  encodePatternOverride,
  decodeCrosshairControl,
  encodeCrosshairControl,
  randomSeedCandidate,
  type PatternOverride,
  type CrosshairControl,
} from "./core";
import { restoreRedirectedPath, readRoute, pushRoute, replaceRoute, buildSeedUrl, type RouteParams } from "./routing";
import "./ui/theme.css";

function AppContent() {
  const [seed, setSeed] = useState<string | null>(null);
  const [override, setOverride] = useState<PatternOverride | null>(null);
  const [crosshair, setCrosshair] = useState<CrosshairControl | null>(null);

  useEffect(() => {
    restoreRedirectedPath();
    const route = readRoute();
    if (route.seed) {
      setSeed(route.seed);
      setOverride(route.pattern ? decodePatternOverride(route.pattern) : null);
      setCrosshair(route.crosshair ? decodeCrosshairControl(route.crosshair) : null);
    }
  }, []);

  const routeParams = (nextOverride: PatternOverride | null, nextCrosshair: CrosshairControl | null): RouteParams => ({
    pattern: nextOverride ? encodePatternOverride(nextOverride) : null,
    crosshair: nextCrosshair ? encodeCrosshairControl(nextCrosshair) : null,
  });

  const handleGenerate = (newSeed: string) => {
    setSeed(newSeed);
    setOverride(null);
    setCrosshair(null);
    pushRoute(newSeed);
  };

  const handleShuffle = () => {
    const newSeed = randomSeedCandidate();
    setSeed(newSeed);
    setOverride(null);
    setCrosshair(null);
    pushRoute(newSeed);
  };

  const handleOverrideChange = (next: PatternOverride | null) => {
    setOverride(next);
    if (seed) replaceRoute(seed, routeParams(next, crosshair));
  };

  const handleCrosshairChange = (next: CrosshairControl | null) => {
    setCrosshair(next);
    if (seed) replaceRoute(seed, routeParams(override, next));
  };

  const handleShare = () => {
    if (!seed) return;
    const url = buildSeedUrl(seed, routeParams(override, crosshair));
    void navigator.clipboard.writeText(url);
  };

  const handleBackToSeed = () => {
    setSeed(null);
    setOverride(null);
    setCrosshair(null);
    window.history.pushState(null, "", import.meta.env.BASE_URL);
  };

  if (!seed) {
    return (
      <div className="ambient-bg">
        <SeedScreen onGenerate={handleGenerate} />
      </div>
    );
  }

  const pattern = generatePattern(seed);

  return (
    <div className="ambient-bg">
      <div className="device-stack">
        <ResultScreen
          pattern={pattern}
          override={override}
          onOverrideChange={handleOverrideChange}
          crosshair={crosshair}
          onCrosshairChange={handleCrosshairChange}
          onShuffle={handleShuffle}
          onShare={handleShare}
          onBackToSeed={handleBackToSeed}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
