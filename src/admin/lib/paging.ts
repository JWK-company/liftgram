// 표의 페이지 나누기. 주소에서 온 값이라 망가진 값을 받는다.
export const PAGE_SIZE = 50;

/** 페이지 번호를 범위 안으로 맞춰 그 페이지의 줄을 돌려준다. 처리로 줄이 줄어도 빈 페이지가 남지 않는다. */
export function pageOf<T>(rows: T[], page: number): { page: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Number.isInteger(page) ? Math.min(Math.max(1, page), pages) : 1;
  return { page: p, rows: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE) };
}
