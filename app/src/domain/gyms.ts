// 위치 기반 주변 헬스장 발견·추천 (SRS-035) — 순수 도메인. RN/네트워크 의존 0(테스트 가능).
// 거리 계산·정렬·표기만. 데이터 조회(위치·POI)는 서비스 계층(gymSearch)이 담당. @plm SRS-035

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Gym {
  id: string; // 제공자 고유 id (예: osm node/way id)
  name: string | null;
  lat: number;
  lon: number;
  address: string | null;
  brand: string | null; // 체인 브랜드(있으면)
}

export interface RankedGym extends Gym {
  distanceM: number;
}

// 하버사인 거리(미터). 두 좌표 사이 대권거리 — 도심 반경(수 km)에서 충분히 정확.
export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // 지구 반경(m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 좌표 유효성(NaN·범위 밖 방어).
export function isValidPoint(p: { lat: number; lon: number }): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

// 사용자 위치 기준 거리순 정렬 + 거리 부여. 좌표 무효 항목은 제외.
// 추천 순위 = 가까운 순(1순위). 이름 있는 곳이 동거리면 우선(정보 유용성). 상단이 '추천' 슬롯.
export function rankGyms(gyms: Gym[], from: GeoPoint): RankedGym[] {
  return gyms
    .filter((g) => isValidPoint(g))
    .map((g) => ({ ...g, distanceM: haversineM(from, g) }))
    .sort((a, b) => {
      // 동일 거리(±25m) 내에서는 이름 있는 곳 우선, 그 외는 거리 오름차순.
      if (Math.abs(a.distanceM - b.distanceM) <= 25) {
        const an = a.name ? 0 : 1;
        const bn = b.name ? 0 : 1;
        if (an !== bn) return an - bn;
      }
      return a.distanceM - b.distanceM;
    });
}

// 거리 표기 — 1km 미만은 m(10m 반올림), 이상은 km(소수1).
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}
