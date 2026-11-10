// @plm SRS-051  로딩·빈 상태·오류 3종 표준 컴포넌트 — 화면마다 다시 만들지 않는다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **"데이터가 아직 없다 / 하나도 없다 / 실패했다"의 생김새를 한 곳에 고정.**
//
// 화면이 늘어날 때 각자 스피너와 오류 문구를 만들면 제품이 금세 제각각이 된다.
// 새 화면은 이 세 컴포넌트를 가져다 쓰고, 부족하면 **여기를 고쳐서** 모든 화면이 함께 바뀌게 한다.
//
// 규칙:
//   · 색은 전부 `--color-*` 토큰(app/globals.css). 하드코딩한 hex를 넣지 않는다.
//   · `data-testid`를 유지한다 — smoke test·e2e가 이 값으로 상태를 확인한다.
//   · 오류에는 되도록 `onRetry`를 준다. 사용자가 막다른 길에 서지 않게 하는 최소 장치다.
// ─────────────────────────────────────────────────────────────────────────────
import { LogoSpinner } from "./ui/LogoSpinner";

/** 데이터를 기다리는 동안 — Liftgram 로고가 차오른다(SRS-054 · 앱 공용 로딩 = 로고 채우기). */
export function Loading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      // [원본] className="flex flex-col items-center gap-3 rounded-xl bg-(--color-card) p-8"
      // [개선] 평평한 기록지(SPEC-056 F1·F2) — 판 없이 가운데 정렬만
      className="flex flex-col items-center gap-3 p-8"
      data-testid="state-loading"
    >
      <LogoSpinner size={52} />
      <p className="text-sm text-(--color-ink3)">{label}…</p>
    </div>
  );
}

/** 결과가 0건일 때. 제목으로 사실을, hint로 "그래서 무엇을 하면 되는지"를 말한다. */
export function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div
      // [원본] className="rounded-xl border border-dashed border-(--color-line) p-8 text-center"
      // [개선] 점선 상자 없이(SPEC-056 F1)
      className="p-8 text-center"
      data-testid="state-empty"
    >
      <p className="font-semibold text-(--color-ink)">{title}</p>
      <p className="mt-1 text-sm text-(--color-ink3)">{hint}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** 실패했을 때. message는 서버가 준 problem+json의 detail을 그대로 넣는 것을 기본으로 한다. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    // [원본] <div className="rounded-xl border border-(--color-warn) bg-(--color-card) p-6" data-testid="state-error">
    // [개선] 오류는 알림 띠라 상자 유지 · 둥근 정도만 토큰(SPEC-056 F1·F2)
    <div
      className="rounded-[var(--radius-md)] border border-(--color-warn) bg-(--color-card) p-6"
      data-testid="state-error"
    >
      <p className="font-semibold text-(--color-warn)">문제가 발생했습니다</p>
      <p className="mt-1 text-sm text-(--color-ink2)">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          // [원본] className="mt-4 rounded-lg border border-(--color-line) px-3 py-2 text-sm"
          // [개선] 둥근 정도 토큰 · 누르는 것의 경계 line-strong · 44px(SPEC-056 F2·F7)
          className="mt-4 min-h-[44px] rounded-[var(--radius-sm)] border border-(--color-line-strong) px-3 py-2 text-sm"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
