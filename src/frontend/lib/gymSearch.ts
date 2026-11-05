// @plm SRS-035  주변 헬스장 조회 — app의 services/gymSearch.ts를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 거리 계산·정렬은 도메인(core의 `rankGyms`)이 한다. 이 파일은 **부수효과만** 맡는다:
// 위치를 묻고, POI 제공자에게 물어보고, 실패를 코드로 갈라 준다.
//
// ── 제공자 순서(SPEC-029) ───────────────────────────────────────────────────
// 우리 서버(카카오 로컬)를 먼저 부른다 — 키를 브라우저에 둘 수 없어 서버 뒤에 있다.
// 200에 형식까지 맞을 때만 그 답을 믿고, 그 밖의 모든 경우(키 없음·국외·제한·오류)는 Overpass로 간다.
// Overpass는 공용 서버라 자주 멈춘다(2026-11-05 운영 33~49초 스피너) — 그래서 대기 상한을 둔다.
//
// ── 실패를 뭉뚱그리지 않는다 ────────────────────────────────────────────────
// "권한 거부"와 "네트워크 실패"는 사용자가 할 일이 다르다(설정을 열지, 다시 눌러 볼지).
// 그래서 코드를 다섯으로 나눠 화면이 다른 문장을 띄우게 한다.
// ─────────────────────────────────────────────────────────────────────────────
import { rankGyms, type GeoPoint, type Gym, type RankedGym } from "@app/core";

export type GymErrorCode =
  | "geo-unsupported" // 이 브라우저가 위치를 지원하지 않는다
  | "geo-denied" // 위치 권한을 거부했다
  | "geo-unavailable" // 위치를 못 얻었다
  | "geo-timeout" // 위치 확인이 너무 오래 걸린다
  | "search-failed"; // POI 조회가 실패했다(네트워크·제공자)

export class GymError extends Error {
  code: GymErrorCode;
  constructor(code: GymErrorCode) {
    super(code);
    this.code = code;
    this.name = "GymError";
  }
}

/** 위치 단계의 전체 상한. `timeout` 옵션은 권한 창이 떠 있는 동안 흐르지 않아 따로 둔다(W3C). */
const LOCATION_CAP_MS = 45_000;

