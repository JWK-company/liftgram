"use client";
// 운영 탭 첫 화면 — 역할별로 쓸 수 있는 줄만 그린다.
// 줄을 숨기는 것은 안내일 뿐 경계가 아니다 — 각 화면의 권한은 서버가 다시 판정한다.
import { Role } from "@app/contracts";
import { t } from "@/lib/i18n";
import { useOpsAlert } from "@/lib/opsAlert";
import { canSeeStaffTab, isInsider } from "@/lib/staffRoles";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText } from "../ui/primitives";
import { ListGroup, ListRow } from "../ui/rows";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function StaffClient() {
  const { user, loading } = useAuth();
  const opsAlert = useOpsAlert();
  const role = user?.role;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title={t("staff.title")} />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="staff-screen">
        {/* 캐시된 역할이 있으면 세션 확인을 기다리지 않고 바로 줄을 그린다 */}
        {loading && !canSeeStaffTab(role) ? (
          <div className="flex justify-center py-[var(--spacing-xl)]" role="status">
            <LogoSpinner size={32} label={t("staff.title")} />
          </div>
        ) : !user ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="staff-signin">
            <AppText variant="body">{t("feed.loginRequiredTitle")}</AppText>
          </div>
        ) : !canSeeStaffTab(role) ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="staff-denied">
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
          </ListGroup>
        )}
      </div>
    </div>
  );
}
