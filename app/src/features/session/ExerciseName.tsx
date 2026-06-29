// @plm SRS-003  세션 종목 행에서 exerciseId → 종목명 표시 (지연 로드)
import React, { useEffect, useState } from 'react';
import { exerciseRepo } from '../../data';
import { exerciseDisplayName } from '../../domain';
import { useT } from '../../i18n';
import type { Exercise } from '../../db/models';
import { AppText } from '../../components';

interface ExerciseNameProps {
  exerciseId: string;
  variant?: 'heading' | 'body' | 'caption' | 'label';
  color?: 'text' | 'textMuted' | 'textFaint';
}

// exerciseId만 가진 행(WorkoutExercise 등)에서 종목명을 비동기로 가져와 표시.
export function ExerciseName({ exerciseId, variant = 'heading', color = 'text' }: ExerciseNameProps) {
  const { lang } = useT();
  const [ex, setEx] = useState<Exercise | null>(null);
  useEffect(() => {
    let alive = true;
    exerciseRepo
      .getExercise(exerciseId)
      .then((e) => {
        if (alive) setEx(e);
      })
      .catch(() => {
        /* 삭제된 종목 — 기본 표기 유지 */
      });
    return () => {
      alive = false;
    };
  }, [exerciseId]);
  return (
    <AppText variant={variant} color={color} numberOfLines={1}>
      {ex ? exerciseDisplayName(ex, lang) : '...'}
    </AppText>
  );
}
