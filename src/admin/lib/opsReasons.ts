// 운영 경고 코드의 문구. 빨간 글자로만 쓴다.
const TEXT: Record<string, string> = {
  stalled: "동기가 멈춘 기기 {count}대",
  daily_none: "일일 백업 기록이 없습니다",
  daily_stale: "일일 백업이 36시간 넘게 성공하지 않았습니다",
  restore_none: "복원 시험 기록이 없습니다",
  restore_old: "복원 시험이 40일 넘게 없었습니다",
  restore_failed: "마지막 복원 시험이 실패했습니다",
  low_disk: "백업 디스크 남은 공간이 20GB보다 적습니다",
  usage_table: "이용 기록 표가 2GB를 넘었습니다",
};

export function reasonText(code: string, stalledCount: number): string {
  return (TEXT[code] ?? `확인할 것: ${code}`).replace("{count}", String(stalledCount));
}
