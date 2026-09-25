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
  crosshair: string | null;
}

export interface RouteParams {
  pattern?: string | null;
  crosshair?: string | null;
}

export function readRoute(): RouteState {
  if (typeof window === "undefined") return { seed: null, pattern: null, crosshair: null };
  const { pathname, search } = window.location;
  const trimmedBase = BASE_PATH.endsWith("/") ? BASE_PATH.slice(0, -1) : BASE_PATH;
  let rest = pathname.startsWith(trimmedBase) ? pathname.slice(trimmedBase.length) : pathname;
  rest = rest.replace(/^\/+/, "");
  const seed = rest.length > 0 ? decodeURIComponent(rest) : null;
  const params = new URLSearchParams(search);
  return { seed, pattern: params.get("pattern"), crosshair: params.get("crosshair") };
}

function buildQuery(params?: RouteParams): string {
  const query = new URLSearchParams();
  if (params?.pattern) query.set("pattern", params.pattern);
  if (params?.crosshair) query.set("crosshair", params.crosshair);
  const str = query.toString();
  return str ? `?${str}` : "";
}

export function buildSeedUrl(seed: string, params?: RouteParams): string {
  const origin = window.location.origin;
  const base = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
  return `${origin}${base}${encodeURIComponent(seed)}${buildQuery(params)}`;
}

export function pushRoute(seed: string, params?: RouteParams): void {
  const base = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
  window.history.pushState(null, "", `${base}${encodeURIComponent(seed)}${buildQuery(params)}`);
}

// 매트릭스 에디터나 크로스헤어 조작처럼 값을 계속 바꿀 때는 새 히스토리 항목을 쌓지 않고
// 현재 URL만 갱신한다.
export function replaceRoute(seed: string, params?: RouteParams): void {
  const base = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
  window.history.replaceState(null, "", `${base}${encodeURIComponent(seed)}${buildQuery(params)}`);
}
