"use client";
// SPEC-018 §8  PWA(안드로이드 크롬) → 전용 앱 바꾸기 · 옛 앱(디버그 키) 재설치 — 단계 시트
//
// switch:    1 기록 확인 → 2 APK 받기(<a download>) → 3 앱 열기(intent · 코드 없음) → 4 끝(웹 아이콘 지워도 됨)
// reinstall: 1 기록 확인 → 시스템 브라우저로 공개 /app(옛 앱에는 업데이트 다리가 없다)
// 단계를 넘어갈 때마다 기록 확인을 다시 한다(웹 아이콘을 지우라는 안내 전에도). 단계는 localStorage(설치하고 돌아와도 이어짐).
//
// REV-013 반영(같은 단계 안의 첫 판을 고친 것 — EXE-009):
//   단계 키를 사용자별로 · 저장된 단계로 돌아오면(check 가 아니면) 바로 다시 확인(통과 못 하면 1단계로) · 연타 막기 ·
//   받기 링크는 옛 서비스 워커를 비켜 가는 apkHref · 수동(크롬 아님) 안내를 3단계에도 · 재설치 「/app 열기」도 매번 확인 ·
//   화면에 돌아왔을 때 다시 확인해 실패하면 「웹 앱을 지우지 마세요」 · 닫기 문구 「닫기」 · 키보드 초점 표시.
import { type Latest, appIntentUrl, sizeLabel } from "@app/core/domain/appDistribution";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RecordCheck,
  SWITCH_STEP_KEY,
  apkHref,
  checkRecordsUploaded,
  openInSystemBrowser,
  readStep,
  writeStep,
} from "@/lib/appDistribution";
import { type TransKey, t } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText, Card } from "../ui/primitives";

const STEPS = ["check", "download", "open", "done"] as const;
type Step = (typeof STEPS)[number];

// [원본] "… rounded-[var(--radius-md)] …" · [개선] 버튼 둥근 정도 sm(Button 과 같다 · SPEC-056 F2)
const LINK =
  "flex min-h-[48px] items-center justify-center rounded-[var(--radius-sm)] bg-(--color-brand) px-[var(--spacing-lg)] font-semibold text-(--color-on-brand) focus-visible:outline-2 focus-visible:outline-(--color-ink) focus-visible:outline-offset-2";

