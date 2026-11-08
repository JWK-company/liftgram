// 「다른 세트도 똑같이」(SRS-106) — 한 세트의 무게·횟수를 다른 세트에 그대로 복사한다.
// 루틴 편집 표와 운동 중 세트 목록이 같은 규칙을 쓴다:
//   · 체크(완료)한 세트는 건드리지 않는다
//   · 준비 세트(웜업·피더)는 준비 세트끼리, 작업 세트(일반·탑·백오프·드롭)는 작업 세트끼리만 맞춘다
//     — 작업 무게가 웜업 칸을 덮으면 웜업이 사라진다. 세트 방식(5×5·피라미드 …)과 상관없이 같은 동작이다.
//   · 이미 같은 값인 세트는 빼고 센다(버튼에 보이는 숫자 = 실제로 바뀌는 세트 수)

export interface CopyItem<V> {
  /** 준비 세트(웜업·피더)인가 */
  prep: boolean;
  /** 아직 안 한(체크 안 된) 세트인가 — 루틴 편집은 늘 true */
  open: boolean;
  /** 비교할 값(무게·횟수 묶음) */
  value: V;
}

/** 복사로 값이 바뀌는 세트의 자리들(원본 자리는 빠진다). */
export function copyTargetIndexes<V>(items: CopyItem<V>[], source: number, same: (a: V, b: V) => boolean): number[] {
  const src = items[source];
  if (!src) return [];
  const out: number[] = [];
  items.forEach((it, i) => {
    if (i === source || !it.open || it.prep !== src.prep) return;
    if (same(it.value, src.value)) return;
    out.push(i);
  });
  return out;
}

/** 루틴 처방 줄의 준비 세트 판정 — 웜업·피더 */
export function isPrepSetType(type: string | null | undefined): boolean {
  return type === 'warmup' || type === 'feeder';
}