/** 현재 위치. 미지원·거부·실패·시간초과를 갈라서 던진다. */
export function getCurrentLocation(
  timeoutMs = 12_000,
  capMs = LOCATION_CAP_MS,
  /** 상한이 지난 뒤에 도착한 위치 — 권한 창을 늦게 허용한 사람의 답을 버리지 않는다. */
  onLate?: (loc: GeoPoint) => void,
): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    let capped = false;
    const cap = setTimeout(() => {
      capped = true;
      reject(new GymError("geo-timeout"));
    }, capMs);
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== "function") {
      clearTimeout(cap);
      reject(new GymError("geo-unsupported"));
      return;
    }
    geo.getCurrentPosition(
      (pos) => {
        clearTimeout(cap);
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        if (capped) onLate?.(loc);
        else resolve(loc);
      },
      (err) => {
        clearTimeout(cap);
        // 1 PERMISSION_DENIED · 2 POSITION_UNAVAILABLE · 3 TIMEOUT
        const code: GymErrorCode =
          err?.code === 1 ? "geo-denied" : err?.code === 3 ? "geo-timeout" : "geo-unavailable";
        reject(new GymError(code));
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

// ── POI 제공자: Overpass(OSM) ────────────────────────────────────────────────
// 미러를 둘 둔다 — 하나가 죽어도 다른 하나로 넘어간다(공용 서비스라 자주 붐빈다).
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// [원본] const PROVIDER_TIMEOUT_MS = 20_000;
// [개선] SPEC-029 — 서버 8초 + Overpass 나머지, 합쳐 25초. 다음 미러는 6초 뒤(앞 서버가 먼저 실패하면 바로) 더한다.
const SERVER_TIMEOUT_MS = 8_000;
const SEARCH_TOTAL_MS = 25_000;
const HEDGE_DELAY_MS = 6_000;
/** Overpass는 거리순으로 자르지 못한다 — 넉넉히 받아 우리가 정렬한 뒤 앞쪽만 보여 준다. */
const OVERPASS_FETCH_LIMIT = 200;
const OVERPASS_SHOW_LIMIT = 60;

function buildQuery(from: GeoPoint, radiusM: number): string {
  const a = `${radiusM},${from.lat},${from.lon}`;
  // 상업 헬스장 태그만 본다. `sport=fitness`는 아파트 헬스장·공원 운동기구까지 끌어와
  // 목록을 못 쓰게 만든다(실측으로 뺐다).
  return (
    "[out:json][timeout:15];(" +
    `node["leisure"="fitness_centre"](around:${a});` +
    `way["leisure"="fitness_centre"](around:${a});` +
    `node["amenity"="gym"](around:${a});` +
    `way["amenity"="gym"](around:${a});` +
    // [원본] ");out center tags 60;" — 거리순 60곳이 아니라 아무 60곳이어서 가까운 곳이 빠질 수 있었다
    `);out center tags ${OVERPASS_FETCH_LIMIT};`
  );
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function tagsToAddress(tags: Record<string, string>): string | null {
  if (tags["addr:full"]) return tags["addr:full"];
  const parts = ["addr:city", "addr:district", "addr:subdistrict", "addr:street", "addr:housenumber"]
    .map((k) => tags[k])
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

// [원본] async function fetchProvider(query: string): Promise<{ elements?: OverpassElement[] }> {
// [원본]   let lastErr: unknown;
// [원본]   for (const url of OVERPASS_ENDPOINTS) {
// [원본]     const ctrl = new AbortController();
// [원본]     const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
// [원본]     try {
// [원본]       const res = await fetch(url, {
// [원본]         method: "POST",
// [원본]         headers: { "Content-Type": "application/x-www-form-urlencoded" },
// [원본]         body: `data=${encodeURIComponent(query)}`,
// [원본]         signal: ctrl.signal,
// [원본]       });
// [원본]       if (!res.ok) {
// [원본]         lastErr = new Error(`overpass ${res.status}`);
// [원본]         continue;
// [원본]       }
// [원본]       return (await res.json()) as { elements?: OverpassElement[] };
// [원본]     } catch (e) {
// [원본]       lastErr = e;
// [원본]     } finally {
// [원본]       clearTimeout(timer);
// [원본]     }
// [원본]   }
// [원본]   throw lastErr ?? new Error("overpass failed");
// [원본] }
//
// [원본] /** 주변 헬스장을 가까운 순으로. 실패는 전부 `search-failed`로 모은다(원인은 화면이 못 고친다). */
// [원본] export async function searchNearbyGyms(from: GeoPoint, radiusM = 2000): Promise<RankedGym[]> {
// [원본]   let data: { elements?: OverpassElement[] };
// [원본]   try {
// [원본]     data = await fetchProvider(buildQuery(from, radiusM));
// [원본]   } catch {
// [원본]     throw new GymError("search-failed");
// [원본]   }
//
// [원본]   const seen = new Set<string>();
// [원본]   const gyms: Gym[] = [];
// [원본]   for (const el of data?.elements ?? []) {
// [원본]     const lat = el.lat ?? el.center?.lat;
// [원본]     const lon = el.lon ?? el.center?.lon;
// [원본]     if (typeof lat !== "number" || typeof lon !== "number") continue;
// [원본]     const id = `${el.type}/${el.id}`;
// [원본]     if (seen.has(id)) continue;
// [원본]     const tags = el.tags ?? {};
// [원본]     const name = tags.name ?? tags["name:ko"] ?? tags["name:en"] ?? null;
// [원본]     // 상호가 없는 항목은 뺀다 — "이름 미상"이 목록의 절반이면 아무도 안 쓴다.
// [원본]     if (!name) continue;
// [원본]     seen.add(id);
// [원본]     gyms.push({ id, name, lat, lon, address: tagsToAddress(tags), brand: tags.brand ?? null });
// [원본]   }
// [원본]   return rankGyms(gyms, from);
// [원본] }

/** Overpass 한 서버. 200이어도 시간 초과면 elements 없음·빈 목록+remark로 온다 — 실패로 본다. */
async function fetchOverpassOnce(
  url: string,
  query: string,
  signal: AbortSignal,
): Promise<OverpassElement[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const data = (await res.json()) as { elements?: unknown; remark?: unknown };
  if (!Array.isArray(data?.elements)) throw new Error("overpass format");
  if (data.elements.length === 0 && data.remark) throw new Error("overpass remark");
  return data.elements as OverpassElement[];
}

/** 미러를 차례로 더해 먼저 온 성공을 쓴다. 끝나면 타이머를 풀고 남은 요청을 끊는다. */
function fetchProvider(query: string, budgetMs: number, signal?: AbortSignal): Promise<OverpassElement[]> {
  return new Promise((resolve, reject) => {
    const ctrls: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let started = 0;
    let failed = 0;
    let settled = false;
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
      for (const c of ctrls) c.abort();
      done();
    };
    const fail = () => finish(() => reject(new Error("overpass failed")));
    const onAbort = () => fail();
    const start = () => {
      if (settled || started >= OVERPASS_ENDPOINTS.length) return;
      const url = OVERPASS_ENDPOINTS[started++];
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      fetchOverpassOnce(url, query, ctrl.signal).then(
        (elements) => finish(() => resolve(elements)),
        () => {
          failed += 1;
          if (failed >= OVERPASS_ENDPOINTS.length) fail();
          else start();
        },
      );
    };
    if (signal?.aborted) {
      fail();
      return;
    }
    signal?.addEventListener("abort", onAbort);
    timers.push(setTimeout(fail, budgetMs));
    timers.push(setTimeout(start, HEDGE_DELAY_MS));
    start();
  });
}

function overpassToGyms(elements: OverpassElement[]): Gym[] {
  const seen = new Set<string>();
  const gyms: Gym[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    const tags = el.tags ?? {};
    const name = tags.name ?? tags["name:ko"] ?? tags["name:en"] ?? null;
    // 상호가 없는 항목은 뺀다 — "이름 미상"이 목록의 절반이면 아무도 안 쓴다.
    if (!name) continue;
    seen.add(id);
    gyms.push({ id, name, lat, lon, address: tagsToAddress(tags), brand: tags.brand ?? null });
  }
  return gyms;
}

// ── 우리 서버(카카오 로컬) ───────────────────────────────────────────────────
const KAKAO_ID_PREFIX = "kakao/";

/** 서버 응답. 형식이 조금이라도 다르면 null — 빈 목록으로 오해하지 않고 Overpass로 간다. */
function parseServerGyms(data: unknown): { gyms: Gym[]; truncated: boolean } | null {
  if (typeof data !== "object" || data === null) return null;
  const { gyms: list, truncated } = data as { gyms?: unknown; truncated?: unknown };
  if (!Array.isArray(list)) return null;
  const gyms: Gym[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const { id, name, lat, lon, address } = raw ?? {};
    if (typeof id !== "string" || !/^\d+$/.test(id)) return null;
    if (typeof name !== "string" || typeof lat !== "number" || typeof lon !== "number") return null;
    gyms.push({
      id: `${KAKAO_ID_PREFIX}${id}`,
      name,
      lat,
      lon,
      address: typeof address === "string" && address ? address : null,
      brand: null,
    });
  }
  return { gyms, truncated: truncated === true };
}

async function fetchFromServer(
  from: GeoPoint,
  radiusM: number,
  signal?: AbortSignal,
): Promise<{ gyms: Gym[]; truncated: boolean } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SERVER_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch("/api/gyms/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: from.lat, lon: from.lon, radius: radiusM }),
      credentials: "omit",
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.status !== 200) return null;
    return parseServerGyms(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export interface GymSearchResult {
  gyms: RankedGym[];
  /** 가까운 곳만 담겼다 — 더 넓혀도 먼 곳이 더 보이지 않는다. */
  truncated: boolean;
}

/** 주변 헬스장을 가까운 순으로. 실패는 전부 `search-failed`로 모은다(원인은 화면이 못 고친다). */
export async function searchNearbyGyms(
  from: GeoPoint,
  radiusM = 2000,
  signal?: AbortSignal,
): Promise<GymSearchResult> {
  const startedAt = Date.now();
  const server = await fetchFromServer(from, radiusM, signal);
  if (server) return { gyms: rankGyms(server.gyms, from), truncated: server.truncated };
  if (signal?.aborted) throw new GymError("search-failed");

  const budgetMs = SEARCH_TOTAL_MS - (Date.now() - startedAt);
  let elements: OverpassElement[];
  try {
    elements = await fetchProvider(buildQuery(from, radiusM), budgetMs, signal);
  } catch {
    throw new GymError("search-failed");
  }
  const ranked = rankGyms(overpassToGyms(elements), from);
  return {
    gyms: ranked.slice(0, OVERPASS_SHOW_LIMIT),
    truncated: elements.length >= OVERPASS_FETCH_LIMIT || ranked.length > OVERPASS_SHOW_LIMIT,
  };
}

/** 길찾기 — 좌표 기반 보편 URL(휴대폰은 지도 앱, 데스크톱은 웹 지도로 열린다). */
export function gymMapsUrl(gym: { id?: string; name: string | null; lat: number; lon: number }): string {
  // 카카오 결과는 장소 id로 카카오맵 길찾기를 연다.
  if (gym.id?.startsWith(KAKAO_ID_PREFIX)) {
    return `https://map.kakao.com/link/to/${gym.id.slice(KAKAO_ID_PREFIX.length)}`;
  }
  const q = gym.name ? `${gym.name} ${gym.lat},${gym.lon}` : `${gym.lat},${gym.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
