// 주변 헬스장 검색 서비스 (SRS-035) — 위치(geolocation) + POI 제공자 조회.
// MVP 제공자 = Overpass(OSM, 키 불필요). 카카오/구글 키 확보 시 searchNearbyGyms 내부만 교체(제공자 추상화).
// 순수 계산(거리·정렬)은 domain/gyms. 여기서는 부수효과(위치·네트워크)만. @plm SRS-035
import { rankGyms, type GeoPoint, type Gym, type RankedGym } from '../domain';

export type GymErrorCode =
  | 'geo-unsupported' // 이 기기/브라우저가 위치를 지원 안 함
  | 'geo-denied' // 위치 권한 거부
  | 'geo-unavailable' // 위치 확인 실패
  | 'geo-timeout' // 위치 확인 시간초과
  | 'search-failed'; // POI 조회 실패(네트워크/제공자)

export class GymError extends Error {
  code: GymErrorCode;
  constructor(code: GymErrorCode) {
    super(code);
    this.code = code;
    this.name = 'GymError';
  }
}

// 현재 위치 — 웹 PWA는 navigator.geolocation. 미지원/거부/실패를 코드로 구분해 UI가 안내.
export function getCurrentLocation(timeoutMs = 12000): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== 'undefined' ? (navigator as { geolocation?: Geolocation }).geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      reject(new GymError('geo-unsupported'));
      return;
    }
    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        // 1 PERMISSION_DENIED · 2 POSITION_UNAVAILABLE · 3 TIMEOUT
        const code: GymErrorCode = err?.code === 1 ? 'geo-denied' : err?.code === 3 ? 'geo-timeout' : 'geo-unavailable';
        reject(new GymError(code));
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

// ── POI 제공자: Overpass(OSM) ──────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function buildOverpassQuery(from: GeoPoint, radiusM: number): string {
  const a = `${radiusM},${from.lat},${from.lon}`;
  return (
    '[out:json][timeout:20];(' +
    `node["leisure"="fitness_centre"](around:${a});` +
    `way["leisure"="fitness_centre"](around:${a});` +
    `node["amenity"="gym"](around:${a});` +
    `way["amenity"="gym"](around:${a});` +
    `node["sport"="fitness"](around:${a});` +
    `way["sport"="fitness"](around:${a});` +
    ');out center tags 60;'
  );
}

function tagsToAddress(tags: Record<string, string>): string | null {
  if (tags['addr:full']) return tags['addr:full'];
  const parts = ['addr:city', 'addr:district', 'addr:subdistrict', 'addr:street', 'addr:housenumber']
    .map((k) => tags[k])
    .filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

async function fetchOverpass(query: string): Promise<{ elements?: OverpassElement[] }> {
  let lastErr: unknown;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          lastErr = new Error(`overpass ${res.status}`);
          continue;
        }
        return (await res.json()) as { elements?: OverpassElement[] };
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('overpass failed');
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// 주변 헬스장(거리순 랭킹). radiusM 기본 2km. 실패 시 GymError('search-failed').
export async function searchNearbyGyms(from: GeoPoint, radiusM = 2000): Promise<RankedGym[]> {
  let data: { elements?: OverpassElement[] };
  try {
    data = await fetchOverpass(buildOverpassQuery(from, radiusM));
  } catch {
    throw new GymError('search-failed');
  }
  const seen = new Set<string>();
  const gyms: Gym[] = [];
  for (const el of data?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags ?? {};
    gyms.push({
      id,
      name: tags.name ?? tags['name:ko'] ?? tags['name:en'] ?? null,
      lat,
      lon,
      address: tagsToAddress(tags),
      brand: tags.brand ?? null,
    });
  }
  return rankGyms(gyms, from);
}

// 외부 지도 앱/웹으로 길찾기 — 좌표 기반 보편 URL(모바일=지도앱, 웹=구글맵). 이름 쿼리 병기.
export function gymMapsUrl(gym: { name: string | null; lat: number; lon: number }): string {
  const q = gym.name ? `${gym.name} ${gym.lat},${gym.lon}` : `${gym.lat},${gym.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
