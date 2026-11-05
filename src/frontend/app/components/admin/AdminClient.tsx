"use client";
// 운영자 페이지 첫 화면(프로필에서 들어온다 · SPEC-032) — 역할별로 쓸 수 있는 줄만 그린다.
// 줄을 숨기는 것은 안내일 뿐 경계가 아니다 — 각 화면의 권한은 서버가 다시 판정한다.
import { Role } from "@app/contracts";
import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { adPreviewOn, setAdPreview } from "@/lib/adPreview";
import { useOpsAlert } from "@/lib/opsAlert";
import { canSeeAdmin, isInsider } from "@/lib/staffRoles";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText } from "../ui/primitives";
import { ListGroup, ListRow } from "../ui/rows";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function AdminClient() {
  const { user, loading } = useAuth();
  const opsAlert = useOpsAlert();
  const role = user?.role;
  const [adPreview, setAdPreviewState] = useState(false);
  useEffect(() => {
    setAdPreviewState(adPreviewOn());
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("staff.title")}
        back={
          <a href="/profile" aria-label={t("profile.title")} data-testid="admin-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="admin-screen">
        {/* 캐시된 역할이 있으면 세션 확인을 기다리지 않고 바로 줄을 그린다 */}
        {loading && !canSeeAdmin(role) ? (
          <div className="flex justify-center py-[var(--spacing-xl)]" role="status">
            <LogoSpinner size={32} label={t("staff.title")} />
          </div>
        ) : !user ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="admin-signin">
            <a href="/account" className="underline">
              <AppText variant="body">{t("feed.loginRequiredTitle")}</AppText>
            </a>
          </div>
        ) : !canSeeAdmin(role) ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="admin-denied">
            <AppText variant="body" color="danger">
              {t("ops.adminOnly")}
            </AppText>
          </div>
        ) : (
          <ListGroup>
            {isInsider(role) ? (
              <ListRow
                testId="row-feedback"
                icon="chatbubble-outline"
                title={t("feedback.title")}
                href="/feedback"
              />
            ) : null}
            {isInsider(role) ? (
              <ListRow
                testId="row-feedback-inbox"
                icon="chatbubbles-outline"
                title={t("admin.feedback.title")}
                href="/admin/feedback"
              />
            ) : null}
            {role === Role.MODERATOR || role === Role.ADMIN ? (
              <ListRow
                testId="btn-moderation"
                icon="flag-outline"
                title={t("moderation.entry")}
                href="/moderation"
              />
            ) : null}
            {role === Role.ADMIN ? (
              <ListRow
                testId="row-stats"
                icon="stats-chart"
                title={t("admin.stats.title")}
                href="/admin/stats"
              />
            ) : null}
            {role === Role.ADMIN ? (
              <ListRow
                testId="row-ops"
                icon="stats-chart"
                title={t("ops.entry")}
                href="/ops"
                trailing={
                  <span className="flex items-center gap-[var(--spacing-sm)]">
                    {opsAlert.alert ? (
                      <span
                        data-testid="row-ops-dot"
                        className="h-[8px] w-[8px] rounded-full bg-(--color-bad)"
                        role="img"
                        aria-label={t("ops.needsCheck")}
                      />
                    ) : null}
                    <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
                  </span>
                }
              />
            ) : null}
            {role === Role.ADMIN ? (
              <ListRow
                testId="row-ad-preview"
                icon="image-outline"
                title={t("staff.adPreview")}
                value={t(adPreview ? "staff.adPreviewOn" : "staff.adPreviewOff")}
                onPress={() => {
                  setAdPreview(!adPreview);
                  setAdPreviewState(!adPreview);
                }}
              />
            ) : null}
          </ListGroup>
        )}
      </div>
    </div>
  );
}
