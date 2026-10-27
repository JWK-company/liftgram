// @plm SRS-071  운동 소요시간 표시 — 홈은 「-」, 피드는 「00:00」, 요약은 「MM:SS」로 제각각이던 것(화면 정리 P3 QA M1)
//
// 규칙: 1분 미만·없음 → null(그 칸을 아예 그리지 않는다). 그 밖은 분으로 반올림해 시간·분으로 나눈다.
// 화면 글자(「45분」·「1시간 5분」)는 프론트가 i18n 으로 만든다 — 여기서는 숫자만.
export interface DurationParts {
  hours: number;
  minutes: number;
}

export function workoutDurationParts(seconds: number | null | undefined): DurationParts | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 60) return null;
  const total = Math.round(seconds / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
