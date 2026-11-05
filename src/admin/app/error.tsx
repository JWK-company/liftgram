"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main data-testid="error-page" role="alert" className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">화면을 그리지 못했습니다</h1>
      <p className="text-muted">다시 시도해도 같으면 개발자에게 알려 주세요.</p>
      <button type="button" className="underline py-1" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
