// @plm SRS-056  사용자가 막 만든 레코드의 칸을 동기 충돌에서 지킨다(/qa code M-2).
//
// WatermelonDB 는 prepareCreate 중에는 `_changed` 를 기록하지 않는다. 그래서 아직 올리지 않은 **created** 레코드가
// 같은 id 의 원격 레코드를 받으면 resolveConflict 가 원격 값으로 전부 덮는다. 결정적 id(`pref-<종목>`)를 쓰는
// 선호 행은 서버 이관·다른 기기가 같은 행을 이미 갖고 있을 수 있어, 오프라인에서 켠 「한쪽 무게로 입력」이나 고른 이름이
// 다음 동기에 조용히 사라졌다. 사용자가 직접 정한 칸만 「바뀐 칸」으로 표시해 칸 단위로 로컬이 이기게 한다.
// (정규화가 심는 이름은 표시하지 않는다 — 다른 기기에서 사용자가 고른 이름이 있으면 그쪽이 이겨야 한다)

/** 만들기 빌더 안에서 부른다: `create((p) => { …; markLocalWins(p._raw, ['plate_one_side']) })` */
export function markLocalWins(raw: { _changed?: string }, columns: string[]): void {
  const set = new Set((raw._changed ?? '').split(',').filter(Boolean));
  for (const c of columns) set.add(c);
  raw._changed = [...set].join(',');
}
