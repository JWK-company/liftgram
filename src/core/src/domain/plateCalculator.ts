// 바벨 플레이트 계산기 — 목표 중량을 한쪽 플레이트 조합으로 분해. @plm SRS-003
// KR 헬스장 표준 플레이트 + 20kg 바 기본값(사용자 설정으로 덮어쓰기 가능).

export interface PlateInventory {
  barKg: number;
  platesKg: number[]; // 보유 플레이트 종류(한쪽 1장 기준), 무관 순서
}

export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
export const DEFAULT_BAR_KG = 20;
export const DEFAULT_INVENTORY: PlateInventory = {
  barKg: DEFAULT_BAR_KG,
  platesKg: DEFAULT_PLATES_KG,
};

export interface PlateBreakdown {
  perSide: { plateKg: number; count: number }[];
  achievableKg: number; // 실제로 끼울 수 있는 총 중량(바 포함)
  leftoverKg: number; // 목표 대비 못 맞춘 잔여(0이면 정확)
}

// 그리디 분해(큰 플레이트부터). 부동소수 비교는 EPS로 보정.
export function calcPlates(targetKg: number, inv: PlateInventory = DEFAULT_INVENTORY): PlateBreakdown {
  const EPS = 1e-6;
  const plates = [...inv.platesKg].sort((a, b) => b - a);
  if (targetKg <= inv.barKg + EPS) {
    return { perSide: [], achievableKg: inv.barKg, leftoverKg: Math.max(0, targetKg - inv.barKg) };
  }
  const perSideTarget = (targetKg - inv.barKg) / 2;
  const result: { plateKg: number; count: number }[] = [];
  let remaining = perSideTarget;
  for (const p of plates) {
    if (remaining >= p - EPS) {
      const count = Math.floor((remaining + EPS) / p);
      if (count > 0) {
        result.push({ plateKg: p, count });
        remaining -= count * p;
      }
    }
  }
  const loadedPerSide = perSideTarget - remaining;
  const achievableKg = inv.barKg + loadedPerSide * 2;
  return { perSide: result, achievableKg, leftoverKg: targetKg - achievableKg };
}

// lb 블록의 원판 계산(/qa code M-2) — 미국식 45lb 봉·lb 원판. 계산은 kg 정본으로 하고(같은 함수) 화면이 lb 로 보인다.
// 봉 무게는 프로필(kg)이 아니라 45lb 로 본다 — lb 원판이 걸린 기구의 봉은 대개 45lb 다. @plm SRS-067
export const LB_PLATES_LB = [45, 35, 25, 10, 5, 2.5];
export const LB_BAR_LB = 45;
export function lbPlateInventory(): PlateInventory {
  const k = 0.45359237;
  return { barKg: LB_BAR_LB * k, platesKg: LB_PLATES_LB.map((p) => p * k) };
}
