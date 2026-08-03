// 앱 셸 — 헤더·내비·토스트 영역·모달 루트·에러 경계를 셸이 소유한다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **모든 화면이 공유하는 껍데기.**
//
// 개별 화면이 헤더·로딩·오류·토스트를 각자 구현하지 않게 하는 것이 목적이다:
//   · 로딩  → 라우트별 loading.tsx (Suspense 경계). **루트에는 두지 않는다** —
//              상위에 경계가 있으면 하위 라우트가 404 상태를 낼 수 없다(app/exercise/[id]/page.tsx 주석)
//   · 오류  → app/error.tsx   (에러 바운더리)
//   · 토스트  → ToastProvider + #toast-root (components/Toast.tsx). 어디서든 `useToast()`로 부른다
//   · 모달    → #modal-root 에 포털로 띄운다(같은 방식). 부모의 overflow·z-index에 영향받지 않는다
//
// 새 화면은 app/<경로>/page.tsx만 추가하면 이 셸 안에 들어온다 — 여기를 고칠 일은
// 내비게이션이 늘거나 전역 UI 슬롯이 필요할 때뿐이다.
// ─────────────────────────────────────────────────────────────────────────────
import type { Metadata } from "next";
import { AuthProvider } from "./components/AuthProvider";
import { GlobalWorkoutBar } from "./components/GlobalWorkoutBar";
import { SessionProvider } from "./components/SessionProvider";
import { ToastProvider } from "./components/Toast";
import { OnboardingOverlay } from "./components/OnboardingOverlay";
import { TabBar } from "./components/ui/TabBar";
import "./globals.css";

// metadataBase(절대 URL)를 **일부러 두지 않는다.**
//
// 이유: not-found 같은 정적 페이지의 메타데이터는 **빌드 시점에** 확정된다. 거기에 도메인을 넣으면
// 빌드 산출물에 도메인이 박히고, 같은 이미지를 개발·스테이징·운영에 그대로 올릴 수 없게 된다
// (실측으로 확인 — 함수로 바꿔도 정적 프리렌더는 빌드 때 평가된다).
// 지금은 OG·트위터 카드를 쓰지 않아 절대 URL이 필요 없다. 필요해지면 런타임 라우트
// (app/opengraph-image.tsx)로 만들고 거기서 env.APP_URL을 읽는다 — 그건 요청 시점에 돈다.
export const metadata: Metadata = {
  title: "Liftgram",
  description: "운동 카탈로그 — liftgram 웹 스택",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* app은 다크 테마 하나만 쓴다 — 브라우저가 폼 컨트롤을 밝게 그리지 않도록 알려 준다. */}
      <body className="min-h-dvh bg-(--color-bg) text-(--color-ink) antialiased [color-scheme:dark]">
        {/* 로그인 상태·진행 중인 운동·휴식은 **화면을 옮겨도 유지된다** — 그래서 셸이 들고 있는다. */}
        <AuthProvider>
          <SessionProvider>
            <ToastProvider>
              {/* 폰 앱을 옮긴 화면이라 폭을 폰만큼으로 잡는다 — 넓은 화면에서는 가운데 정렬된다. */}
              <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col border-(--color-line) sm:border-x">
                {/* 머리는 화면이 각자 그린다(components/ui/ScreenHeader) — app이 화면마다
                  제목·액션을 다르게 두기 때문이다. 셸은 자리만 내어 준다. */}
                <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">{children}</main>

                <GlobalWorkoutBar />
                <TabBar />
                {/* 첫 실행 안내는 **한 번만** 뜬다(본 표시는 이 기기에 남는다). */}
                <OnboardingOverlay />
              </div>
            </ToastProvider>
          </SessionProvider>
        </AuthProvider>
        <div id="toast-root" data-testid="toast-root" className="fixed right-4 bottom-20 z-50" />
        <div id="modal-root" data-testid="modal-root" />
      </body>
    </html>
  );
}
