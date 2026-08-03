// @plm SRS-007  목록 상태 — app의 components/ListState.tsx를 웹으로 옮긴 것
//
// 비어 있는 목록 자리에 무엇을 보여 줄지 한 곳에서 정한다:
//   loading(첫 로드) → 스켈레톤 · error → 구분되는 오류 + 재시도 · 그 외 → 빈 상태
//
// **스켈레톤은 첫 로드에만** 보여 준다. 이미 "비어 있음"으로 정착한 목록을 다시 당겨 새로고침할 때
// 스켈레톤이 끼어들면 빈상태↔스켈레톤이 깜빡인다 — app이 겪고 고친 그 규칙을 그대로 옮겼다.
"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { Button } from "./Button";
import type { IconName } from "./Icon";
import { EmptyState } from "./primitives";
import { SkeletonList, type SkeletonVariant } from "./Skeleton";

export function ListState({
  loading,
  error,
  onRetry,
  skeletonVariant = "post",
  skeletonCount = 4,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  emptyAction,
}: {
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  skeletonVariant?: SkeletonVariant;
  skeletonCount?: number;
  emptyIcon?: IconName;
  emptyTitle: TransKey;
  emptyMessage?: TransKey;
  emptyAction?: ReactNode;
}) {
  const settledEmpty = useRef(false);
  useEffect(() => {
    if (!loading) settledEmpty.current = !error;
  }, [loading, error]);

  if (loading && !settledEmpty.current)
    return <SkeletonList variant={skeletonVariant} count={skeletonCount} />;

  if (error)
    return (
      <EmptyState
        tone="error"
        icon="cloud-offline-outline"
        title={t("common.loadError")}
        message={t("common.loadErrorMessage")}
        action={
          onRetry ? (
            <Button
              title={t("common.retry")}
              variant="secondary"
              icon="refresh"
              fullWidth={false}
              onPress={onRetry}
            />
          ) : undefined
        }
      />
    );

  return (
    <EmptyState
      icon={emptyIcon}
      title={t(emptyTitle)}
      message={emptyMessage ? t(emptyMessage) : undefined}
      action={emptyAction}
    />
  );
}
