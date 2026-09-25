import { useEffect, useState } from "react";
import { I18nProvider } from "./i18n/i18n";
import { SeedScreen } from "./ui/SeedScreen";
import { ResultScreen } from "./ui/ResultScreen";
import { generatePattern, decodePatternOverride, encodePatternOverride, randomSeedCandidate, type PatternOverride } from "./core";
import { restoreRedirectedPath, readRoute, pushRoute, replaceRoute, buildSeedUrl } from "./routing";
import "./ui/theme.css";

function AppContent() {
  const [seed, setSeed] = useState<string | null>(null);
  const [override, setOverride] = useState<PatternOverride | null>(null);

  useEffect(() => {
    restoreRedirectedPath();
    const route = readRoute();
    if (route.seed) {
      setSeed(route.seed);
      setOverride(route.pattern ? decodePatternOverride(route.pattern) : null);
    }
  }, []);

  const handleGenerate = (newSeed: string) => {
    setSeed(newSeed);
    setOverride(null);
    pushRoute(newSeed);
  };

  const handleShuffle = () => {
    const newSeed = randomSeedCandidate();
    setSeed(newSeed);
    setOverride(null);
    pushRoute(newSeed);
  };

  const handleOverrideChange = (next: PatternOverride | null) => {
    setOverride(next);
    if (seed) replaceRoute(seed, next ? encodePatternOverride(next) : null);
  };

  const handleShare = () => {
    if (!seed) return;
    const url = buildSeedUrl(seed, override ? encodePatternOverride(override) : null);
    void navigator.clipboard.writeText(url);
  };

  const handleBackToSeed = () => {
    setSeed(null);
    setOverride(null);
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
