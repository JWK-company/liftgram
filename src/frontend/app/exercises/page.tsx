// @plm SRS-001  카탈로그 화면 — 목록은 로컬 저장소가 정본이다 (ADR-002 · ADR-032)
//
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 목록을 서버에서 읽지 **않는다.** 읽기 정본은 기기의 로컬 저장소이고, 서버는 그 저장소를
// 세우고 갱신하는 **배포 채널**이다(lib/catalogSync.ts). 그래야 헬스장에서 네트워크가 끊겨도
// 목록·검색·필터가 그대로 동작한다 — 이 제품이 지켜야 하는 약속이다(SRS-006).
//
// 그 대가로 첫 페인트에 목록이 없다. 로컬 저장소는 브라우저에만 있어서 서버가 미리 그릴 수
// 없기 때문이다(IndexedDB를 여는 데 보통 수십 ms). 서버가 그려 줄 수 있는 것 — 운영 메타 —
// 만 RSC에서 확정해 넘긴다.
//
// **예외는 종목 상세다**(app/exercise/[id]). 그건 밖으로 공유되는 URL이라 SEO와 즉시 열림이
// 필요해서 서버 렌더를 유지한다. 목록=로컬, 상세=서버. 각자 이유가 있다.
// ─────────────────────────────────────────────────────────────────────────────
import { metaClient } from "@/lib/api";
import CatalogClient from "../components/CatalogClient";
import { Icon } from "../components/ui/Icon";
import { ScreenHeader } from "../components/ui/ScreenHeader";

// 운영 메타(어느 인스턴스가 답했나)는 요청마다 다르다 — 정적 생성 대상이 아니다.
export const dynamic = "force-dynamic";

export default async function Page() {
  const meta = await metaClient().getMeta({});

  return (
    <>
      {/* app의 종목 화면 머리와 같은 제목이다(i18n exercises.title).
          오른쪽은 app의 헤더 액션과 같은 자리 — 커스텀 종목 만들기. */}
      <ScreenHeader
        title="운동"
        right={
          <a href="/exercises/new" aria-label="커스텀 운동" data-testid="btn-new-exercise">
            <Icon name="add" size={24} color="var(--color-brand)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]">
        <CatalogClient
          busKind={meta.bus}
          // 어느 backend 인스턴스가 이 페이지를 줬는지 — 다중 인스턴스 propagation을 눈으로 확인하기 위한 표시.
          instance={meta.instance}
        />
      </div>
    </>
  );
}
