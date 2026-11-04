"use client";
// SPEC-018 §8  새 안드로이드 앱 — 「앱 설치 파일 업데이트」 시트
//
// 크기(데이터 요금 회선이면 안내) → [설치 허용 단계] → 받기(진행 막대 · 취소) → 「업데이트」 → 시스템 확인 화면 → 재시작.
// 단계·받은 id 는 sessionStorage(설정에 다녀와도 · 화면을 새로 고쳐도 이어짐) · 다리 state() 로 진행을 이어 본다.
// 설치 직전 운동 중인지 다시 보고, 입력 중 값 저장 → 기기 DB 내려쓰기(설치에 성공하면 프로세스가 죽는다).
// 실패는 닫힌 코드별 문구 · aborted = 「다시 누르면 이어서」 · blocked = 대체 설치를 한 번만.
//
// REV-013 반영(같은 단계 안의 첫 판을 고친 것이라 [원본] 주석은 남기지 않는다 — EXE-009 범위 밖 변경 절):
//   받은 id 는 지금 최신판 sha256 일 때만 쓴다 · 받는 중에 다시 붙으면 끝날 때 download() 로 이어 받음 · 설치 중에서 빠져나오는
//   「설치 취소」 · 대체 설치(view)는 결과 이벤트가 없어 돌아오면(resume) info() 로 판단 · 30분 지난 설치 표식은 거둠 ·
//   notAllowed → 설정 단계 · 다시 해도 같은 실패(signature 등)는 다시 시도 없음 · 연타 막기 · 사용자가 낸 취소는 오류 아님 ·
//   다른 세션 결과는 버림 · state() 응답 전에는 버튼을 그리지 않음.
import {
  type Latest,
  type UpdateErrorCode,
  sizeLabel,
  updateErrorCode,
} from "@app/core/domain/appDistribution";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type NativeInfo,
  UPDATE_STEP_KEY,
  UpdateError,
  apkHref,
  openInSystemBrowser,
  prepareForInstall,
  readStep,
  updateBridge,
  updateInfo,
  updateState,
  writeStep,
} from "@/lib/appDistribution";
import { type TransKey, t } from "@/lib/i18n";
import { useSession } from "../SessionProvider";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

type Phase = "loading" | "idle" | "allow" | "downloading" | "ready" | "installing" | "error";
type ErrCode = UpdateErrorCode | "flush" | "workout";
const STEPS = ["allow", "ready", "installing"] as const;
const ID_KEY = `${UPDATE_STEP_KEY}.id`;
const VIEW_TRIED_KEY = `${UPDATE_STEP_KEY}.viewTried`;
/** 이만큼 지난 결과·설치 표식은 지금 일로 보지 않는다(네이티브 MARK_TTL 과 같은 30분) */
const STALE_MS = 30 * 60_000;
/** 다시 해도 같은 결과인 실패 — 다시 시도 버튼을 두지 않는다 */
const FINAL: ReadonlySet<string> = new Set([
  "downgrade",
  "store",
  "signature",
  "package",
  "incompatible",
  "conflict",
  "origin",
]);
/**
 * 앱 안 설치가 「취소·막힘·실패」로 끝났을 때 보일 우회 길(실기기: 갤럭시에서 aborted 가 거듭 나 1.2.0 에 머묾 — 2026-11-04).
 * 대체 설치(시스템 설치기로 파일 열기) · 브라우저로 받기(시스템 설치기 + 브라우저 권한 — 앱 쪽이 막혀도 된다).
 */
const VIEW_FALLBACK: ReadonlySet<string> = new Set(["blocked", "aborted", "failure", "timeout"]);
const BROWSER_FALLBACK: ReadonlySet<string> = new Set([
  "blocked",
  "aborted",
  "failure",
  "timeout",
  "expired",
]);
/** 실패를 누가 판정했나 — 화면에 원인 코드와 함께 보여 진단한다(result 시스템 결과 · resume 돌아와 본 상태 · call 설치 요청 · restore 다시 열 때) */
type ErrSrc = "result" | "resume" | "call" | "restore" | "view";

