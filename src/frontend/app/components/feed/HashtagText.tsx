"use client";
// @plm SRS-018  캡션의 #태그를 링크로 — app의 features/social/HashtagText.tsx를 웹으로
//
// 규칙은 서버의 추출 규칙과 **같아야 한다**(유니코드 글자·숫자·밑줄, 1~50자).
// 여기서 링크로 보이는데 눌러도 목록이 비어 있으면, 둘 중 하나가 틀린 것이다.
import { routes } from "@app/contracts";

// 서버(internal/feed/service.go의 hashtagRe)와 같은 규칙.
const TAG_RE = /#([\p{L}\p{N}_]{1,50})/gu;

export function HashtagText({ text, className = "" }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;

  for (const m of text.matchAll(TAG_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const tag = m[1];
    parts.push(
      <a
        key={`${tag}-${i}`}
        href={routes.hashtag(tag.toLowerCase())}
        data-testid="hashtag-link"
        className="text-(--color-brand)"
      >
        {m[0]}
      </a>,
    );
    last = start + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <p
      className={`whitespace-pre-wrap break-words text-[15px] text-(--color-ink) leading-[22px] ${className}`}
    >
      {parts}
    </p>
  );
}
