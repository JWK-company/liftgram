"use client";
// SPEC-018 §8  홈 위 앱 배포 띠 — 「새 앱 — 앱 설치 파일 업데이트」 · 「앱을 한 번만 다시 설치」 · 「전용 앱으로 바꾸기」
//
// 판정은 useAppOffer(core decideOffer · 「나중에」 3 → 7 → 30일 · 새 버전이면 다시 · 꼭 해야 하는 업데이트는 숨기지 않음).
// 홈(/)에서만 그린다 — 운동 중이면 판정이 none 이다. 프로필의 「업데이트」(AppVersionRow — 웹 번들)와 용어를 나눈다.
// 앱이 막 업데이트돼 다시 열렸으면(info.justUpdated) 어디서든 한 번 알리고 표식을 지운다.
// 운동이 시작되면 기다리던 시스템 확인 화면(설치)을 거둔다 — 운동 중에 앱이 재시작되지 않게(REV-013 화면 H-2).
import { type Offer, offerKey } from "@app/core/domain/appDistribution";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dismissOffer, updateBridge, updateState } from "@/lib/appDistribution";
import { t } from "@/lib/i18n";
import { useSession } from "../SessionProvider";
import { useToast } from "../Toast";
import { Icon } from "../ui/Icon";
import { AppUpdateSheet } from "./AppUpdateSheet";
import { SwitchToAppSheet } from "./SwitchToAppSheet";
import { useAppOffer } from "./useAppOffer";

type Actionable = Exclude<Offer, { kind: "none" }>;

const BTN =
  "min-h-[44px] px-[var(--spacing-xs)] focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2";

export function AppDistBanner() {
  const path = usePathname();
  const st = useAppOffer({ withDismiss: true });
  const { activeWorkoutId } = useSession();
  // [원본] open(boolean) — 운동이 시작돼 판정이 none 이 되면 시트가 정리 없이 사라졌다(REV-013 화면 H-2)
  // [개선] 연 순간의 판정 사본으로 시트를 그린다
  const [opened, setOpened] = useState<Actionable | null>(null);
  const [hidden, setHidden] = useState(false);
  const toast = useToast();
  const announced = useRef(false);

  // 「업데이트됐어요」 한 번 — 셸 판별(info)에 실려 온다
  useEffect(() => {
    const ju = st.info?.justUpdated;
    if (!ju || announced.current) return;
    announced.current = true;
    toast(t("appDist.justUpdated", { version: st.info?.versionName ?? String(ju.to) }), "info");
    void updateBridge.ackJustUpdated();
  }, [st.info, toast]);

  // 운동이 시작됐다 — 받는 중이면 끊고, 기다리는 확인 화면은 거둔다(시트 밖에서도)
  useEffect(() => {
    if (!activeWorkoutId || st.shell?.kind !== "app" || st.shell.bridge !== "ready") return;
    void updateState()
      .then((s) => {
        if (s.downloading) void updateBridge.cancelDownload();
        if (s.installing || s.confirmWaiting) void updateBridge.cancelInstall();
      })
      .catch(() => undefined);
  }, [activeWorkoutId, st.shell]);

  const close = () => {
    setOpened(null);
    st.reload();
  };
  const sheet = opened ? (
    opened.kind === "update" ? (
      <AppUpdateSheet latest={opened.latest} info={st.info} onClose={close} />
    ) : (
      <SwitchToAppSheet
        latest={opened.latest}
        mode={opened.kind}
        manual={opened.kind === "switch" && opened.manual}
        onClose={close}
      />
    )
  ) : null;

  const o = st.offer;
  // 판정 결과 표식(화면에는 안 보임) — 시험이 「아직 판정 전」과 「안내 없음」을 가른다(REV-013 시험 M-1)
  const marker = st.loaded ? (
    <span hidden data-testid="app-offer-state" data-kind={o.kind} data-why={o.kind === "none" ? o.why : ""} />
  ) : null;

  if (path !== "/" || hidden || o.kind === "none") {
    return (
      <>
        {marker}
        {sheet}
      </>
    );
  }

  const mandatory = o.kind === "update" && o.mandatory;
  const key = offerKey(o.kind, o.latest.versionCode);
  const title =
    o.kind === "update"
      ? mandatory
        ? t("appDist.bannerUpdateMandatory", { version: o.latest.versionName })
        : t("appDist.bannerUpdate", { version: o.latest.versionName })
      : o.kind === "reinstall"
        ? t("appDist.bannerReinstall")
        : t("appDist.bannerSwitch");
  // [원본] const body = o.kind === "update" ? t("appDist.bannerUpdateBody") : o.kind === "reinstall" ? t("appDist.bannerReinstallBody") : t("appDist.bannerSwitchBody");
  // [개선] 업데이트·앱으로 옮기기 부연은 설명 줄 없앰(SPEC-055 Phase 4) — 다시 설치(보안·절차)만 남김
  const body = o.kind === "reinstall" ? t("appDist.bannerReinstallBody") : null;
  // [원본] 「보기」 하나 — 무엇을 하는지 말하지 않았다(REV-013 화면 L-13)
  const cta =
    o.kind === "update"
      ? t("appDist.ctaUpdate")
      : o.kind === "reinstall"
        ? t("appDist.ctaReinstall")
        : t("appDist.ctaSwitch");

  return (
    <>
      {marker}
      {/* [원본] role="status" 가 버튼까지 감쌌다 — 낭독기가 버튼 이름까지 읽었다(REV-013 화면 M-9) */}
      <section
        aria-labelledby="app-dist-title"
        data-testid="app-dist-banner"
        data-kind={o.kind}
        className="mx-[var(--spacing-md)] mt-[var(--spacing-sm)] flex items-start gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-md)] text-sm"
      >
        <Icon name="download-outline" size={20} color="var(--color-brand)" />
        <div className="min-w-0 flex-1">
          <div id="app-dist-title" role="status" className="font-semibold" data-testid="app-dist-title">
            {title}
          </div>
          {/* [원본] <div className="mt-[2px] text-(--color-ink2)">{body}</div> */}
          {body ? <div className="mt-[2px] text-(--color-ink2)">{body}</div> : null}
          <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-x-[var(--spacing-md)]">
            <button
              type="button"
              data-testid="btn-app-dist-open"
              className={`${BTN} font-semibold text-(--color-brand)`}
              onClick={() => setOpened(o)}
            >
              {cta}
            </button>
            {mandatory ? null : (
              <button
                type="button"
                data-testid="btn-app-dist-later"
                className={`${BTN} text-(--color-ink2)`}
                onClick={() => {
                  dismissOffer(key);
                  setHidden(true);
                }}
              >
                {t("appDist.later")}
              </button>
            )}
            {o.kind === "switch" ? (
              <button
                type="button"
                data-testid="btn-app-dist-never"
                className={`${BTN} text-(--color-ink2)`}
                onClick={() => {
                  dismissOffer(key, true);
                  setHidden(true);
                }}
              >
                {t("appDist.never")}
              </button>
            ) : null}
          </div>
        </div>
      </section>
      {sheet}
    </>
  );
}