/** 설치 단계 실패 중 「받은 파일 그대로 다시 설치」가 맞는 것 */
const RETRY_INSTALL: ReadonlySet<string> = new Set([
  "aborted",
  "blocked",
  "timeout",
  "expired",
  "failure",
  "flush",
  "workout",
  "storage",
]);

function errText(code: ErrCode): string {
  return t(`appDist.err.${code}` as TransKey);
}

function readId(sha: string): string | null {
  try {
    const v = sessionStorage.getItem(ID_KEY);
    return v === sha ? v : null;
  } catch {
    return null;
  }
}
function writeId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(ID_KEY, id);
    else sessionStorage.removeItem(ID_KEY);
  } catch {
    // 이어 보기만 빠진다
  }
}

export function AppUpdateSheet({
  latest,
  info: initialInfo,
  onClose,
}: {
  latest: Latest;
  info: NativeInfo | null;
  onClose: () => void;
}) {
  const { activeWorkoutId } = useSession();
  const [info, setInfo] = useState<NativeInfo | null>(initialInfo);
  const [phase, setPhaseRaw] = useState<Phase>("loading");
  const [progress, setProgress] = useState<{ received: number; total: number }>({
    received: 0,
    total: latest.size,
  });
  const [error, setError] = useState<ErrCode | null>(null);
  const [canView, setCanView] = useState(false);
  const [errSrc, setErrSrc] = useState<ErrSrc | null>(null);
  const idRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const busyRef = useRef(false);
  const userCancelRef = useRef(false);
  const modeRef = useRef<"session" | "view">("session");
  const sessionRef = useRef<number | null>(null);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseRaw(p);
    if (p !== "loading")
      writeStep("session", UPDATE_STEP_KEY, (STEPS as readonly string[]).includes(p) ? p : null);
  }, []);

  const fail = useCallback(
    (code: ErrCode, src: ErrSrc = "call") => {
      if (code === "notAllowed") {
        setError(null);
        setPhase("allow");
        return;
      }
      setError(code);
      setErrSrc(src);
      setPhase("error");
      // [원본] if (code === "blocked") { — 대체 설치를 blocked 에만 열었다(갤럭시의 aborted 반복에 길이 없었다)
      if (VIEW_FALLBACK.has(code)) {
        let tried = false;
        try {
          tried = sessionStorage.getItem(VIEW_TRIED_KEY) === "1";
        } catch {
          tried = false;
        }
        setCanView(!tried && !!idRef.current);
      } else setCanView(false);
    },
    [setPhase],
  );

  /** 받기 — 같은 sha256 파일이 이미 있으면 네이티브가 바로 끝낸다(이어 붙기에도 쓴다) */
  const fetchApk = useCallback(async () => {
    setProgress((p) => ({ received: p.received, total: latest.size }));
    setPhase("downloading");
    try {
      const id = await updateBridge.download(latest);
      if (id !== latest.sha256) throw new UpdateError("hash");
      idRef.current = id;
      writeId(id);
      setPhase("ready");
    } catch (e) {
      const code = e instanceof UpdateError ? e.code : "failure";
      if (code === "cancelled" && userCancelRef.current) {
        userCancelRef.current = false;
        setPhase("idle");
        return;
      }
      if (code === "busy") return; // 앞선 받기가 아직 돈다 — 진행 이벤트·이어 붙기가 끝을 알린다
      fail(code);
    }
  }, [fail, latest, setPhase]);

  // 처음 — 다리 상태로 이어 본다(받는 중 · 확인 화면 대기 · 리스너 전 결과). 응답 전에는 버튼을 그리지 않는다.
  useEffect(() => {
    idRef.current = readId(latest.sha256);
    if (!idRef.current) writeId(null);
    const saved = readStep("session", UPDATE_STEP_KEY, STEPS);
    let live = true;
    void updateState()
      .then((s) => {
        if (!live) return;
        if (s.downloading) {
          setProgress({ received: s.downloading.received, total: s.downloading.total || latest.size });
          setPhase("downloading");
          return;
        }
        if (s.confirmWaiting || s.installing) {
          if (s.installing && Date.now() - s.installing.at > STALE_MS && !s.confirmWaiting) {
            void updateBridge.cancelInstall(); // 오래된 표식 — 갇히지 않게 거둔다
          } else {
            sessionRef.current = s.installing?.sessionId ?? null;
            setPhase("installing");
            return;
          }
        }
        if (s.lastResult && Date.now() - s.lastResult.at < STALE_MS && saved === "installing") {
          const st = s.lastResult.status;
          if (st !== "success" && st !== "pending") return fail(updateErrorCode(st), "restore");
        }
        if (saved === "ready" && idRef.current) setPhase("ready");
        else if (saved === "allow") setPhase("allow");
        else setPhase("idle");
      })
      .catch(() => {
        if (live) setPhase(saved === "ready" && idRef.current ? "ready" : "idle");
      });
    return () => {
      live = false;
    };
  }, [fail, latest.sha256, latest.size, setPhase]);

  // 받는 중에 다시 붙었다 — 끝나면(state 에 받기가 없어지면) download() 로 id 를 받는다(같은 파일 → 바로 끝)
  useEffect(() => {
    if (phase !== "downloading" || busyRef.current) return;
    const timer = setInterval(() => {
      void updateState()
        .then((s) => {
          if (!s.downloading && phaseRef.current === "downloading" && !busyRef.current) {
            clearInterval(timer);
            void fetchApk();
          }
        })
        .catch(() => undefined);
    }, 1_000);
    return () => clearInterval(timer);
  }, [phase, fetchApk]);

  // 다리 이벤트
  useEffect(() => {
    const offs: Array<() => void> = [];
    let live = true;
    void updateBridge
      .on("progress", (d) => {
        const received = Number(d.received ?? 0);
        const total = Number(d.total ?? 0) || latest.size;
        setProgress({ received, total });
      })
      .then((o) => (live ? offs.push(o) : o()));
    void updateBridge
      .on("installResult", (d) => {
        const sid = typeof d.sessionId === "number" ? d.sessionId : null;
        if (sid != null && sessionRef.current != null && sid !== sessionRef.current) return; // 다른 세션 결과
        const st = String(d.status ?? "");
        if (st === "pending") return setPhase("installing");
        if (st === "success") return; // 곧 새 판으로 재시작된다
        fail(updateErrorCode(st), "result");
      })
      .then((o) => (live ? offs.push(o) : o()));
    // 설정(설치 허용)·확인 화면·대체 설치 화면에서 돌아왔다
    void updateBridge
      .on("resume", () => {
        void updateInfo()
          .then(async (i) => {
            setInfo(i);
            if (phaseRef.current === "allow" && i.canInstall) setPhase(idRef.current ? "ready" : "idle");
            if (phaseRef.current !== "installing") return;
            if (modeRef.current === "view") {
              // 대체 설치는 결과 이벤트가 없다 — 아직 그 판이 아니면 취소로 본다(계약 §5)
              if ((i.versionCode ?? 0) < latest.versionCode) {
                void updateBridge.cancelInstall();
                fail("aborted", "view");
              }
              return;
            }
            const s = await updateState();
            if (!s.confirmWaiting && !s.installing) fail("aborted", "resume");
          })
          .catch(() => undefined);
      })
      .then((o) => (live ? offs.push(o) : o()));
    return () => {
      live = false;
      for (const o of offs) o();
    };
  }, [fail, latest.size, latest.versionCode, setPhase]);

  const download = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      if (info && !info.canInstall) return setPhase("allow");
      await fetchApk();
    } finally {
      busyRef.current = false;
    }
  };

  const install = async (mode: "session" | "view" = "session") => {
    if (busyRef.current) return;
    const id = idRef.current;
    if (!id) return download();
    busyRef.current = true;
    setError(null);
    try {
      // 설치 직전 다시 확인 — 운동 중이면 미룬다 · 저장 먼저
      const prep = await prepareForInstall();
      if (!prep.ok) return fail(prep.why);
      if (mode === "view") {
        try {
          sessionStorage.setItem(VIEW_TRIED_KEY, "1");
        } catch {
          // 한 번만 보이기가 이 문서 안으로 줄어든다
        }
      }
      modeRef.current = mode;
      setPhase("installing");
      try {
        const r = await updateBridge.install(id, mode);
        sessionRef.current = r.sessionId;
      } catch (e) {
        const code = e instanceof UpdateError ? e.code : "failure";
        if (code === "missing" || code === "hash") {
          writeId(null);
          idRef.current = null;
        }
        fail(code);
      }
    } finally {
      busyRef.current = false;
    }
  };

  const openSettings = async () => {
    try {
      const opened = await updateBridge.openInstallSettings();
      if (!opened) {
        const i = await updateInfo();
        setInfo(i);
        if (i.canInstall) setPhase(idRef.current ? "ready" : "idle");
      }
    } catch {
      fail("failure");
    }
  };

  const close = () => {
    if (phase === "downloading") {
      userCancelRef.current = true;
      void updateBridge.cancelDownload();
    }
    if (phase !== "installing" && phase !== "ready") writeStep("session", UPDATE_STEP_KEY, null);
    onClose();
  };

  const size = sizeLabel(latest.size);
  const pct = progress.total > 0 ? Math.min(100, Math.floor((progress.received / progress.total) * 100)) : 0;
  const working = !!activeWorkoutId;
  const finalErr = phase === "error" && !!error && FINAL.has(error);
  const retryInstall = phase === "error" && !!error && RETRY_INSTALL.has(error) && !!idRef.current;
  // 운동 중에는 숨긴다 — 브라우저에서 설치하면 앱이 교체되며 죽는다(REV-018 M1)
  const browserFallback = phase === "error" && !!error && BROWSER_FALLBACK.has(error) && !working;
  const openBrowser = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // 설치와 같은 보호 — 운동 중이면 미루고 입력 중 값·기기 DB 를 먼저 저장(REV-018 M1)
      const prep = await prepareForInstall();
      if (!prep.ok) return fail(prep.why);
      // 옛 서비스 워커를 비켜 가는 받기 주소 규칙(REV-018 M2)
      await openInSystemBrowser(new URL(apkHref(latest.url), window.location.origin).href);
    } catch {
      // 주소를 만들지 못함·열지 못함 — 버튼만 효과 없음
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <SheetShell title={t("appDist.updateTitle")} onClose={close} hideOk testId="app-update-sheet">
      <div
        data-testid="app-update-phase"
        data-phase={phase}
        className="mt-[var(--spacing-xs)] flex flex-col gap-[var(--spacing-sm)]"
      >
        <AppText variant="body" className="block" data-testid="app-update-size">
          {t("appDist.updateSize", { version: latest.versionName, size })} · {t("appDist.wifi")}
        </AppText>
        {info?.metered ? (
          <AppText variant="caption" color="warning" className="block" data-testid="app-update-metered">
            {t("appDist.metered", { size })}
          </AppText>
        ) : null}

        {phase === "allow" ? (
          <div data-testid="app-update-allow" className="flex flex-col gap-[var(--spacing-sm)]">
            <AppText variant="heading" className="block">
              {t("appDist.allowTitle")}
            </AppText>
            <AppText variant="body" color="textMuted" className="block">
              {/* 안드로이드 7(sdk 24·25)은 앱별 허용이 없다 — 기기 전체 설정 */}
              {info?.sdk != null && info.sdk < 26 ? t("appDist.allowBodyOld") : t("appDist.allowBody")}
            </AppText>
            <Button
              title={t("appDist.openSettings")}
              testId="btn-app-update-settings"
              onPress={() => void openSettings()}
            />
          </div>
        ) : null}

        {phase === "downloading" ? (
          <div className="flex flex-col gap-[var(--spacing-xs)]">
            <div
              role="progressbar"
              aria-label={t("appDist.progressLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              data-testid="app-update-progress"
              className="h-[8px] w-full overflow-hidden rounded-[var(--radius-pill)] bg-(--color-surface-alt)"
            >
              <div className="h-full bg-(--color-brand) transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <AppText variant="caption" color="textMuted" className="block">
              {t("appDist.downloading", { pct })}
            </AppText>
            <Button
              title={t("appDist.cancel")}
              variant="quiet"
              testId="btn-app-update-cancel"
              onPress={() => {
                userCancelRef.current = true;
                void updateBridge.cancelDownload();
                setPhase("idle");
              }}
            />
          </div>
        ) : null}

        {phase === "installing" ? (
          <>
            <AppText variant="body" role="status" className="block" data-testid="app-update-installing">
              {t("appDist.confirmWaiting")} {t("appDist.installHint")}
            </AppText>
            <Button
              title={t("appDist.cancelInstall")}
              variant="quiet"
              testId="btn-app-update-cancel-install"
              onPress={() => {
                void updateBridge.cancelInstall();
                setPhase(idRef.current ? "ready" : "idle");
              }}
            />
          </>
        ) : null}

        {phase === "error" && error ? (
          <AppText
            variant="body"
            color="danger"
            role="alert"
            className="block"
            data-testid="app-update-error"
            data-code={error}
          >
            {errText(error)}
          </AppText>
        ) : null}
        {phase === "error" && error ? (
          // [원본] 「원인 코드: hash · call」을 글자로 보였다 — 위 줄에 사람용 문구가 있다(SPEC-025). 시험용 표지만 남긴다.
          <span hidden data-testid="app-update-error-detail" data-src={errSrc ?? ""} />
        ) : null}

        {working ? (
          <AppText variant="caption" color="textMuted" className="block" data-testid="app-update-workout">
            {t("appDist.workoutWait")}
          </AppText>
        ) : null}

        {phase === "idle" || (phase === "error" && !finalErr && !retryInstall) ? (
          <Button
            title={phase === "error" ? t("appDist.retry") : t("appDist.download")}
            testId="btn-app-update-download"
            icon="download-outline"
            onPress={() => void download()}
          />
        ) : null}
        {phase === "ready" ? (
          <AppText variant="caption" color="textMuted" className="block">
            {t("appDist.installHint")}
          </AppText>
        ) : null}
        {/* 임시 APK 배포 동안 — 삼성 「자동 차단」이 앱 안 설치를 「취소」로 끝낸다(2026-11-04 실기기 확인) · 설치 전부터 알린다 */}
        {phase === "ready" || (phase === "error" && error === "aborted") ? (
          <AppText variant="caption" color="warning" className="block" data-testid="app-update-autoblocker">
            {t("appDist.autoBlockerHint")}
          </AppText>
        ) : null}
        {phase === "ready" || retryInstall ? (
          <Button
            title={t("appDist.install")}
            testId="btn-app-update-install"
            disabled={working}
            onPress={() => void install()}
          />
        ) : null}
        {phase === "error" && canView ? (
          <Button
            title={t("appDist.viewInstall")}
            variant="secondary"
            testId="btn-app-update-view"
            onPress={() => {
              setCanView(false);
              void install("view");
            }}
          />
        ) : null}
        {browserFallback ? (
          <>
            <AppText
              variant="caption"
              color="textMuted"
              className="block"
              data-testid="app-update-browser-hint"
            >
              {t("appDist.browserHint")}
            </AppText>
            <Button
              title={t("appDist.browserDownload")}
              variant="secondary"
              testId="btn-app-update-browser"
              icon="open-outline"
              onPress={() => void openBrowser()}
            />
          </>
        ) : null}
        <Button title={t("appDist.close")} variant="quiet" testId="btn-app-update-close" onPress={close} />
      </div>
    </SheetShell>
  );
}
