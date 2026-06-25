// 경량 랜덤 id (슈퍼셋 그룹 키 등 비-PK 식별자용). WatermelonDB 레코드 PK는 자동 생성됨.
export function randomId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}${t}${rand}`;
}
