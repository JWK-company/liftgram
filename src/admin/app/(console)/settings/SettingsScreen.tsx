"use client";

// 설정. 광고 자리 미리 보기는 기기마다 저장돼 앱 주소에서 켠다. 그래서 켜졌는지는 여기서 알 수 없다.
import { Role } from "@app/contracts";
import { RoleGate } from "@/app/components/RoleGate";
import { PageHeader, Section } from "@/app/components/ui";

const ROLES = [Role.ADMIN] as const;

export function SettingsScreen({ appUrl }: { appUrl: string }) {
  const base = appUrl.replace(/\/$/, "");
  return (
    <RoleGate roles={ROLES}>
      <div data-testid="settings-screen">
        <PageHeader title="설정" />
        <Section title="광고 자리 미리 보기" testid="settings-ad-preview">
          <p className="mb-3 text-muted">
            이 기기의 앱 화면에서 광고가 들어갈 자리를 점선 칸으로 보여 줍니다. 앱을 쓰는 브라우저에서 눌러야
            적용됩니다. 관리자 계정에만 보이고, 운동 중에는 보이지 않습니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              data-testid="ad-preview-on"
              className="underline"
              href={`${base}/?adPreview=on`}
              target="_blank"
              rel="noreferrer"
            >
              미리 보기 켜기
            </a>
            <a
              data-testid="ad-preview-off"
              className="underline"
              href={`${base}/?adPreview=off`}
              target="_blank"
              rel="noreferrer"
            >
              미리 보기 끄기
            </a>
          </div>
        </Section>
      </div>
    </RoleGate>
  );
}
