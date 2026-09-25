// GitHub Pages는 서버 라우팅이 없어서 public/404.html이 실제 경로를 ?p=/?q= 형태로
// 감춰 루트로 리다이렉트한다. 앱이 뜨기 전에 그 흔적을 실제 경로로 복원한다.
// https://github.com/rafrex/spa-github-pages
export function restoreRedirectedPath(): void {
  if (typeof window === "undefined") return;
  const { location } = window;
  if (location.search[1] !== "p" && location.search.slice(1, 3) !== "p=") return;

  const params = new URLSearchParams(location.search.slice(1));
  const restoredPath = params.get("p");
  if (restoredPath === null) return;

  const restoredQuery = params.get("q");
  const query = restoredQuery ? "?" + restoredQuery.replace(/~and~/g, "&") : "";
  const newUrl =
    location.pathname.slice(0, -1) + restoredPath.replace(/~and~/g, "&") + query + location.hash;
  window.history.replaceState(null, "", newUrl);
}

const BASE_PATH = import.meta.env.BASE_URL; // 예: "/krachwerk/"

export interface RouteState {
  seed: string | null;
  pattern: string | null;
}

export function readRoute(): RouteState {
  if (typeof window === "undefined") return { seed: null, pattern: null };
  const { pathname, search } = window.location;
  const trimmedBase = BASE_PATH.endsWith("/") ? BASE_PATH.slice(0, -1) : BASE_PATH;
  let rest = pathname.startsWith(trimmedBase) ? pathname.slice(trimmedBase.length) : pathname;
  rest = rest.replace(/^\/+/, "");
  const seed = rest.length > 0 ? decodeURIComponent(rest) : null;
  const pattern = new URLSearchParams(search).get("pattern");
  return { seed, pattern };
}

export function buildSeedUrl(seed: string, pattern?: string | null): string {
  const origin = window.location.origin;
  const base = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
  const path = `${origin}${base}${encodeURIComponent(seed)}`;
  return pattern ? `${path}?pattern=${pattern}` : path;
}

export function pushRoute(seed: string, pattern?: string | null): void {
  const base = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
  const path = `${base}${encodeURIComponent(seed)}`;
  const query = pattern ? `?pattern=${pattern}` : "";
  window.history.pushState(null, "", path + query);
}

// 매트릭스 에디터에서 셀을 토글할 때는 새 히스토리 항목을 쌓지 않고 현재 URL만 갱신한다.
export function replaceRoute(seed: string, pattern?: string | null): void {
  const base = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
  const path = `${base}${encodeURIComponent(seed)}`;
  const query = pattern ? `?pattern=${pattern}` : "";
  window.history.replaceState(null, "", path + query);
}
