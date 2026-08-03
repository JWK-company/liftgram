// @plm SRS-035  주변 헬스장 조회 — app의 services/gymSearch.ts를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 거리 계산·정렬은 도메인(core의 `rankGyms`)이 한다. 이 파일은 **부수효과만** 맡는다:
// 위치를 묻고, POI 제공자에게 물어보고, 실패를 코드로 갈라 준다.
//
// ── 왜 우리 서버를 거치지 않나 ──────────────────────────────────────────────
// Overpass는 키가 필요 없고 CORS를 연다. 서버를 한 겹 두면 우리 IP 하나로 모든 요청이 모여
// 공용 서비스의 사용 제한에 먼저 걸리고, 정작 우리가 할 일(거리 계산)은 늘지 않는다.
// 유료 제공자(카카오·구글)로 옮기는 날에는 키가 생기므로 **그때** 서버 뒤로 넣는다.
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

/** 현재 위치. 미지원·거부·실패·시간초과를 갈라서 던진다. */
export function getCurrentLocation(timeoutMs = 12_000): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== "function") {
      reject(new GymError("geo-unsupported"));
      return;
    }
    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
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

const PROVIDER_TIMEOUT_MS = 20_000;

function buildQuery(from: GeoPoint, radiusM: number): string {
  const a = `${radiusM},${from.lat},${from.lon}`;
  // 상업 헬스장 태그만 본다. `sport=fitness`는 아파트 헬스장·공원 운동기구까지 끌어와
  // 목록을 못 쓰게 만든다(실측으로 뺐다).
  return (
    "[out:json][timeout:20];(" +
    `node["leisure"="fitness_centre"](around:${a});` +
    `way["leisure"="fitness_centre"](around:${a});` +
    `node["amenity"="gym"](around:${a});` +
    `way["amenity"="gym"](around:${a});` +
    ");out center tags 60;"
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

async function fetchProvider(query: string): Promise<{ elements?: OverpassElement[] }> {
  let lastErr: unknown;
  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`overpass ${res.status}`);
        continue;
      }
      return (await res.json()) as { elements?: OverpassElement[] };
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error("overpass failed");
}

/** 주변 헬스장을 가까운 순으로. 실패는 전부 `search-failed`로 모은다(원인은 화면이 못 고친다). */
export async function searchNearbyGyms(from: GeoPoint, radiusM = 2000): Promise<RankedGym[]> {
  let data: { elements?: OverpassElement[] };
  try {
    data = await fetchProvider(buildQuery(from, radiusM));
  } catch {
    throw new GymError("search-failed");
  }

  const seen = new Set<string>();
  const gyms: Gym[] = [];
  for (const el of data?.elements ?? []) {
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
  return rankGyms(gyms, from);
}

/** 길찾기 — 좌표 기반 보편 URL(휴대폰은 지도 앱, 데스크톱은 웹 지도로 열린다). */
export function gymMapsUrl(gym: { name: string | null; lat: number; lon: number }): string {
  const q = gym.name ? `${gym.name} ${gym.lat},${gym.lon}` : `${gym.lat},${gym.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
