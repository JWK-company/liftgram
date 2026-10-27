// @plm SRS-082  다른 탭 가드 갈고리(P5-1) — 플랫폼(웹 lib/tabGuard)이 꽂고 importRepository·부팅 파이프라인이 묻는다.
// 가져오기 본체(importRepository)를 열지 않고도 부팅 파이프라인이 「다른 탭에서 가져오는 중」을 물을 수 있게 따로 둔다.
// 꽂히지 않았으면(node 시험·네이티브) 아무것도 막지 않는다.

export interface ImportTabGuard {
  /** 이 탭 말고 열려 있는 앱 탭 수 */
  countOtherTabs(): Promise<number>;
  /** 이 탭 혼자면 「가져오는 중」 잠금을 쥐고 푸는 함수를, 다른 탭이 있거나 가져오는 중이면 null 을 돌려준다 */
  acquire(): Promise<(() => void) | null>;
  /** 다른 탭에서 가져오기·되돌리기가 진행 중인가(부팅 정리 보류) */
  isRunningElsewhere(): Promise<boolean>;
}

let guard: ImportTabGuard | null = null;

/** 앱 시작 때 한 번 꽂는다(부팅 파이프라인보다 먼저). null 이면 뽑는다. */
export function installImportTabGuard(g: ImportTabGuard | null): void {
  guard = g;
}

export function getImportTabGuard(): ImportTabGuard | null {
  return guard;
}

/** 다른 탭에서 가져오기·되돌리기가 진행 중인가 — 판정 실패는 false(평소처럼) */
export async function isImportRunningElsewhere(): Promise<boolean> {
  if (!guard) return false;
  try {
    return await guard.isRunningElsewhere();
  } catch {
    return false;
  }
}
