"use client";
// @plm SRS-004  진행 중 세션 상태 — 특히 **전역 휴식 카운트다운**
//
// ─────────────────────────────────────────────────────────────────────────────
// 휴식은 **운동 전체에 하나**다. 세트를 체크하면 시작되고, 다른 화면으로 옮겨 가도 계속 흐른다
// (app이 v7에서 화면 지역 타이머를 전역으로 승격시킨 이유 — 헬스장에서 화면을 옮겨 다니기 때문).
//
// ── 남은 시간을 세는 방법(중요) ──────────────────────────────────────────────
// 초를 1씩 빼지 **않는다.** 끝나는 시각(월클럭)을 잡아 두고 매 틱 그것과 지금의 차를 잰다.
// 브라우저는 탭이 가려지면 타이머를 늦추거나 멈춘다 — 빼기 방식이면 그만큼 휴식이 길어진다.
// 끝시각 기준이면 돌아왔을 때 곧바로 맞는 값이 나온다. 틱은 500ms(초 표시가 늦게 넘어가지 않게).
//
// app의 sessionContext는 react-native와 네이티브 알람에 묶여 있어 **옮기지 않고 다시 썼다**
// (ADR-032의 플랫폼 책임). 규칙 — 전역 1개 · 월클럭 · 500ms — 은 그대로다.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { mergeRest, type RestState } from "@app/core/domain/lockScreen";
import { lockAvailable } from "@/lib/native";
import { trackUsage } from "@/lib/usage";

// ── 휴식 영속화·LWW(SPEC-017 Phase 3 §7) ─────────────────────────────────────
// 휴식은 「사람이 정한 시각」(setAt)이 더 늦은 쪽이 이긴다 — 잠금화면 +30초·끝내기와 웹 시작·+15초·건너뛰기가 같은 규칙(mergeRest).
// 시각이 지나 끝난 휴식은 **계산한 상태**일 뿐 쓰기가 아니다(setAt 을 바꾸지 않고 네이티브로 보내지도 않는다 · REV-003 동시성 H-1).
// 새로고침해도 이어지게 끝 시각을 기기에 둔다(동기 안 함 · 운동 id 대조 · 지난 시각은 소리 없이 지움).
const REST_KEY = "liftgram.restEndsAt";
type StoredRest = {
  workoutId: string;
  endsAt: number | null;
  totalSec: number | null;
  setAt: number;
  by?: "web" | "native";
};

function readStoredRest(): StoredRest | null {
  try {
    const raw = localStorage.getItem(REST_KEY);
    const v = raw ? (JSON.parse(raw) as StoredRest) : null;
    return v && typeof v.setAt === "number" && typeof v.workoutId === "string" ? v : null;
  } catch {
    return null;
  }
}
function writeStoredRest(v: StoredRest | null): void {
  try {
    if (v) localStorage.setItem(REST_KEY, JSON.stringify(v));
    else localStorage.removeItem(REST_KEY);
  } catch {
    // 저장소 없음 — 새로고침하면 휴식이 사라질 뿐
  }
}
/** 웹의 휴식 변경을 네이티브 카드로 즉시 보낸다(디바운스·DB 읽기 없음 · §7). 다리가 없으면 아무것도 안 한다. */
function sendRestToNative(rest: RestState): void {
  void import("@/lib/lockBridge").then((m) => m.sendLockRest(rest)).catch(() => {});
}

