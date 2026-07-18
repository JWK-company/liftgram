// @plm SRS-032  종목 미디어(자세 사진·설명) — free-exercise-db.
// 라이선스: 원본 LICENSE.md·GitHub 모두 Unlicense(퍼블릭 도메인, 이미지 포함 리포 전체·상업이용/판매 자유·출처표기 의무 없음).
// (이미지 원출처는 문서화돼 있지 않아 chain-of-title 잔여 리스크 존재 — 유료 상용 시 IP 검토 권장.)
// 매핑을 정적 데이터로 베이크(런타임·네트워크 의존 0, 오프라인 PWA 안전). 이미지는 jsDelivr CDN 서빙.
// 시작/끝 2프레임 교차로 동작 시연('가난한 자의 움짤'). 무료 합법 GIF는 없어 사진 2컷 채택.
// 크레딧은 의무 아니나 관례상 표기(출처 존중). @plm SRS-032

export interface ExerciseMedia {
  start: string; // 시작 자세 이미지 CDN URL
  end: string; // 끝(수축) 자세 이미지 CDN URL
  instructionsKo: string[]; // 한국어 자세 설명(step)
  instructionsEn: string[]; // 영문 원문(폴백/참고)
}

// free-exercise-db 이미지 경로 → jsDelivr 절대 URL. (resolveMediaUrl가 절대 URL은 그대로 통과)
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
export function freeDbImageUrl(path: string): string {
  return CDN + path;
}

// 종목 미디어 원시데이터 — 키=종목 한국어명(nameKo), 값={s:시작경로, e:끝경로, k:한국어스텝, en:영문스텝}.
// 이미지 경로만 저장(CDN base 중앙화)하고 조회 시 절대 URL로 조립. RAW_MEDIA는 빌드 스크립트가 생성.
import { RAW_MEDIA } from './exerciseMedia.data';

export function getExerciseMedia(nameKo: string): ExerciseMedia | null {
  const r = RAW_MEDIA[nameKo];
  if (!r) return null;
  return { start: freeDbImageUrl(r.s), end: freeDbImageUrl(r.e), instructionsKo: r.k, instructionsEn: r.en };
}

// 이미지 출처 크레딧(관례 표기 — Unlicense는 의무 아님).
export const EXERCISE_MEDIA_CREDIT = 'free-exercise-db (Public Domain)';
