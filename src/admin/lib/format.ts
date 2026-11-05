// 표시 형식. 운영자는 모두 한국 시각으로 본다.
import { type Timestamp, timestampDate } from "@bufbuild/protobuf/wkt";

const KST = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** 2026-11-05 14:30 (한국 시각). 값이 없으면 대시. */
export function kst(ts: Timestamp | undefined): string {
  return ts ? KST.format(timestampDate(ts)) : "—";
}

export function bytes(n: bigint | number): string {
  const v = Number(n);
  if (!v) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)}${units[i]}`;
}

export function num(n: bigint | number): string {
  return Number(n).toLocaleString("ko-KR");
}

/** 「3분 전」 — 마지막 갱신 표시. */
export function ago(atMs: number, now = Date.now()): string {
  const min = Math.floor((now - atMs) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}