interface SessionContextValue {
  /** 남은 휴식 초. null이면 휴식 중이 아니다. */
  restRemaining: number | null;
  startRest: (seconds: number) => void;
  /** 사람이 휴식을 끝냈다(건너뛰기 · 운동 끝) — setAt 이 새로 찍힌다. */
  clearRest: () => void;
  /** 지금 휴식(LWW 재료) — 잠금 카드 스냅샷이 싣는다. */
  getRestState: () => RestState | null;
  /** 네이티브(잠금 카드)의 휴식을 합친다 — setAt 이 늦은 쪽이 이긴다. 되돌려 보내지 않는다. */
  mergeRemoteRest: (rest: RestState | null) => void;
  /** 전역 운동 바가 읽는다 — 어느 화면에서든 진행 중인 운동을 보여 주기 위해. */
  activeWorkoutId: string | null;
  activeStartedAt: number | null;
  activeName: string | null;
  setActive: (v: { id: string; startedAt: number; name: string | null } | null) => void;
  /** 저장소에서 진행 중인 운동을 다시 읽는다(다른 화면에서 시작·종료했을 때). */
  refreshActive: () => Promise<void>;
  /**
   * 진행 중인 운동을 **한 번이라도** 저장소에서 읽었는가.
   * 그 전의 `activeWorkoutId=null` 은 「없음」이 아니라 「모름」이다(운동 홈의 주 행동 판단 · 화면 정리 M-2 /qa H-2). @plm SRS-072
   */
  activeLoaded: boolean;
  /**
   * 진행 중인 운동을 **읽어 냈는가**(또는 화면이 직접 정했는가). activeLoaded 는 읽기에 실패해도 켜지므로,
   * 「운동 중이 아니다」를 믿어야 하는 판정(광고 가드)은 이 값을 쓴다(SPEC-022).
   */
  activeKnown: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [active, setActiveState] = useState<{
    id: string;
    startedAt: number;
    name: string | null;
  } | null>(null);

  const [activeLoaded, setActiveLoaded] = useState(false);
  const [activeKnown, setActiveKnown] = useState(false);
  const setActive = useCallback((v: { id: string; startedAt: number; name: string | null } | null) => {
    setActiveState(v);
    setActiveKnown(true);
  }, []);

  const endAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** LWW 재료 — 끝 시각·총 초·사람이 정한 시각·누가 */
  const restRef = useRef<RestState | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = active?.id ?? null;
  /** 지금 휴식이 속한 운동 — 운동이 바뀌면(다시 하기 등) 옛 운동의 휴식을 지운다(REV-006 화면 M-2) */
  const restWorkoutRef = useRef<string | null>(null);

