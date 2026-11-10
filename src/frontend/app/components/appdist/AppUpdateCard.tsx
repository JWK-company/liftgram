"use client";
// SPEC-018 §8  프로필 「앱 설치 파일」 줄 — AppVersionRow(화면 업데이트) 아래
//
// 안드로이드 앱: 앱 버전 · 상태 배지(최신 · 업데이트 있음 · 다시 설치 필요 · 개발 빌드 · 플레이 스토어) · 서명 지문 앞 16자. 누르면 시트.
// 안드로이드 웹(크롬·삼성 등): 「전용 앱으로 바꾸기」. iOS·데스크톱: 그리지 않는다.
// 「나중에」와 상관없이 늘 보인다(배너만 숨김).
import { useState } from "react";
import { type TransKey, t } from "@/lib/i18n";
import { type TagTone, Tag } from "../ui/primitives";
import { AppUpdateSheet } from "./AppUpdateSheet";
import { SwitchToAppSheet } from "./SwitchToAppSheet";
import { useAppOffer } from "./useAppOffer";

export function AppUpdateCard() {
  const st = useAppOffer({ withDismiss: false });
  const [open, setOpen] = useState(false);
  const { shell, info, latest, offer } = st;
  // 시트를 닫으면 다시 판정한다(설치 허용·받기 뒤 배지가 옛 상태로 남지 않게 — REV-013 화면 L-9)
  const close = () => {
    setOpen(false);
    st.reload();
  };
  if (!st.loaded || !shell || shell.os !== "android") return null;
  if (shell.kind === "web" && offer.kind !== "switch") return null;

  let badge: { key: TransKey; tone: TagTone } | null = null;
  const why = offer.kind === "none" ? offer.why : "";
  if (shell.kind === "app") {
    if (offer.kind === "update") badge = { key: "appDist.badgeUpdate", tone: "primary" };
    else if (offer.kind === "reinstall") badge = { key: "appDist.badgeReinstall", tone: "warning" };
    else if (why === "debug" || info?.debug) badge = { key: "appDist.badgeDebug", tone: "muted" };
    else if (why === "play") badge = { key: "appDist.badgePlay", tone: "muted" };
    else if (why === "latest") badge = { key: "appDist.badgeLatest", tone: "success" };
  }
  const actionable =
    !!latest && (offer.kind === "update" || offer.kind === "reinstall" || offer.kind === "switch");

  const title =
    shell.kind === "web"
      ? t("appDist.bannerSwitch")
      : info?.versionName
        ? t("appDist.cardVersion", { version: info.versionName })
        : t("appDist.cardTitle");

  return (
    <>
      <button
        type="button"
        data-testid="app-update-card"
        data-kind={offer.kind}
        data-why={offer.kind === "none" ? offer.why : ""}
        disabled={!actionable}
        onClick={() => setOpen(true)}
        // [원본] className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)] text-left focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:-outline-offset-2 disabled:cursor-default"
        // [개선] 판 없는 ListGroup 에 맞춰 좌우 여백 px-xs(ui/rows.tsx ListRow 와 같다 · SPEC-056)
        className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-xs)] py-[var(--spacing-md)] text-left focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:-outline-offset-2 disabled:cursor-default"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
            {title}
          </span>
          {/* [원본] <span className="text-(--color-ink3) text-[length:var(--text-xs)]">
            {/* [원본] 앱이면 늘 cardTitle — 제목과 같은 말을 되풀이했다(REV-013 화면 M-8 일부) * /}
            {shell.kind === "web" ? t("appDist.bannerSwitchBody") : t("appDist.cardSub")}
            {/* [원본] 서명 지문 — 일반 사용자에게 뜻이 없다(SPEC-025) * /}
          </span> */}
          {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
        </span>
        {badge ? (
          <span data-testid="app-update-card-badge" data-badge={badge.key}>
            <Tag label={t(badge.key)} tone={badge.tone} />
          </span>
        ) : null}
      </button>
      {open && latest ? (
        offer.kind === "update" ? (
          <AppUpdateSheet latest={latest} info={info} onClose={close} />
        ) : offer.kind === "switch" || offer.kind === "reinstall" ? (
          <SwitchToAppSheet
            latest={latest}
            mode={offer.kind}
            manual={offer.kind === "switch" && offer.manual}
            onClose={close}
          />
        ) : null
      ) : null}
    </>
  );
}
