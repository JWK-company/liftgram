// 진행 중 세션 상태 컨텍스트 (SRS-004). 앱 시작 시 active/paused 세션을 복구 대상으로 로드.
// v7(#12): 휴식 카운트다운을 전역으로 승격 — 어느 화면으로 가도 휴식이 유지되고, 전역 운동 바가
// 모든 화면에 떠서 경과·휴식을 보여준다. 운동 메인 화면을 벗어나도 리셋되지 않는다.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { workoutRepo } from '../data';
import {
  primeRestSound,
  playRestDone,
  vibrateRestDone,
  scheduleRestDone,
  cancelScheduledRestDone,
  stopKeepAlive,
  flushIfMissedRestBeep,
  setRestProgress,
  endRestProgress,
} from '../utils/sound';
import { initRestAlarm, scheduleRestAlarm, cancelRestAlarm } from '../utils/restAlarm';

interface SessionContextValue {
  activeWorkoutId: string | null;
  activeStartedAt: number | null; // 전역 바 경과 표시용
  activeName: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActiveWorkoutId: (id: string | null) => void;
  // 전역 휴식 카운트다운(#12) — 운동 전체 1개. 화면 이동에도 유지.
  restRemaining: number | null;
  startRest: (seconds: number) => void;
  clearRest: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkoutId, setActiveWorkoutIdState] = useState<string | null>(null);
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const restEndRef = useRef<number | null>(null);
  const scheduledOnClockRef = useRef(false); // web: 오디오 클록 예약 성공 여부(true면 인터벌은 소리 안 냄)
  const restAlarmIdRef = useRef<string | null>(null); // native: 예약 알림 id(취소용)
  const restGenRef = useRef(0); // 빠른 연속 startRest 경합 방지 토큰

  const loadActiveMeta = useCallback((id: string | null) => {
    if (!id) {
      setActiveStartedAt(null);
      setActiveName(null);
      return;
    }
    workoutRepo
      .getWorkout(id)
      .then((w) => {
        setActiveStartedAt(w.startedAt);
        setActiveName(w.name ?? null);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await workoutRepo.getActiveWorkout();
      setActiveWorkoutIdState(active?.id ?? null);
      setActiveStartedAt(active?.startedAt ?? null);
      setActiveName(active?.name ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 앱 시작 시 네이티브 알림 채널/권한 준비(웹 no-op) + 언마운트 시 예약·키프얼라이브 정리.
  useEffect(() => {
    void initRestAlarm();
    return () => {
      cancelScheduledRestDone();
      stopKeepAlive();
      void cancelRestAlarm(restAlarmIdRef.current);
    };
  }, []);

  const setActiveWorkoutId = useCallback(
    (id: string | null) => {
      setActiveWorkoutIdState(id);
      loadActiveMeta(id);
      if (!id) {
        restGenRef.current += 1;
        restEndRef.current = null;
        setRestRemaining(null); // 운동 종료/취소 시 휴식도 정리
        cancelScheduledRestDone();
        endRestProgress(); // 잠금화면 진행바 정지
        stopKeepAlive(); // 운동 끝 — 세션 유지용 키프얼라이브 해제
        void cancelRestAlarm(restAlarmIdRef.current);
        restAlarmIdRef.current = null;
      }
    },
    [loadActiveMeta],
  );

  const startRest = useCallback((seconds: number) => {
    primeRestSound(); // 세트 완료 체크(사용자 제스처) 시 웹 오디오 잠금 해제
    const gen = (restGenRef.current += 1);
    // 이전 예약 정리(재시작·+15s·연속 체크) — 웹 오디오 클록 + 네이티브 OS 알림 둘 다.
    cancelScheduledRestDone();
    void cancelRestAlarm(restAlarmIdRef.current);
    restAlarmIdRef.current = null;
    if (seconds > 0) {
      restEndRef.current = Date.now() + seconds * 1000;
      setRestRemaining(seconds);
      // 웹: 오디오 하드웨어 클록에 미리 예약(잠금/백그라운드에서도 정확). 실패(미지원) 시 인터벌 폴백.
      scheduledOnClockRef.current = scheduleRestDone(seconds);
      setRestProgress(seconds, seconds); // 잠금화면 카드 진행바 시작(표시 전용, OS가 스스로 틱)
      // 네이티브: OS 예약 알림(잠금화면 소리·진동). 늦게 resolve된 stale 예약이면 즉시 취소(경합 방지).
      void scheduleRestAlarm(seconds).then((alarmId) => {
        if (restGenRef.current === gen) restAlarmIdRef.current = alarmId;
        else void cancelRestAlarm(alarmId);
      });
    } else {
      scheduledOnClockRef.current = false;
      restEndRef.current = null;
      setRestRemaining(null);
    }
  }, []);

  const clearRest = useCallback(() => {
    restGenRef.current += 1;
    restEndRef.current = null;
    setRestRemaining(null);
    cancelScheduledRestDone(); // 예약 소리 취소(키프얼라이브는 세션 유지 — 운동 끝날 때만 해제)
    endRestProgress(); // 잠금화면 진행바 정지
    void cancelRestAlarm(restAlarmIdRef.current);
    restAlarmIdRef.current = null;
  }, []);

  // 전역 카운트다운 틱 — restEndRef(월클럭 기준)로 계산해 백그라운드 복귀에도 정확.
  // 소리는 인터벌이 내지 않는다(잠금 시 정지·이중재생 위험). 소리 = 웹 오디오 클록 예약 / 네이티브 OS 알림.
  // 인터벌은 '표시 갱신 + 보조 진동'만 담당하고, 소리 누락(잠금 인터럽트) 시에만 flush로 즉시 보정.
  const restActive = restRemaining != null;
  useEffect(() => {
    if (!restActive) return;
    const iv = setInterval(() => {
      if (restEndRef.current == null) return;
      const rem = Math.round((restEndRef.current - Date.now()) / 1000);
      if (rem <= 0) {
        restEndRef.current = null;
        setRestRemaining(null);
        // playRestDone(); // [원본] 인터벌이 소리를 냄 — 잠금 시 안 울리고 이중재생 위험. 아래로 교체.
        if (Platform.OS === 'web') {
          endRestProgress(); // 휴식 자연 종료 → 잠금화면 진행바 정지
          if (scheduledOnClockRef.current) {
            flushIfMissedRestBeep(); // 예약이 잠금으로 밀렸으면 지금 즉시 재생(러닝이면 no-op — 이중 없음)
            if (typeof document === 'undefined' || document.visibilityState === 'visible') vibrateRestDone();
          } else {
            playRestDone(); // 오디오 클록 미지원 폴백(구 동작: 소리 + 진동)
          }
        } else {
          // 네이티브 포그라운드: 즉시 진동 + 예약 알림 취소(백그라운드 발화와 이중 방지)
          playRestDone();
          void cancelRestAlarm(restAlarmIdRef.current);
          restAlarmIdRef.current = null;
        }
      } else {
        setRestRemaining(rem);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [restActive]);

  const value = useMemo<SessionContextValue>(
    () => ({
      activeWorkoutId,
      activeStartedAt,
      activeName,
      loading,
      refresh,
      setActiveWorkoutId,
      restRemaining,
      startRest,
      clearRest,
    }),
    [activeWorkoutId, activeStartedAt, activeName, loading, refresh, setActiveWorkoutId, restRemaining, startRest, clearRest],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
