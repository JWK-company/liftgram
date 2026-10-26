// 인증 흐름 화면(비밀번호 찾기·재설정·이메일 확인·소셜 완료)의 공통 껍데기 — 계정 화면과 같은 머리.
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { AppText, Card } from "../ui/primitives";

export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <div className="mt-[var(--spacing-xl)] mb-[var(--spacing-lg)] flex flex-col items-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-(--color-surface-alt)">
          <Icon name="lock-closed-outline" size={28} color="var(--color-brand)" />
        </span>
        <AppText variant="heading" className="mt-[var(--spacing-md)] block">
          {title}
        </AppText>
      </div>
      <Card>{children}</Card>
    </div>
  );
}
