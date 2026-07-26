// @plm SRS-003  세션 종목 행에서 exerciseId → 종목명 표시 (지연 로드)
// revealOnTap: 패널 폭 때문에 긴 이름은 1줄로 잘리는데(…), 탭하면 잠시 전체 이름을 펼쳐 보여준다. @plm SRS-004
import React, { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { exerciseRepo } from '../../data';
import { exerciseDisplayName, baseExerciseName } from '../../domain';
import { useT } from '../../i18n';
import type { Exercise } from '../../db/models';
import { AppText } from '../../components';

interface ExerciseNameProps {
  exerciseId: string;
  variant?: 'heading' | 'body' | 'caption' | 'label';
  color?: 'text' | 'textMuted' | 'textFaint';
  base?: boolean; // 세션/루틴 표기 — 기구 토큰을 뗀 베이스명('벤치프레스'). 기구는 변형 태그로 별도 표시. @plm SRS-028
  revealOnTap?: boolean; // 탭하면 잘린 전체 이름을 잠시 펼쳐 보여줌(운동 중 화면). 기본 off — 다른 화면의 행 탭과 충돌 방지.
}

const REVEAL_MS = 3000; // 펼쳐 보여주는 시간

// exerciseId만 가진 행(WorkoutExercise 등)에서 종목명을 비동기로 가져와 표시.
export function ExerciseName({ exerciseId, variant = 'heading', color = 'text', base = false, revealOnTap = false }: ExerciseNameProps) {
  const { lang } = useT();
  const [ex, setEx] = useState<Exercise | null>(null);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 언마운트 시 펼침 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const label = ex ? (base ? baseExerciseName(ex, lang) : exerciseDisplayName(ex, lang)) : '...';
  const text = (
    <AppText variant={variant} color={color} numberOfLines={expanded ? undefined : 1}>
      {label}
    </AppText>
  );

  if (!revealOnTap) return text;

  const reveal = () => {
    setExpanded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpanded(false), REVEAL_MS);
  };

  return (
    <Pressable onPress={reveal} hitSlop={4} accessibilityRole="button">
      {text}
    </Pressable>
  );
}
