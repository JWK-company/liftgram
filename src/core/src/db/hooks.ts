// WatermelonDB reactive 구독 훅. 화면은 repository가 돌려준 Query를 이 훅으로 구독한다.
// factory+deps 패턴으로 쿼리를 메모이즈해 불필요한 재구독을 막는다.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Model, Query } from '@nozbe/watermelondb';

// Query<T> 결과 배열을 반응형으로 구독.
export function useQueryData<T extends Model>(factory: () => Query<T> | null, deps: unknown[]): T[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(factory, deps);
  const [data, setData] = useState<T[]>([]);
  useEffect(() => {
    if (!query) {
      setData([]);
      return;
    }
    const sub = query.observe().subscribe(setData);
    return () => sub.unsubscribe();
  }, [query]);
  return data;
}

// 결과와 함께 **첫 결과가 도착했는가**를 돌려준다 — 「아직 안 읽음([])」과 「정말 0개」를 가려야 하는 화면용.
// (운동 홈의 주 행동은 루틴 0개일 때와 아닐 때가 다르다 — 읽기 전 []를 0개로 보면 빨강이 옮겨 다닌다 · 화면 정리 M-2 /qa H-1)
// @plm SRS-072
export function useQueryDataStatus<T extends Model>(
  factory: () => Query<T> | null,
  deps: unknown[],
): { data: T[]; loaded: boolean } {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(factory, deps);
  const [state, setState] = useState<{ data: T[]; loaded: boolean; query: Query<T> | null }>({
    data: [],
    loaded: false,
    query: null,
  });
  useEffect(() => {
    if (!query) return;
    const sub = query.observe().subscribe((data) => setState({ data, loaded: true, query }));
    return () => sub.unsubscribe();
  }, [query]);
  // 쿼리가 바뀌었으면 이전 쿼리의 결과는 「아직 안 읽음」으로 본다
  return state.query === query && query ? { data: state.data, loaded: state.loaded } : { data: [], loaded: false };
}

// 단일 모델의 변경을 반응형으로 구독(없으면 null).
// 주의: WatermelonDB의 model.observe()는 변경 시 "동일 인스턴스"를 emit한다(필드는 in-place 변경).
// 따라서 setState(sameRef)는 Object.is 바일아웃으로 리렌더가 안 된다 → 버전 카운터로 강제 리렌더.
export function useModelData<T extends Model>(model: T | null): T | null {
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const ref = useRef<T | null>(model);
  ref.current = model;
  useEffect(() => {
    if (!model) return;
    const sub = model.observe().subscribe(() => bump());
    return () => sub.unsubscribe();
  }, [model]);
  return ref.current;
}
