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
