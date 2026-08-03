// @plm SRS-007  아바타 — app의 components/Avatar를 웹으로 옮긴 것
//
// 사진이 있으면 사진, 없으면 이름의 첫 글자를 브랜드색 원에 넣는다.
// 사진이 깨져도 빈 사각형이 남지 않게, 실패하면 첫 글자로 되돌아간다.
"use client";

import { useState } from "react";

export function Avatar({ name, url, size = 36 }: { name?: string; url?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (name?.trim()?.[0] ?? "?").toUpperCase();
  const style = { width: size, height: size, minWidth: size } as const;

  if (url && !broken) {
    return (
      // 원격 이미지라 next/image의 최적화 대상이 아니다(도메인이 정해져 있지 않다).
      // biome-ignore lint/performance/noImgElement: 임의 출처의 아바타 — 최적화 대상이 아니다
      <img
        src={url}
        alt=""
        style={style}
        onError={() => setBroken(true)}
        className="rounded-full bg-(--color-surface-alt) object-cover"
      />
    );
  }
  return (
    <div
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
      className="flex items-center justify-center rounded-full bg-(--color-brand) font-bold text-(--color-on-brand)"
      aria-hidden
    >
      {letter}
    </div>
  );
}
