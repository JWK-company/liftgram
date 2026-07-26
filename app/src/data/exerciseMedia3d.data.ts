// 3D 스타일 움짤 오버레이 매핑 — scripts/ingest-3d-media.js 가 생성/갱신(수기 편집 비권장). @plm SRS-046
// 키=종목 nameKo(조회 KEY), 값=자체 호스팅 GIF 경로(/media3d/*.gif — app/public/media3d에 배치, ADR-029 자체 호스팅).
// 라이선스 확보된 에셋만 넣는다: ADR-029 게이트(재배포 조항 원문 확인) 통과 전 제3자 GIF 반입 금지.
// 비어 있는 동안에는 기존 2프레임(free-exercise-db) 시연이 그대로 사용된다 — 코드 변경 없이 이 파일만 채우면 전환.
export const RAW_MEDIA_3D: Record<string, string> = {};