export function SwitchToAppSheet({
  latest,
  mode,
  manual = false,
  onClose,
}: {
  latest: Latest;
  mode: "switch" | "reinstall";
  /** 크롬이 아닌 브라우저(삼성 인터넷 등) — 받기가 막힐 수 있다는 안내 */
  manual?: boolean;
  onClose: () => void;
}) {
  const { user, ownerConflict } = useAuth();
  const userId = user?.id ?? null;
  // [원본] SWITCH_STEP_KEY 하나 — 다른 계정으로 바꿔도 앞 사람의 단계가 이어졌다(REV-013 보안 M-3)
  const stepKey = `${SWITCH_STEP_KEY}:${userId ?? "anon"}`;
  const [step, setStepRaw] = useState<Step>("check");
  const [check, setCheck] = useState<RecordCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [warnKeep, setWarnKeep] = useState(false);

  const setStep = useCallback(
    (s: Step) => {
      setStepRaw(s);
      if (mode === "switch") writeStep("local", stepKey, s === "check" ? null : s);
    },
    [mode, stepKey],
  );

  /** 기록 확인 — 통과하면 next 로, 아니면 1단계에 이유를 보인다 */
  const verify = useCallback(
    async (next: Step | (() => void)): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const r = await checkRecordsUploaded({ userId, ownerConflict: !!ownerConflict });
        setCheck(r);
        if (!r.ok) {
          setStep("check");
          return false;
        }
        setWarnKeep(false);
        if (typeof next === "function") next();
        else setStep(next);
        return true;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [ownerConflict, setStep, userId],
  );

  // 저장된 단계로 돌아왔다 — 그 단계를 그대로 믿지 않고 다시 확인한다(REV-013 보안 H-1)
  useEffect(() => {
    if (mode !== "switch") return;
    const saved = readStep("local", stepKey, STEPS);
    if (saved && saved !== "check") void verify(saved);
  }, [mode, stepKey, verify]);

  // 앱을 설치하고 돌아왔다 — 그 사이 기록이 바뀌었을 수 있다. 실패면 웹 앱을 지우지 말라고 알린다.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (mode === "switch" && step === "check") return;
      void verify(mode === "switch" ? step : () => undefined).then((ok) => setWarnKeep(!ok));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [mode, step, verify]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const size = sizeLabel(latest.size);
  const title = mode === "switch" ? t("appDist.switchTitle") : t("appDist.reinstallTitle");
  const openAppPage = () => void verify(() => void openInSystemBrowser(`${origin}/app`));

  return (
    <SheetShell title={title} onClose={onClose} hideOk testId="switch-sheet">
      <div
        data-testid="switch-step"
        data-step={step}
        className="mt-[var(--spacing-xs)] flex flex-col gap-[var(--spacing-sm)]"
      >
        {mode === "reinstall" ? (
          <AppText variant="body" color="textMuted" className="block">
            {t("appDist.reinstallSteps")}
          </AppText>
        ) : null}

        {warnKeep ? (
          <AppText
            variant="body"
            color="danger"
            role="alert"
            className="block"
            data-testid="switch-dont-delete"
          >
            {t("appDist.dontDelete")}
          </AppText>
        ) : null}

        {/* 1. 기록 확인 */}
        <Card>
          <AppText variant="heading" className="block">
            {t("appDist.step1")}
          </AppText>
          {busy ? (
            <AppText
              variant="caption"
              color="textMuted"
              className="mt-[2px] block"
              data-testid="switch-checking"
            >
              {t("appDist.checking")}
            </AppText>
          ) : null}
          {check?.ok ? (
            <AppText
              variant="caption"
              color="success"
              className="mt-[2px] block"
              data-testid="switch-check-ok"
            >
              {t("appDist.checkOk", { count: check.uploaded })}
            </AppText>
          ) : null}
          {check && !check.ok ? (
            <>
              <AppText
                variant="caption"
                color="danger"
                role="alert"
                className="mt-[2px] block"
                data-testid="switch-check-fail"
                data-why={check.why}
              >
                {t(`appDist.check.${check.why}` as TransKey, { count: check.count ?? 0 })}
              </AppText>
              {check.why === "logged-out" ? (
                <a
                  href="/account"
                  className="mt-[var(--spacing-xs)] flex min-h-[44px] items-center font-semibold text-(--color-brand) focus-visible:outline-2 focus-visible:outline-(--color-brand)"
                >
                  {t("syncHealth.openProfile")}
                </a>
              ) : null}
            </>
          ) : null}
          {step === "check" ? (
            <div className="mt-[var(--spacing-sm)]">
              <Button
                title={check && !check.ok ? t("appDist.retry") : t("appDist.check.go")}
                testId="btn-switch-check"
                loading={busy}
                onPress={() => (mode === "switch" ? void verify("download") : openAppPage())}
              />
            </div>
          ) : null}
        </Card>

        {mode === "reinstall" && check?.ok ? (
          <Button
            title={t("appDist.openAppPage")}
            variant="secondary"
            testId="btn-reinstall-open"
            loading={busy}
            onPress={openAppPage}
          />
        ) : null}

        {mode === "switch" && step !== "check" ? (
          <Card>
            <AppText variant="heading" className="block">
              {t("appDist.step2")}
            </AppText>
            {step === "download" ? (
              <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-sm)]">
                {/* [원본] href={latest.url} — 옛 서비스 워커가 받기를 가로채 HTML 을 돌려줄 수 있었다(REV-013 계약 H-1) */}
                <a href={apkHref(latest.url)} download data-testid="switch-apk-link" className={LINK}>
                  {t("appDist.downloadApk", { size })}
                </a>
                <AppText variant="caption" color="textMuted" className="block">
                  {t("appDist.chromeAllow")}
                </AppText>
                {manual ? (
                  <AppText variant="caption" color="warning" className="block" data-testid="switch-manual">
                    {t("appDist.manualHint")}
                  </AppText>
                ) : null}
                <Button
                  title={t("appDist.installedAlready")}
                  variant="secondary"
                  testId="btn-switch-installed"
                  loading={busy}
                  onPress={() => void verify("open")}
                />
              </div>
            ) : null}
          </Card>
        ) : null}

        {mode === "switch" && (step === "open" || step === "done") ? (
          <Card>
            <AppText variant="heading" className="block">
              {t("appDist.step3")}
            </AppText>
            {step === "open" ? (
              <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-sm)]">
                {/* 코드는 싣지 않는다 — 앱이 자기 비밀(v)로 「계속」을 시작한다(SPEC-018 §7) */}
                <a href={appIntentUrl(origin)} data-testid="switch-open-app" className={LINK}>
                  {t("appDist.openApp")}
                </a>
                <AppText variant="caption" color="textMuted" className="block">
                  {t("appDist.openAppHint")}
                </AppText>
                {manual ? (
                  <AppText
                    variant="caption"
                    color="warning"
                    className="block"
                    data-testid="switch-manual-login"
                  >
                    {t("appDist.manualLogin")}
                  </AppText>
                ) : null}
                <Button
                  title={t("appDist.next")}
                  variant="secondary"
                  testId="btn-switch-next"
                  loading={busy}
                  onPress={() => void verify("done")}
                />
              </div>
            ) : null}
          </Card>
        ) : null}

        {mode === "switch" && step === "done" ? (
          <Card>
            <AppText variant="heading" className="block">
              {t("appDist.step4")}
            </AppText>
            {/* [원본] <AppText variant="body" className="mt-[2px] block" data-testid="switch-done">
              {t("appDist.doneHint")}
            </AppText> */}
            {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
            <div className="mt-[var(--spacing-sm)]">
              <Button
                title={t("appDist.finish")}
                testId="btn-switch-finish"
                onPress={() => {
                  writeStep("local", stepKey, null);
                  onClose();
                }}
              />
            </div>
          </Card>
        ) : null}

        {/* [원본] 「나중에」 — 띠의 「나중에」(며칠 숨김)와 같은 말이라 헷갈렸다(REV-013 화면 L-6) */}
        <Button title={t("appDist.close")} variant="quiet" testId="btn-switch-close" onPress={onClose} />
      </div>
    </SheetShell>
  );
}
