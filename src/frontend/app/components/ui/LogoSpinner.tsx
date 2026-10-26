// @plm SRS-054  공용 로딩 표시 — Liftgram 로고(B1 사선 L-바벨)에 아래에서 위로 색이 차오른다
//
// ─────────────────────────────────────────────────────────────────────────────
// booktarae LogoSpinner 를 옮겼다(같은 회사 제품 · 같은 로딩 언어). 빈 로고(윤곽선) 위에 채운 로고를 겹치고
// «창»(.lf-win)을 아래에서 위로 올리며 안의 그림(.lf-ink)은 반대로 내려 제자리에 둔다(globals.css `.lf-*`).
// ⚠ 움직임은 **transform 키프레임뿐**이다 — 합성 스레드라 폰이 첫 실행(하이드레이션)으로 바빠도 멈추지 않는다.
//   booktarae 가 SVG clip(SMIL·JS setAttribute)으로 했다가 폰에서 빈 로고만 보인 일이 있다(2026-10-01).
// 움직임 줄이기면 다 찬 정지 로고. 서버 컴포넌트에서도 쓴다(상태·효과 없음).
// ─────────────────────────────────────────────────────────────────────────────

function BrandGlyph({ outline, color }: { outline: boolean; color: string }) {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" className="block">
      <g
        transform="translate(5.2 0) skewX(-14)"
        fill={outline ? "none" : color}
        stroke={outline ? color : undefined}
        strokeWidth={outline ? 1.4 : undefined}
        vectorEffect={outline ? "non-scaling-stroke" : undefined}
      >
        <rect x="3" y="3" width="5.4" height="24" rx="2.7" />
        <rect x="3" y="21.4" width="24" height="3.6" rx="1.8" />
        <rect x="18.4" y="14.6" width="4.4" height="17.2" rx="2.2" />
        <rect x="24" y="17.6" width="3.4" height="11.2" rx="1.7" />
      </g>
    </svg>
  );
}

export function LogoSpinner({
  size = 40,
  tone = "brand",
  label,
  className = "",
}: {
  size?: number;
  /** current = 채운 버튼 위(글자색을 따라야 보인다). */
  tone?: "brand" | "current";
  /** 혼자 서는 로딩이면 스크린 리더가 읽을 말. 없으면 장식(옆 글자가 말한다). */
  label?: string;
  className?: string;
}) {
  const color = tone === "current" ? "currentColor" : "var(--color-brand-vivid)";
  return (
    <>
      {label ? <span className="sr-only">{label}</span> : null}
      <span
        className={`lf lf-loop logo-spinner-breathe shrink-0 ${className}`}
        style={{ width: size, height: size }}
        data-testid="logo-spinner"
        aria-hidden="true"
      >
        <BrandGlyph outline color={color} />
        <span className="lf-win">
          <span className="lf-ink">
            <BrandGlyph outline={false} color={color} />
          </span>
        </span>
      </span>
    </>
  );
}

/** 화면 한가운데 로고 — 라우트 loading.tsx · 첫 로드처럼 화면 전체가 기다릴 때. */
export function RouteLoading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="route-loading"
      className="flex min-h-[50dvh] flex-1 items-center justify-center"
    >
      <LogoSpinner size={52} label={label} />
    </div>
  );
}

/** 줄 안의 작은 로딩 — 목록·시트가 받는 동안. */
export function InlineLoading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-(--color-ink3) text-[length:var(--text-sm)]"
    >
      <LogoSpinner size={20} />
      {label}…
    </span>
  );
}
