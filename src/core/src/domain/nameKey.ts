// @plm SRS-056  이름 비교 키 — 띄어쓰기·하이픈·괄호·가운뎃점·대소문자를 무시한다(「랫풀」 = 「랫 풀」).
// 카탈로그 무결성 검사(이름·별칭 유일)와 검색 색인이 같은 규칙을 써야 「검사는 통과했는데 검색은 겹친다」가 없다.

/** NFKC → 소문자 → 공백·하이픈·구두점 제거. 빈 결과면 빈 문자열. */
export function normalizeNameKey(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_·.,/()[\]{}'"`~!?&+:;|·]+/g, '');
}

/** 시드 종목의 결정적 id — nameEn 슬러그(seedRunner·scripts/gen-catalog.mjs 와 같은 규칙. 바꾸면 기록이 끊긴다). */
export function seedIdOf(nameEn: string): string {
  const slug = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `seed-${slug}`;
}
