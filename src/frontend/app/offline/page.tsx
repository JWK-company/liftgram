// @plm SRS-051  오프라인 화면 — 서비스워커가 기기에 없는 화면 대신 보여 준다
//
// 정적 페이지다(데이터를 읽지 않는다). 서비스워커가 설치 때 미리 받아 두므로, 한 번도 열지 않은
// 화면을 오프라인에서 누르면 이것이 뜬다. 운동 탭은 셸이 기기에 있어 언제나 열린다.
import { tw } from "@/lib/i18n";
import { EmptyState } from "../components/ui/primitives";

export default function OfflinePage() {
  return (
    <div className="flex flex-1 items-center justify-center p-[var(--spacing-lg)]" data-testid="offline-page">
      <EmptyState
        icon="cloud-offline-outline"
        title={tw("web.offline.title")}
        message={tw("web.offline.message")}
        action={
          <a
            href="/"
            className="rounded-lg bg-(--color-brand) px-4 py-2 font-semibold text-(--color-on-brand)"
            data-testid="offline-home"
          >
            {tw("web.offline.home")}
          </a>
        }
      />
    </div>
  );
}
