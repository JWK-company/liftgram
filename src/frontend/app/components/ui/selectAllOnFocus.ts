// 숫자 칸을 누르면 숫자 전체가 선택된다 — 바로 새 숫자를 치면 바뀐다(「12」 사이에 커서가 들어가 두 번 지우던 것 · SPEC-042).
// 휴대폰은 탭이 끝날 때(mouseup) 커서를 누른 자리로 옮겨 focus 때의 선택을 풀어 버린다 →
// 포커스 직후 첫 mouseup 의 기본 동작을 막고, 한 박자 뒤에 한 번 더 선택한다(iOS Safari).
import type { FocusEvent, MouseEvent } from "react";

const JUST = "selectAllJust";

function selectWhole(el: HTMLInputElement) {
  try {
    el.setSelectionRange(0, el.value.length);
  } catch {
    el.select();
  }
}

export function selectAllOnFocus(e: FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  el.select();
  el.dataset[JUST] = "1";
  setTimeout(() => {
    if (document.activeElement === el) selectWhole(el);
  }, 0);
  // iOS Safari 는 탭이 끝난 뒤 커서를 늦게 놓는 일이 있다 — 한 번 더(REV-077 C-5)
  // 그사이 이미 치기 시작했으면(값이 바뀜) 건드리지 않는다 — 친 글자를 다시 선택해 지우지 않게
  const before = el.value;
  setTimeout(() => {
    if (document.activeElement === el && el.value === before && el.selectionStart === el.selectionEnd) selectWhole(el);
  }, 80);
  // 키보드로 들어온 포커스(mouseup 없음)는 표시를 곧 지운다 — 다음 클릭으로 커서를 옮길 수 있게
  setTimeout(() => {
    delete el.dataset[JUST];
  }, 600);
}

export function keepSelectAllOnMouseUp(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  if (el.dataset[JUST] !== "1") return;
  delete el.dataset[JUST];
  e.preventDefault();
}

/** 입력칸에 그대로 펼쳐 쓰는 묶음 — 다른 onFocus 가 있으면 두 함수를 따로 부른다. */
export const selectAllProps = {
  onFocus: selectAllOnFocus,
  onMouseUp: keepSelectAllOnMouseUp,
};
