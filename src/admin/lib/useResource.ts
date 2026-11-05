"use client";

// 서버에서 읽어 오는 화면의 공통 규칙(SPEC-033).
//   · 다시 읽다 실패해도 있던 데이터를 지우지 않는다. 운영자는 「n분 전 데이터」라는 표시와 함께 계속 본다.
//   · 탭이 보일 때만 자동으로 다시 읽고, 다시 보이면 바로 읽는다.
//   · 오래된 응답이 새 응답을 덮지 않는다.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { errorText } from "./rpc";

export type Resource<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  loadedAt: number | null;
  /** 지금 보이는 data 를 받은 요청이 시작된 시각. 이보다 뒤에 처리한 일은 data 에 아직 없을 수 있다. */
  dataStartedAt: number | null;
  reload: () => Promise<void>;
  /** 처리 응답을 바로 반영한다. 진행 중인 읽기는 처리 전 값일 수 있어 버린다. */
  mutate(fn: (prev: T) => T): void;
};

/** 값을 올리면 그 아래 자원이 모두 다시 읽는다(화면 전체 새로고침). */
export const RefreshSignal = createContext(0);

/** 탭 복귀 때 이보다 최근에 읽었으면 다시 읽지 않는다. 요약은 복귀 한 번에 RPC 가 다섯 개라 요청 제한을 먹는다. */
const RETURN_MIN_MS = 30_000;

export function useResource<T>(load: () => Promise<T>, autoMs = 0): Resource<T> {
  const signal = useContext(RefreshSignal);
  const lastLoad = useRef(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [dataStartedAt, setDataStartedAt] = useState<number | null>(null);
  const seq = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const startedAt = Date.now();
    lastLoad.current = startedAt;
    setLoading(true);
    try {
      const next = await loader.current();
      if (mine !== seq.current) return;
      setData(next);
      setError(null);
      setLoadedAt(Date.now());
      setDataStartedAt(startedAt);
    } catch (e) {
      if (mine === seq.current) setError(errorText(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const mutate = useCallback((fn: (prev: T) => T) => {
    seq.current++;
    setLoading(false);
    setData((prev) => (prev === null ? prev : fn(prev)));
  }, []);

  useEffect(() => {
    void reload();
    if (!autoMs) return;
    const tick = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const onReturn = () => {
      if (Date.now() - lastLoad.current >= RETURN_MIN_MS) tick();
    };
    const timer = setInterval(tick, autoMs);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [reload, autoMs]);

  const seenSignal = useRef(signal);
  useEffect(() => {
    if (signal === seenSignal.current) return;
    seenSignal.current = signal;
    void reload();
  }, [signal, reload]);

  return { data, error, loading, loadedAt, dataStartedAt, reload, mutate };
}
