// @plm SRS-007  자리표시 — app의 components/Skeleton.tsx를 웹으로 옮긴 것
//
// 첫 로딩에 빈 화면 대신 보여 주는 회색 펄스 블록. app은 Animated.loop(0.5↔1, 750ms)로
// 투명도를 오간다 — 여기서는 같은 주기의 CSS 애니메이션으로 대신한다(JS 타이머가 필요 없다).
//
// 스크린리더에서는 숨긴다(자리표시는 읽어 봐야 뜻이 없다).
import { Card } from "./primitives";

export function Skeleton({
  width,
  height,
  radius = "var(--radius-sm)",
  className = "",
}: {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width, height, borderRadius: radius }}
      className={`block animate-[skeleton-pulse_1.5s_ease-in-out_infinite] bg-(--color-surface-alt) ${className}`}
    />
  );
}

function PostSkeleton() {
  return (
    <Card>
      <div className="flex items-center">
        <Skeleton width={38} height={38} radius="var(--radius-pill)" />
        <div className="ml-[var(--spacing-md)] flex-1">
          <Skeleton width="45%" height={12} />
          <Skeleton width="28%" height={10} className="mt-[6px]" />
        </div>
      </div>
      <Skeleton width="100%" height={180} radius="var(--radius-md)" className="mt-[var(--spacing-md)]" />
      <div className="mt-[var(--spacing-md)] flex items-center gap-[var(--spacing-lg)]">
        <Skeleton width={44} height={12} />
        <Skeleton width={44} height={12} />
      </div>
    </Card>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-[var(--spacing-md)] py-[var(--spacing-sm)]">
      <Skeleton width={44} height={44} radius="var(--radius-pill)" />
      <div className="flex-1">
        <Skeleton width="55%" height={13} />
        <Skeleton width="75%" height={11} className="mt-[7px]" />
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex items-center gap-[var(--spacing-md)] py-[var(--spacing-sm)]">
      <Skeleton width={32} height={32} radius="var(--radius-pill)" />
      <div className="flex-1">
        <Skeleton width="35%" height={11} />
        <Skeleton width="90%" height={11} className="mt-[7px]" />
      </div>
    </div>
  );
}

/** 채팅 스레드용 — 실제 말풍선과 같은 좌/우 정렬. */
function BubbleSkeleton({ mine }: { mine: boolean }) {
  return (
    <div className={`mb-[var(--spacing-xs)] flex ${mine ? "justify-end" : "justify-start"}`}>
      <Skeleton width={mine ? "52%" : "64%"} height={38} radius="var(--radius-lg)" />
    </div>
  );
}

const VARIANTS = { post: PostSkeleton, row: RowSkeleton, comment: CommentSkeleton } as const;
export type SkeletonVariant = keyof typeof VARIANTS | "bubble";

export function SkeletonList({
  variant = "post",
  count = 4,
  className = "",
}: {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={`flex flex-col gap-[var(--spacing-md)] py-[var(--spacing-xs)] ${className}`}>
      {Array.from({ length: count }, (_, i) => {
        const key = `${variant}-${i}`;
        if (variant === "bubble") return <BubbleSkeleton key={key} mine={i % 2 === 1} />;
        const Item = VARIANTS[variant];
        return <Item key={key} />;
      })}
    </div>
  );
}
