// @plm SRS-007  로딩·빈 상태·오류 3종 표준 컴포넌트 — 화면마다 다시 만들지 않는다
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

/** 데이터를 기다리는 동안. 실제 콘텐츠와 비슷한 형태(스켈레톤)로 레이아웃 밀림을 줄인다. */
export function Loading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      className="animate-pulse rounded-xl border border-(--color-line) bg-(--color-card) p-6"
      data-testid="state-loading"
    >
      <div className="h-4 w-24 rounded bg-(--color-line)" />
      <div className="mt-3 h-8 w-40 rounded bg-(--color-line)" />
      <p className="mt-3 text-sm text-(--color-ink3)">{label}…</p>
    </div>
  );
}

/** 결과가 0건일 때. 제목으로 사실을, hint로 "그래서 무엇을 하면 되는지"를 말한다. */
export function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border border-dashed border-(--color-line) p-8 text-center"
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
    <div className="rounded-xl border border-(--color-warn) bg-(--color-card) p-6" data-testid="state-error">
      <p className="font-semibold text-(--color-warn)">문제가 발생했습니다</p>
      <p className="mt-1 text-sm text-(--color-ink2)">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-(--color-line) px-3 py-2 text-sm"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