  /**
   * 진행 중인 운동을 저장소에서 읽는다.
   *
   * 저장소는 브라우저에만 있으므로 **동적 import**로만 부른다 — 이 파일이 셸(모든 화면)에
   * 올라가 있어서, 모듈 최상단에서 불러오면 서버 렌더가 통째로 터진다.
   */
  const refreshActive = useCallback(async () => {
    try {
      const repo = await import("@app/core/data/workoutRepository");
      const w = (await repo.getActiveWorkout()) as unknown as {
        id: string;
        startedAt: number;
        name: string | null;
      } | null;
      setActiveState(w ? { id: w.id, startedAt: w.startedAt, name: w.name } : null);
      setActiveKnown(true);
    } catch {
      // 저장소를 못 열었다 — 바를 띄우지 않을 뿐 화면은 그대로 돈다.
    } finally {
      // 실패해도 「읽기를 시도했다」 — 판단을 영원히 미루지 않는다
      setActiveLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const stopTicking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // [원본] 휴식 시작·끝내기·가려졌다 돌아올 때 — 끝시각만 들고, 지난 휴식은 clearRest(=쓰기)로 지웠다
  // const clearRest = useCallback(() => {
  //   endAtRef.current = null;
  //   stopTicking();
  //   setRestRemaining(null);
  // }, [stopTicking]);
  //
  // const startRest = useCallback(
  //   (seconds: number) => {
  //     stopTicking();
  //     if (seconds <= 0) {
  //       endAtRef.current = null;
  //       setRestRemaining(null);
  //       return;
  //     }
  //     endAtRef.current = Date.now() + seconds * 1000;
  //     setRestRemaining(seconds);
  //
  //     timerRef.current = setInterval(() => {
  //       const end = endAtRef.current;
  //       if (end == null) return;
  //       const left = Math.round((end - Date.now()) / 1000);
  //       if (left <= 0) {
  //         endAtRef.current = null;
  //         stopTicking();
  //         setRestRemaining(null);
  //         void import("@/lib/restSound").then((m) => m.notifyRestDone());
  //         return;
  //       }
  //       setRestRemaining(left);
  //     }, 500);
  //   },
  //   [stopTicking],
  // );
  //
  // // 탭이 가려졌다 돌아오면 곧바로 맞춘다 — 틱이 늦어졌더라도 표시가 튀지 않게.
  // useEffect(() => {
  //   const onVisible = () => {
  //     const end = endAtRef.current;
  //     if (end == null) return;
  //     const left = Math.round((end - Date.now()) / 1000);
  //     if (left <= 0) clearRest();
  //     else setRestRemaining(left);
  //   };
  //   document.addEventListener("visibilitychange", onVisible);
  //   return () => document.removeEventListener("visibilitychange", onVisible);
  // }, [clearRest]);
  // [개선] LWW·영속화·네이티브 전송(SPEC-017 §7)
  /** 화면에 그린다 — 끝 시각으로 틱을 걸거나 끈다(쓰기·전송 없음). 지나간 끝 시각이면 소리 없이 끈다. */
  const paint = useCallback(
    (rest: RestState | null, opts: { soundOnEnd: boolean }) => {
      stopTicking();
      const end = rest?.endsAt ?? null;
      const left = end == null ? 0 : Math.round((end - Date.now()) / 1000);
      if (end == null || left <= 0) {
        endAtRef.current = null;
        setRestRemaining(null);
        return;
      }
      endAtRef.current = end;
      setRestRemaining(left);
      timerRef.current = setInterval(() => {
        const e = endAtRef.current;
        if (e == null) return;
        const l = Math.round((e - Date.now()) / 1000);
        if (l <= 0) {
          // 시간 만료 — 계산한 상태일 뿐 쓰기가 아니다(setAt·저장·전송 없음)
          endAtRef.current = null;
          stopTicking();
          setRestRemaining(null);
          // 앱 안에서는 보일 때만 소리(네이티브가 잠금 중 소리를 낸다 · §11)
          // 웹 브라우저는 옛 동작대로 늘 울린다 — 앱일 때만 보일 때로 제한(REV-006 화면 M-1)
          if (opts.soundOnEnd && (!lockAvailable() || document.visibilityState === "visible"))
            void import("@/lib/restSound").then((m) => m.notifyRestDone());
          return;
        }
        setRestRemaining(l);
      }, 500);
    },
    [stopTicking],
  );

  /** 사람이 휴식을 정했다(web) — 저장 · 그림 · 네이티브로 즉시. */
  const setHumanRest = useCallback(
    (endsAt: number | null, totalSec: number | null) => {
      const rest: RestState = { endsAt, totalSec, setAt: Date.now(), by: "web" };
      restRef.current = rest;
      restWorkoutRef.current = activeIdRef.current;
      const wid = activeIdRef.current;
      writeStoredRest(
        wid && endsAt != null
          ? { workoutId: wid, endsAt, totalSec, setAt: rest.setAt, by: "web" }
          : wid
            ? { workoutId: wid, endsAt: null, totalSec: null, setAt: rest.setAt, by: "web" }
            : null,
      );
      paint(rest, { soundOnEnd: true });
      sendRestToNative(rest);
    },
    [paint],
  );

  const clearRest = useCallback(() => setHumanRest(null, null), [setHumanRest]);

  const startRest = useCallback(
    (seconds: number) => {
      if (seconds <= 0) {
        setHumanRest(null, null);
        return;
      }
      trackUsage("rest_timer", { throttleMs: 60_000 });
      setHumanRest(Date.now() + seconds * 1000, seconds);
    },
    [setHumanRest],
  );

  const getRestState = useCallback(() => restRef.current, []);

  const mergeRemoteRest = useCallback(
    (remote: RestState | null) => {
      if (!remote) return;
      const merged = mergeRest(restRef.current, remote);
      if (merged === restRef.current) return;
      restRef.current = merged;
      restWorkoutRef.current = activeIdRef.current;
      const wid = activeIdRef.current;
      if (wid && merged)
        writeStoredRest({
          workoutId: wid,
          endsAt: merged.endsAt,
          totalSec: merged.totalSec,
          setAt: merged.setAt,
          by: merged.by,
        });
      // [원본] paint(merged, { soundOnEnd: false }); — 앱이 앞이면 네이티브가 안 울려 아무도 울리지 않았다(REV-006 화면 H-1)
      paint(merged, { soundOnEnd: true });
    },
    [paint],
  );

  // 새로고침 뒤 이어 받기 — 활성 운동이 정해진 뒤 그 운동의 휴식만(다른 운동·운동 없음이면 지운다)
  useEffect(() => {
    if (!activeLoaded) return;
    const stored = readStoredRest();
    if (!active) {
      if (stored) writeStoredRest(null);
      restRef.current = null;
      restWorkoutRef.current = null;
      paint(null, { soundOnEnd: false });
      return;
    }
    // 다른 운동의 휴식이 남아 있으면 지운다(소리·쓰기·전송 없음 — 새 운동의 스냅샷이 rest 없음으로 덮는다)
    if (restRef.current && restWorkoutRef.current && restWorkoutRef.current !== active.id) {
      restRef.current = null;
      restWorkoutRef.current = null;
      paint(null, { soundOnEnd: false });
    }
    if (!stored || stored.workoutId !== active.id) {
      if (stored) writeStoredRest(null);
      // 운동이 정해지기 전 합친 휴식은 이제 저장한다(REV-006 화면 L-3)
      if (restRef.current && !restWorkoutRef.current) {
        restWorkoutRef.current = active.id;
        const r = restRef.current;
        writeStoredRest({
          workoutId: active.id,
          endsAt: r.endsAt,
          totalSec: r.totalSec,
          setAt: r.setAt,
          by: r.by,
        });
      }
      return;
    }
    // 지난 시각은 소리 없이 지운다(§7 · REV-006 화면 L-2) — LWW 재료(setAt)는 남긴다
    if (stored.endsAt != null && stored.endsAt <= Date.now())
      writeStoredRest({ ...stored, endsAt: null, totalSec: null });
    if (restRef.current && restRef.current.setAt >= stored.setAt) return; // 이 탭에서 이미 더 새 값
    restWorkoutRef.current = active.id;
    restRef.current = {
      endsAt: stored.endsAt,
      totalSec: stored.totalSec,
      setAt: stored.setAt,
      by: stored.by ?? "web",
    };
    paint(restRef.current, { soundOnEnd: true });
  }, [active, activeLoaded, paint]);

  // 탭이 가려졌다 돌아오면 곧바로 맞춘다 — 지난 휴식은 끄기만 한다(쓰기 아님 · REV-003 동시성 H-1).
  useEffect(() => {
    const onVisible = () => {
      const end = endAtRef.current;
      if (end == null) return;
      const left = Math.round((end - Date.now()) / 1000);
      // 앱이면 만료 판정 전에 네이티브 휴식부터 합친다(drain 이 merge 뒤 다시 그린다 · §7 · REV-006 화면 L-1)
      if (left <= 0 && lockAvailable()) return;
      if (left <= 0) {
        endAtRef.current = null;
        stopTicking();
        setRestRemaining(null);
      } else setRestRemaining(left);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [stopTicking]);

  useEffect(() => stopTicking, [stopTicking]);

  const value = useMemo<SessionContextValue>(
    () => ({
      restRemaining,
      startRest,
      clearRest,
      getRestState,
      mergeRemoteRest,
      activeWorkoutId: active?.id ?? null,
      activeStartedAt: active?.startedAt ?? null,
      activeName: active?.name ?? null,
      // [원본] setActive: setActiveState,
      setActive,
      refreshActive,
      activeLoaded,
      activeKnown,
    }),
    [
      restRemaining,
      startRest,
      clearRest,
      getRestState,
      mergeRemoteRest,
      active,
      refreshActive,
      activeLoaded,
      activeKnown,
      setActive,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession은 SessionProvider 안에서만 쓸 수 있다");
  return ctx;
}
