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
