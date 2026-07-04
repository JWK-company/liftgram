import React, { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { EmptyState } from './primitives';
import { SkeletonList, type SkeletonVariant } from './Skeleton';
import { useT, type TransKey } from '../i18n';

// 목록 화면의 상태 자리표시 — FlatList의 ListEmptyComponent로 사용.
// loading(첫 로딩·데이터 없음) → 스켈레톤 / error → 구분되는 에러+재시도 / 그 외 → 아이콘+제목+메시지+CTA.
// 목록에 데이터가 있으면 ListEmptyComponent는 렌더되지 않으므로 여긴 항상 "비어있는 화면" 맥락이다.
export function ListState({
  loading,
  error,
  onRetry,
  skeletonVariant = 'post',
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
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  emptyTitle: TransKey;
  emptyMessage?: TransKey;
  emptyAction?: React.ReactNode;
}) {
  const { t } = useT();
  // 스켈레톤은 첫 로드(또는 에러 후 재시도)에만. 이미 빈상태로 정착한 목록을 pull-to-refresh
  // 할 땐 RefreshControl 스피너가 담당 → 빈상태↔스켈레톤 플리커 방지.
  const settledEmpty = useRef(false);
  useEffect(() => {
    if (!loading) settledEmpty.current = !error; // 로드 완료 & 에러 아니면 '빈상태 정착'
  }, [loading, error]);
  if (loading && !settledEmpty.current) return <SkeletonList variant={skeletonVariant} count={skeletonCount} />;
  if (error)
    return (
      <EmptyState
        tone="error"
        icon="cloud-offline-outline"
        title={t('common.loadError')}
        message={t('common.loadErrorMessage')}
        action={
          onRetry ? (
            <Button
              title={t('common.retry')}
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
