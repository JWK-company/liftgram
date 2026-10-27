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
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./components/AuthProvider";
import { GlobalWorkoutBar } from "./components/GlobalWorkoutBar";
import { LinkInterceptor } from "./components/LinkInterceptor";
import { SessionProvider } from "./components/SessionProvider";
import { ToastProvider } from "./components/Toast";
import { OnboardingOverlay } from "./components/OnboardingOverlay";
import { ServiceWorker } from "./components/ServiceWorker";
import { PrefsBridge } from "./components/PrefsBridge";
import { AccountGuard } from "./components/sync/AccountGuard";
import { SyncHealthBanner } from "./components/sync/SyncHealthBanner";
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
  description: "운동 기록 + 소셜 — Hevy식 트래킹에 인스타식 피드·DM·스토리",
  // 홈 화면에 추가하면 앱처럼 열린다(옛 Expo 웹과 같은 매니페스트·아이콘 — public/).
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Liftgram", statusBarStyle: "black-translucent" },
  // 아이콘 주소에 버전을 붙인다 — 주소가 같으면 설치된 홈 화면 앱이 새 아이콘을 받지 않는다(v0.23 로고 교체 때 실측).
  icons: { apple: "/apple-touch-icon.png?v=2" },
};

// 브라우저 상단 띠 색 — 라이트·다크 바탕(#F7F7F7 · #161616)과 같게. 토큰을 쓸 수 없는 자리라 값을 적는다.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F7" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};

// 테마 — 첫 칠하기 **전에** 정한다(그렇지 않으면 라이트로 번쩍였다가 다크로 바뀐다). 프로필에서 고른 값이 없으면
// 기기 설정(prefers-color-scheme)을 따른다 — CSS 가 처리하므로 data-theme 을 달지 않는다(lib/theme.ts).
const THEME_INIT = `(function(){try{var t=localStorage.getItem("liftgram.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard — booktarae 와 같은 본문 글꼴. 자체 호스팅(오프라인 PWA에서도 같은 글꼴 · 외부 요청 없음). */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 첫 칠하기 전 테마를 정하는 고정 문자열 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh bg-(--color-bg) font-sans text-(--color-ink) antialiased">
        {/* 로그인 상태·진행 중인 운동·휴식은 **화면을 옮겨도 유지된다** — 그래서 셸이 들고 있는다. */}
        <AuthProvider>
          <SessionProvider>
            <ToastProvider>
              {/* 폰 앱을 옮긴 화면이라 폭을 폰만큼으로 잡는다 — 넓은 화면에서는 가운데 정렬된다. */}
              <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col border-(--color-line) sm:border-x">
                {/* 머리는 화면이 각자 그린다(components/ui/ScreenHeader) — app이 화면마다
                  제목·액션을 다르게 두기 때문이다. 셸은 자리만 내어 준다. */}
                {/* 백업이 멈췄거나 기록이 이 기기에만 쌓이면 화면 위에 알린다 — 조용한 실패 금지(2026-10-26). */}
                <SyncHealthBanner />
                {/* [원본] overflow-x-hidden — overflow-y 가 auto 로 바뀌어 main 이 스크롤 상자가 되고, 그 안의 sticky 하단
                    (휴식 막대·루틴 편집 하단·요약 하단·댓글/DM 입력)이 화면이 아니라 main 끝에 붙었다(#45·#43 · SRS-066).
                  <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">{children}</main> */}
                {/* [개선] clip — 가로 넘침은 똑같이 잘라 내되 스크롤 상자를 만들지 않는다. @plm SRS-066 */}
                <main className="flex min-w-0 flex-1 flex-col overflow-x-clip">{children}</main>

                <GlobalWorkoutBar />
                <TabBar />
                {/* 첫 실행 안내는 **한 번만** 뜬다(본 표시는 이 기기에 남는다). */}
                <OnboardingOverlay />
                {/* 오프라인 셸·새 버전 띠 — 운동 중인지 알아야 해서 SessionProvider 안에 둔다. */}
                <ServiceWorker />
                {/* 다른 계정의 올라가지 않은 기록이 있으면 지우지 않고 고르게 한다. */}
                <AccountGuard />
                {/* 계정과 함께 옮기는 설정(주간 목표·알림음)을 프로필과 잇는다. */}
                <PrefsBridge />
                {/* 앱 안 <a href> 를 클라이언트 이동으로 — 탭마다 문서를 새로 받지 않게(SRS-054). */}
                <LinkInterceptor />
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
