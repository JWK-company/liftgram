"use client";
// SPEC-018 §7  로그아웃된 안드로이드 앱의 로그인 화면 맨 위 — 「웹에서 쓰던 계정으로 계속」.
// PWA 에서 바꾸기로 처음 켜졌으면(liftgram://start) 강조한다. 앱이 아니거나 이미 로그인돼 있으면 그리지 않는다.
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { appContinue, canAppContinue, launchedForSwitch, onAppLink } from "@/lib/native";
import { Button } from "../ui/Button";
import { AppText, Card } from "../ui/primitives";

export function AppContinueEntry() {
  const [show, setShow] = useState(false);
  const [emph, setEmph] = useState(false);
  // REV-012 화면 M-5 — 두 번 누르면 탭이 둘 열리고 첫 처리기가 남았다 · 실패하면 알린다(L-10)
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canAppContinue()) return;
    setShow(true);
    let off: (() => void) | null = null;
    let alive = true;
    void launchedForSwitch().then((v) => {
      if (alive && v) setEmph(true);
    });
    // 앱이 떠 있을 때 PWA 에서 다시 넘어온 경우(liftgram://start)
    void onAppLink("start", () => setEmph(true), { replayLaunch: true }).then((o) => {
      if (alive) off = o;
      else o?.();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  if (!show) return null;
  return (
    <Card
      className="mb-[var(--spacing-lg)]"
      data-testid="app-continue-entry"
      data-emphasis={emph ? "1" : "0"}
    >
      {emph ? (
        <AppText variant="body" className="mb-[var(--spacing-sm)] block" data-testid="app-continue-new">
          {t("appContinue.entryNew")}
        </AppText>
      ) : null}
      <Button
        title={t("appContinue.entry")}
        variant={emph ? "primary" : "secondary"}
        icon="open-outline"
        testId="btn-app-continue"
        loading={busy}
        disabled={busy}
        onPress={() => {
          if (busy) return;
          setBusy(true);
          setFailed(false);
          void appContinue()
            .then((ok) => setFailed(!ok))
            .catch(() => setFailed(true))
            // 탭이 열리면 앱은 뒤로 간다 — 돌아왔을 때 다시 누를 수 있게 잠깐 뒤 푼다
            .finally(() => setTimeout(() => setBusy(false), 1_500));
        }}
      />
      {failed ? (
        <AppText variant="caption" color="danger" className="mt-[var(--spacing-xs)] block" role="alert">
          {t("appContinue.failed")}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
        {t("appContinue.entryHint")}
      </AppText>
    </Card>
  );
}
