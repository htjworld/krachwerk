import { useEffect, useMemo, useState } from "react";
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
  type UserSlot,
} from "./core";
import {
  listFiles,
  addFile,
  removeFile,
  updateSlot,
  clearAll,
  type UserKitFile,
} from "./core/userKitStore";
import { restoreRedirectedPath, readRoute, pushRoute, replaceRoute, buildSeedUrl, type RouteParams } from "./routing";
import "./ui/theme.css";

function AppContent() {
  const [seed, setSeed] = useState<string | null>(null);
  const [override, setOverride] = useState<PatternOverride | null>(null);
  const [crosshair, setCrosshair] = useState<CrosshairControl | null>(null);
  const [userKitFiles, setUserKitFiles] = useState<UserKitFile[]>([]);
  const [receivedLocalKit, setReceivedLocalKit] = useState(false);

  useEffect(() => {
    // kraftwerk.com/KKM/kkm.html 원본 그대로: body 배경색을 5초마다 직접 바꾼다.
    // 사파리는 이 body 배경색을 탭바/툴바 색으로 그대로 반영한다.
    const colors = ["#cccccc", "#00ff00"];
    document.body.style.backgroundColor = colors[0];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % colors.length;
      document.body.style.backgroundColor = colors[i];
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    restoreRedirectedPath();
    const route = readRoute();
    if (route.seed) {
      setSeed(route.seed);
      setOverride(route.pattern ? decodePatternOverride(route.pattern) : null);
      setCrosshair(route.crosshair ? decodeCrosshairControl(route.crosshair) : null);
    }
    setReceivedLocalKit(route.kit === "local");
    void listFiles().then(setUserKitFiles);
  }, []);

  // 슬롯별로 묶은 원본 ArrayBuffer 목록 — 렌더링 엔진에 그대로 넘긴다(§15.4).
  const userKit = useMemo<Partial<Record<UserSlot, ArrayBuffer[]>> | null>(() => {
    if (userKitFiles.length === 0) return null;
    const map: Partial<Record<UserSlot, ArrayBuffer[]>> = {};
    for (const file of userKitFiles) {
      (map[file.slot] ??= []).push(file.data);
    }
    return map;
  }, [userKitFiles]);

  const handleAddUserKitFiles = (files: UserKitFile[]) => {
    files.forEach((file) => void addFile(file));
    setUserKitFiles((prev) => [...prev, ...files]);
  };
  const handleRemoveUserKitFile = (id: string) => {
    void removeFile(id);
    setUserKitFiles((prev) => prev.filter((f) => f.id !== id));
  };
  const handleUpdateUserKitSlot = (id: string, slot: UserSlot) => {
    void updateSlot(id, slot);
    setUserKitFiles((prev) => prev.map((f) => (f.id === id ? { ...f, slot } : f)));
  };
  const handleClearUserKit = () => {
    void clearAll();
    setUserKitFiles([]);
  };

  const routeParams = (nextOverride: PatternOverride | null, nextCrosshair: CrosshairControl | null): RouteParams => ({
    pattern: nextOverride ? encodePatternOverride(nextOverride) : null,
    crosshair: nextCrosshair ? encodeCrosshairControl(nextCrosshair) : null,
    kit: userKitFiles.length > 0 ? "local" : null,
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
          userKitFiles={userKitFiles}
          userKit={userKit}
          onAddUserKitFiles={handleAddUserKitFiles}
          onRemoveUserKitFile={handleRemoveUserKitFile}
          onUpdateUserKitSlot={handleUpdateUserKitSlot}
          onClearUserKit={handleClearUserKit}
          receivedLocalKit={receivedLocalKit}
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
