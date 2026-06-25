// @plm SRS-002  루틴 종목 이름 표시 헬퍼 (exerciseId → 운동 이름 비동기 조회)
import React, { useEffect, useState } from 'react';
import { AppText } from '../../components';
import { exerciseRepo } from '../../data';
import type Exercise from '../../db/models/Exercise';

type Variant = 'body' | 'title' | 'heading' | 'caption' | 'label';

// exerciseId로 운동 이름을 비동기 조회해 표시하는 작은 컴포넌트.
export function ExerciseName({
  exerciseId,
  variant = 'body',
  color = 'text',
}: {
  exerciseId: string;
  variant?: Variant;
  color?: 'text' | 'textMuted' | 'textFaint';
}) {
  const [ex, setEx] = useState<Exercise | null>(null);
  useEffect(() => {
    let alive = true;
    exerciseRepo
      .getExercise(exerciseId)
      .then((e) => {
        if (alive) setEx(e);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [exerciseId]);
  return (
    <AppText variant={variant} color={color} numberOfLines={1}>
      {ex ? ex.nameKo : '…'}
    </AppText>
  );
}
